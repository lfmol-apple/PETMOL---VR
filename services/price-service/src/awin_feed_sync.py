"""
AwinFeedSyncService — baixa o Product Feed (CSV, gzip) de um advertiser
Awin e grava em AffiliateFeedOffer (Postgres local). Ver docs/AFFILIATES.md
item 6 e awin_feed_provider.py.

Esta é a ÚNICA chamada real à Awin em todo o código — roda em lote (job
externo, não por clique de usuário), nunca a partir de uma requisição HTTP
do frontend. AwinFeedProvider só lê o resultado já sincronizado; nunca
chama isto diretamente.

Rodar manualmente: `python3 scripts/sync_awin_feed.py cobasi`. Idempotente
e re-executável — cada linha do feed vira um upsert (chave: network +
advertiser_id + external_product_id); produtos que desaparecem do feed
entre uma sincronização e outra são marcados active=False, nunca
apagados (histórico de preço/oferta fica preservado).
"""
from __future__ import annotations

import csv
import gzip
import io
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .awin_advertisers import AwinAdvertiser, get_awin_advertiser
from .config import get_settings
from .product_catalog_lookup import normalize_gtin

logger = logging.getLogger(__name__)

FEED_BASE_URL = "https://productdata.awin.com/datafeed/download"
# Mesma lista de colunas confirmada no painel Awin — GTIN e deep link
# afiliado (aw_deep_link) são os dois campos que o resto do sistema exige
# (find_offer só resolve por GTIN exato; monetize nunca cai pra
# merchant_url limpa — ver awin_feed_provider.py).
FEED_COLUMNS = (
    "data_feed_id,merchant_id,merchant_name,aw_product_id,aw_deep_link,"
    "aw_image_url,aw_thumb_url,category_id,category_name,brand_id,"
    "brand_name,merchant_product_id,merchant_category,mpn,product_name,"
    "description,merchant_deep_link,merchant_image_url,search_price,"
    "condition,product_type,custom_1,custom_2,stock_status,product_GTIN"
)
_IN_STOCK_VALUES = {"1", "true", "yes", "in stock", "instock", "in_stock"}
TIMEOUT_SECONDS = 300  # feeds grandes (milhares de produtos) demoram


class AwinFeedSyncError(RuntimeError):
    pass


@dataclass
class AwinFeedSyncResult:
    merchant: str
    rows_seen: int
    rows_upserted: int
    rows_deactivated: int


def build_feed_url(advertiser: AwinAdvertiser, datafeed_key: str) -> str:
    if not advertiser.feed_id:
        raise AwinFeedSyncError(f"Advertiser '{advertiser.merchant}' não tem feed_id configurado")
    return (
        f"{FEED_BASE_URL}/apikey/{datafeed_key}/fid/{advertiser.feed_id}"
        f"/format/csv/language/pt/delimiter/%2C/compression/gzip"
        f"/columns/{FEED_COLUMNS}/"
    )


def fetch_feed_csv(url: str) -> str:
    """Baixa e descomprime o feed. Rede real — só chamado pelo job de sync."""
    with httpx.Client(timeout=TIMEOUT_SECONDS) as client:
        response = client.get(url)
        response.raise_for_status()
        raw = response.content
    try:
        return gzip.decompress(raw).decode("utf-8-sig")
    except gzip.BadGzipFile:
        # Awin às vezes responde sem gzip mesmo pedindo compression=gzip
        # (ex: erro em texto puro) — deixa o parser de CSV falhar de forma
        # legível em vez de mascarar com um decompress silencioso.
        return raw.decode("utf-8-sig")


def _parse_float(value: str) -> Optional[float]:
    if not value:
        return None
    cleaned = value.strip().replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


def _parse_in_stock(value: str) -> Optional[bool]:
    if value is None or value == "":
        return None
    return value.strip().lower() in _IN_STOCK_VALUES


def _row_to_offer_fields(row: dict, merchant: str, advertiser_id: str, synced_at: datetime) -> Optional[dict]:
    external_id = (row.get("aw_product_id") or "").strip()
    if not external_id:
        return None
    gtin = normalize_gtin(row.get("product_GTIN") or "") or None
    return dict(
        network="awin",
        merchant=merchant,
        advertiser_id=advertiser_id,
        external_product_id=external_id,
        sku=(row.get("merchant_product_id") or "").strip() or None,
        gtin=gtin,
        title=(row.get("product_name") or "").strip() or None,
        brand=(row.get("brand_name") or "").strip() or None,
        category=(row.get("category_name") or "").strip() or None,
        price=_parse_float(row.get("search_price", "")),
        currency="BRL",
        in_stock=_parse_in_stock(row.get("stock_status", "")),
        merchant_url=(row.get("merchant_deep_link") or "").strip() or None,
        affiliate_url=(row.get("aw_deep_link") or "").strip() or None,
        image_url=(row.get("aw_image_url") or row.get("merchant_image_url") or "").strip() or None,
        last_synced_at=synced_at,
        active=True,
    )


def _upsert_offer(db: Session, fields: dict) -> None:
    """Upsert por (network, advertiser_id, external_product_id) — mesma
    unique constraint da tabela. Dialeto SQLite nos testes, Postgres em
    produção; ambos suportam ON CONFLICT DO UPDATE nesse formato."""
    insert_fn = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    stmt = insert_fn(AffiliateFeedOffer).values(**fields)
    update_cols = {k: v for k, v in fields.items() if k not in ("network", "advertiser_id", "external_product_id")}
    stmt = stmt.on_conflict_do_update(
        index_elements=["network", "advertiser_id", "external_product_id"],
        set_=update_cols,
    )
    db.execute(stmt)


def sync_awin_feed(db: Session, merchant: str, *, datafeed_key: Optional[str] = None) -> AwinFeedSyncResult:
    advertiser = get_awin_advertiser(merchant)
    if not advertiser:
        raise AwinFeedSyncError(f"Merchant desconhecido: {merchant!r}")
    if not advertiser.feed_available:
        raise AwinFeedSyncError(f"Merchant '{merchant}' não tem Product Feed disponível na Awin")

    key = datafeed_key or get_settings().awin_datafeed_key
    if not key:
        raise AwinFeedSyncError(
            "AWIN_DATAFEED_KEY não configurada — ver docs/AFFILIATES.md seção Awin"
        )

    url = build_feed_url(advertiser, key)
    logger.info("[awin_feed_sync] baixando feed de %s (fid=%s)", merchant, advertiser.feed_id)
    csv_text = fetch_feed_csv(url)

    synced_at = datetime.now(timezone.utc)
    rows_seen = 0
    rows_upserted = 0

    reader = csv.DictReader(io.StringIO(csv_text))
    for row in reader:
        rows_seen += 1
        fields = _row_to_offer_fields(row, merchant, advertiser.advertiser_id, synced_at)
        if fields is None:
            continue
        _upsert_offer(db, fields)
        rows_upserted += 1
        if rows_upserted % 500 == 0:
            db.commit()
    db.commit()

    # Produtos que saíram do feed entre uma sincronização e outra: marca
    # inativo em vez de apagar (histórico preservado; find_offer já filtra
    # active=True). Qualquer linha não tocada nesta rodada (last_synced_at
    # antigo) é considerada removida do catálogo do merchant.
    deactivate_stmt = (
        update(AffiliateFeedOffer)
        .where(
            AffiliateFeedOffer.network == "awin",
            AffiliateFeedOffer.advertiser_id == advertiser.advertiser_id,
            AffiliateFeedOffer.active.is_(True),
            (AffiliateFeedOffer.last_synced_at.is_(None)) | (AffiliateFeedOffer.last_synced_at < synced_at),
        )
        .values(active=False)
    )
    result = db.execute(deactivate_stmt)
    db.commit()
    rows_deactivated = result.rowcount or 0

    logger.info(
        "[awin_feed_sync] %s: %d linhas no feed, %d upserted, %d desativados",
        merchant, rows_seen, rows_upserted, rows_deactivated,
    )
    return AwinFeedSyncResult(
        merchant=merchant,
        rows_seen=rows_seen,
        rows_upserted=rows_upserted,
        rows_deactivated=rows_deactivated,
    )

"""
AwinFeedSyncService — baixa o Product Feed (CSV, gzip) de um advertiser
Awin e grava em AffiliateFeedOffer (Postgres local). Ver docs/AFFILIATES.md
item 6 e awin_feed_provider.py.

Esta é a ÚNICA chamada real à Awin em todo o código — roda em lote (job
externo, não por clique de usuário), nunca a partir de uma requisição HTTP
do frontend. AwinFeedProvider só lê o resultado já sincronizado; nunca
chama isto diretamente.

Sincronizar catálogo é uma decisão INDEPENDENTE de expor oferta ao tutor —
controlada só por config.awin_sync_enabled, nunca por awin_enabled/
awin_shadow_mode (ver config.py). É seguro rodar mesmo com Awin totalmente
desligada pro tutor: só grava Postgres local, nunca abre link.

Rodar manualmente: `python3 scripts/sync_awin_feed.py cobasi`. Idempotente
e re-executável — cada linha do feed vira um upsert em lote (chave:
network + advertiser_id + external_product_id); produtos que desaparecem
do feed entre uma sincronização e outra são marcados active=False, nunca
apagados (histórico de preço/oferta fica preservado) — EXCETO quando o
feed baixado veio vazio (0 linhas): tratado como falha, nunca desativa o
catálogo anterior por um download ruim (ver §11 do doc de arquitetura
interno). Cada execução fica registrada em AffiliateFeedSyncRun — nunca o
feed bruto, nunca a URL (que contém a chave de API), nunca credenciais.

Lock: duas sincronizações do mesmo merchant não podem rodar ao mesmo
tempo — checado via uma linha "running" sem finished_at em
AffiliateFeedSyncRun (ver _acquire_lock).
"""
from __future__ import annotations

import csv
import gzip
import io
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer, AffiliateFeedSyncRun
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
    "condition,product_type,custom_1,custom_2,stock_status,in_stock,product_GTIN"
)
# Valores observados em feeds Awin reais até hoje: "disponível" é o valor
# confirmado no feed da Cobasi (13/08/2026, português); os demais ficam
# como fallback pra outros merchants/formatos. Zee Dog (22/08/2026) usa
# stock_status vazio e in_stock=1, por isso o parser tenta stock_status
# primeiro e cai para in_stock quando necessário.
_IN_STOCK_VALUES = {"1", "true", "yes", "in stock", "instock", "in_stock", "disponível", "disponivel"}
_OUT_OF_STOCK_VALUES = {"0", "false", "no", "out of stock", "indisponível", "indisponivel"}
TIMEOUT_SECONDS = 300  # feeds grandes (milhares de produtos) demoram
UPSERT_BATCH_SIZE = 500
# Uma sincronização "running" sem finished_at por mais que isso é
# considerada travada/morta (processo que crashou), não um lock válido —
# evita que uma falha sem cleanup bloqueie sync pra sempre.
STALE_LOCK_AFTER_MINUTES = 30


class AwinFeedSyncError(RuntimeError):
    pass


@dataclass
class AwinFeedSyncResult:
    merchant: str
    rows_seen: int
    rows_upserted: int
    rows_deactivated: int
    run_id: Optional[int] = None


def _sanitize_error(exc: Exception) -> str:
    """Mensagem curta e segura pra AffiliateFeedSyncRun.error_message —
    nunca stack trace inteiro, nunca a URL do feed (contém a datafeed
    key). Trunca de propósito."""
    text = f"{type(exc).__name__}: {exc}"
    # httpx inclui a URL completa (com a apikey) na representação de
    # HTTPStatusError/RequestError — nunca deixar isso ir pro banco.
    if "apikey" in text.lower():
        text = f"{type(exc).__name__} (detalhes omitidos — continham a URL do feed)"
    return text[:300]


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


def _parse_in_stock(value: str, *, field_name: str = "stock_status") -> Optional[bool]:
    if value is None or value == "":
        return None
    normalized = value.strip().lower()
    if normalized in _IN_STOCK_VALUES:
        return True
    if normalized in _OUT_OF_STOCK_VALUES:
        return False
    # Valor desconhecido: não presumir estoque (find_offer só considera
    # in_stock=True) nem falta de estoque — melhor não ofertar do que
    # ofertar errado, mas também não some silenciosamente um valor real
    # que só não reconhecemos ainda.
    logger.warning("[awin_feed_sync] %s desconhecido: %r", field_name, value)
    return None


def _availability_from_row(row: dict) -> Optional[bool]:
    stock_status = (row.get("stock_status") or "").strip()
    if stock_status:
        return _parse_in_stock(stock_status, field_name="stock_status")
    return _parse_in_stock((row.get("in_stock") or "").strip(), field_name="in_stock")


def _first_nonempty(*values: Optional[str]) -> Optional[str]:
    for value in values:
        cleaned = (value or "").strip()
        if cleaned:
            return cleaned
    return None


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
        category=_first_nonempty(row.get("category_name"), row.get("product_type"), row.get("merchant_category")),
        price=_parse_float(row.get("search_price", "")),
        currency="BRL",
        in_stock=_availability_from_row(row),
        merchant_url=(row.get("merchant_deep_link") or "").strip() or None,
        affiliate_url=(row.get("aw_deep_link") or "").strip() or None,
        image_url=(row.get("aw_image_url") or row.get("merchant_image_url") or "").strip() or None,
        last_synced_at=synced_at,
        active=True,
    )


def _upsert_batch(db: Session, batch: list[dict]) -> None:
    """Upsert em lote de verdade — UM statement compilado (com `excluded`,
    não valores per-row na cláusula SET) executado com a lista inteira do
    batch via executemany, em vez de um INSERT por linha. Chave:
    (network, advertiser_id, external_product_id), mesma unique
    constraint da tabela."""
    if not batch:
        return
    insert_fn = sqlite_insert if db.bind.dialect.name == "sqlite" else pg_insert
    stmt = insert_fn(AffiliateFeedOffer)
    update_cols = {
        k: getattr(stmt.excluded, k)
        for k in batch[0]
        if k not in ("network", "advertiser_id", "external_product_id")
    }
    stmt = stmt.on_conflict_do_update(
        index_elements=["network", "advertiser_id", "external_product_id"],
        set_=update_cols,
    )
    db.execute(stmt, batch)


def _acquire_lock(db: Session, merchant: str) -> None:
    """Impede duas sincronizações simultâneas do mesmo merchant. Uma
    "running" sem finished_at mais nova que STALE_LOCK_AFTER_MINUTES conta
    como lock ativo; mais velha que isso é considerada travada (processo
    morto sem cleanup) e não bloqueia — evita lock permanente por um crash
    sem tratamento."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=STALE_LOCK_AFTER_MINUTES)
    running = db.scalar(
        select(AffiliateFeedSyncRun).where(
            AffiliateFeedSyncRun.merchant == merchant,
            AffiliateFeedSyncRun.status == "running",
            AffiliateFeedSyncRun.finished_at.is_(None),
            AffiliateFeedSyncRun.started_at >= cutoff,
        )
    )
    if running is not None:
        raise AwinFeedSyncError(
            f"Já existe uma sincronização em andamento pra '{merchant}' (run_id={running.id}, "
            f"iniciada às {running.started_at.isoformat()}) — aguarde terminar."
        )


def sync_awin_feed(db: Session, merchant: str, *, datafeed_key: Optional[str] = None) -> AwinFeedSyncResult:
    settings = get_settings()
    if not settings.awin_sync_enabled:
        raise AwinFeedSyncError(
            "AWIN_SYNC_ENABLED=false — sync pausado deliberadamente (independente de "
            "awin_enabled/awin_shadow_mode, ver config.py)"
        )

    advertiser = get_awin_advertiser(merchant)
    if not advertiser:
        raise AwinFeedSyncError(f"Merchant desconhecido: {merchant!r}")
    if not advertiser.feed_available:
        raise AwinFeedSyncError(f"Merchant '{merchant}' não tem Product Feed disponível na Awin")

    key = datafeed_key or settings.awin_datafeed_key
    if not key:
        raise AwinFeedSyncError(
            "AWIN_DATAFEED_KEY não configurada — ver docs/AFFILIATES.md seção Awin"
        )

    _acquire_lock(db, merchant)

    run = AffiliateFeedSyncRun(
        network="awin",
        merchant=merchant,
        advertiser_id=advertiser.advertiser_id,
        feed_id=advertiser.feed_id,
        status="running",
    )
    db.add(run)
    db.commit()
    db.refresh(run)

    try:
        url = build_feed_url(advertiser, key)
        logger.info("[awin_feed_sync] baixando feed de %s (fid=%s, run_id=%s)", merchant, advertiser.feed_id, run.id)
        csv_text = fetch_feed_csv(url)
    except Exception as exc:  # noqa: BLE001 — precisa registrar qualquer falha e re-lançar
        run.status = "failed"
        run.finished_at = datetime.now(timezone.utc)
        run.error_message = _sanitize_error(exc)
        db.commit()
        raise AwinFeedSyncError(f"Falha ao baixar/descomprimir feed de '{merchant}': {run.error_message}") from exc

    synced_at = datetime.now(timezone.utc)
    rows_seen = 0
    rows_upserted = 0
    rows_with_gtin = 0
    rows_with_affiliate_url = 0
    rows_in_stock = 0
    batch: list[dict] = []

    try:
        reader = csv.DictReader(io.StringIO(csv_text))
        for row in reader:
            rows_seen += 1
            fields = _row_to_offer_fields(row, merchant, advertiser.advertiser_id, synced_at)
            if fields is None:
                continue
            batch.append(fields)
            rows_upserted += 1
            if fields.get("gtin"):
                rows_with_gtin += 1
            if fields.get("affiliate_url"):
                rows_with_affiliate_url += 1
            if fields.get("in_stock"):
                rows_in_stock += 1
            if len(batch) >= UPSERT_BATCH_SIZE:
                _upsert_batch(db, batch)
                db.commit()
                batch = []
        if batch:
            _upsert_batch(db, batch)
            db.commit()
    except Exception as exc:  # noqa: BLE001
        db.rollback()
        run.status = "failed"
        run.finished_at = datetime.now(timezone.utc)
        run.error_message = _sanitize_error(exc)
        run.rows_seen = rows_seen
        db.commit()
        raise AwinFeedSyncError(f"Falha ao processar feed de '{merchant}': {run.error_message}") from exc

    if rows_seen == 0:
        # Feed baixou (sem erro HTTP) mas veio vazio — nunca tratar como
        # sincronização válida: um feed vazio NUNCA deve desativar o
        # catálogo anterior silenciosamente (ver §11 do doc de arquitetura
        # interno). Marca a run como empty_feed e para aqui, sem tocar em
        # AffiliateFeedOffer.
        run.status = "empty_feed"
        run.finished_at = datetime.now(timezone.utc)
        run.rows_seen = 0
        db.commit()
        raise AwinFeedSyncError(
            f"Feed de '{merchant}' voltou vazio (0 linhas) — tratado como falha, "
            f"catálogo anterior preservado (run_id={run.id})"
        )

    # Produtos que saíram do feed entre uma sincronização e outra: marca
    # inativo em vez de apagar (histórico preservado; find_offer já filtra
    # active=True). Qualquer linha não tocada nesta rodada (last_synced_at
    # antigo) é considerada removida do catálogo do merchant. Só chega
    # aqui depois de confirmar rows_seen > 0 acima.
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
    rows_deactivated = result.rowcount or 0

    run.status = "success"
    run.finished_at = datetime.now(timezone.utc)
    run.rows_seen = rows_seen
    run.rows_upserted = rows_upserted
    run.rows_deactivated = rows_deactivated
    run.rows_with_gtin = rows_with_gtin
    run.rows_with_affiliate_url = rows_with_affiliate_url
    run.rows_in_stock = rows_in_stock
    db.commit()

    logger.info(
        "[awin_feed_sync] %s: %d linhas no feed, %d upserted, %d desativados (run_id=%s)",
        merchant, rows_seen, rows_upserted, rows_deactivated, run.id,
    )
    return AwinFeedSyncResult(
        merchant=merchant,
        rows_seen=rows_seen,
        rows_upserted=rows_upserted,
        rows_deactivated=rows_deactivated,
        run_id=run.id,
    )

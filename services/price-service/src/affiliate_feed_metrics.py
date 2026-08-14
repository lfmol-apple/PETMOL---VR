"""
Métricas de cobertura/saúde do catálogo de afiliados (AffiliateFeedOffer) —
observabilidade pra decidir quando um merchant está pronto pra virar
publicly_servable, nunca uma superfície pública (só admin, ver
admin/affiliate_feed_metrics_router.py). Não confundir com
AffiliateFeedSyncRun (histórico de execuções do job) — aqui é o estado
ATUAL do catálogo por merchant, dos dois lidos juntos.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer, AffiliateFeedSyncRun
from .awin_advertisers import AWIN_ADVERTISERS
from .config import get_settings


@dataclass(frozen=True)
class AffiliateFeedMerchantMetrics:
    merchant: str
    network: str
    rows_active: int
    rows_with_gtin: int
    rows_with_affiliate_url: int
    rows_in_stock: int
    coverage_gtin_rate: Optional[float]
    affiliate_url_present_rate: Optional[float]
    in_stock_rate: Optional[float]
    last_successful_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    is_stale: Optional[bool]
    publicly_servable: bool


def _rate(numerator: int, denominator: int) -> Optional[float]:
    if denominator == 0:
        return None
    return round(numerator / denominator, 4)


def compute_affiliate_feed_metrics(db: Session, network: str = "awin") -> list[AffiliateFeedMerchantMetrics]:
    """Uma linha por merchant configurado (AWIN_ADVERTISERS), mesmo os que
    nunca sincronizaram nada (rows_active=0) — pra deixar visível o que
    ainda falta, não só o que já existe."""
    from .awin_advertisers import is_awin_merchant_publicly_servable

    settings = get_settings()
    stale_cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.awin_stale_after_hours)

    counts_query = (
        select(
            AffiliateFeedOffer.merchant,
            func.count().label("rows_active"),
            func.count(AffiliateFeedOffer.gtin).label("rows_with_gtin"),
            func.count(AffiliateFeedOffer.affiliate_url).label("rows_with_affiliate_url"),
        )
        .where(AffiliateFeedOffer.network == network, AffiliateFeedOffer.active.is_(True))
        .group_by(AffiliateFeedOffer.merchant)
    )
    # `in_stock` é contado à parte (count condicional sobre Boolean não é
    # portável entre Postgres/SQLite do mesmo jeito que count(coluna
    # not-null) acima), numa segunda query simples.
    counts_rows = {row.merchant: row for row in db.execute(counts_query)}

    in_stock_query = (
        select(AffiliateFeedOffer.merchant, func.count())
        .where(
            AffiliateFeedOffer.network == network,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
        )
        .group_by(AffiliateFeedOffer.merchant)
    )
    in_stock_counts = dict(db.execute(in_stock_query).all())

    results: list[AffiliateFeedMerchantMetrics] = []
    for merchant in AWIN_ADVERTISERS:
        row = counts_rows.get(merchant)
        rows_active = int(row.rows_active) if row else 0
        rows_with_gtin = int(row.rows_with_gtin) if row else 0
        rows_with_affiliate_url = int(row.rows_with_affiliate_url) if row else 0
        rows_in_stock = int(in_stock_counts.get(merchant, 0))

        last_run = db.scalar(
            select(AffiliateFeedSyncRun)
            .where(
                AffiliateFeedSyncRun.network == network,
                AffiliateFeedSyncRun.merchant == merchant,
                AffiliateFeedSyncRun.status == "success",
            )
            .order_by(AffiliateFeedSyncRun.finished_at.desc())
            .limit(1)
        )
        last_any_run = db.scalar(
            select(AffiliateFeedSyncRun)
            .where(AffiliateFeedSyncRun.network == network, AffiliateFeedSyncRun.merchant == merchant)
            .order_by(AffiliateFeedSyncRun.started_at.desc())
            .limit(1)
        )

        is_stale: Optional[bool] = None
        if last_run is not None and last_run.finished_at is not None:
            finished_at = last_run.finished_at
            if finished_at.tzinfo is None:
                # SQLite (dev/teste) não preserva tzinfo mesmo em coluna
                # DateTime(timezone=True) — Postgres (prod) preserva.
                finished_at = finished_at.replace(tzinfo=timezone.utc)
            is_stale = finished_at < stale_cutoff
        elif rows_active > 0:
            # Há catálogo mas nenhum AffiliateFeedSyncRun de sucesso
            # registrado (ex: dado seedado direto em dev/teste) — não dá
            # pra afirmar staleness sem um sync real pra comparar.
            is_stale = None

        results.append(
            AffiliateFeedMerchantMetrics(
                merchant=merchant,
                network=network,
                rows_active=rows_active,
                rows_with_gtin=rows_with_gtin,
                rows_with_affiliate_url=rows_with_affiliate_url,
                rows_in_stock=rows_in_stock,
                coverage_gtin_rate=_rate(rows_with_gtin, rows_active),
                affiliate_url_present_rate=_rate(rows_with_affiliate_url, rows_active),
                in_stock_rate=_rate(rows_in_stock, rows_active),
                last_successful_sync_at=last_run.finished_at if last_run else None,
                last_sync_status=last_any_run.status if last_any_run else None,
                is_stale=is_stale,
                publicly_servable=is_awin_merchant_publicly_servable(merchant),
            )
        )
    return results

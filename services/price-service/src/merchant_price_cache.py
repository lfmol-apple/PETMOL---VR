"""
Cache PERSISTENTE do último preço visto por (merchant, gtin) — Fase 1-D.

Diferente dos TTLCache em memória do commerce_pricing.py: sobrevive a
restart, dá histórico e um fallback "visto por R$X" quando a consulta ao
vivo falha. Nunca é fonte de identidade — só de preço, e sempre marcado
como não-fresco quando servido do cache.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .product_catalog_lookup import MerchantPriceCache, normalize_gtin

logger = logging.getLogger(__name__)


def remember_price(
    db: Session, merchant: str, gtin: str, *,
    price: Optional[float], list_price: Optional[float] = None,
    product_name: Optional[str] = None, url: Optional[str] = None,
    source: str = "live",
) -> None:
    g = normalize_gtin(gtin or "")
    if not g or not merchant or price is None:
        return
    now = datetime.now(timezone.utc)
    try:
        row = db.scalar(
            select(MerchantPriceCache).where(
                MerchantPriceCache.merchant == merchant, MerchantPriceCache.gtin == g
            )
        )
        if row is None:
            db.add(MerchantPriceCache(
                merchant=merchant, gtin=g, price=price, list_price=list_price,
                product_name=product_name, url=url, source=source, checked_at=now,
            ))
        else:
            row.price = price
            row.list_price = list_price
            row.product_name = product_name or row.product_name
            row.url = url or row.url
            row.source = source
            row.checked_at = now
        db.flush()
    except Exception as exc:  # noqa: BLE001 — cache nunca derruba a request
        logger.info("[merchant_price_cache] remember falhou merchant=%s gtin=%s: %s", merchant, g, exc)
        db.rollback()


def recall_price(
    db: Session, merchant: str, gtin: str, *, max_age_days: int = 14
) -> Optional[MerchantPriceCache]:
    g = normalize_gtin(gtin or "")
    if not g:
        return None
    cutoff = datetime.now(timezone.utc) - timedelta(days=max_age_days)
    try:
        row = db.scalar(
            select(MerchantPriceCache).where(
                MerchantPriceCache.merchant == merchant, MerchantPriceCache.gtin == g
            )
        )
    except Exception:  # noqa: BLE001
        return None
    if row is None or row.price is None:
        return None
    checked = row.checked_at
    if checked is not None and checked.tzinfo is None:
        checked = checked.replace(tzinfo=timezone.utc)
    if checked is not None and checked < cutoff:
        return None
    return row

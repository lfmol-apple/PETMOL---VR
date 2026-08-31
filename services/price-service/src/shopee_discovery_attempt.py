"""
Discovery on-demand da Shopee — quando o tutor abre a Loja de um produto
com GTIN confiável mas ainda NÃO existe MarketplaceOffer Shopee, tenta
descobrir a oferta UMA vez, em background, com cooldown persistido.

Objetivo: cobertura maior sem inline (o cliente tem timeout de 5s e a
busca da Shopee é lenta) e sem enxurrada na API (cooldown por GTIN
sobrevive a restart, ao contrário de um cache só em memória).

Nunca: lote, scraping, produto sem GTIN, link inventado.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import Column, DateTime, Integer, String, select

from .config import get_settings
from .db import Base, SessionLocal, engine
from .product_catalog_lookup import normalize_gtin

logger = logging.getLogger(__name__)

# Miss por "nenhum candidato confiável" espera o cooldown cheio; erro de
# API espera bem menos (é transitório).
_API_ERROR_RETRY_HOURS = 1
_MAX_INFLIGHT = 4


class ShopeeDiscoveryAttempt(Base):
    """Uma linha por GTIN — quando tentamos descobrir a oferta Shopee pela
    última vez e o que aconteceu. Persistente de propósito (o cooldown não
    pode resetar a cada deploy)."""

    __tablename__ = "shopee_discovery_attempts"

    gtin = Column(String(20), primary_key=True)
    last_attempt_at = Column(DateTime(timezone=True), nullable=False)
    last_result = Column(String(16), nullable=False)  # matched | no_match | api_error
    attempts = Column(Integer, nullable=False, default=1)


Base.metadata.create_all(bind=engine, tables=[ShopeeDiscoveryAttempt.__table__])

# GTINs com sync em andamento agora — evita disparar 2 threads pro mesmo
# GTIN quando várias requests chegam juntas. Limite duro de concorrência.
_inflight: set[str] = set()
_inflight_lock = threading.Lock()


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def should_attempt_discovery(db, gtin: str) -> bool:
    """True quando nunca tentamos esse GTIN ou o cooldown já expirou."""
    gtin_n = normalize_gtin(gtin)
    if not gtin_n:
        return False
    row = db.get(ShopeeDiscoveryAttempt, gtin_n)
    if row is None:
        return True
    settings = get_settings()
    hours = _API_ERROR_RETRY_HOURS if row.last_result == "api_error" else settings.shopee_miss_retry_hours
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    return _aware(row.last_attempt_at) < cutoff


def record_attempt(db, gtin: str, result: str) -> None:
    gtin_n = normalize_gtin(gtin)
    if not gtin_n:
        return
    now = datetime.now(timezone.utc)
    row = db.get(ShopeeDiscoveryAttempt, gtin_n)
    if row is None:
        db.add(ShopeeDiscoveryAttempt(gtin=gtin_n, last_attempt_at=now, last_result=result, attempts=1))
    else:
        row.last_attempt_at = now
        row.last_result = result
        row.attempts = (row.attempts or 0) + 1
    db.commit()


def _run_discovery(gtin_n: str) -> None:
    from .shopee_offer_sync import sync_shopee_offer_for_gtin

    db = SessionLocal()
    try:
        result = sync_shopee_offer_for_gtin(db, gtin_n)
        reason = (result.reason or "").lower()
        if result.matched:
            outcome = "matched"
        elif "erro na api" in reason:
            outcome = "api_error"
        else:
            outcome = "no_match"
        record_attempt(db, gtin_n, outcome)
        logger.info("shopee discovery on-demand: gtin=%s -> %s", gtin_n, outcome)
    except Exception as exc:  # noqa: BLE001 — best-effort, nunca propaga pra request
        db.rollback()
        try:
            record_attempt(db, gtin_n, "api_error")
        except Exception:
            pass
        logger.warning("shopee discovery on-demand: gtin=%s erro: %s", gtin_n, exc)
    finally:
        db.close()
        with _inflight_lock:
            _inflight.discard(gtin_n)


def schedule_shopee_discovery(gtin: str) -> bool:
    """Agenda (não bloqueia) um sync best-effort pra UM GTIN. Retorna True
    se agendou, False se pulou (já em andamento, sem vaga ou GTIN ruim)."""
    gtin_n = normalize_gtin(gtin)
    if not gtin_n:
        return False
    with _inflight_lock:
        if gtin_n in _inflight or len(_inflight) >= _MAX_INFLIGHT:
            return False
        _inflight.add(gtin_n)
    threading.Thread(target=_run_discovery, args=(gtin_n,), daemon=True).start()
    return True

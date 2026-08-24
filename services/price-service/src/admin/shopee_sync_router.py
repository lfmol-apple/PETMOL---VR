"""
Gatilho HTTP pro sync em lote da Shopee (shopee_offer_sync.py) — existe
pra poder disparar e acompanhar isso via HTTPS, sem precisar de uma
sessão SSH toda vez (ver docs/AFFILIATES.md, seção Shopee).

Roda em thread própria (threading.Thread, nunca asyncio.BackgroundTasks
puro) de propósito: sync_shopee_offer_for_gtin faz chamada de rede e de
banco BLOQUEANTES; se isto rodasse na mesma event loop do FastAPI,
travaria o servidor inteiro pelos ~40 minutos que o lote inteiro leva.
Uma thread daemon separada mantém o resto da API respondendo normalmente
enquanto o sync roda.

Autenticação: token dedicado (SHOPEE_SYNC_TRIGGER_TOKEN), separado do
ADMIN_OPS_API_KEY — aquele é só leitura por design (ver admin/deps.py,
"nunca em rota de escrita"); este endpoint tem efeito colateral real
(grava MarketplaceOffer), então nunca reaproveita a chave read-only.
"""
from __future__ import annotations

import hmac
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from ..config import get_settings
from ..db import SessionLocal
from ..product_catalog_lookup import ProductCatalog
from ..shopee_offer_sync import (
    iter_awin_feed_products,
    iter_unified_awin_feed_products,
    sync_shopee_offer_for_gtin,
    sync_shopee_offer_from_feed_row,
)
from ..shopee_offer_audit import audit_active_shopee_offers
from .deps import get_current_admin_or_readonly_key
from .shopee_sync_state import STATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/shopee-sync", tags=["Admin Shopee Sync"])

DEFAULT_CATEGORIES = ["food", "antiparasite", "medication", "hygiene", "dewormer", "collar"]
ALLOWED_SOURCES = {"categories", "awin_feed", "awin_feed_all"}


class RunRequest(BaseModel):
    categories: Optional[list[str]] = None
    # "categories": products_catalog filtrado por categoria (só o que já
    #   foi escaneado por algum tutor).
    # "awin_feed": catálogo real do feed Awin/Cobasi (milhares de produtos,
    #   independente do que qualquer tutor específico já cadastrou —
    #   cria a entrada em products_catalog quando ainda não existir).
    # "awin_feed_all": catálogo unificado Cobasi + Zee Now + Zee Dog,
    #   deduplicado por GTIN e incremental por padrão.
    source: str = "categories"
    feed_merchant: str = "cobasi"
    feed_merchants: Optional[list[str]] = None
    skip_existing_shopee: bool = True
    audit_existing_shopee: bool = True
    deactivate_invalid_shopee: bool = True


def _require_token(x_sync_token: Optional[str]) -> None:
    settings = get_settings()
    if not settings.shopee_sync_trigger_token or not x_sync_token or not hmac.compare_digest(
        x_sync_token, settings.shopee_sync_trigger_token
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


def _run_sync(
    categories: list[str],
    source: str = "categories",
    feed_merchant: str = "cobasi",
    feed_merchants: Optional[list[str]] = None,
    skip_existing_shopee: bool = True,
    audit_existing_shopee: bool = True,
    deactivate_invalid_shopee: bool = True,
) -> None:
    db = SessionLocal()
    try:
        source_merchants = tuple(feed_merchants or ["cobasi", "zeenow", "zeedog"])
        if source == "awin_feed_all" and audit_existing_shopee:
            with STATE.lock:
                STATE.phase = "auditing_existing_shopee"
            audit = audit_active_shopee_offers(
                db,
                source_merchants=source_merchants,
                deactivate_invalid=deactivate_invalid_shopee,
            )
            with STATE.lock:
                STATE.audit_total = audit.total
                STATE.audit_invalid = audit.invalid
                STATE.audit_deactivated = audit.deactivated

        with STATE.lock:
            STATE.phase = "building_queue"

        if source == "awin_feed_all":
            items: list[tuple[str, Optional[str], Optional[str]]] = iter_unified_awin_feed_products(
                db,
                merchants=source_merchants,
                skip_existing_shopee=skip_existing_shopee,
            )
        elif source == "awin_feed":
            items = iter_awin_feed_products(
                db,
                merchant=feed_merchant,
                skip_existing_shopee=skip_existing_shopee,
            )
        else:
            rows = db.query(ProductCatalog.barcode_normalized).filter(
                ProductCatalog.category.in_(categories),
                ProductCatalog.name.isnot(None),
                ProductCatalog.brand.isnot(None),
            ).all()
            items = [(r[0], None, None) for r in rows]

        with STATE.lock:
            STATE.total = len(items)
            STATE.processed = 0
            STATE.matched = 0
            STATE.error = None
            STATE.finished_at = None
            STATE.phase = "syncing"

        sync_from_feed_source = source in {"awin_feed", "awin_feed_all"}
        for gtin, name, brand in items:
            try:
                if sync_from_feed_source:
                    result = sync_shopee_offer_from_feed_row(db, gtin, name or "", brand)
                else:
                    result = sync_shopee_offer_for_gtin(db, gtin)
                matched = result.matched
            except Exception as exc:  # noqa: BLE001 — um GTIN ruim não pode derrubar o lote inteiro
                logger.warning("shopee sync (admin trigger): erro inesperado em gtin=%s: %s", gtin, exc)
                matched = False
            with STATE.lock:
                STATE.processed += 1
                if matched:
                    STATE.matched += 1
            time.sleep(0.4)
    except Exception as exc:  # noqa: BLE001 — job em background, precisa registrar erro em vez de sumir calado
        logger.exception("shopee sync (admin trigger): erro fatal no lote")
        with STATE.lock:
            STATE.error = str(exc)
    finally:
        db.close()
        with STATE.lock:
            STATE.running = False
            STATE.phase = "finished" if STATE.error is None else "error"
            STATE.finished_at = datetime.now(timezone.utc).isoformat()


@router.post("/run")
def run_sync(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _require_token(x_sync_token)
    if payload.source not in ALLOWED_SOURCES:
        raise HTTPException(status_code=400, detail=f"source inválido: {payload.source}")
    with STATE.lock:
        if STATE.running:
            return {"started": False, "reason": "already_running"}
        STATE.running = True
        STATE.started_at = datetime.now(timezone.utc).isoformat()
        STATE.phase = "starting"
        STATE.audit_total = 0
        STATE.audit_invalid = 0
        STATE.audit_deactivated = 0

    categories = payload.categories or DEFAULT_CATEGORIES
    thread = threading.Thread(
        target=_run_sync,
        args=(
            categories,
            payload.source,
            payload.feed_merchant,
            payload.feed_merchants,
            payload.skip_existing_shopee,
            payload.audit_existing_shopee,
            payload.deactivate_invalid_shopee,
        ),
        daemon=True,
    )
    thread.start()
    return {
        "started": True,
        "categories": categories,
        "source": payload.source,
        "feed_merchant": payload.feed_merchant,
        "feed_merchants": payload.feed_merchants,
        "skip_existing_shopee": payload.skip_existing_shopee,
        "audit_existing_shopee": payload.audit_existing_shopee,
        "deactivate_invalid_shopee": payload.deactivate_invalid_shopee,
    }


@router.get("/status")
def get_status(x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _require_token(x_sync_token)
    return _status_payload()


@router.get("/progress")
def get_progress(_current=Depends(get_current_admin_or_readonly_key)):
    return _status_payload()


def _status_payload():
    with STATE.lock:
        total = STATE.total
        processed = STATE.processed
        matched = STATE.matched
        percent = round((processed / total) * 100, 2) if total else 0.0
        match_rate = round((matched / processed) * 100, 2) if processed else 0.0
        return {
            "running": STATE.running,
            "phase": STATE.phase,
            "total": total,
            "processed": processed,
            "matched": matched,
            "audit_total": STATE.audit_total,
            "audit_invalid": STATE.audit_invalid,
            "audit_deactivated": STATE.audit_deactivated,
            "percent": percent,
            "remaining": max(total - processed, 0),
            "match_rate": match_rate,
            "started_at": STATE.started_at,
            "finished_at": STATE.finished_at,
            "error": STATE.error,
        }

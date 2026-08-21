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

from fastapi import APIRouter, Header, HTTPException, status
from pydantic import BaseModel

from ..config import get_settings
from ..db import SessionLocal
from ..product_catalog_lookup import ProductCatalog
from ..shopee_offer_sync import iter_awin_feed_products, sync_shopee_offer_for_gtin, sync_shopee_offer_from_feed_row
from .shopee_sync_state import STATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/shopee-sync", tags=["Admin Shopee Sync"])

DEFAULT_CATEGORIES = ["food", "antiparasite", "medication", "hygiene", "dewormer", "collar"]


class RunRequest(BaseModel):
    categories: Optional[list[str]] = None
    # "categories": products_catalog filtrado por categoria (só o que já
    #   foi escaneado por algum tutor).
    # "awin_feed": catálogo real do feed Awin/Cobasi (milhares de produtos,
    #   independente do que qualquer tutor específico já cadastrou —
    #   cria a entrada em products_catalog quando ainda não existir).
    source: str = "categories"
    feed_merchant: str = "cobasi"


def _require_token(x_sync_token: Optional[str]) -> None:
    settings = get_settings()
    if not settings.shopee_sync_trigger_token or not x_sync_token or not hmac.compare_digest(
        x_sync_token, settings.shopee_sync_trigger_token
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


def _run_sync(categories: list[str], source: str = "categories", feed_merchant: str = "cobasi") -> None:
    db = SessionLocal()
    try:
        if source == "awin_feed":
            items: list[tuple[str, Optional[str], Optional[str]]] = iter_awin_feed_products(db, merchant=feed_merchant)
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

        for gtin, name, brand in items:
            try:
                if source == "awin_feed":
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
            STATE.finished_at = datetime.now(timezone.utc).isoformat()


@router.post("/run")
def run_sync(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _require_token(x_sync_token)
    with STATE.lock:
        if STATE.running:
            return {"started": False, "reason": "already_running"}
        STATE.running = True
        STATE.started_at = datetime.now(timezone.utc).isoformat()

    categories = payload.categories or DEFAULT_CATEGORIES
    thread = threading.Thread(
        target=_run_sync, args=(categories, payload.source, payload.feed_merchant), daemon=True
    )
    thread.start()
    return {"started": True, "categories": categories, "source": payload.source, "feed_merchant": payload.feed_merchant}


@router.get("/status")
def get_status(x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _require_token(x_sync_token)
    with STATE.lock:
        return {
            "running": STATE.running,
            "total": STATE.total,
            "processed": STATE.processed,
            "matched": STATE.matched,
            "started_at": STATE.started_at,
            "finished_at": STATE.finished_at,
            "error": STATE.error,
        }

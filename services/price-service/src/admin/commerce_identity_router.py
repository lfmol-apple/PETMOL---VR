"""
Gatilho + relatório HTTP da auditoria de identidade comercial
(commerce_identity_audit.py) — mesma família do shopee-sync router: roda
em thread própria (a auditoria faz chamada de rede pra resolver o destino
de links mais.app e busca ao vivo na Cobasi), e o gatilho de escrita usa
o token dedicado, não a chave read-only.

Autenticação:
  - POST /run   → SHOPEE_SYNC_TRIGGER_TOKEN (reusado — mesma classe de
                  operação de comércio; grava CommerceIdentityCheck e pode
                  desativar ProductAffiliateLink).
  - GET /report → chave admin read-only.
"""
from __future__ import annotations

import asyncio
import hmac
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from ..affiliate_links import ProductAffiliateLink
from ..commerce_identity_audit import audit_commerce_identity, identity_report
from ..config import get_settings
from ..db import SessionLocal
from ..product_catalog_lookup import ProductCatalog
from ..shopee_offer_sync import iter_launch_coverage_queue
from .deps import get_current_admin_or_readonly_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/commerce-identity", tags=["Admin Commerce Identity"])

_MAX_GTINS_PER_RUN = 800

STATE: dict = {"phase": "idle", "total": 0, "processed": 0, "started_at": None, "finished_at": None, "report": None, "error": None}
_lock = threading.Lock()


class RunRequest(BaseModel):
    # Sem gtins → monta a fila (links Cobasi cadastrados + ofertas Shopee
    # ativas + GTINs usados pelos tutores), deduplicada, cortada no teto.
    gtins: Optional[list[str]] = None
    deactivate_hard_links: bool = True


def _authorize(x_sync_token: Optional[str]) -> None:
    token = get_settings().shopee_sync_trigger_token
    if not token or not x_sync_token or not hmac.compare_digest(x_sync_token, token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token inválido")


def _build_queue(db) -> list[str]:
    seen: set[str] = set()
    queue: list[str] = []

    def _add(g: Optional[str]) -> None:
        if g and g not in seen:
            seen.add(g)
            queue.append(g)

    # A) GTINs com link Cobasi cadastrado (o caso "abre produto diferente")
    for pid in db.scalars(
        select(ProductAffiliateLink.product_id).where(
            ProductAffiliateLink.merchant == "cobasi", ProductAffiliateLink.active.is_(True)
        )
    ):
        prod = db.get(ProductCatalog, pid)
        if prod:
            _add(prod.barcode_normalized)

    # B) fila de cobertura já existente (ofertas Shopee ativas → tutores → Awin)
    items, _total = iter_launch_coverage_queue(db, max_products=_MAX_GTINS_PER_RUN)
    for gtin, _n, _b in items:
        _add(gtin)

    return queue[:_MAX_GTINS_PER_RUN]


def _run(gtins: list[str], deactivate_hard_links: bool) -> None:
    db = SessionLocal()
    try:
        with _lock:
            STATE.update(phase="running", total=len(gtins), processed=0,
                         started_at=datetime.now(timezone.utc).isoformat(),
                         finished_at=None, report=None, error=None)
        report = asyncio.run(audit_commerce_identity(db, gtins, deactivate_hard_links=deactivate_hard_links))
        with _lock:
            STATE.update(
                phase="done", processed=report.total,
                finished_at=datetime.now(timezone.utc).isoformat(),
                report={"total": report.total, "counts": report.counts,
                        "deactivated_links": report.deactivated_links},
            )
        logger.info("[commerce_identity_audit] concluído: %s", STATE["report"])
    except Exception as exc:  # noqa: BLE001
        logger.exception("[commerce_identity_audit] falhou")
        with _lock:
            STATE.update(phase="error", error=str(exc), finished_at=datetime.now(timezone.utc).isoformat())
    finally:
        db.close()


@router.post("/run")
def run_audit(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    with _lock:
        if STATE["phase"] == "running":
            raise HTTPException(status_code=409, detail="auditoria já em andamento")
    db = SessionLocal()
    try:
        gtins = [g.strip() for g in (payload.gtins or []) if g and g.strip()] or _build_queue(db)
    finally:
        db.close()
    if not gtins:
        return {"started": False, "reason": "fila vazia"}
    threading.Thread(target=_run, args=(gtins, payload.deactivate_hard_links), daemon=True).start()
    return {"started": True, "queued": len(gtins)}


@router.get("/status")
def audit_status(_admin=Depends(get_current_admin_or_readonly_key)):
    with _lock:
        return dict(STATE)


@router.get("/report")
def audit_report(limit: int = 500, _admin=Depends(get_current_admin_or_readonly_key)):
    db = SessionLocal()
    try:
        return identity_report(db, limit=limit)
    finally:
        db.close()

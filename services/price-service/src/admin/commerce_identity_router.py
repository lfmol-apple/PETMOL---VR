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
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select

from ..affiliate_links import MarketplaceOffer, ProductAffiliateLink
from ..affiliate_feed import AffiliateFeedOffer
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


@router.get("/product-report")
def product_identity_product_report(_admin=Depends(get_current_admin_or_readonly_key)):
    """Aggregated Product Identity report.

    Product Identity != Merchant Match != Monetization != Price.
    No secrets and no affiliate URLs are returned.
    """
    db = SessionLocal()
    try:
        settings = get_settings()
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.marketplace_offer_stale_after_hours)
        total_products = int(db.query(func.count(ProductCatalog.id)).scalar() or 0)

        merchants: dict[str, dict] = {}
        for merchant in ("cobasi", "shopee"):
            merchants[merchant] = {
                "identity_exact": 0,
                "high_confidence": 0,
                "ambiguous": 0,
                "conflict": 0,
                "no_match": 0,
                "active_offers": 0,
                "fresh_prices": 0,
                "stale_prices": 0,
                "errors_refresh": 0,
                "last_refresh": None,
            }

        cobasi_links = int(db.query(func.count(ProductAffiliateLink.id)).filter(
            ProductAffiliateLink.merchant == "cobasi",
            ProductAffiliateLink.active.is_(True),
        ).scalar() or 0)
        cobasi_feed = int(db.query(func.count(AffiliateFeedOffer.id)).filter(
            AffiliateFeedOffer.merchant == "cobasi",
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.gtin.isnot(None),
        ).scalar() or 0)
        merchants["cobasi"]["identity_exact"] = cobasi_links + cobasi_feed
        merchants["cobasi"]["active_offers"] = cobasi_links

        rows = db.scalars(select(MarketplaceOffer).where(MarketplaceOffer.merchant == "shopee")).all()
        reason_counts: dict[str, int] = {}
        for row in rows:
            bucket = merchants.setdefault(row.merchant, dict(merchants["shopee"]))
            decision = (row.match_decision or "").upper()
            if decision == "EXACT":
                bucket["identity_exact"] += 1
            elif decision == "HIGH_CONFIDENCE":
                bucket["high_confidence"] += 1
            elif decision == "AMBIGUOUS":
                bucket["ambiguous"] += 1
            elif decision == "CONFLICT":
                bucket["conflict"] += 1
            else:
                bucket["no_match"] += 1
            if row.active:
                bucket["active_offers"] += 1
            checked = row.last_checked_at or row.verified_at
            if checked is not None and checked.tzinfo is None:
                checked = checked.replace(tzinfo=timezone.utc)
            if checked is not None:
                current = bucket["last_refresh"]
                if current is None or checked.isoformat() > current:
                    bucket["last_refresh"] = checked.isoformat()
                if checked >= cutoff and row.price is not None and row.is_available is True:
                    bucket["fresh_prices"] += 1
                else:
                    bucket["stale_prices"] += 1
            if row.price_refresh_status in {"api_error", "timeout", "identity_conflict"}:
                bucket["errors_refresh"] += 1
            for reason in _safe_json_list(row.match_reasons_json):
                reason_counts[reason] = reason_counts.get(reason, 0) + 1

        return {
            "total_master_products": total_products,
            "merchants": merchants,
            "match_quality": {
                "gtin_exact": reason_counts.get("GTIN_EXACT", 0),
                "textual_fallback": reason_counts.get("TEXT_STRONG_MATCH", 0) + reason_counts.get("FAMILY_MATCH", 0),
                "rejected_by_weight": reason_counts.get("WEIGHT_KG_CONFLICT", 0),
                "rejected_by_species": reason_counts.get("SPECIES_CONFLICT", 0),
                "rejected_by_volume": reason_counts.get("VOLUME_ML_CONFLICT", 0),
                "rejected_by_length": reason_counts.get("LENGTH_CM_CONFLICT", 0),
                "rejected_by_pack_count": reason_counts.get("PACK_COUNT_CONFLICT", 0),
                "rejected_by_therapeutic_line": reason_counts.get("THERAPEUTIC_ATTRIBUTES_CONFLICT", 0),
            },
            "price_job": {
                "merchant": "shopee",
                "timer": "deploy/systemd/petmol-commerce-price-refresh.timer",
                "frequency": "every 6 hours with 15 minutes randomized delay",
                "scope": "active validated MarketplaceOffer rows only; never creates or swaps SKU",
            },
        }
    finally:
        db.close()


def _safe_json_list(raw: str | None) -> list[str]:
    if not raw:
        return []
    import json

    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item]

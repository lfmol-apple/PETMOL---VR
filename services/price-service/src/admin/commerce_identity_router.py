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


@router.get("/product/{gtin}")
def product_identity_detail(gtin: str, _admin=Depends(get_current_admin_or_readonly_key)):
    """Observabilidade por GTIN: identidade canônica do ProductCatalog, de
    onde cada campo veio (identity_evidence_json), as linhas de feed Awin
    que alimentaram, e as ofertas/matches por merchant. Sem secrets, sem
    affiliate URLs."""
    import json

    from ..product_catalog_lookup import normalize_gtin

    g = normalize_gtin(gtin or "")
    db = SessionLocal()
    try:
        product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == g)) if g else None
        feed_rows = list(db.scalars(
            select(AffiliateFeedOffer).where(AffiliateFeedOffer.gtin == g, AffiliateFeedOffer.active.is_(True))
        )) if g else []
        offers = list(db.scalars(
            select(MarketplaceOffer)
            .where(MarketplaceOffer.product_id == (product.id if product else -1), MarketplaceOffer.active.is_(True))
        )) if product else []

        def _catalog_view(p: ProductCatalog) -> dict:
            try:
                evidence = json.loads(p.identity_evidence_json or "{}")
            except Exception:
                evidence = {}
            return {
                "product_id": p.id,
                "gtin": p.barcode_normalized,
                "canonical_name": p.canonical_name or p.name,
                "canonical_brand": p.canonical_brand or p.brand,
                "species": p.species,
                "product_family": p.product_family,
                "product_line": p.product_line,
                "weight_kg": p.weight_kg,
                "volume_ml": p.volume_ml,
                "length_cm": p.length_cm,
                "pack_count": p.pack_count,
                "animal_weight_range": (
                    [p.animal_weight_min_kg, p.animal_weight_max_kg]
                    if p.animal_weight_min_kg is not None else None
                ),
                "breed_size": p.breed_size,
                "flavor": p.flavor,
                "therapeutic_attributes": _safe_json_list(p.therapeutic_attributes_json),
                "aliases": _safe_json_list(p.identity_aliases_json),
                "image_url": p.thumbnail_url,
                "source_primary": p.source_primary,
                "source_confidence": p.source_confidence,
                "identity_enriched_at": p.identity_enriched_at.isoformat() if p.identity_enriched_at else None,
                "evidence": evidence,
            }

        return {
            "gtin": g,
            "catalog": _catalog_view(product) if product else None,
            "feed_sources": [
                {
                    "merchant": r.merchant, "network": r.network,
                    "title": r.title, "brand": r.brand, "category": r.category,
                    "has_description": bool(r.description), "mpn": r.mpn,
                    "in_stock": r.in_stock, "has_image": bool(r.image_url),
                }
                for r in feed_rows
            ],
            "merchant_offers": [
                {
                    "merchant": o.merchant, "seller": o.seller_name,
                    "merchant_title": o.merchant_title, "merchant_gtin": o.merchant_gtin,
                    "match_decision": o.match_decision, "match_confidence": o.match_confidence,
                    "match_reasons": _safe_json_list(o.match_reasons_json),
                    "price": o.price, "is_available": o.is_available,
                    "last_checked_at": o.last_checked_at.isoformat() if o.last_checked_at else None,
                }
                for o in offers
            ],
        }
    finally:
        db.close()


class SkuGroupPairRequest(BaseModel):
    gtin_a: str
    gtin_b: str
    by: str = "admin"


def _safe_json(raw):
    import json as _json
    try:
        return _json.loads(raw or "{}")
    except Exception:
        return {}


@router.get("/sku-group/{gtin}")
def sku_group_detail(gtin: str, _admin=Depends(get_current_admin_or_readonly_key)):
    """Por que estes GTINs estão (ou NÃO estão) no mesmo grupo de SKU."""
    from ..product_catalog_lookup import SkuGroupMember, normalize_gtin
    from .. import sku_grouping as sg

    g = normalize_gtin(gtin or "")
    db = SessionLocal()
    try:
        rows = db.scalars(select(SkuGroupMember).where(SkuGroupMember.member_gtin == g)).all() if g else []
        keys = [r.group_key for r in rows if r.status == "active"]
        members = db.scalars(
            select(SkuGroupMember).where(SkuGroupMember.group_key.in_(keys))
        ).all() if keys else []
        product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == g)) if g else None
        near_misses = []
        if product is not None:
            slug = sg._brand_slug(product.canonical_brand or product.brand,
                                  name_hint=product.canonical_name or product.name)
            for cand in sg._candidate_gtins(db, product, slug)[:40]:
                d = sg.evaluate_pair(db, g, cand)
                if not d.grouped:
                    near_misses.append({"gtin": cand, "reason": d.reason, "basis": d.basis})
        return {
            "gtin": g,
            "memberships": [
                {"group_key": r.group_key, "basis": r.match_basis, "status": r.status,
                 "confidence": r.confidence, "confirmed_by": r.confirmed_by,
                 "canonical_gtin": r.canonical_gtin, "evidence": _safe_json(r.evidence_json)}
                for r in rows
            ],
            "group_members": sorted({m.member_gtin for m in members if m.status == "active"}),
            "not_grouped": near_misses,
        }
    finally:
        db.close()


@router.post("/sku-group/confirm")
def sku_group_confirm(payload: SkuGroupPairRequest,
                      x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    from .. import sku_grouping as sg

    db = SessionLocal()
    try:
        key = sg.confirm_membership(db, payload.gtin_a, payload.gtin_b, payload.by)
        db.commit()
        return {"ok": True, "group_key": key}
    finally:
        db.close()


@router.post("/sku-group/reject")
def sku_group_reject(payload: SkuGroupPairRequest,
                     x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    from .. import sku_grouping as sg

    db = SessionLocal()
    try:
        key = sg.reject_pair(db, payload.gtin_a, payload.gtin_b, payload.by)
        db.commit()
        return {"ok": True, "group_key": key}
    finally:
        db.close()

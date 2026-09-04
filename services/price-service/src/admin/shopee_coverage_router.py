"""Admin — cobertura Shopee x Cobasi.

Lista os produtos que aparecem na Cobasi e NÃO têm oferta Shopee
validada, com o motivo e a sugestão. Regenerada ao fim do job noturno
(ver shopee_sync_router). Ações de normalização manual, individuais e em
massa.
"""
from __future__ import annotations

import csv
import io
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from ..affiliate_links import MarketplaceOffer
from ..db import get_db
from ..product_catalog_lookup import ProductCatalog, normalize_gtin
from ..shopee_coverage_gaps import ShopeeCoverageGap, rebuild_shopee_coverage_gaps
from ..shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .deps import get_current_admin

router = APIRouter(prefix="/v1/admin/shopee-coverage", tags=["Admin Shopee Coverage"])

_REASONS = ("never_searched", "no_confident_match", "only_conflicting", "has_unverified_offer", "api_error")
_STATUSES = ("open", "cobasi_only", "resolved")


class GapOut(BaseModel):
    id: int
    gtin: str
    product_id: Optional[int]
    product_name: Optional[str]
    category: Optional[str]
    cobasi_price: Optional[float]
    cobasi_title: Optional[str]
    reason: str
    reason_detail: Optional[str]
    suggestion: Optional[str]
    seen_by_tutor: bool
    discovery_attempts: int
    status: str
    resolved_note: Optional[str]
    first_seen_at: Optional[datetime]
    last_seen_at: Optional[datetime]


class GapListOut(BaseModel):
    total: int
    items: list[GapOut]


class ResolveRequest(BaseModel):
    action: str  # register_offer | cobasi_only | reopen | retry
    affiliate_url: Optional[str] = None
    direct_url: Optional[str] = None
    price: Optional[float] = None
    note: Optional[str] = None


class BulkRequest(BaseModel):
    action: str  # cobasi_only | reopen | retry
    ids: list[int]
    note: Optional[str] = None


def _to_out(g: ShopeeCoverageGap) -> GapOut:
    return GapOut(
        id=g.id, gtin=g.gtin, product_id=g.product_id, product_name=g.product_name,
        category=g.category, cobasi_price=g.cobasi_price, cobasi_title=g.cobasi_title,
        reason=g.reason, reason_detail=g.reason_detail, suggestion=g.suggestion,
        seen_by_tutor=g.seen_by_tutor, discovery_attempts=g.discovery_attempts,
        status=g.status, resolved_note=g.resolved_note,
        first_seen_at=g.first_seen_at, last_seen_at=g.last_seen_at,
    )


def _query(db: Session, *, status, reason, category, seen_by_tutor, q, min_price, max_price, sort):
    stmt = select(ShopeeCoverageGap)
    if status:
        stmt = stmt.where(ShopeeCoverageGap.status == status)
    if reason:
        stmt = stmt.where(ShopeeCoverageGap.reason == reason)
    if category:
        stmt = stmt.where(ShopeeCoverageGap.category == category)
    if seen_by_tutor is not None:
        stmt = stmt.where(ShopeeCoverageGap.seen_by_tutor.is_(seen_by_tutor))
    if min_price is not None:
        stmt = stmt.where(ShopeeCoverageGap.cobasi_price >= min_price)
    if max_price is not None:
        stmt = stmt.where(ShopeeCoverageGap.cobasi_price <= max_price)
    if q:
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            ShopeeCoverageGap.product_name.ilike(like) | ShopeeCoverageGap.gtin.ilike(like)
        )
    if sort == "price_desc":
        stmt = stmt.order_by(ShopeeCoverageGap.cobasi_price.is_(None), ShopeeCoverageGap.cobasi_price.desc())
    elif sort == "price_asc":
        stmt = stmt.order_by(ShopeeCoverageGap.cobasi_price.is_(None), ShopeeCoverageGap.cobasi_price.asc())
    else:  # relevância: tutor primeiro, depois mais caro
        stmt = stmt.order_by(ShopeeCoverageGap.seen_by_tutor.desc(), ShopeeCoverageGap.cobasi_price.desc().nullslast())
    return stmt


@router.get("", response_model=GapListOut)
def list_gaps(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
    status: str = Query("open"),
    reason: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    seen_by_tutor: Optional[bool] = Query(None),
    q: Optional[str] = Query(None),
    min_price: Optional[float] = Query(None),
    max_price: Optional[float] = Query(None),
    sort: str = Query("relevance"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    if status not in _STATUSES and status != "all":
        raise HTTPException(400, f"status inválido: {status}")
    stmt = _query(db, status=None if status == "all" else status, reason=reason, category=category,
                  seen_by_tutor=seen_by_tutor, q=q, min_price=min_price, max_price=max_price, sort=sort)
    total = db.scalar(select(text("count(*)")).select_from(stmt.subquery())) or 0
    items = list(db.scalars(stmt.limit(limit).offset(offset)))
    return GapListOut(total=int(total), items=[_to_out(g) for g in items])


@router.get("/summary")
def summary(_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    rows = db.execute(text("""
        select status, reason, count(*) n, count(*) filter (where seen_by_tutor) tutor
        from shopee_coverage_gaps group by status, reason
    """)).fetchall()
    by_status: dict[str, int] = {}
    by_reason: dict[str, int] = {}
    tutor_open = 0
    for st, rs, n, tut in rows:
        by_status[st] = by_status.get(st, 0) + n
        if st == "open":
            by_reason[rs] = by_reason.get(rs, 0) + n
            tutor_open += tut
    cats = db.execute(text(
        "select category, count(*) n from shopee_coverage_gaps where status='open' group by category order by n desc"
    )).fetchall()
    last = db.execute(text("select max(last_seen_at) from shopee_coverage_gaps")).scalar()
    return {
        "by_status": by_status, "by_reason": by_reason, "tutor_open": tutor_open,
        "by_category": [{"category": c or "(sem)", "n": n} for c, n in cats],
        "last_rebuild": last.isoformat() if last else None,
    }


@router.get("/categories")
def categories(_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    rows = db.execute(text(
        "select distinct category from shopee_coverage_gaps where category is not null order by 1"
    )).fetchall()
    return [r[0] for r in rows]


@router.post("/rebuild")
def rebuild(_admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    return rebuild_shopee_coverage_gaps(db)


@router.get("/export.csv")
def export_csv(
    _admin=Depends(get_current_admin),
    db: Session = Depends(get_db),
    status: str = Query("open"),
    reason: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    seen_by_tutor: Optional[bool] = Query(None),
):
    stmt = _query(db, status=None if status == "all" else status, reason=reason, category=category,
                  seen_by_tutor=seen_by_tutor, q=None, min_price=None, max_price=None, sort="relevance")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["gtin", "produto", "categoria", "cobasi_preco", "motivo", "detalhe", "sugestao", "tutor_ve", "tentativas", "status"])
    for g in db.scalars(stmt):
        w.writerow([g.gtin, g.product_name, g.category, g.cobasi_price, g.reason, g.reason_detail,
                    g.suggestion, "sim" if g.seen_by_tutor else "nao", g.discovery_attempts, g.status])
    buf.seek(0)
    return StreamingResponse(
        iter([buf.getvalue()]), media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=shopee_coverage_gaps.csv"},
    )


def _resolve_one(db: Session, gap: ShopeeCoverageGap, req: ResolveRequest) -> None:
    now = datetime.now(timezone.utc)
    if req.action == "cobasi_only":
        gap.status = "cobasi_only"
        gap.resolved_note = req.note or "marcado como só-Cobasi pelo admin"
        gap.resolved_at = now
    elif req.action == "reopen":
        gap.status = "open"
        gap.resolved_note = None
        gap.resolved_at = None
    elif req.action == "retry":
        try:
            from ..shopee_discovery_attempt import ShopeeDiscoveryAttempt, schedule_shopee_discovery
            db.query(ShopeeDiscoveryAttempt).filter(ShopeeDiscoveryAttempt.gtin == gap.gtin).delete()
            db.commit()
            schedule_shopee_discovery(gap.gtin)
        except Exception as exc:  # noqa: BLE001
            raise HTTPException(502, f"falha ao reagendar discovery: {exc}")
        gap.reason_detail = "re-tentativa agendada pelo admin"
    elif req.action == "register_offer":
        if not req.affiliate_url:
            raise HTTPException(400, "affiliate_url é obrigatório pra register_offer")
        try:
            validate_shopee_affiliate_url(req.affiliate_url)
        except InvalidShopeeAffiliateUrlError as exc:
            raise HTTPException(400, str(exc))
        product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == normalize_gtin(gap.gtin)))
        if not product:
            raise HTTPException(404, "produto não encontrado no catálogo")
        db.add(MarketplaceOffer(
            product_id=product.id, merchant="shopee",
            affiliate_url=req.affiliate_url, direct_url=req.direct_url,
            merchant_title=product.canonical_name or product.name,
            merchant_gtin=normalize_gtin(gap.gtin),
            price=req.price, is_available=True, active=True,
            verified_at=now, last_checked_at=now,
            match_decision="HIGH_CONFIDENCE", match_confidence=0.99,
            match_reasons_json='["ADMIN_MANUAL_REGISTRATION"]',
            price_refresh_status="refreshed",
        ))
        gap.status = "resolved"
        gap.resolved_note = req.note or "link Shopee cadastrado manualmente pelo admin"
        gap.resolved_at = now
    else:
        raise HTTPException(400, f"ação inválida: {req.action}")


@router.post("/{gap_id}/resolve")
def resolve(gap_id: int, req: ResolveRequest, _admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    gap = db.get(ShopeeCoverageGap, gap_id)
    if not gap:
        raise HTTPException(404, "gap não encontrado")
    _resolve_one(db, gap, req)
    db.commit()
    return _to_out(gap)


@router.post("/bulk")
def bulk(req: BulkRequest, _admin=Depends(get_current_admin), db: Session = Depends(get_db)):
    if req.action not in ("cobasi_only", "reopen", "retry"):
        raise HTTPException(400, f"ação em massa inválida: {req.action}")
    if len(req.ids) > 2000:
        raise HTTPException(400, "máximo 2000 por vez")
    done, errors = 0, 0
    for gid in req.ids:
        gap = db.get(ShopeeCoverageGap, gid)
        if not gap:
            errors += 1
            continue
        try:
            _resolve_one(db, gap, ResolveRequest(action=req.action, note=req.note))
            done += 1
        except HTTPException:
            errors += 1
    db.commit()
    return {"done": done, "errors": errors}

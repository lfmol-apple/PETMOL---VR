"""Admin BI endpoints — /v1/admin/analytics/*.

All GET, all guarded by ``get_current_admin_or_readonly_key`` (master JWT or
the standing read-only ops key). No writes here — the dashboard only reads.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ...db import get_db
from ..deps import get_current_admin_or_readonly_key
from . import queries as q
from .filters import AnalyticsFilters

router = APIRouter(prefix="/v1/admin/analytics", tags=["Admin Analytics"])

_Auth = Depends(get_current_admin_or_readonly_key)


def _filters(
    period_days: Optional[int] = Query(None, ge=1, le=400),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    app_version: Optional[str] = Query(None),
    os: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    neighborhood: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    pet_id: Optional[str] = Query(None),
) -> AnalyticsFilters:
    return AnalyticsFilters.build(
        period_days=period_days, since=since, until=until, platform=platform,
        app_version=app_version, os=os, state=state, city=city,
        neighborhood=neighborhood, user_id=user_id, pet_id=pet_id,
    )


@router.get("/overview")
def get_overview(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return q.overview(db, f)


@router.get("/activation-funnel")
def get_activation_funnel(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return q.activation_funnel(db, f)


@router.get("/features")
def get_features(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return q.feature_matrix(db, f)


@router.get("/features/{key}/population")
def get_feature_population(
    key: str,
    state: Optional[str] = Query(None, description="active|stale|inactive|never_configured"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=_Auth,
):
    result = q.feature_population(db, key, state, page=page, page_size=page_size)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/users")
def get_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    search: Optional[str] = Query(None),
    sort: str = Query("created_at"),
    direction: str = Query("desc", pattern="^(asc|desc)$"),
    db: Session = Depends(get_db),
    f: AnalyticsFilters = Depends(_filters),
    _=_Auth,
):
    return q.list_users(
        db, f, page=page, page_size=page_size, search=search,
        sort=sort, direction=direction,
    )


@router.get("/users/{user_id}")
def get_user_detail(user_id: str, db: Session = Depends(get_db), _=_Auth):
    result = q.user_detail(db, user_id)
    if result is None:
        raise HTTPException(status_code=404, detail="user_not_found")
    return result


@router.get("/pets/{pet_id}")
def get_pet_detail(pet_id: str, db: Session = Depends(get_db), _=_Auth):
    result = q.pet_detail(db, pet_id)
    if result is None:
        raise HTTPException(status_code=404, detail="pet_not_found")
    return result


@router.get("/retention")
def get_retention(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return q.retention(db, f)


@router.get("/commerce")
def get_commerce(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return q.commerce(db, f)


@router.get("/data-quality")
def get_data_quality(db: Session = Depends(get_db), _=_Auth):
    return q.data_quality(db)


@router.get("/data-quality/{key}/population")
def get_data_quality_population(
    key: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=_Auth,
):
    result = q.data_quality_population(db, key, page=page, page_size=page_size)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/geo")
def get_geo(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    """Aggregated geo — from users.state/city only. No GPS, no IP-geo yet."""
    from sqlalchemy import func as _f

    from ...user_auth.models import User

    total = db.query(_f.count(User.id)).scalar() or 0
    with_state = db.query(_f.count(User.id)).filter(User.state.isnot(None), _f.trim(User.state) != "").scalar() or 0

    by_state = [
        {"state": (s or "—"), "users": int(c)}
        for s, c in db.query(User.state, _f.count(User.id))
        .filter(User.state.isnot(None), _f.trim(User.state) != "")
        .group_by(User.state).order_by(_f.count(User.id).desc()).all()
    ]
    by_city = [
        {"city": (c or "—"), "state": st, "users": int(n)}
        for c, st, n in db.query(User.city, User.state, _f.count(User.id))
        .filter(User.city.isnot(None), _f.trim(User.city) != "")
        .group_by(User.city, User.state).order_by(_f.count(User.id).desc()).limit(50).all()
    ]

    return {
        "source": "users.state / users.city (preenchido via CEP no perfil)",
        "coverage": {"users_total": int(total), "users_with_state": int(with_state),
                     "pct": round(int(with_state) / total, 3) if total else 0.0},
        "by_state": by_state,
        "by_city": by_city,
        "map_note": "Sem geo-IP e sem coordenada residencial. Mapa por UF/cidade agregada apenas. "
                    "App Store / Google Play e geo-IP aproximado ficam para a Fase D.",
        "appstore_downloads": None,
        "appstore_note": "Dados de downloads (App Store Connect / Google Play) ainda não integrados.",
    }

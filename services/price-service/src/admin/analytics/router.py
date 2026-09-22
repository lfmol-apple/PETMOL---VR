"""Admin BI endpoints — /v1/admin/analytics/*.

Quase tudo GET, guardado por ``get_current_admin_or_readonly_key`` (master
JWT ou a chave de operação de só-leitura) — o dashboard só lê. A única
exceção é POST /tactical-decisions (registrar aprovar/adiar/descartar uma
sugestão tática): guardado por ``get_current_admin`` puro (só JWT, sem a
chave de API), porque é uma escrita e a chave de API não tem rastro de
quem decidiu — nunca dispara push, só registra a decisão do master.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...db import get_db
from ..deps import get_current_admin, get_current_admin_or_readonly_key
from . import feeding_bi
from . import journey_bi
from . import locations_bi
from . import map_bi
from . import queries as q
from . import tactical_bi
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
    device_type: Optional[str] = Query(None, description="iphone|ipad|android|desktop|outros"),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    neighborhood: Optional[str] = Query(None),
    user_id: Optional[str] = Query(None),
    pet_id: Optional[str] = Query(None),
) -> AnalyticsFilters:
    return AnalyticsFilters.build(
        period_days=period_days, since=since, until=until, platform=platform,
        app_version=app_version, os=os, device_type=device_type, state=state, city=city,
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


@router.get("/feeding-funnel")
def get_feeding_funnel(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return feeding_bi.feeding_funnel(db, f)


@router.get("/feeding-funnel/{stage}/population")
def get_feeding_stage_population(
    stage: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    f: AnalyticsFilters = Depends(_filters),
    _=_Auth,
):
    result = feeding_bi.feeding_stage_population(db, stage, f, page=page, page_size=page_size)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/commerce-funnel")
def get_commerce_funnel(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return feeding_bi.commerce_funnel(db, f)


@router.get("/journey-funnel")
def get_journey_funnel(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return journey_bi.journey_funnel(db, f)


@router.get("/journey-funnel/{step}/population")
def get_journey_step_population(
    step: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    f: AnalyticsFilters = Depends(_filters),
    _=_Auth,
):
    result = journey_bi.journey_step_population(db, step, f, page=page, page_size=page_size)
    if result.get("error"):
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@router.get("/map-tutors")
def get_map_tutors(
    has_feeding: Optional[bool] = Query(None),
    db: Session = Depends(get_db),
    f: AnalyticsFilters = Depends(_filters),
    _=_Auth,
):
    return map_bi.map_tutors(db, f, has_feeding=has_feeding)


@router.get("/missing-pets-summary")
def get_missing_pets_summary(db: Session = Depends(get_db), _=_Auth):
    return tactical_bi.missing_pets_summary(db)


@router.get("/locations")
def get_locations_summary(db: Session = Depends(get_db), _=_Auth):
    """Mesmo dado do push/e-mail de acesso e download, agregado por
    cidade — sem depender do filtro global (ver `locations_bi.py`)."""
    return locations_bi.locations_summary(db)


@router.get("/tactical-suggestions")
def get_tactical_suggestions(db: Session = Depends(get_db), f: AnalyticsFilters = Depends(_filters), _=_Auth):
    return tactical_bi.tactical_suggestions(db, f)


class TacticalDecisionIn(BaseModel):
    decision: str = Field(pattern="^(approved_for_review|postponed|discarded)$")
    note: Optional[str] = Field(default=None, max_length=500)


@router.post("/tactical-decisions/{suggestion_key}")
def post_tactical_decision(
    suggestion_key: str,
    payload: TacticalDecisionIn,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    admin_user, _admin_row = current
    result = tactical_bi.record_tactical_decision(
        db, suggestion_key, payload.decision, payload.note, decided_by=admin_user.email,
    )
    if result.get("error"):
        raise HTTPException(status_code=400, detail=result["error"])
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

"""Admin BI endpoints — /v1/admin/analytics/*.

Quase tudo GET, guardado por ``get_current_admin_or_readonly_key`` (master
JWT ou a chave de operação de só-leitura) — o dashboard só lê. A única
exceção é POST /tactical-decisions (registrar aprovar/adiar/descartar uma
sugestão tática): guardado por ``get_current_admin`` puro (só JWT, sem a
chave de API), porque é uma escrita e a chave de API não tem rastro de
quem decidiu — nunca dispara push, só registra a decisão do master.
"""
from __future__ import annotations

import time
from datetime import date as _date
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ...db import get_db
from ..deps import get_current_admin, get_current_admin_or_readonly_key
from . import briefing_bi
from . import campaign_bi
from . import feeding_bi
from . import journey_bi
from . import landing_ab_bi
from . import landing_intro_bi
from . import locations_bi
from . import map_bi
from . import permission_snapshots
from . import permissions_bi
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
def get_locations_summary(
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    sort_by: str = Query("total", pattern="^(total|downloads|acessos)$"),
    db: Session = Depends(get_db),
    _=_Auth,
):
    """Mesmo dado do push/e-mail de acesso e download, agregado por cidade.
    Sem since/until: cumulativo desde o corte da campanha (comportamento
    padrão de sempre). Com since/until (o filtro global do Mission
    Control, quando o dono navega aqui a partir de um card de
    Downloads/Acessos): a janela vira exatamente o período selecionado —
    ver `locations_bi.py`."""
    parsed = AnalyticsFilters.build(since=since, until=until)
    return locations_bi.locations_summary(db, since=parsed.since, until=parsed.until, sort_by=sort_by)


@router.get("/campaigns")
def get_campaigns_summary(
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _=_Auth,
):
    """Downloads/acessos agrupados por origem (utm_source/medium/campaign) —
    ver `campaign_bi.py` pra limitações de atribuição."""
    parsed = AnalyticsFilters.build(since=since, until=until, platform=platform)
    return campaign_bi.campaign_summary(db, since=parsed.since, until=parsed.until, platform=platform)


@router.get("/landing-ab")
def get_landing_ab(
    period_days: Optional[int] = Query(None, ge=1, le=400),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    campaign: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    os: Optional[str] = Query(None),
    instagram: bool = Query(False, description="só tráfego vindo do Instagram/Meta"),
    intro: Optional[str] = Query(None, pattern="^(shown|none)$", description="introdução em vídeo: shown = viram, none = não viram"),
    db: Session = Depends(get_db),
    _=_Auth,
):
    """Teste A/B da landing: visitas, visitantes únicos estimados, cliques de download e conversão por
    variante — ver `landing_ab_bi.py` para as definições e o que NÃO é atribuível (instalações)."""
    parsed = AnalyticsFilters.build(period_days=period_days, since=since, until=until)
    return landing_ab_bi.landing_ab_summary(
        db, since=parsed.since, until=parsed.until, campaign=campaign, source=source, os=os, instagram_only=instagram, intro=intro,
    )


@router.get("/landing-intro")
def get_landing_intro(
    period_days: Optional[int] = Query(None, ge=1, le=400),
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    campaign: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    os: Optional[str] = Query(None),
    instagram: bool = Query(False),
    db: Session = Depends(get_db),
    _=_Auth,
):
    """Funil da introdução em vídeo da landing (mobile): pôster → assistir → concluir/pular/falhar → download."""
    parsed = AnalyticsFilters.build(period_days=period_days, since=since, until=until)
    return landing_intro_bi.landing_intro_summary(
        db, since=parsed.since, until=parsed.until, campaign=campaign, source=source, os=os, instagram_only=instagram,
    )


class CampaignSpendIn(BaseModel):
    utm_campaign: str = Field(min_length=1, max_length=160)
    spent_on: Optional[_date] = None        # dia civil de SP; padrão = hoje
    amount_brl: float = Field(gt=0, le=10_000_000)
    note: Optional[str] = Field(default=None, max_length=300)


@router.get("/campaign-spend")
def list_campaign_spend(limit: int = Query(100, ge=1, le=500), db: Session = Depends(get_db), _=_Auth):
    """Gastos lançados à mão, mais recentes primeiro."""
    from ...analytics.spend_models import CampaignSpend

    rows = db.query(CampaignSpend).order_by(CampaignSpend.spent_on.desc(), CampaignSpend.created_at.desc()).limit(limit).all()
    return {"items": [
        {"id": r.id, "utm_campaign": r.utm_campaign, "spent_on": r.spent_on.isoformat(),
         "amount_brl": round(r.amount_cents / 100, 2), "note": r.note}
        for r in rows
    ]}


@router.post("/campaign-spend", status_code=201)
def add_campaign_spend(payload: CampaignSpendIn, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    """Lança um gasto de campanha. Escrita: só JWT de admin (a chave de
    leitura nunca chega aqui) e fica registrado quem lançou."""
    from ...analytics.spend_models import CampaignSpend

    name = payload.utm_campaign.strip()
    if not name:
        raise HTTPException(status_code=422, detail="Informe a campanha (o mesmo utm_campaign da URL).")
    row = CampaignSpend(
        utm_campaign=name,
        spent_on=payload.spent_on or briefing_bi.today_br(),
        amount_cents=int(round(payload.amount_brl * 100)),
        note=(payload.note or "").strip() or None,
        created_by=str(current[0].id),
    )
    db.add(row)
    db.commit()
    return {"id": row.id, "utm_campaign": row.utm_campaign, "spent_on": row.spent_on.isoformat(),
            "amount_brl": round(row.amount_cents / 100, 2), "note": row.note}


@router.delete("/campaign-spend/{spend_id}")
def delete_campaign_spend(spend_id: str, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    from ...analytics.spend_models import CampaignSpend

    row = db.query(CampaignSpend).filter(CampaignSpend.id == spend_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Lançamento não encontrado")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.get("/location-events")
def get_location_events(
    since: Optional[str] = Query(None),
    until: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    platform: Optional[str] = Query(None),
    utm_campaign: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None, description="download|acesso"),
    registered_only: Optional[bool] = Query(None, description="true=só cadastrado, false=só visitante"),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    _=_Auth,
):
    """Linha a linha (não agregado): cada download/acesso, mais recente
    primeiro — o drill-down de Locais. Combina app_installs +
    analytics_product_events (eventos-âncora de sessão) num único feed
    ordenado por tempo; ver `location_events_bi.py`."""
    parsed = AnalyticsFilters.build(since=since, until=until, state=state, city=city, platform=platform)
    return locations_bi.location_events(
        db, since=parsed.since, until=parsed.until, state=parsed.state, city=parsed.city,
        platform=platform, utm_campaign=utm_campaign, event_type=event_type,
        registered_only=registered_only, page=page, page_size=page_size,
    )


_TODAY_CACHE: dict[str, Any] = {"at": 0.0, "day": None, "value": None}


@router.get("/today")
def get_today(db: Session = Depends(get_db), _=_Auth):
    """"Hoje" do Mission Control — mesmo cálculo do boletim diário por
    e-mail (`briefing_bi.build_brief`), pro dia corrente de SP até agora.
    Cache de 30s: a tela repete a chamada a cada 20s (painel ao vivo) e o
    resumo faz ~80 contagens pequenas."""
    day = briefing_bi.today_br()
    now = time.monotonic()
    if _TODAY_CACHE["day"] == day and now - _TODAY_CACHE["at"] < 30 and _TODAY_CACHE["value"]:
        return _TODAY_CACHE["value"]
    value = briefing_bi.build_brief(db, day)
    _TODAY_CACHE.update(at=now, day=day, value=value)
    return value


@router.get("/brief")
def get_brief(day: str = Query(..., pattern=r"^\d{4}-\d{2}-\d{2}$"), db: Session = Depends(get_db), _=_Auth):
    """Resumo de um dia qualquer (AAAA-MM-DD, dia civil de SP) — o mesmo
    conteúdo do boletim diário daquele dia."""
    try:
        parsed = _date.fromisoformat(day)
    except ValueError:
        raise HTTPException(status_code=400, detail="data inválida")
    return briefing_bi.build_brief(db, parsed)


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
    push: Optional[str] = Query(None, pattern="^(active|none)$", description="notificação ativa?"),
    push_platform: Optional[str] = Query(None, pattern="^(ios|android|web)$", description="aparelho com aviso ativo"),
    location: Optional[str] = Query(None, pattern="^(gps|city|ip|none)$", description="origem da última localização"),
    has_pet: Optional[str] = Query(None, pattern="^(yes|no)$"),
    has_feeding: Optional[str] = Query(None, pattern="^(yes|no)$"),
    activity: Optional[str] = Query(None, pattern="^(active|recent|cooling|dormant|no_analytics)$"),
    email_verified: Optional[str] = Query(None, pattern="^(yes|no)$"),
    db: Session = Depends(get_db),
    f: AnalyticsFilters = Depends(_filters),
    _=_Auth,
):
    return q.list_users(
        db, f, page=page, page_size=page_size, search=search,
        sort=sort, direction=direction,
        push=push, push_platform=push_platform, location=location, has_pet=has_pet,
        has_feeding=has_feeding, activity=activity, email_verified=email_verified,
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


# ── Permissões: notificação ativa × localização compartilhada (aba "Permissões") ──

@router.get("/permissions/summary")
def get_permissions_summary(db: Session = Depends(get_db), _=_Auth):
    return permissions_bi.summary(db)


@router.get("/permissions/history")
def get_permissions_history(db: Session = Depends(get_db), _=_Auth):
    """Fotografias do estado de permissões (1ª = linha de base). Grava a do dia se estiver atrasada."""
    permission_snapshots.ensure_daily(db)
    return {"items": permission_snapshots.history(db)}


@router.post("/permissions/snapshots")
def post_permissions_snapshot(db: Session = Depends(get_db), admin=Depends(get_current_admin)):
    """"Gravar agora": nova fotografia sob demanda. Escrita → só JWT de admin (a chave de leitura não vale)."""
    permission_snapshots.take_snapshot(db, "manual")
    return {"items": permission_snapshots.history(db)}

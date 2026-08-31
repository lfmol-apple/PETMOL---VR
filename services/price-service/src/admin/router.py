"""Admin API routes.

NOTE on URLs in production:
- Nginx proxies `/api/*` to backend and strips the `/api` prefix.
- Therefore frontend should call `/api/v1/admin/...` and backend must expose `/v1/admin/...`.
"""

import json
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..affiliate_links import MarketplaceOffer
from ..analytics.models import AnalyticsProductEvent
from ..runtime_metrics import request_metrics_summary
from ..user_auth.models import User
from ..user_auth.security import hash_password
from ..user_auth.router import COOKIE_NAME
from ..pets.models import Pet
from .deps import get_current_admin, get_current_admin_or_readonly_key
from .models import AdminUser
from .schemas import (
    AdminBootstrapPromoteRequest,
    AdminMeOut,
    GlobalStatsOut,
    AccountOut,
    AccountsListOut,
    OkOut,
    TutorOut,
    PetOut,
    AdminMeData,
    GlobalStatsData,
    UserCreateRequest,
    UserUpdateRequest,
    UserDetailOut,
    UsersListOut,
    UserOut,
    PetCreateRequest,
    PetUpdateRequest,
    PetDetailOut,
    PetsListOut,
    DeletedOut,
)

router = APIRouter(prefix="/v1/admin", tags=["Admin"])

settings = get_settings()

_BRT = ZoneInfo("America/Sao_Paulo")
_FUNNEL_EVENTS = [
    ("signup_started", "Cadastro iniciado"),
    ("register_completed", "Cadastro completo"),
    ("pet_created", "Pet criado"),
    ("pet_profile_completed", "Perfil completo"),
    ("store_opened", "Loja aberta"),
    ("offer_viewed", "Oferta vista"),
    ("commerce_click", "Comprar clicado"),
]


def _brt_day_start_utc(days_back: int = 0) -> datetime:
    today_brt = datetime.now(_BRT).date() - timedelta(days=days_back)
    return datetime.combine(today_brt, time.min, tzinfo=_BRT).astimezone(timezone.utc)


def _count_created_since(db: Session, model, since: datetime) -> int:
    return int(db.query(func.count(model.id)).filter(model.created_at >= since).scalar() or 0)


def _event_identity_expr():
    return func.coalesce(
        AnalyticsProductEvent.user_id,
        AnalyticsProductEvent.anonymous_id,
        AnalyticsProductEvent.session_id,
        AnalyticsProductEvent.event_id,
    )


def _distinct_event_identities(db: Session, event_name: str, since: datetime) -> int:
    return int(
        db.query(func.count(func.distinct(_event_identity_expr())))
        .filter(AnalyticsProductEvent.event_name == event_name)
        .filter(AnalyticsProductEvent.received_at >= since)
        .scalar()
        or 0
    )


def _active_users_since(db: Session, since: datetime) -> int:
    return int(
        db.query(func.count(func.distinct(AnalyticsProductEvent.user_id)))
        .filter(AnalyticsProductEvent.user_id.isnot(None))
        .filter(AnalyticsProductEvent.received_at >= since)
        .scalar()
        or 0
    )


def _safe_props(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _funnel_summary(db: Session, since: datetime) -> dict:
    steps = []
    previous = None
    biggest_drop = None
    for event_name, label in _FUNNEL_EVENTS:
        count = _distinct_event_identities(db, event_name, since)
        pct_from_previous = None if previous in (None, 0) else round(count / previous, 4)
        drop = None if previous in (None, 0) else max(previous - count, 0)
        if drop is not None and (biggest_drop is None or drop > biggest_drop["drop_count"]):
            biggest_drop = {"from": steps[-1]["event_name"], "to": event_name, "drop_count": drop}
        steps.append({
            "event_name": event_name,
            "label": label,
            "count": count,
            "pct_from_previous": pct_from_previous,
        })
        previous = count
    return {"window_days": 7, "steps": steps, "biggest_drop": biggest_drop}


def _commerce_summary(db: Session, since: datetime) -> dict:
    rows = (
        db.query(AnalyticsProductEvent.event_name, AnalyticsProductEvent.properties_json)
        .filter(AnalyticsProductEvent.received_at >= since)
        .filter(AnalyticsProductEvent.event_name.in_(["offer_viewed", "commerce_click"]))
        .all()
    )
    views = 0
    clicks = 0
    by_merchant: dict[str, dict[str, int]] = {}
    stale_shopee_events = 0
    for event_name, properties_json in rows:
        props = _safe_props(properties_json)
        merchant = str(props.get("merchant") or "unknown").lower()
        bucket = by_merchant.setdefault(merchant, {"offer_viewed": 0, "commerce_click": 0})
        if event_name == "offer_viewed":
            views += 1
            bucket["offer_viewed"] += 1
        elif event_name == "commerce_click":
            clicks += 1
            bucket["commerce_click"] += 1
        if merchant == "shopee" and props.get("price_is_stale") is True:
            stale_shopee_events += 1

    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.marketplace_offer_stale_after_hours)
    checked_at = func.coalesce(
        MarketplaceOffer.last_checked_at,
        MarketplaceOffer.verified_at,
        MarketplaceOffer.updated_at,
        MarketplaceOffer.created_at,
    )
    shopee_active = int(
        db.query(func.count(MarketplaceOffer.id))
        .filter(MarketplaceOffer.merchant == "shopee")
        .filter(MarketplaceOffer.active.is_(True))
        .filter(MarketplaceOffer.is_available.is_(True))
        .scalar()
        or 0
    )
    shopee_stale = int(
        db.query(func.count(MarketplaceOffer.id))
        .filter(MarketplaceOffer.merchant == "shopee")
        .filter(MarketplaceOffer.active.is_(True))
        .filter(MarketplaceOffer.is_available.is_(True))
        .filter((checked_at.is_(None)) | (checked_at < cutoff))
        .scalar()
        or 0
    )

    return {
        "window_days": 7,
        "store_opened": _distinct_event_identities(db, "store_opened", since),
        "offer_viewed": views,
        "commerce_click": clicks,
        "ctr": round(clicks / views, 4) if views else None,
        "by_merchant": by_merchant,
        "sales_confirmed": None,
        "sales_confirmed_note": "commerce_click é clique de saída, não venda confirmada.",
        "cobasi": {
            "availability": "not_instrumented",
            "latency_ms": None,
        },
        "shopee": {
            "active_offers": shopee_active,
            "stale_offers": shopee_stale,
            "stale_click_events": stale_shopee_events,
            "stale_after_hours": settings.marketplace_offer_stale_after_hours,
        },
    }


def _platform_summary(db: Session, since: datetime) -> dict:
    platforms = (
        db.query(AnalyticsProductEvent.platform, func.count(AnalyticsProductEvent.id))
        .filter(AnalyticsProductEvent.received_at >= since)
        .group_by(AnalyticsProductEvent.platform)
        .all()
    )
    versions = (
        db.query(AnalyticsProductEvent.app_version, func.count(AnalyticsProductEvent.id))
        .filter(AnalyticsProductEvent.received_at >= since)
        .group_by(AnalyticsProductEvent.app_version)
        .order_by(func.count(AnalyticsProductEvent.id).desc())
        .limit(10)
        .all()
    )
    return {
        "window_days": 7,
        "platforms": [{"platform": key or "unknown", "events": int(count)} for key, count in platforms],
        "versions": [{"version": key or "unknown", "events": int(count)} for key, count in versions],
    }


def _attention_state(api: dict, commerce: dict, funnel: dict) -> dict:
    alerts = []
    if api.get("errors_5xx", 0) > 0:
        alerts.append({"severity": "attention", "message": "Há respostas 5xx na janela recente."})
    if api.get("p95_ms") is not None and api["p95_ms"] > 3000:
        alerts.append({"severity": "critical", "message": "p95 da API acima de 3000ms."})
    elif api.get("p95_ms") is not None and api["p95_ms"] > 1000:
        alerts.append({"severity": "attention", "message": "p95 da API acima de 1000ms."})
    if commerce["shopee"]["stale_offers"] > 0:
        alerts.append({"severity": "attention", "message": "Existem ofertas Shopee ativas com preço stale."})
    drop = funnel.get("biggest_drop")
    if drop and drop["drop_count"] > 0:
        alerts.append({"severity": "attention", "message": f"Maior queda no funil: {drop['from']} -> {drop['to']}."})

    severity = "normal"
    if any(item["severity"] == "critical" for item in alerts):
        severity = "critical"
    elif alerts:
        severity = "attention"
    return {"state": severity, "alerts": alerts}


@router.post("/bootstrap/promote", response_model=AdminMeOut)
def bootstrap_promote_admin(
    payload: AdminBootstrapPromoteRequest,
    db: Session = Depends(get_db),
    x_admin_bootstrap: Optional[str] = Header(default=None, alias="X-Admin-Bootstrap"),
):
    # Only the hardcoded master email may ever be promoted — this endpoint
    # exists purely to create the AdminUser row for that one account, not
    # as a general "become admin" mechanism.
    if payload.email.strip().lower() != settings.admin_master_email.strip().lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Apenas o e-mail master pode ser promovido")

    # If a secret is configured (especially in prod), require it.
    if settings.env == "prod" and not settings.admin_bootstrap_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ADMIN_BOOTSTRAP_SECRET não configurado",
        )
    if settings.admin_bootstrap_secret:
        if x_admin_bootstrap != settings.admin_bootstrap_secret:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Bootstrap secret inválido")

    # Safety: only allow bootstrapping if there are no admins yet.
    existing_admins = db.query(AdminUser).count()
    if existing_admins > 0:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bootstrap já foi realizado")

    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    admin = AdminUser(user_id=str(user.id), role=payload.role)
    db.add(admin)
    db.commit()
    db.refresh(admin)

    return AdminMeOut(
        success=True,
        data=AdminMeData(
            admin_id=admin.id,
            user_id=str(user.id),
            email=user.email,
            role=admin.role,
            created_at=admin.created_at,
        ),
    )


@router.get("/me", response_model=AdminMeOut)
def admin_me(current=Depends(get_current_admin)):
    user, admin = current
    return AdminMeOut(
        success=True,
        data=AdminMeData(
            admin_id=admin.id,
            user_id=str(user.id),
            email=user.email,
            role=admin.role,
            created_at=admin.created_at,
        ),
    )


@router.get("/stats", response_model=GlobalStatsOut)
def admin_stats(db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    total_users = db.query(User).count()
    total_owners = total_users  # Agora users = owners
    total_pets = db.query(Pet).count()

    countries_count = (
        db.query(func.count(func.distinct(User.country)))
        .filter(User.country.isnot(None))
        .scalar()
        or 0
    )
    cities_count = (
        db.query(func.count(func.distinct(User.city)))
        .filter(User.city.isnot(None))
        .scalar()
        or 0
    )

    return GlobalStatsOut(
        success=True,
        data=GlobalStatsData(
            total_users=total_users,
            total_owners=total_owners,
            total_pets=total_pets,
            total_vaccines=0,
            total_appointments=0,
            countries_count=int(countries_count),
            cities_count=int(cities_count),
        ),
    )


@router.get("/mission-control")
def mission_control_phase_1(db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    """Aggregated launch cockpit.

    Phase 1 stays first-party and small: no GPS analytics, no user drill-down,
    no external analytics suite and no sale attribution. Active users are
    counted only from authenticated v2 analytics events, so early history is
    explicitly partial.
    """
    start_today = _brt_day_start_utc(0)
    start_7d = datetime.now(timezone.utc) - timedelta(days=7)
    start_24h = datetime.now(timezone.utc) - timedelta(hours=24)
    start_30d = datetime.now(timezone.utc) - timedelta(days=30)

    total_users = int(db.query(func.count(User.id)).scalar() or 0)
    total_pets = int(db.query(func.count(Pet.id)).scalar() or 0)
    events_total = int(db.query(func.count(AnalyticsProductEvent.id)).scalar() or 0)

    funnel = _funnel_summary(db, start_7d)
    commerce = _commerce_summary(db, start_7d)
    api = request_metrics_summary(window_minutes=60)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "api": api,
        "growth": {
            "total_users": total_users,
            "total_pets": total_pets,
            "new_users_today": _count_created_since(db, User, start_today),
            "new_users_7d": _count_created_since(db, User, start_7d),
            "new_pets_today": _count_created_since(db, Pet, start_today),
            "new_pets_7d": _count_created_since(db, Pet, start_7d),
            "active_users_24h": _active_users_since(db, start_24h),
            "active_users_7d": _active_users_since(db, start_7d),
            "active_users_30d": _active_users_since(db, start_30d),
            "active_users_definition": "distinct authenticated user_id with analytics_product_events in the window",
            "active_users_partial": True,
            "active_users_note": (
                "Histórico anterior à coleta v2 não tem user_id analítico estável; "
                "não use como DAU/WAU/MAU definitivo até acumular dados novos."
            ),
        },
        "funnel": funnel,
        "commerce": commerce,
        "platforms": _platform_summary(db, start_7d),
        "instrumentation": {
            "events_total": events_total,
            "anonymous_id_storage": "localStorage:petmol_analytics_anonymous_id",
            "session_rule": "nova sessão na primeira abertura ou após 30 minutos de inatividade",
            "gps_analytics": False,
            "ip_geo_phase_1": False,
        },
    }
    payload["attention"] = _attention_state(api, commerce, funnel)
    return payload


@router.get("/all-accounts", response_model=AccountsListOut)
def admin_all_accounts(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
    limit: int = 200,
    offset: int = 0,
):
    # users
    users = (
        db.query(User)
        .order_by(User.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    out: list[AccountOut] = []
    for u in users:
        pets = db.query(Pet).filter(Pet.user_id == u.id).all()

        out.append(
            AccountOut(
                user_id=str(u.id),
                email=u.email,
                created_at=u.created_at,
                tutor=(
                    TutorOut(
                        id=str(u.id),  # Agora user.id é o mesmo que tutor.id
                        name=u.name,
                        phone=u.phone,
                        email=u.email,
                        city=u.city,
                        state=u.state,
                        country=u.country,
                    )
                    if u.name
                    else None
                ),
                pets=[
                    PetOut(
                        id=str(p.id),
                        name=p.name,
                        species=p.species,
                        breed=p.breed,
                    )
                    for p in pets
                ],
            )
        )

    return AccountsListOut(success=True, data=out)


@router.post("/logout", response_model=OkOut)
def admin_logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return OkOut(success=True)


# === USER MANAGEMENT ===

@router.get("/users", response_model=UsersListOut)
def admin_list_users(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
    limit: int = 100,
    offset: int = 0,
    email: Optional[str] = None,
):
    q = db.query(User)
    if email:
        q = q.filter(User.email.ilike(f"%{email}%"))
    users = q.order_by(User.created_at.desc()).offset(offset).limit(limit).all()

    user_data = []
    for user in users:
        user_data.append(UserOut(
            id=str(user.id), email=user.email, created_at=user.created_at,
            email_verified=bool(user.email_verified),
        ))

    return UsersListOut(success=True, data=user_data)


@router.post("/users", response_model=UserDetailOut)
def admin_create_user(
    payload: UserCreateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já existe")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at),
    )


@router.get("/users/{user_id}", response_model=UserDetailOut)
def admin_get_user(
    user_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at,
                     email_verified=bool(user.email_verified)),
    )


@router.put("/users/{user_id}", response_model=UserDetailOut)
def admin_update_user(
    user_id: str,
    payload: UserUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    if payload.email and payload.email.lower() != user.email:
        existing = db.query(User).filter(User.email == payload.email.lower()).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email já existe")
        user.email = payload.email.lower()

    if payload.password:
        user.password_hash = hash_password(payload.password)

    if payload.email_verified is not None:
        user.email_verified = payload.email_verified

    db.commit()
    db.refresh(user)

    return UserDetailOut(
        success=True,
        data=UserOut(id=str(user.id), email=user.email, created_at=user.created_at,
                     email_verified=bool(user.email_verified)),
    )


@router.delete("/users/{user_id}", response_model=DeletedOut)
def admin_delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    # Check if user is an admin (prevent self-deletion)
    admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
    current_user, current_admin = current
    if admin and admin.user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Não é possível excluir seu próprio usuário")

    db.delete(user)
    db.commit()

    return DeletedOut(success=True, message=f"Usuário {user.email} excluído com sucesso")


# Nota: não há mais endpoints /tutors/* aqui — o modelo Tutor foi
# absorvido por User (ver user_auth/models.py); dados de tutor são
# editados via /v1/admin/users/{id}. As rotas antigas referenciavam um
# `Tutor` que não existe mais e sempre quebravam com NameError.

# === PET MANAGEMENT ===

@router.get("/pets", response_model=PetsListOut)
def admin_list_pets(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
    limit: int = 100,
    offset: int = 0,
):
    pets = (
        db.query(Pet)
        .order_by(Pet.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    pets_data = []
    for pet in pets:
        pets_data.append(PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ))

    return PetsListOut(success=True, data=pets_data)


@router.post("/pets", response_model=PetDetailOut)
def admin_create_pet(
    payload: PetCreateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    user = db.query(User).filter(User.id == payload.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Usuário não encontrado")

    birth_date = None
    if payload.birth_date:
        try:
            birth_date = date.fromisoformat(payload.birth_date)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data de nascimento inválida")

    pet = Pet(
        user_id=payload.user_id,
        name=payload.name,
        species=payload.species,
        breed=payload.breed,
        birth_date=birth_date,
        weight_value=payload.weight_value,
        weight_unit=payload.weight_unit,
        photo=payload.photo,
        neutered=payload.neutered,
    )
    db.add(pet)
    db.commit()
    db.refresh(pet)

    return PetDetailOut(
        success=True,
        data=PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ),
    )


@router.get("/pets/{pet_id}", response_model=PetDetailOut)
def admin_get_pet(
    pet_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")

    return PetDetailOut(
        success=True,
        data=PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ),
    )


@router.put("/pets/{pet_id}", response_model=PetDetailOut)
def admin_update_pet(
    pet_id: str,
    payload: PetUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")

    data = payload.model_dump(exclude_unset=True)
    
    if "birth_date" in data and data["birth_date"]:
        try:
            data["birth_date"] = date.fromisoformat(data["birth_date"])
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Data de nascimento inválida")

    for field, value in data.items():
        setattr(pet, field, value)

    db.commit()
    db.refresh(pet)

    return PetDetailOut(
        success=True,
        data=PetOut(
            id=str(pet.id),
            name=pet.name,
            species=pet.species,
            breed=pet.breed,
            birth_date=pet.birth_date.isoformat() if pet.birth_date else None,
            weight_value=pet.weight_value,
            weight_unit=pet.weight_unit,
            neutered=pet.neutered,
        ),
    )


@router.delete("/pets/{pet_id}", response_model=DeletedOut)
def admin_delete_pet(
    pet_id: str,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    pet = db.query(Pet).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")

    db.delete(pet)
    db.commit()

    return DeletedOut(success=True, message=f"Pet {pet.name} excluído com sucesso")

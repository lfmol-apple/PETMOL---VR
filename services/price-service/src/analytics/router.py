"""
Analytics router — Motor de Intenção.

POST /api/analytics/click  — registra evento de funil anônimo.
"""
import hashlib
import json
import secrets
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.models import User
from ..user_auth.router import COOKIE_NAME
from ..user_auth.security import decode_token
from .models import AnalyticsEvent, AnalyticsProductEvent

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ── Schemas ───────────────────────────────────────────────────────────────

class ClickRequest(BaseModel):
    source: str          # rg_public | home | sos | vaccines | rg_generator
    cta_type: str        # rg_share | found_pet | create_rg | benefits_view | shop_redirect | doglife_redirect
    target: Optional[str] = None   # petz | cobasi | petlove | internal
    link_type: Optional[str] = None  # affiliate_product | affiliate_marketplace_offer | affiliate_store | affiliate_service | affiliate_search | direct
    pet_id: Optional[str] = None
    rg_public_id: Optional[str] = None
    metadata: Optional[dict] = None  # livre, sem PII


class ClickResponse(BaseModel):
    lead_id: str


class ProductEventRequest(BaseModel):
    event_id: Optional[str] = None
    event_name: str = Field(min_length=1, max_length=64)
    anonymous_id: Optional[str] = None
    session_id: Optional[str] = None
    screen: Optional[str] = None
    route: Optional[str] = None
    occurred_at: Optional[datetime] = None
    platform: Optional[str] = None
    app_version: Optional[str] = None
    os: Optional[str] = None
    browser: Optional[str] = None
    device_class: Optional[str] = None
    locale: Optional[str] = None
    timezone: Optional[str] = None
    properties: Optional[dict[str, Any]] = None


class ProductEventResponse(BaseModel):
    accepted: bool
    event_id: str


# ── Util ──────────────────────────────────────────────────────────────────

def _ip_hash(ip: Optional[str]) -> Optional[str]:
    """SHA-256 do IP, truncado para 16 chars (não reversível)."""
    if not ip:
        return None
    return hashlib.sha256(ip.encode()).hexdigest()[:16]


def _truncate_ua(ua: Optional[str]) -> Optional[str]:
    if not ua:
        return None
    return ua[:255]


_PII_KEYS = {
    "address",
    "bairro",
    "cep",
    "city_address",
    "complement",
    "cpf",
    "document",
    "documents",
    "email",
    "endereco",
    "health_data",
    "medicine",
    "medication",
    "name",
    "nome",
    "notes",
    "observacao",
    "observation",
    "phone",
    "photo",
    "picture",
    "postal_code",
    "prescription",
    "remedy",
    "rua",
    "street",
    "telefone",
    "title",
    "whatsapp",
    "url",
}

_SAFE_EVENT_NAMES = {
    "app_open",
    "session_start",
    "screen_view",
    "signup_started",
    "register_step1_completed",
    "register_completed",
    "pet_created",
    "pet_profile_completed",
    "store_opened",
    "offer_viewed",
    "commerce_click",
    "medication_created",
    "food_cycle_created",
    "vaccine_record_created",
    "worm_control_created",
    "flea_control_created",
    "collar_created",
    "onboarding_started",
    "onboarding_completed",
    "onboarding_skipped",
}

_COMMERCE_CLICK_CTAS = {
    "shop_partner_store_click",
    "shop_reorder_click",
    "shop_reorder_buy_direct",
    "shop_reorder_buy_petz",
    "petz_direct_link_click",
    "shop_awin_search_buy",
    "food_buy_direct",
    "medication_buy_direct",
    "parasite_buy_direct",
}

_LEGACY_EVENT_MAP = {
    "shop_sheet_view": "screen_view",
    "store_opened": "store_opened",
    "offer_viewed": "offer_viewed",
    "signup_started": "signup_started",
    "register_step1_completed": "register_step1_completed",
    "register_completed": "register_completed",
    "pet_created": "pet_created",
    "first_pet_created": "pet_created",
    "pet_profile_completed": "pet_profile_completed",
    "medication_created": "medication_created",
    "food_cycle_created": "food_cycle_created",
    "vaccine_record_created": "vaccine_record_created",
    "worm_control_created": "worm_control_created",
    "flea_control_created": "flea_control_created",
    "collar_created": "collar_created",
    "onboarding_started": "onboarding_started",
    "onboarding_completed": "onboarding_completed",
    "onboarding_skipped": "onboarding_skipped",
}


def _clip(value: Optional[str], length: int) -> Optional[str]:
    if not value:
        return None
    return str(value)[:length]


def _safe_properties(value: Any, depth: int = 0) -> Any:
    if depth > 3:
        return None
    if isinstance(value, dict):
        safe: dict[str, Any] = {}
        for key, raw in value.items():
            key_str = str(key)[:64]
            if key_str.strip().lower() in _PII_KEYS:
                continue
            cleaned = _safe_properties(raw, depth + 1)
            if cleaned is not None:
                safe[key_str] = cleaned
        return safe
    if isinstance(value, list):
        return [_safe_properties(item, depth + 1) for item in value[:20]]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value[:160] if isinstance(value, str) else value
    return str(value)[:160]


def _properties_json(properties: Optional[dict[str, Any]]) -> Optional[str]:
    if not properties:
        return None
    try:
        return json.dumps(_safe_properties(properties), ensure_ascii=False, separators=(",", ":"))[:4000]
    except Exception:
        return None


def _extract_optional_user_id(
    db: Session,
    authorization: Optional[str],
    cookie_token: Optional[str],
) -> Optional[str]:
    token: Optional[str] = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "", 1).strip()
    elif cookie_token:
        token = cookie_token
    if not token:
        return None
    token_data = decode_token(token)
    if not token_data or not token_data.user_id:
        return None
    user = db.query(User.id).filter(User.id == token_data.user_id).first()
    return str(user[0]) if user else None


def _store_product_event(
    db: Session,
    body: ProductEventRequest,
    user_id: Optional[str],
) -> str:
    event_id = _clip(body.event_id, 64) or str(uuid4())
    event_name = _clip(body.event_name.strip(), 64) or "unknown"
    if event_name not in _SAFE_EVENT_NAMES and not event_name.startswith("screen_"):
        event_name = "screen_view" if event_name.endswith("_view") else event_name

    event = AnalyticsProductEvent(
        event_id=event_id,
        event_name=event_name,
        user_id=user_id,
        anonymous_id=_clip(body.anonymous_id, 64),
        session_id=_clip(body.session_id, 64),
        screen=_clip(body.screen, 64),
        route=_clip(body.route, 160),
        occurred_at=body.occurred_at or datetime.now(timezone.utc),
        platform=_clip(body.platform, 32),
        app_version=_clip(body.app_version, 64),
        os=_clip(body.os, 32),
        browser=_clip(body.browser, 32),
        device_class=_clip(body.device_class, 16),
        locale=_clip(body.locale, 32),
        timezone=_clip(body.timezone, 64),
        properties_json=_properties_json(body.properties),
    )
    db.add(event)
    db.commit()
    return event_id


def _legacy_click_event(body: ClickRequest, metadata: Optional[dict[str, Any]]) -> ProductEventRequest:
    event_name = "commerce_click" if body.cta_type in _COMMERCE_CLICK_CTAS else _LEGACY_EVENT_MAP.get(body.cta_type, body.cta_type)
    props = {
        **(metadata or {}),
        "legacy_cta_type": body.cta_type,
        "source": body.source,
    }
    if body.target:
        props["merchant"] = body.target
    if body.link_type:
        props["link_type"] = body.link_type
    return ProductEventRequest(
        event_name=event_name,
        anonymous_id=str(metadata.get("anonymous_id")) if metadata and metadata.get("anonymous_id") else None,
        session_id=str(metadata.get("session_id")) if metadata and metadata.get("session_id") else None,
        screen=str(metadata.get("screen")) if metadata and metadata.get("screen") else body.source,
        route=str(metadata.get("route")) if metadata and metadata.get("route") else None,
        occurred_at=datetime.fromtimestamp(metadata["client_timestamp"] / 1000, tz=timezone.utc)
        if metadata and isinstance(metadata.get("client_timestamp"), (int, float))
        else None,
        platform=str(metadata.get("platform")) if metadata and metadata.get("platform") else None,
        app_version=str(metadata.get("app_version")) if metadata and metadata.get("app_version") else None,
        os=str(metadata.get("os")) if metadata and metadata.get("os") else None,
        browser=str(metadata.get("browser")) if metadata and metadata.get("browser") else None,
        device_class=str(metadata.get("device_class")) if metadata and metadata.get("device_class") else None,
        locale=str(metadata.get("locale")) if metadata and metadata.get("locale") else None,
        timezone=str(metadata.get("timezone")) if metadata and metadata.get("timezone") else None,
        properties=props,
    )


# ── Endpoint ──────────────────────────────────────────────────────────────

@router.post("/click", response_model=ClickResponse, status_code=201)
def record_click(
    body: ClickRequest,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    """Registra evento de intenção anônimo.

    - Não armazena PII (email/telefone).
    - ip_hash = SHA-256[:16], não reversível.
    - Gera e retorna lead_id para rastreio agregado.
    """
    lead_id = secrets.token_hex(16)  # 32-char hex

    meta_str: Optional[str] = None
    safe_meta: Optional[dict[str, Any]] = None
    if body.metadata:
        try:
            # Remover campos que possam conter PII
            safe_meta = {k: v for k, v in body.metadata.items()
                         if k.lower() not in ("email", "phone", "cpf", "name", "nome")}
            meta_str = json.dumps(safe_meta, ensure_ascii=False)[:500]
        except Exception:
            pass

    client_ip = request.client.host if request.client else None
    ua = request.headers.get("user-agent")

    event = AnalyticsEvent(
        lead_id=lead_id,
        source=body.source[:40],
        cta_type=body.cta_type[:40],
        target=body.target[:60] if body.target else None,
        link_type=body.link_type[:32] if body.link_type else None,
        pet_id=body.pet_id,
        rg_public_id=body.rg_public_id,
        metadata_json=meta_str,
        user_agent=_truncate_ua(ua),
        ip_hash=_ip_hash(client_ip),
    )
    try:
        db.add(event)
        db.commit()
        if not (safe_meta and safe_meta.get("v2_sent") is True):
            user_id = _extract_optional_user_id(db, authorization, request.cookies.get(COOKIE_NAME))
            _store_product_event(db, _legacy_click_event(body, safe_meta if body.metadata else None), user_id)
    except Exception:
        db.rollback()
        # Não travar o cliente por falha de analytics
        pass

    return ClickResponse(lead_id=lead_id)


@router.post("/event", response_model=ProductEventResponse, status_code=201)
def record_product_event(
    body: ProductEventRequest,
    request: Request,
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
):
    user_id = _extract_optional_user_id(db, authorization, request.cookies.get(COOKIE_NAME))
    event_id = _clip(body.event_id, 64) or str(uuid4())
    try:
        body.event_id = event_id
        stored_id = _store_product_event(db, body, user_id)
        return ProductEventResponse(accepted=True, event_id=stored_id)
    except Exception:
        db.rollback()
        return ProductEventResponse(accepted=False, event_id=event_id)

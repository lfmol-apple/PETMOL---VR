"""
Push Notifications — sistema simples de lembretes push para PETMOL.

Fluxo: usuário define lembrete no sheet → POST /notifications/reminders →
scheduler (1 min) detecta remind_at <= now → envia push via VAPID.
"""
import json
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from ..db import Base, SessionLocal, engine
from ..user_auth.deps import get_current_user
from ..config import get_settings
from ..family.models import FamilyGroup, FamilyMember
from ..pets.access import get_accessible_pet_or_404
from ..pets.caretaker_models import PetCaretaker
from ..pets.models import Pet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])

# ── Subscription storage (arquivo JSON na VPS) ───────────────────────────────

_SUBS_FILE = os.environ.get(
    "PUSH_SUBSCRIPTIONS_FILE",
    os.path.join(os.path.dirname(__file__), "push_subscriptions.json"),
)


def _load_subscriptions() -> dict:
    try:
        with open(_SUBS_FILE, "r") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_subscriptions(subs: dict) -> None:
    os.makedirs(os.path.dirname(_SUBS_FILE), exist_ok=True)
    tmp = _SUBS_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(subs, f)
    os.replace(tmp, _SUBS_FILE)  # atomic on POSIX


# ── Push send helper ─────────────────────────────────────────────────────────

def _normalize_subscription(sub: dict) -> dict:
    """Convert flat subscription (old format) to nested keys format (Web Push standard)."""
    if "keys" not in sub and ("p256dh" in sub or "auth" in sub):
        return {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub.get("p256dh", ""),
                "auth": sub.get("auth", ""),
            },
        }
    return sub


def _send_push(subscription: dict, payload: dict) -> tuple:
    """Returns (ok: bool, sub_invalid: bool). sub_invalid=True means subscription should be removed."""
    settings = get_settings()
    try:
        webpush(
            subscription_info=_normalize_subscription(subscription),
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_claims_email},
        )
        return True, False
    except WebPushException as e:
        status = getattr(e.response, "status_code", None) if e.response else None
        if status in (404, 410):
            logger.warning(f"Subscription expirada/removida ({status}) — será descartada. Body: {getattr(e.response, 'text', '')[:200]}")
            return False, True
        else:
            logger.warning(f"WebPushException ({status}): {e}")
            return False, False
    except Exception as e:
        logger.error(f"_send_push error: {e}")
        return False, False


# ── Reminder model ───────────────────────────────────────────────────────────

_MAX_RETRY = 5

class Reminder(Base):
    __tablename__ = "reminders"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String(36), nullable=False, index=True)
    pet_id      = Column(String(36), nullable=True, index=True)
    type        = Column(String(50), nullable=False)
    title       = Column(String(255), nullable=False)
    body        = Column(Text, nullable=True)
    url         = Column(Text, nullable=True)
    remind_at   = Column(DateTime(timezone=True), nullable=False, index=True)
    sent        = Column(Boolean, default=False, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# Cria a tabela se não existir
Base.metadata.create_all(bind=engine, tables=[Reminder.__table__])


# ── Deep link builder ────────────────────────────────────────────────────────

_TYPE_TO_MODAL = {
    "food":       ("food",      None),
    "medication": ("medication", None),
    "vaccine":    ("vaccines",  None),
    "dewormer":   ("parasites", "dewormer"),
    "flea":       ("parasites", "flea_tick"),
    "collar":     ("parasites", "collar"),
    "grooming":   ("grooming",  None),
}


def _build_deep_link(reminder_type: str, pet_id: Optional[str]) -> str:
    modal, subtype = _TYPE_TO_MODAL.get(reminder_type, ("home", None))
    if modal == "home":
        return "/home"
    params = f"modal={modal}"
    if pet_id:
        params += f"&petId={pet_id}"
    if subtype:
        params += f"&subtype={subtype}"
    return f"/home?{params}"


_TYPE_CONFIG: dict = {
    # ── Produtos: lembrete para COMPRAR ──
    "food": {
        "action_label": "🛒 Comprar ração",
        "action_id": "buy",
        "fallback_body": "Hora de comprar ração. O estoque está acabando!",
    },
    "dewormer": {
        "action_label": "🛒 Comprar vermífugo",
        "action_id": "buy",
        "fallback_body": "Hora de comprar o vermífugo para o seu pet.",
    },
    "flea": {
        "action_label": "🛒 Comprar antipulgas",
        "action_id": "buy",
        "fallback_body": "Hora de comprar o antipulgas para o seu pet.",
    },
    "collar": {
        "action_label": "🛒 Comprar coleira",
        "action_id": "buy",
        "fallback_body": "Hora de comprar a coleira antipulgas para o seu pet.",
    },
    # ── Serviços/ações: lembrete para FAZER ──
    "medication": {
        "action_label": "✅ Registrar dose",
        "action_id": "register",
        "fallback_body": "Hora de dar o medicamento para o seu pet. Toque para registrar a dose.",
    },
    "vaccine": {
        "action_label": "📅 Agendar consulta",
        "action_id": "view",
        "fallback_body": "Hora de levar ao veterinário para a vacina. Agende a consulta!",
    },
    "grooming": {
        "action_label": "📅 Agendar serviço",
        "action_id": "view",
        "fallback_body": "Hora de agendar o banho e/ou tosa no pet shop.",
    },
}


# ── Scheduler job ────────────────────────────────────────────────────────────

def send_due_reminders() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = (
            db.query(Reminder)
            .filter(Reminder.sent == False, Reminder.remind_at <= now)
            .all()
        )
        if not due:
            return

        subscriptions = _load_subscriptions()
        changed = False

        # Dedup: para cada (user_id, pet_id, type, remind_at), enviar apenas uma vez
        # e marcar todos os duplicados como enviados (evita push duplo por dados herdados)
        seen: set = set()

        for reminder in due:
            dedup_key = (reminder.user_id, reminder.pet_id or "", reminder.type, reminder.remind_at)
            is_duplicate = dedup_key in seen
            seen.add(dedup_key)

            if is_duplicate:
                logger.info(f"Reminder {reminder.id}: duplicado suprimido — marcado como enviado")
                reminder.sent = True
                continue

            recipient_ids = {str(reminder.user_id)}
            if reminder.pet_id:
                pet = db.query(Pet).filter(Pet.id == reminder.pet_id).first()
                if pet:
                    recipient_ids.add(str(pet.user_id))
                    caretakers = db.query(PetCaretaker).filter(PetCaretaker.pet_id == reminder.pet_id).all()
                    recipient_ids.update(str(c.user_id) for c in caretakers)
                    family_members = (
                        db.query(FamilyMember)
                        .join(FamilyGroup, FamilyGroup.id == FamilyMember.group_id)
                        .filter(FamilyGroup.owner_id == str(pet.user_id))
                        .all()
                    )
                    recipient_ids.update(str(m.user_id) for m in family_members)

            recipient_subs = [(uid, subscriptions.get(uid)) for uid in recipient_ids]
            recipient_subs = [(uid, sub) for uid, sub in recipient_subs if sub]
            if not recipient_subs:
                logger.info(f"Reminder {reminder.id}: sem subscriptions para o pet/user — consumindo")
                if is_duplicate:
                    logger.info(f"Reminder {reminder.id}: duplicado suprimido — marcado como enviado")
                reminder.sent = True
                continue

            deep_url = _build_deep_link(reminder.type, reminder.pet_id)
            cfg = _TYPE_CONFIG.get(reminder.type, {})
            body = reminder.body or cfg.get("fallback_body", "Toque para ver detalhes no PETMOL.")

            # Se o lembrete tem URL customizada (ex: wa.me), usá-la como destino principal
            custom_url = reminder.url
            is_whatsapp = custom_url and custom_url.startswith("https://wa.me")
            main_url = custom_url if custom_url else deep_url

            if is_whatsapp:
                action_label = "📱 Agendar no WhatsApp"
                action_id = "whatsapp"
            else:
                action_label = cfg.get("action_label", "Abrir PETMOL")
                action_id = cfg.get("action_id", "open")

            payload = {
                "title": reminder.title,
                "body": body,
                "icon": cfg.get("icon", "/icons/icon-192x192.png"),
                "badge": cfg.get("badge", "/icons/badge-mono.png"),
                "tag": f"petmol-{reminder.type}-{reminder.pet_id or 'x'}",
                "renotify": True,
                "requireInteraction": True,
                "vibrate": [300, 150, 300, 150, 300],
                "actions": [
                    {"action": action_id, "title": action_label},
                    {"action": "dismiss", "title": "Dispensar"},
                ],
                "data": {
                    "url": main_url,
                    "action_urls": {
                        action_id: main_url,
                        "dismiss": "/home",
                    },
                    "pet_id": reminder.pet_id or "",
                    "type": reminder.type,
                },
            }
            ok_count = 0
            hard_fail = False
            for recipient_id, sub in recipient_subs:
                ok, sub_invalid = _send_push(sub, payload)
                logger.info(
                    f"Reminder {reminder.id} ({reminder.type}) user={recipient_id}: "
                    f"push={'ok' if ok else 'falhou'} retries={reminder.retry_count}"
                )
                if ok:
                    ok_count += 1
                elif sub_invalid:
                    subscriptions.pop(recipient_id, None)
                    changed = True
                else:
                    hard_fail = True

            if ok_count > 0 or not hard_fail:
                reminder.sent = True
            else:
                reminder.retry_count = (reminder.retry_count or 0) + 1
                if reminder.retry_count >= _MAX_RETRY:
                    logger.warning(f"Reminder {reminder.id}: desistindo após {_MAX_RETRY} tentativas")
                    reminder.sent = True

        db.commit()
        if changed:
            _save_subscriptions(subscriptions)

    except Exception as e:
        logger.error(f"send_due_reminders error: {e}")
        db.rollback()
    finally:
        db.close()


# ── Schemas ──────────────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    subscription: dict
    lat: Optional[float] = None
    lng: Optional[float] = None


class ReminderIn(BaseModel):
    pet_id:    Optional[str] = None
    type:      str
    title:     str
    body:      Optional[str] = None
    url:       Optional[str] = None
    remind_at: str  # ISO 8601


class ReminderOut(BaseModel):
    id:         str
    pet_id:     Optional[str]
    type:       str
    title:      str
    body:       Optional[str]
    remind_at:  str
    sent:       bool
    created_at: str

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/vapid-public-key")
def get_vapid_public_key():
    settings = get_settings()
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, current_user=Depends(get_current_user)):
    subs = _load_subscriptions()
    entry = {**body.subscription}
    if body.lat is not None:
        entry["lat"] = body.lat
    if body.lng is not None:
        entry["lng"] = body.lng
    subs[str(current_user.id)] = entry
    _save_subscriptions(subs)
    return {"status": "subscribed"}


@router.delete("/subscribe")
def unsubscribe(current_user=Depends(get_current_user)):
    subs = _load_subscriptions()
    subs.pop(str(current_user.id), None)
    _save_subscriptions(subs)
    return {"status": "unsubscribed"}


@router.post("/test")
def test_push(current_user=Depends(get_current_user)):
    subs = _load_subscriptions()
    sub = subs.get(str(current_user.id))
    if not sub:
        raise HTTPException(status_code=404, detail="Sem subscription registrada para este usuário")
    ok, _ = _send_push(sub, {"title": "🐾 Teste PETMOL", "body": "Push funcionando!", "tag": "test"})
    if not ok:
        raise HTTPException(status_code=502, detail="Falha ao enviar push")
    return {"status": "sent"}


@router.get("/reminders", response_model=List[ReminderOut])
def list_reminders(current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(Reminder)
            .filter(Reminder.user_id == str(current_user.id), Reminder.sent == False)
            .order_by(Reminder.remind_at)
            .all()
        )
        return [
            ReminderOut(
                id=r.id, pet_id=r.pet_id, type=r.type, title=r.title, body=r.body,
                remind_at=r.remind_at.isoformat(), sent=r.sent,
                created_at=r.created_at.isoformat(),
            )
            for r in rows
        ]
    finally:
        db.close()


@router.post("/reminders", response_model=ReminderOut)
def create_reminder(body: ReminderIn, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        if body.pet_id:
            get_accessible_pet_or_404(db, str(current_user.id), body.pet_id)
        remind_at = datetime.fromisoformat(body.remind_at.replace("Z", "+00:00"))
        r = Reminder(
            user_id=str(current_user.id),
            pet_id=body.pet_id,
            type=body.type,
            title=body.title,
            body=body.body,
            url=body.url,
            remind_at=remind_at,
        )
        db.add(r)
        db.commit()
        db.refresh(r)
        return ReminderOut(
            id=r.id, pet_id=r.pet_id, type=r.type, title=r.title, body=r.body,
            remind_at=r.remind_at.isoformat(), sent=r.sent,
            created_at=r.created_at.isoformat(),
        )
    finally:
        db.close()


@router.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        r = db.query(Reminder).filter(
            Reminder.id == reminder_id,
            Reminder.user_id == str(current_user.id),
        ).first()
        if not r:
            raise HTTPException(status_code=404, detail="Lembrete não encontrado")
        db.delete(r)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()

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
from sqlalchemy import Boolean, Column, DateTime, String, Text

from ..db import Base, SessionLocal, engine
from ..user_auth.deps import get_current_user
from ..config import get_settings

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
    with open(_SUBS_FILE, "w") as f:
        json.dump(subs, f)


# ── Push send helper ─────────────────────────────────────────────────────────

def _send_push(subscription: dict, payload: dict) -> bool:
    settings = get_settings()
    try:
        webpush(
            subscription_info=subscription,
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_claims_email},
        )
        return True
    except WebPushException as e:
        status = getattr(e.response, "status_code", None) if e.response else None
        if status in (404, 410):
            logger.info(f"Subscription expired/gone ({status}) — removing")
        else:
            logger.warning(f"WebPushException: {e}")
        return False
    except Exception as e:
        logger.error(f"_send_push error: {e}")
        return False


# ── Reminder model ───────────────────────────────────────────────────────────

class Reminder(Base):
    __tablename__ = "reminders"

    id         = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id    = Column(String(36), nullable=False, index=True)
    pet_id     = Column(String(36), nullable=True, index=True)
    type       = Column(String(50), nullable=False)
    title      = Column(String(255), nullable=False)
    body       = Column(Text, nullable=True)
    remind_at  = Column(DateTime(timezone=True), nullable=False, index=True)
    sent       = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


# Cria a tabela se não existir
Base.metadata.create_all(bind=engine, tables=[Reminder.__table__])


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

        for reminder in due:
            reminder.sent = True
            sub = subscriptions.get(str(reminder.user_id))
            if not sub:
                logger.info(f"Reminder {reminder.id}: sem subscription para user {reminder.user_id}")
                continue

            payload = {
                "title": reminder.title,
                "body": reminder.body or "",
                "tag": f"reminder-{reminder.id}",
                "requireInteraction": True,
                "data": {
                    "url": "/home",
                    "pet_id": reminder.pet_id or "",
                    "type": reminder.type,
                },
            }
            ok = _send_push(sub, payload)
            logger.info(f"Reminder {reminder.id} ({reminder.type}): push={'ok' if ok else 'falhou'}")
            if not ok:
                subscriptions.pop(str(reminder.user_id), None)
                changed = True

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


class ReminderIn(BaseModel):
    pet_id:    Optional[str] = None
    type:      str
    title:     str
    body:      Optional[str] = None
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
    subs[str(current_user.id)] = body.subscription
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
    ok = _send_push(sub, {"title": "🐾 Teste PETMOL", "body": "Push funcionando!", "tag": "test"})
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
        remind_at = datetime.fromisoformat(body.remind_at.replace("Z", "+00:00"))
        r = Reminder(
            user_id=str(current_user.id),
            pet_id=body.pet_id,
            type=body.type,
            title=body.title,
            body=body.body,
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

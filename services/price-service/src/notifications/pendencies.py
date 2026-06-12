"""Notification pendencies — persistent in-app alerts that survive push expiry.

A pendency is the in-app equivalent of a push notification.
It lives in the DB until the tutor resolves, snoozes, or dismisses it.

Dual-layer model (push + pendency):
  - Push fires once (OS delivers or drops it)
  - Pendency stays until actioned — tutor always sees overdue care items

Lifecycle:  active → [snoozed] → active → resolved / dismissed
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import Session

from ..db import Base, SessionLocal
from ..user_auth.deps import get_current_user
from ..user_auth.models import User

BRT = timezone(timedelta(hours=-3))

router = APIRouter(prefix="/notifications/pendencies", tags=["Pendencies"])


# ── ORM Model ─────────────────────────────────────────────────────────────────

class NotificationPendency(Base):
    """Persistent in-app notification pendency."""

    __tablename__ = "notification_pendencies"

    # Primary key equals the push `tag` — natural deduplication.
    # e.g. "petmol-care-vaccine-42-CORE_DOG_RABIES-2026-04-14"
    id = Column(String, primary_key=True)
    user_id = Column(String(36), nullable=False, index=True)
    pet_id = Column(String(36), nullable=True, index=True)
    type = Column(String, nullable=False)   # vaccine | parasite | medication | grooming | documents
    event_id = Column(String, nullable=True)
    title = Column(Text, nullable=False)
    message = Column(Text, nullable=False)
    deep_link = Column(Text, nullable=False)
    priority = Column(Integer, default=50)  # 0-100; higher = more urgent
    # active | snoozed | resolved | dismissed
    status = Column(String, default="active")
    snoozed_until = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=True)


# ── Pydantic ──────────────────────────────────────────────────────────────────

class PendencyOut(BaseModel):
    id: str
    pet_id: Optional[str]
    type: str
    title: str
    message: str
    deep_link: str
    priority: int
    status: str
    created_at: str

    class Config:
        from_attributes = True


class PendencyPatch(BaseModel):
    action: str          # resolve | snooze | dismiss
    snooze_hours: int = 24


# ── CRUD ──────────────────────────────────────────────────────────────────────

def upsert_pendency(
    db: Session,
    *,
    user_id: str,
    pet_id: Optional[str],
    pend_id: str,
    type_: str,
    title: str,
    message: str,
    deep_link: str,
    priority: int = 50,
    expires_at: Optional[datetime] = None,
    event_id: Optional[str] = None,
) -> None:
    """Create or refresh a pendency.

    Rules:
    - If already resolved/dismissed → skip (don't recreate for same ID today).
    - If snoozed but new urgency >= 75 (overdue) → reactivate.
    - Otherwise refresh title/message in case details changed.
    """
    now = datetime.now(BRT)
    existing = db.get(NotificationPendency, pend_id)

    if existing:
        if existing.status in ("resolved", "dismissed"):
            return
        # Reactivate snoozed items when they become truly overdue (priority ≥ 75)
        if existing.status == "snoozed" and priority >= 75:
            existing.status = "active"
            existing.snoozed_until = None
        # Refresh content (name or days may have changed)
        existing.title = title
        existing.message = message
        existing.priority = max(existing.priority, priority)
        existing.updated_at = now
    else:
        db.add(NotificationPendency(
            id=pend_id,
            user_id=user_id,
            pet_id=pet_id,
            type=type_,
            event_id=event_id,
            title=title,
            message=message,
            deep_link=deep_link,
            priority=priority,
            status="active",
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
        ))

    db.commit()


def upsert_pendency_standalone(
    *,
    user_id: str,
    pet_id: Optional[str],
    pend_id: str,
    type_: str,
    title: str,
    message: str,
    deep_link: str,
    priority: int = 50,
    expires_at: Optional[datetime] = None,
    event_id: Optional[str] = None,
) -> None:
    """Thread-safe wrapper: opens its own DB session (for use in APScheduler jobs)."""
    import logging
    _log = logging.getLogger(__name__)
    try:
        db = SessionLocal()
        try:
            upsert_pendency(
                db,
                user_id=str(user_id),
                pet_id=str(pet_id) if pet_id is not None else None,
                pend_id=pend_id,
                type_=type_,
                title=title,
                message=message,
                deep_link=deep_link,
                priority=priority,
                expires_at=expires_at,
                event_id=event_id,
            )
        finally:
            db.close()
    except Exception as e:
        _log.error(f"upsert_pendency_standalone error: {e}")


def get_active_pendencies(db: Session, user_id: str) -> List[NotificationPendency]:
    """Return active (non-snoozed, non-expired) pendencies sorted by priority desc."""
    now = datetime.now(BRT)
    rows = (
        db.query(NotificationPendency)
        .filter(
            NotificationPendency.user_id == user_id,
            NotificationPendency.status.in_(["active", "snoozed"]),
        )
        .all()
    )
    result = []
    changed = False
    for r in rows:
        if r.type == "vaccine":
            continue

        # Auto-expire
        if r.expires_at:
            exp = r.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=BRT)
            if exp < now:
                r.status = "resolved"
                changed = True
                continue
        # Skip still-snoozed
        if r.status == "snoozed" and r.snoozed_until:
            su = r.snoozed_until
            if su.tzinfo is None:
                su = su.replace(tzinfo=BRT)
            if su > now:
                continue
            else:
                # Snooze expired → wake up
                r.status = "active"
                r.snoozed_until = None
                changed = True
        result.append(r)

    if changed:
        db.commit()

    return sorted(result, key=lambda x: (x.priority or 0), reverse=True)


# ── Dependency ────────────────────────────────────────────────────────────────

def _get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=List[PendencyOut])
def list_pendencies(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    """Return active in-app pendencies for the current user, sorted by priority."""
    rows = get_active_pendencies(db, current_user.id)
    output = []
    for r in rows:
        created = ""
        if r.created_at:
            ca = r.created_at
            if ca.tzinfo is None:
                ca = ca.replace(tzinfo=BRT)
            created = ca.isoformat()
        output.append(PendencyOut(
            id=r.id,
            pet_id=r.pet_id,
            type=r.type,
            title=r.title,
            message=r.message,
            deep_link=r.deep_link,
            priority=r.priority or 50,
            status=r.status,
            created_at=created,
        ))
    return output


@router.patch("/{pend_id}")
def update_pendency(
    pend_id: str,
    body: PendencyPatch,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(_get_db),
):
    """Resolve, snooze, or dismiss a pendency."""
    row = db.get(NotificationPendency, pend_id)
    if not row or row.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Pendência não encontrada")

    now = datetime.now(BRT)

    if body.action == "resolve":
        row.status = "resolved"
    elif body.action == "dismiss":
        row.status = "dismissed"
    elif body.action == "snooze":
        row.status = "snoozed"
        row.snoozed_until = now + timedelta(hours=max(1, body.snooze_hours))
    else:
        raise HTTPException(status_code=400, detail="Ação inválida: use resolve, snooze ou dismiss")

    row.updated_at = now
    db.commit()
    return {"success": True, "status": row.status}

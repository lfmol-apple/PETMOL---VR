"""Aba "Pets sumidos" do painel do dono: todos os alertas, com quem avisou, quantos foram notificados e achados."""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func

from ..db import SessionLocal
from ..missing_pets import FoundReport, MissingPet, MissingPetNotification, PetSighting
from ..user_auth.models import User
from .deps import get_current_admin

router = APIRouter(prefix="/v1/admin/missing-pets", tags=["Admin Pets sumidos"])


def _counts(db, model, ids: list[str], col) -> dict[str, int]:
    if not ids:
        return {}
    return {str(k): int(n) for k, n in db.query(col, func.count()).filter(col.in_(ids)).group_by(col).all()}


@router.get("")
def list_missing_pets(status: Literal["active", "found", "all"] = "all", limit: int = 200, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        q = db.query(MissingPet)
        if status == "active":
            q = q.filter(MissingPet.status == "active")
        elif status == "found":
            q = q.filter(MissingPet.status != "active")
        rows = q.order_by(MissingPet.created_at.desc()).limit(max(1, min(limit, 500))).all()
        ids = [str(r.id) for r in rows]
        notified = _counts(db, MissingPetNotification, ids, MissingPetNotification.missing_pet_id)
        found = _counts(db, FoundReport, ids, FoundReport.missing_pet_id)
        seen = _counts(db, PetSighting, ids, PetSighting.matched_missing_pet_id)
        owners = {str(u.id): u for u in db.query(User).filter(User.id.in_({r.user_id for r in rows if r.user_id} or {"__none__"})).all()}
        total_active = db.query(func.count(MissingPet.id)).filter(MissingPet.status == "active").scalar() or 0
        total = db.query(func.count(MissingPet.id)).scalar() or 0
        out = []
        for r in rows:
            o = owners.get(str(r.user_id)) if r.user_id else None
            out.append({
                "id": r.id, "pet_name": r.pet_name, "species": r.species, "breed": r.breed, "status": r.status,
                "photo_url": r.photo_url, "created_at": r.created_at.isoformat() if r.created_at else None,
                "found_at": r.found_at.isoformat() if r.found_at else None,
                "last_seen_location": r.last_seen_location, "radius_km": r.current_radius_km,
                "reporter_type": r.reporter_type, "public_slug": r.public_slug,
                "tutor_name": o.name if o else None, "tutor_email": o.email if o else None,
                "notified": notified.get(str(r.id), 0), "found_reports": found.get(str(r.id), 0), "sightings": seen.get(str(r.id), 0),
            })
        return {"total": total, "active": int(total_active), "items": out}
    finally:
        db.close()

"""
Missing Pets — funcionalidade Pet Sumido do PETMOL.

Endpoints:
  POST   /missing-pets         — registrar pet desaparecido (auth obrigatória)
  GET    /missing-pets         — listar todos (público)
  GET    /missing-pets/all     — listar todos incluindo encontrados (público)
  PATCH  /missing-pets/{id}/found — marcar como encontrado (auth, apenas dono)
"""
import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, DateTime, Text, Float
from sqlalchemy.orm import Session

from ..db import Base, get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from ..notifications import _load_subscriptions, _save_subscriptions, _send_push

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/missing-pets", tags=["Missing Pets"])


class FoundReport(Base):
    __tablename__ = "found_reports"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    missing_pet_id = Column(String(36), nullable=False, index=True)
    finder_contact = Column(String(200), nullable=False)
    finder_location = Column(String(500), nullable=True)
    notes = Column(Text, nullable=True)
    finder_photos = Column(Text, nullable=True)
    compatibility_score = Column(Integer, nullable=True)
    compatibility_analysis = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class MissingPet(Base):
    __tablename__ = "missing_pets"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), nullable=False, index=True)
    pet_id = Column(String(36), nullable=True)
    pet_name = Column(String(200), nullable=False)
    species = Column(String(50), nullable=True)
    breed = Column(String(200), nullable=True)
    characteristics = Column(Text, nullable=True)
    contact = Column(String(100), nullable=False)
    last_seen_location = Column(String(500), nullable=True)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    missing_date = Column(String(20), nullable=True)
    missing_time = Column(String(10), nullable=True)
    photo_url = Column(Text, nullable=True)
    status = Column(String(20), default="active")      # active | found
    current_radius_km = Column(Float, default=2.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    found_at = Column(DateTime, nullable=True)


class FoundReportCreate(BaseModel):
    finder_contact: str
    finder_location: Optional[str] = None
    notes: Optional[str] = None
    finder_photos: List[str] = []


class MissingPetCreate(BaseModel):
    pet_id: Optional[str] = None
    pet_name: str
    species: Optional[str] = None
    breed: Optional[str] = None
    characteristics: Optional[str] = None
    contact: str
    last_seen_location: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    missing_date: Optional[str] = None
    missing_time: Optional[str] = None
    photo_url: Optional[str] = None


def _mp_to_dict(p: MissingPet) -> dict:
    return {
        "id": p.id,
        "user_id": p.user_id,
        "pet_name": p.pet_name,
        "species": p.species,
        "breed": p.breed,
        "characteristics": p.characteristics,
        "contact": p.contact,
        "last_seen_location": p.last_seen_location,
        "lat": p.lat,
        "lng": p.lng,
        "missing_date": p.missing_date,
        "missing_time": p.missing_time,
        "photo_url": p.photo_url,
        "status": p.status,
        "current_radius_km": p.current_radius_km,
        "created_at": p.created_at.isoformat() if p.created_at else None,
        "found_at": p.found_at.isoformat() if p.found_at else None,
    }


@router.post("", status_code=201)
def create_missing_pet(
    body: MissingPetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mp = MissingPet(
        id=str(uuid.uuid4()),
        user_id=str(current_user.id),
        pet_id=body.pet_id,
        pet_name=body.pet_name,
        species=body.species,
        breed=body.breed,
        characteristics=body.characteristics,
        contact=body.contact,
        last_seen_location=body.last_seen_location,
        lat=body.lat,
        lng=body.lng,
        missing_date=body.missing_date,
        missing_time=body.missing_time,
        photo_url=body.photo_url,
        status="active",
        current_radius_km=2.0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(mp)
    db.commit()
    db.refresh(mp)

    _broadcast_missing_pet(mp)

    return {"id": mp.id, "status": "created"}


def _broadcast_missing_pet(mp: MissingPet) -> None:
    """Push notification para todos os usuários PETMOL com subscrição ativa."""
    try:
        subs = _load_subscriptions()
        payload = {
            "title": "🚨 Pet sumido perto de você!",
            "body": f"{mp.pet_name} está desaparecido. Toque para ver e ajudar.",
            "url": "/achei-um-pet",
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/icon-72x72.png",
        }
        removed: list[str] = []
        sent = 0
        for user_id, subscription in subs.items():
            if user_id == mp.user_id:
                continue
            ok, invalid = _send_push(subscription, payload)
            if invalid:
                removed.append(user_id)
            elif ok:
                sent += 1

        if removed:
            for uid in removed:
                subs.pop(uid, None)
            _save_subscriptions(subs)

        logger.info(f"Pet Sumido broadcast: {sent} enviados, {len(removed)} removidos (pet={mp.id})")
    except Exception as e:
        logger.error(f"_broadcast_missing_pet error: {e}")


@router.get("")
def list_missing_pets(
    include_found: bool = False,
    db: Session = Depends(get_db),
):
    """Público — lista pets desaparecidos."""
    q = db.query(MissingPet)
    if not include_found:
        q = q.filter(MissingPet.status == "active")
    return [_mp_to_dict(p) for p in q.order_by(MissingPet.created_at.desc()).limit(200).all()]


@router.patch("/{mp_id}/found")
def mark_found(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id).first()
    if not mp:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    if str(mp.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sem permissão")
    mp.status = "found"
    mp.found_at = datetime.now(timezone.utc)
    db.commit()
    return {"status": "found"}


@router.post("/{mp_id}/report-found", status_code=201)
def report_found(mp_id: str, body: FoundReportCreate, db: Session = Depends(get_db)):
    """Achador registra que encontrou o pet — sem autenticação necessária."""
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id, MissingPet.status == "active").first()
    if not mp:
        raise HTTPException(status_code=404, detail="Alerta não encontrado ou pet já foi encontrado")

    existing = (
        db.query(FoundReport)
        .filter(FoundReport.missing_pet_id == mp_id, FoundReport.finder_contact == body.finder_contact.strip())
        .first()
    )
    if existing:
        return {"id": existing.id, "status": "already_reported"}

    report = FoundReport(
        id=str(uuid.uuid4()),
        missing_pet_id=mp_id,
        finder_contact=body.finder_contact.strip(),
        finder_location=body.finder_location,
        notes=body.notes,
        finder_photos=json.dumps(body.finder_photos) if body.finder_photos else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(report)
    db.commit()

    # Push para o tutor
    try:
        subs = _load_subscriptions()
        owner_sub = subs.get(str(mp.user_id))
        if owner_sub:
            loc = f" em {body.finder_location}" if body.finder_location else ""
            _send_push(owner_sub, {
                "title": f"🎉 {mp.pet_name} foi encontrado!",
                "body": f"Alguém encontrou seu pet{loc}. Contato: {body.finder_contact}. Toque para confirmar.",
                "tag": f"found-report-{mp_id}",
                "renotify": True,
                "requireInteraction": True,
                "icon": "/icons/icon-192x192.png",
                "data": {"url": f"/home?found_report={mp_id}"},
            })
    except Exception as e:
        logger.error(f"Push ao tutor falhou: {e}")

    return {"id": report.id, "status": "reported"}

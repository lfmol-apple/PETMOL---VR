"""
Missing Pets — funcionalidade Pet Sumido do PETMOL.

Endpoints:
  POST   /missing-pets                   — registrar pet desaparecido (auth)
  GET    /missing-pets                   — listar ativos (público)
  PATCH  /missing-pets/{id}/found       — marcar como encontrado (dono)
  POST   /missing-pets/{id}/report-found — achador reporta (sem auth)
"""
import json
import math
import os
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

# ── Notified tracking (evita renotificar quem já recebeu) ────────────────────

_MP_NOTIFIED_FILE = os.path.join(os.path.dirname(__file__), "mp_notified.json")


def _load_mp_notified() -> dict:
    try:
        with open(_MP_NOTIFIED_FILE) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_mp_notified(data: dict) -> None:
    tmp = _MP_NOTIFIED_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(data, f)
    os.replace(tmp, _MP_NOTIFIED_FILE)


def _get_excluded_user_ids(mp_id: str, owner_id: str) -> set:
    rec = _load_mp_notified().get(mp_id, {})
    return set(rec.get("notified", [])) | {str(owner_id)}


def _mark_notified(mp_id: str, user_ids: list) -> None:
    data = _load_mp_notified()
    rec = data.get(mp_id, {"notified": []})
    rec["notified"] = list(set(rec.get("notified", []) + user_ids))
    data[mp_id] = rec
    _save_mp_notified(data)


# ── Geo helper ───────────────────────────────────────────────────────────────

def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


# ── Models ───────────────────────────────────────────────────────────────────

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
    status = Column(String(20), default="active")
    current_radius_km = Column(Float, default=2.0)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    found_at = Column(DateTime, nullable=True)


# ── Schemas ──────────────────────────────────────────────────────────────────

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
    radius_km: Optional[float] = 2.0
    missing_date: Optional[str] = None
    missing_time: Optional[str] = None
    photo_url: Optional[str] = None


class FoundReportCreate(BaseModel):
    finder_contact: str
    finder_location: Optional[str] = None
    notes: Optional[str] = None
    finder_photos: List[str] = []


# ── Helpers ──────────────────────────────────────────────────────────────────

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


def _broadcast_missing_pet(mp: MissingPet) -> None:
    """
    Push para usuários com subscrição ativa.
    - Nunca envia para o dono.
    - Nunca renotifica quem já recebeu.
    - Geo filter: se o alerta tem lat/lng e o subscriber tem lat/lng,
      só notifica quem está dentro do raio.
    - Sem localização: notifica todos (máx 50).
    """
    try:
        subs = _load_subscriptions()
        excluded = _get_excluded_user_ids(mp.id, mp.user_id)
        radius = mp.current_radius_km or 2.0
        has_location = mp.lat is not None and mp.lng is not None

        site_url = "https://petmol.com.br"
        photo_image = (
            f"{site_url}{mp.photo_url}"
            if mp.photo_url and mp.photo_url.startswith("/")
            else (mp.photo_url or f"{site_url}/brand/notification-banner.png")
        )
        location_part = f"Visto em: {mp.last_seen_location}. " if mp.last_seen_location else ""
        payload = {
            "title": f"🚨 {mp.pet_name} pode estar na sua região!",
            "body": f"{location_part}Desaparecido desde {mp.missing_date or 'hoje'} às {mp.missing_time or '??:??'}. Toque para ajudar.",
            "tag": f"missing-pet-{mp.id}",
            "renotify": False,
            "requireInteraction": True,
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/icon-72x72.png",
            "image": photo_image,
            "data": {"url": f"/achei-um-pet?id={mp.id}"},
        }

        newly_notified: list = []
        removed: list = []
        sent = 0
        skipped = 0
        MAX_NO_LOCATION = 50

        for user_id, subscription in subs.items():
            if user_id in excluded:
                continue
            if not has_location and sent >= MAX_NO_LOCATION:
                skipped += 1
                continue

            # Geo filter — só aplica se ambos têm coordenadas
            if has_location and isinstance(subscription, dict):
                sub_lat = subscription.get("lat")
                sub_lng = subscription.get("lng")
                if sub_lat is not None and sub_lng is not None:
                    dist = _haversine_km(mp.lat, mp.lng, sub_lat, sub_lng)
                    if dist > radius:
                        skipped += 1
                        continue

            ok, invalid = _send_push(subscription, payload)
            if invalid:
                removed.append(user_id)
            elif ok:
                sent += 1
                newly_notified.append(user_id)

        if removed:
            for uid in removed:
                subs.pop(uid, None)
            _save_subscriptions(subs)

        if newly_notified:
            _mark_notified(mp.id, newly_notified)

        logger.info(
            f"Pet Sumido broadcast: {sent} enviados, {skipped} fora do raio, "
            f"{len(removed)} removidos (pet={mp.id}, raio={radius}km)"
        )
    except Exception as e:
        logger.error(f"_broadcast_missing_pet error: {e}")


# ── Endpoints ────────────────────────────────────────────────────────────────

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
        current_radius_km=body.radius_km or 2.0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(mp)
    db.commit()
    db.refresh(mp)
    _broadcast_missing_pet(mp)
    return {"id": mp.id, "status": "created"}


@router.get("")
def list_missing_pets(include_found: bool = False, db: Session = Depends(get_db)):
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

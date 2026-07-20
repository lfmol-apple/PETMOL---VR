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
import threading
import asyncio
import base64 as _base64
import io
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, Integer, String, DateTime, Text, Float
from sqlalchemy.orm import Session

from ..db import Base, get_db, SessionLocal
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from ..notifications import _load_subscriptions, _save_subscriptions, _send_push
from ..family.models import FamilyGroup, FamilyMember
from ..pets.access import accessible_pets_query, get_accessible_pet_or_404

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/missing-pets", tags=["Missing Pets"])
sighting_router = APIRouter(prefix="/pet-sightings", tags=["Pet Sightings"])

# ── Notified tracking (evita renotificar quem já recebeu) ────────────────────

_MP_NOTIFIED_FILE = os.environ.get(
    "MP_NOTIFIED_FILE",
    os.path.join(os.path.dirname(__file__), "mp_notified.json"),
)


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
    dismissed = Column(Integer, nullable=True, default=0)
    finder_user_id = Column(String(36), nullable=True)
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


class MissingPetPhotoFingerprint(Base):
    __tablename__ = "missing_pet_photo_fingerprints"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    missing_pet_id = Column(String(36), nullable=False, index=True)
    photo_url = Column(Text, nullable=False)
    dhash = Column(String(16), nullable=False, index=True)
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class PetSighting(Base):
    __tablename__ = "pet_sightings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    photo_urls = Column(Text, nullable=False)
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    location_text = Column(String(500), nullable=True)
    situation = Column(String(30), nullable=False, default="visto_no_local")
    contact = Column(String(200), nullable=True)
    notes = Column(Text, nullable=True)
    matched_missing_pet_id = Column(String(36), nullable=True, index=True)
    compatibility_score = Column(Integer, nullable=True)
    compatibility_analysis = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), index=True)


class MissingPetFollower(Base):
    __tablename__ = "missing_pet_followers"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    missing_pet_id = Column(String(36), nullable=False, index=True)
    finder_user_id = Column(String(36), nullable=True, index=True)
    finder_contact = Column(String(200), nullable=True, index=True)
    source = Column(String(50), nullable=False, default="dismissed_report")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


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
    finder_user_id: Optional[str] = None
    pre_score: Optional[int] = None
    pre_analysis: Optional[str] = None


class PhotoAnalysisBody(BaseModel):
    finder_photos: List[str] = []


class PhotoMatchBody(BaseModel):
    finder_photos: List[str] = []
    lat: Optional[float] = None
    lng: Optional[float] = None
    radius_km: Optional[float] = 30.0
    limit: Optional[int] = 20


class PetSightingCreate(BaseModel):
    finder_photos: List[str] = []
    lat: Optional[float] = None
    lng: Optional[float] = None
    cep: Optional[str] = None
    location_text: Optional[str] = None
    situation: str = "visto_no_local"
    contact: Optional[str] = None
    notes: Optional[str] = None


class MissingPetUpdate(BaseModel):
    characteristics: Optional[str] = None
    contact: Optional[str] = None
    last_seen_location: Optional[str] = None
    missing_date: Optional[str] = None
    missing_time: Optional[str] = None
    radius_km: Optional[float] = None


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


def _compatibility_level(score: int | None) -> str:
    if score is None:
        return "unknown"
    if score >= 90:
        return "strong_candidate"
    if score >= 75:
        return "review_candidate"
    if score >= 50:
        return "weak_candidate"
    return "unlikely"


def _compatibility_label(score: int | None) -> str:
    level = _compatibility_level(score)
    if level == "strong_candidate":
        return "Muito parecido - confirme com cuidado"
    if level == "review_candidate":
        return "Parecido - precisa confirmação"
    if level == "weak_candidate":
        return "Baixa confiança - verifique manualmente"
    if level == "unlikely":
        return "Pouca semelhança"
    return "Não foi possível avaliar bem"


def _compatibility_payload(score: int | None, analysis: str | None = None) -> dict:
    return {
        "confidence_level": _compatibility_level(score),
        "confidence_label": _compatibility_label(score),
        "requires_human_confirmation": True,
        "analysis": analysis or None,
    }


def _accessible_pet_ids(db: Session, user_id: str) -> list[str]:
    return [str(p.id) for p in accessible_pets_query(db, user_id).all()]


def _can_access_missing_pet(db: Session, user_id: str, mp: MissingPet) -> bool:
    if str(mp.user_id) == str(user_id):
        return True
    if not mp.pet_id:
        return False
    try:
        get_accessible_pet_or_404(db, str(user_id), str(mp.pet_id))
        return True
    except HTTPException:
        return False


def _ensure_missing_pet_access(db: Session, user_id: str, mp: MissingPet | None) -> MissingPet:
    if not mp:
        raise HTTPException(status_code=404, detail="Alerta não encontrado")
    if not _can_access_missing_pet(db, str(user_id), mp):
        raise HTTPException(status_code=403, detail="Sem permissão")
    return mp


def _family_missing_pets_query(db: Session, user_id: str, status: str | None = None):
    pet_ids = _accessible_pet_ids(db, user_id)
    q = db.query(MissingPet)
    if status:
        q = q.filter(MissingPet.status == status)
    if pet_ids:
        q = q.filter((MissingPet.user_id == str(user_id)) | (MissingPet.pet_id.in_(pet_ids)))
    else:
        q = q.filter(MissingPet.user_id == str(user_id))
    return q


def _broadcast_missing_pet(mp: MissingPet) -> int:
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

        print(
            f"[broadcast] pet={mp.id} owner={mp.user_id} raio={radius}km "
            f"has_location={has_location} total_subs={len(subs)} excluded={len(excluded)}",
            flush=True,
        )

        location_part = f"Visto em: {mp.last_seen_location}. " if mp.last_seen_location else ""
        payload = {
            "title": f"🚨 {mp.pet_name} pode estar na sua região!",
            "body": f"{location_part}Desaparecido desde {mp.missing_date or 'hoje'} às {mp.missing_time or '??:??'}. Toque para ajudar.",
            "tag": f"missing-pet-{mp.id}",
            "renotify": True,
            "requireInteraction": True,
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/icon-72x72.png",
            "data": {"url": f"/achei-um-pet?id={mp.id}"},
        }

        newly_notified: list = []
        removed: list = []
        sent = 0
        skipped = 0
        no_coord_sent = 0
        MAX_NO_LOCATION = 50        # alertas sem localização
        MAX_NO_COORD_SUB = 15       # assinantes sem coordenadas quando alerta TEM localização

        for user_id, subscription in subs.items():
            if user_id in excluded or user_id == str(mp.user_id):
                continue
            if not has_location and sent >= MAX_NO_LOCATION:
                skipped += 1
                continue

            # Geo filter
            if has_location:
                sub_lat = subscription.get("lat") if isinstance(subscription, dict) else None
                sub_lng = subscription.get("lng") if isinstance(subscription, dict) else None
                if sub_lat is None or sub_lng is None:
                    # Assinante sem coordenadas — localização desconhecida
                    # Permite até MAX_NO_COORD_SUB para não cortar alcance completamente
                    if no_coord_sent >= MAX_NO_COORD_SUB:
                        skipped += 1
                        continue
                    no_coord_sent += 1
                else:
                    dist = _haversine_km(mp.lat, mp.lng, sub_lat, sub_lng)
                    if dist > radius:
                        print(f"[broadcast]   skip {user_id[:8]} dist={dist:.1f}km > {radius}km", flush=True)
                        skipped += 1
                        continue

            ok, invalid = _send_push(subscription, payload)
            print(f"[broadcast]   user={user_id[:8]} ok={ok} invalid={invalid}", flush=True)
            if invalid:
                removed.append(user_id)
            elif ok:
                sent += 1
                newly_notified.append(user_id)

        if removed:
            for uid in removed:
                subs.pop(uid, None)
            _save_subscriptions(subs)

        # Notifica cuidadores e familiares do pet sempre (sem filtro de geo)
        caretaker_sent = 0
        if mp.pet_id:
            try:
                from ..pets.caretaker_models import PetCaretaker
                from ..pets.models import Pet
                from sqlalchemy.orm import Session as _Session
                from ..db import SessionLocal
                with SessionLocal() as _db:
                    family_user_ids: set[str] = set()
                    pet = _db.query(Pet).filter(Pet.id == mp.pet_id).first()
                    if pet:
                        family_members = (
                            _db.query(FamilyMember)
                            .join(FamilyGroup, FamilyGroup.id == FamilyMember.group_id)
                            .filter(FamilyGroup.owner_id == str(pet.user_id))
                            .all()
                        )
                        family_user_ids.update(str(m.user_id) for m in family_members)
                    caretakers = _db.query(PetCaretaker).filter(PetCaretaker.pet_id == mp.pet_id).all()
                    target_user_ids = {str(c.user_id) for c in caretakers} | family_user_ids
                    for c_id in target_user_ids:
                        if c_id in excluded or c_id == str(mp.user_id) or c_id in newly_notified:
                            continue
                        c_sub = subs.get(c_id)
                        if not c_sub:
                            continue
                        ok, _ = _send_push(c_sub, payload)
                        if ok:
                            caretaker_sent += 1
                            if c_id not in newly_notified:
                                newly_notified.append(c_id)
            except Exception as ce:
                print(f"[broadcast] caretaker push error: {ce}", flush=True)

        if newly_notified:
            _mark_notified(mp.id, newly_notified)

        print(
            f"[broadcast] DONE: {sent} geo + {caretaker_sent} cuidadores, {skipped} fora do raio, "
            f"{len(removed)} removidos (pet={mp.id})",
            flush=True,
        )
        return sent + caretaker_sent
    except Exception as e:
        print(f"[broadcast] ERRO: {e}", flush=True)
        logger.error(f"_broadcast_missing_pet error: {e}")
    return 0


def _save_sighting_photo(photo_b64: str) -> str:
    photo_bytes, mime = _decode_finder_photo(photo_b64)
    ext = "jpg"
    if mime == "image/png":
        ext = "png"
    elif mime == "image/webp":
        ext = "webp"
    elif mime == "image/gif":
        ext = "gif"
    upload_dir = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "pet_sightings")
    os.makedirs(upload_dir, exist_ok=True)
    filename = f"{uuid.uuid4().hex}.{ext}"
    path = os.path.join(upload_dir, filename)
    with open(path, "wb") as fh:
        fh.write(photo_bytes)
    return f"/uploads/pet_sightings/{filename}"


def _nearby_active_missing_pets(
    db: Session,
    lat: float | None,
    lng: float | None,
    radius_km: float = 30.0,
    days: int = 30,
    limit: int = 80,
) -> list[MissingPet]:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    q = (
        db.query(MissingPet)
        .filter(MissingPet.status == "active", MissingPet.photo_url.isnot(None))
        .filter(MissingPet.created_at >= since)
    )
    if lat is None or lng is None:
        return q.order_by(MissingPet.created_at.desc()).limit(min(limit, 40)).all()

    radius_km = max(3.0, min(float(radius_km or 30.0), 100.0))
    lat_delta = radius_km / 111.0
    lng_base = 111.0 * max(math.cos(math.radians(lat)), 0.1)
    lng_delta = radius_km / lng_base
    candidates = (
        q.filter(MissingPet.lat.isnot(None), MissingPet.lng.isnot(None))
        .filter(MissingPet.lat >= lat - lat_delta, MissingPet.lat <= lat + lat_delta)
        .filter(MissingPet.lng >= lng - lng_delta, MissingPet.lng <= lng + lng_delta)
        .order_by(MissingPet.created_at.desc())
        .limit(500)
        .all()
    )
    candidates = [
        p for p in candidates
        if p.lat is not None and p.lng is not None and _haversine_km(lat, lng, p.lat, p.lng) <= radius_km
    ]
    return sorted(candidates, key=lambda p: _haversine_km(lat, lng, p.lat, p.lng))[:limit]


def _create_found_report_from_sighting(
    db: Session,
    mp: MissingPet,
    sighting: PetSighting,
    score: int,
    analysis: str,
) -> FoundReport:
    contact = (sighting.contact or "Avistamento público").strip()
    existing = (
        db.query(FoundReport)
        .filter(FoundReport.missing_pet_id == mp.id, FoundReport.finder_contact == contact)
        .first()
    )
    if existing:
        return existing

    report = FoundReport(
        id=str(uuid.uuid4()),
        missing_pet_id=mp.id,
        finder_contact=contact,
        finder_location=sighting.location_text,
        notes=sighting.notes or f"Avistamento público: {sighting.situation}",
        finder_photos=sighting.photo_urls,
        compatibility_score=score,
        compatibility_analysis=analysis,
        created_at=datetime.now(timezone.utc),
    )
    db.add(report)
    sighting.matched_missing_pet_id = mp.id
    sighting.compatibility_score = score
    sighting.compatibility_analysis = analysis
    db.commit()

    if mp.user_id:
        threading.Thread(
            target=_push_owner_found,
            args=(mp, contact, sighting.location_text, mp.id),
            daemon=True,
        ).start()
        threading.Thread(
            target=_push_compat_score,
            args=(score, analysis or "", mp.user_id, mp.pet_name, report.id),
            daemon=True,
        ).start()
    return report


def _match_sighting_against_missing_pets(
    db: Session,
    sighting: PetSighting,
    threshold: int = 75,
) -> dict:
    photos = json.loads(sighting.photo_urls) if sighting.photo_urls else []
    if not photos:
        return {"matched": False, "analyzed": 0}

    candidates = _nearby_active_missing_pets(db, sighting.lat, sighting.lng)
    finder_photo_bytes = []
    for photo_url in photos[:2]:
        try:
            finder_photo_bytes.append(_load_reference_photo(photo_url))
        except Exception as exc:
            logger.warning(f"Sighting photo load failed ({photo_url}): {exc}")
    candidates, visual_distances = _rank_candidates_by_visual_fingerprint(db, candidates, finder_photo_bytes)

    best: tuple[MissingPet, int, str] | None = None
    analyzed = 0
    for mp in candidates[:40]:
        if not mp.photo_url:
            continue
        analyzed += 1
        score, analysis = _analyze_photo_compatibility(mp.photo_url, photos, mp.characteristics)
        if score >= threshold and (best is None or score > best[1]):
            best = (mp, score, analysis)
        elif score >= 50 and visual_distances.get(mp.id, 999) <= 12 and (best is None or score > best[1]):
            best = (mp, score, analysis)

    if not best:
        return {"matched": False, "analyzed": analyzed}

    mp, score, analysis = best
    report = _create_found_report_from_sighting(db, mp, sighting, score, analysis)
    return {"matched": True, "analyzed": analyzed, "missing_pet_id": mp.id, "report_id": report.id}


def _retro_match_recent_sightings_for_missing_pet(db: Session, mp: MissingPet) -> int:
    if not mp.photo_url:
        return 0
    since = datetime.now(timezone.utc) - timedelta(days=30)
    q = (
        db.query(PetSighting)
        .filter(PetSighting.created_at >= since, PetSighting.matched_missing_pet_id.is_(None))
        .order_by(PetSighting.created_at.desc())
        .limit(200)
    )
    sightings = q.all()
    matched = 0
    for sighting in sightings:
        if mp.lat is not None and mp.lng is not None and sighting.lat is not None and sighting.lng is not None:
            if _haversine_km(mp.lat, mp.lng, sighting.lat, sighting.lng) > 30:
                continue
        photos = json.loads(sighting.photo_urls) if sighting.photo_urls else []
        if not photos:
            continue
        score, analysis = _analyze_photo_compatibility(mp.photo_url, photos, mp.characteristics)
        if score >= 75:
            _create_found_report_from_sighting(db, mp, sighting, score, analysis)
            matched += 1
    return matched


def _retro_match_recent_sightings_for_missing_pet_id(mp_id: str) -> None:
    db = SessionLocal()
    try:
        mp = db.query(MissingPet).filter(MissingPet.id == mp_id, MissingPet.status == "active").first()
        if mp:
            _retro_match_recent_sightings_for_missing_pet(db, mp)
    except Exception as exc:
        logger.error(f"Retroactive sighting match failed for {mp_id}: {exc}")
    finally:
        db.close()


def _mark_finder_following_nearby_alerts(db: Session, report: FoundReport, mp: MissingPet) -> int:
    targets = _nearby_active_missing_pets(db, mp.lat, mp.lng, radius_km=30, days=30, limit=80)
    if not targets:
        targets = [mp]
    created = 0
    for target in targets:
        exists = (
            db.query(MissingPetFollower)
            .filter(
                MissingPetFollower.missing_pet_id == target.id,
                MissingPetFollower.finder_user_id == report.finder_user_id,
                MissingPetFollower.finder_contact == report.finder_contact,
            )
            .first()
        )
        if exists:
            continue
        db.add(MissingPetFollower(
            id=str(uuid.uuid4()),
            missing_pet_id=target.id,
            finder_user_id=report.finder_user_id,
            finder_contact=report.finder_contact,
            source="dismissed_report",
            created_at=datetime.now(timezone.utc),
        ))
        created += 1
    db.commit()
    return created


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_missing_pet(
    body: MissingPetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)
    owner_user_id = user_id
    pet_id = body.pet_id
    pet_name = body.pet_name
    species = body.species
    breed = body.breed
    photo_url = body.photo_url

    if pet_id:
        pet = get_accessible_pet_or_404(db, user_id, pet_id)
        owner_user_id = str(pet.user_id)
        pet_name = pet_name or pet.name
        species = species or pet.species
        breed = breed or pet.breed
        photo_url = photo_url or pet.photo_url

    # Bloqueia se já existe alerta ativo para o mesmo pet — só pode reabrir após confirmar encontrado
    existing_q = db.query(MissingPet).filter(MissingPet.status == "active")
    if pet_id:
        existing_q = existing_q.filter(MissingPet.pet_id == pet_id)
    else:
        existing_q = existing_q.filter(MissingPet.user_id == user_id, MissingPet.pet_name == pet_name)

    if existing_q.first():
        raise HTTPException(
            status_code=409,
            detail="Já existe um alerta ativo para este pet. Confirme que foi encontrado antes de criar um novo alerta.",
        )

    mp = MissingPet(
        id=str(uuid.uuid4()),
        user_id=owner_user_id,
        pet_id=pet_id,
        pet_name=pet_name,
        species=species,
        breed=breed,
        characteristics=body.characteristics,
        contact=body.contact,
        last_seen_location=body.last_seen_location,
        lat=body.lat,
        lng=body.lng,
        missing_date=body.missing_date,
        missing_time=body.missing_time,
        photo_url=photo_url,
        status="active",
        current_radius_km=body.radius_km or 2.0,
        created_at=datetime.now(timezone.utc),
    )
    db.add(mp)
    db.commit()
    db.refresh(mp)
    notified_count = _broadcast_missing_pet(mp)

    # Re-broadcasts nas primeiras 3 horas para maximizar o alcance
    for delay in [3600, 7200]:
        t = threading.Thread(target=_delayed_rebroadcast, args=(mp.id, delay), daemon=True)
        t.start()

    threading.Thread(target=_retro_match_recent_sightings_for_missing_pet_id, args=(mp.id,), daemon=True).start()

    return {"id": mp.id, "status": "created", "notified_count": notified_count}


@router.get("")
def list_missing_pets(include_found: bool = False, db: Session = Depends(get_db)):
    q = db.query(MissingPet)
    if not include_found:
        q = q.filter(MissingPet.status == "active")
    return [_mp_to_dict(p) for p in q.order_by(MissingPet.created_at.desc()).limit(200).all()]


@sighting_router.post("", status_code=201)
def create_pet_sighting(body: PetSightingCreate, db: Session = Depends(get_db)):
    """Registro público de avistamento livre, sem escolher alerta específico."""
    if not body.finder_photos:
        raise HTTPException(status_code=400, detail="Envie ao menos uma foto")

    situation = (body.situation or "visto_no_local").strip()
    if situation not in ("com_achador", "visto_no_local"):
        raise HTTPException(status_code=400, detail="Situação inválida")
    contact = (body.contact or "").strip()
    if situation == "com_achador" and not contact:
        raise HTTPException(status_code=400, detail="Informe um contato se o pet está com você")

    try:
        decoded = [_decode_finder_photo(photo) for photo in body.finder_photos[:3]]
    except Exception:
        raise HTTPException(status_code=400, detail="Não foi possível ler a foto enviada")
    quality = _assess_finder_photos_quality(decoded[:1])
    if not quality.get("ok"):
        return {
            "status": "rejected_photo_quality",
            "matched": False,
            "photo_quality": quality,
            "message": quality.get("message"),
        }

    photo_urls = []
    for photo in body.finder_photos[:3]:
        try:
            photo_urls.append(_save_sighting_photo(photo))
        except Exception as exc:
            logger.warning(f"Sighting photo save failed: {exc}")
    if not photo_urls:
        raise HTTPException(status_code=400, detail="Não foi possível salvar a foto enviada")

    location_text = body.location_text
    if not location_text and body.cep:
        location_text = f"CEP {body.cep}"

    sighting = PetSighting(
        id=str(uuid.uuid4()),
        photo_urls=json.dumps(photo_urls),
        lat=body.lat,
        lng=body.lng,
        location_text=location_text,
        situation=situation,
        contact=contact or None,
        notes=body.notes,
        created_at=datetime.now(timezone.utc),
    )
    db.add(sighting)
    db.commit()
    db.refresh(sighting)

    match = _match_sighting_against_missing_pets(db, sighting)
    return {
        "id": sighting.id,
        "status": "created",
        "matched": bool(match.get("matched")),
        "analyzed": match.get("analyzed", 0),
        "message": (
            "Encontramos um possível alerta e o tutor foi avisado para revisar."
            if match.get("matched")
            else "Avistamento registrado. Se um alerta compatível aparecer, o sistema poderá cruzar depois."
        ),
    }


@router.get("/my-found-reports")
def my_found_reports(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Retorna found_reports pendentes para pets que o usuário pode cuidar."""
    user_id = str(current_user.id)
    my_pets = _family_missing_pets_query(db, user_id, "active").all()
    if not my_pets:
        return []
    my_pet_ids = [p.id for p in my_pets]
    pet_map = {p.id: p for p in my_pets}
    reports = (
        db.query(FoundReport)
        .filter(FoundReport.missing_pet_id.in_(my_pet_ids), FoundReport.dismissed != 1)
        .order_by(FoundReport.created_at.desc())
        .all()
    )
    return [
        {
            "report_id": r.id,
            "missing_pet_id": r.missing_pet_id,
            "pet_name": pet_map[r.missing_pet_id].pet_name,
            "finder_contact": r.finder_contact,
            "finder_location": r.finder_location,
            "notes": r.notes,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "compatibility_score": r.compatibility_score,
            "compatibility_analysis": r.compatibility_analysis,
            **_compatibility_payload(r.compatibility_score, r.compatibility_analysis),
            "has_photos": bool(r.finder_photos),
            "photo_count": len(json.loads(r.finder_photos)) if r.finder_photos else 0,
        }
        for r in reports
        if r.missing_pet_id in pet_map
    ]


@router.patch("/found-reports/{report_id}/dismiss")
def dismiss_found_report(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dono descarta o report — foto não bate com o pet."""
    report = db.query(FoundReport).filter(FoundReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report não encontrado")
    mp = db.query(MissingPet).filter(MissingPet.id == report.missing_pet_id).first()
    _ensure_missing_pet_access(db, str(current_user.id), mp)
    report.dismissed = 1
    db.commit()
    following_count = _mark_finder_following_nearby_alerts(db, report, mp)

    # Push para o finder: avisa que o report foi descartado e o pet ainda está desaparecido
    if report.finder_user_id:
        try:
            subs = _load_subscriptions()
            finder_sub = subs.get(str(report.finder_user_id))
            if finder_sub:
                _send_push(finder_sub, {
                    "title": f"🔍 {mp.pet_name} ainda está desaparecido",
                    "body": "O tutor não reconheceu as fotos. Talvez seja outro animal — mas o pet ainda precisa de ajuda!",
                    "tag": f"dismissed-{report.id}",
                    "renotify": False,
                    "requireInteraction": False,
                    "icon": "/icons/icon-192x192.png",
                    "data": {"url": f"/achei-um-pet?id={mp.id}&retry=1"},
                })
        except Exception as e:
            logger.error(f"Push dismiss falhou: {e}")

    return {"status": "dismissed", "following_count": following_count}


@router.get("/{mp_id}/my-report-status")
def my_report_status(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Finder verifica se seu report foi descartado pelo dono."""
    user_id = str(current_user.id)
    report = (
        db.query(FoundReport)
        .filter(FoundReport.missing_pet_id == mp_id, FoundReport.finder_user_id == user_id)
        .order_by(FoundReport.created_at.desc())
        .first()
    )
    if not report:
        return {"found": False, "dismissed": False}
    return {"found": True, "dismissed": bool(report.dismissed)}


@router.get("/found-reports/{report_id}/photos")
def get_found_report_photos(
    report_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna as fotos enviadas pelo achador — acesso apenas para o dono do pet."""
    report = db.query(FoundReport).filter(FoundReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report não encontrado")
    mp = db.query(MissingPet).filter(MissingPet.id == report.missing_pet_id).first()
    _ensure_missing_pet_access(db, str(current_user.id), mp)
    photos = json.loads(report.finder_photos) if report.finder_photos else []
    return {
        "photos": photos,
        "compatibility_score": report.compatibility_score,
        "compatibility_analysis": report.compatibility_analysis,
        **_compatibility_payload(report.compatibility_score, report.compatibility_analysis),
    }


@router.get("/my-active")
def my_active_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Alertas ativos dos pets que o usuário pode cuidar."""
    pets = _family_missing_pets_query(db, str(current_user.id), "active").all()
    return [{**_mp_to_dict(p), "pet_id": p.pet_id} for p in pets]


@router.get("/my-alerts")
def my_alerts(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Retorna alertas ativos onde o usuário logado foi notificado (estava no raio)."""
    notified_data = _load_mp_notified()
    user_id = str(current_user.id)
    # IDs dos alertas onde este usuário foi notificado
    notified_pet_ids = [
        mp_id for mp_id, rec in notified_data.items()
        if user_id in rec.get("notified", [])
    ]
    family_alert_ids = [
        p.id for p in _family_missing_pets_query(db, user_id, "active").all()
    ]
    notified_pet_ids = list(set(notified_pet_ids + family_alert_ids))
    if not notified_pet_ids:
        return []
    pets = (
        db.query(MissingPet)
        .filter(MissingPet.id.in_(notified_pet_ids), MissingPet.status == "active")
        .order_by(MissingPet.created_at.desc())
        .all()
    )
    return [_mp_to_dict(p) for p in pets]


@router.get("/history")
def my_history(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Histórico de alertas encerrados — como dono e como finder."""
    user_id = str(current_user.id)

    # Pets da família que já foram encontrados
    family_found = (
        _family_missing_pets_query(db, user_id, "found")
        .order_by(MissingPet.found_at.desc())
        .limit(20)
        .all()
    )

    # Pets de outros usuários onde o usuário foi notificado e já foram encontrados
    notified_data = _load_mp_notified()
    notified_pet_ids = [mp_id for mp_id, rec in notified_data.items() if user_id in rec.get("notified", [])]
    helped_found = []
    if notified_pet_ids:
        family_found_ids = [p.id for p in family_found]
        helped_found = (
            db.query(MissingPet)
            .filter(
                MissingPet.id.in_(notified_pet_ids),
                MissingPet.status == "found",
                MissingPet.user_id != user_id,
                ~MissingPet.id.in_(family_found_ids) if family_found_ids else True,
            )
            .order_by(MissingPet.found_at.desc())
            .limit(20)
            .all()
        )

    def _fmt(p: MissingPet, role: str) -> dict:
        return {
            "id": p.id,
            "pet_name": p.pet_name,
            "species": p.species,
            "found_at": p.found_at.isoformat() if p.found_at else None,
            "last_seen_location": p.last_seen_location,
            "role": role,
        }

    return (
        [_fmt(p, "family") for p in family_found]
        + [_fmt(p, "finder") for p in helped_found]
    )


@router.patch("/{mp_id}/found")
def mark_found(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id).first()
    _ensure_missing_pet_access(db, str(current_user.id), mp)
    mp.status = "found"
    mp.found_at = datetime.now(timezone.utc)
    db.commit()

    # Push de agradecimento para quem encontrou o pet (se tiver user_id e subscrição)
    try:
        report = (
            db.query(FoundReport)
            .filter(FoundReport.missing_pet_id == mp_id, FoundReport.dismissed != 1)
            .order_by(FoundReport.created_at.desc())
            .first()
        )
        if report and report.finder_user_id:
            subs = _load_subscriptions()
            finder_sub = subs.get(str(report.finder_user_id))
            if finder_sub:
                _send_push(finder_sub, {
                    "title": f"🎉 Você fez a diferença!",
                    "body": f"O tutor de {mp.pet_name} confirmou que você encontrou o pet. Muito obrigado!",
                    "tag": f"thanks-{mp_id}",
                    "renotify": False,
                    "requireInteraction": False,
                    "icon": "/icons/icon-192x192.png",
                    "data": {"url": "/home"},
                })
    except Exception as e:
        logger.error(f"Push agradecimento falhou: {e}")

    return {"status": "found"}


class PhotoUploadBody(BaseModel):
    photo_base64: str  # data:image/jpeg;base64,... or raw base64


@router.get("/{mp_id}/reach")
def alert_reach(
    mp_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna quantas pessoas têm o push ativo na área e quantas novas podem receber."""
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id).first()
    _ensure_missing_pet_access(db, str(current_user.id), mp)

    subs = _load_subscriptions()
    notified_data = _load_mp_notified()
    already_notified_ids = set(notified_data.get(mp_id, {}).get("notified", []))
    radius = mp.current_radius_km or 2.0
    has_location = mp.lat is not None and mp.lng is not None

    notified_active = 0   # já receberam E ainda têm subscrição válida
    new_in_radius = 0     # novos no raio que ainda não receberam

    for user_id, sub in subs.items():
        if user_id == str(mp.user_id):
            continue
        if has_location:
            sub_lat = sub.get("lat") if isinstance(sub, dict) else None
            sub_lng = sub.get("lng") if isinstance(sub, dict) else None
            if sub_lat is None or sub_lng is None:
                continue
            dist = _haversine_km(mp.lat, mp.lng, sub_lat, sub_lng)
            if dist > radius:
                continue
        if user_id in already_notified_ids:
            notified_active += 1
        else:
            new_in_radius += 1

    return {
        "notified_active": notified_active,
        "new_in_radius": new_in_radius,
        "radius_km": radius,
    }


@router.patch("/{mp_id}")
def update_missing_pet(
    mp_id: str,
    body: MissingPetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edita alerta ativo e re-envia push para novos usuários no raio."""
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id, MissingPet.status == "active").first()
    _ensure_missing_pet_access(db, str(current_user.id), mp)

    if body.characteristics is not None:
        mp.characteristics = body.characteristics or None
    if body.contact is not None:
        mp.contact = body.contact
    if body.last_seen_location is not None:
        mp.last_seen_location = body.last_seen_location or None
    if body.missing_date is not None:
        mp.missing_date = body.missing_date
    if body.missing_time is not None:
        mp.missing_time = body.missing_time
    if body.radius_km is not None:
        mp.current_radius_km = body.radius_km
    db.commit()
    db.refresh(mp)

    newly_notified = _broadcast_missing_pet(mp)
    return {"status": "updated", "newly_notified": newly_notified}


@router.post("/upload-photo")
def upload_missing_pet_photo(body: PhotoUploadBody):
    """Salva foto do alerta no disco e retorna o caminho relativo."""
    import base64 as _b64
    import re
    try:
        data = body.photo_base64
        mime = "image/jpeg"
        if data.startswith("data:"):
            m = re.match(r"data:([^;]+);base64,(.+)", data, re.DOTALL)
            if m:
                mime = m.group(1)
                data = m.group(2)
        raw = _b64.b64decode(data)
        ext_map = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}
        ext = ext_map.get(mime, ".jpg")
        filename = f"{uuid.uuid4().hex}{ext}"
        upload_dir = os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "pets")
        os.makedirs(upload_dir, exist_ok=True)
        filepath = os.path.join(upload_dir, filename)
        with open(filepath, "wb") as f:
            f.write(raw)
        return {"photo_url": f"pets/{filename}"}
    except Exception as e:
        logger.error(f"upload_missing_pet_photo error: {e}")
        raise HTTPException(status_code=500, detail="Erro ao salvar foto")


@router.post("/match-photo")
def match_missing_pets_by_photo(body: PhotoMatchBody, db: Session = Depends(get_db)):
    """Compara fotos do achador contra alertas ativos e retorna os melhores candidatos."""
    if not body.finder_photos:
        raise HTTPException(status_code=400, detail="Envie ao menos uma foto")

    try:
        finder_photo_bytes = [_decode_finder_photo(photo) for photo in body.finder_photos[:2]]
    except Exception:
        raise HTTPException(status_code=400, detail="Não foi possível ler a foto enviada")

    quality = _assess_finder_photos_quality(finder_photo_bytes)
    if not quality.get("ok"):
        return {
            "analyzed": 0,
            "total_active_with_photo": 0,
            "matches": [],
            "photo_quality": quality,
            "message": quality.get("message"),
        }

    max_candidates = max(1, min(int(body.limit or 20), 40))
    q = db.query(MissingPet).filter(MissingPet.status == "active", MissingPet.photo_url.isnot(None))

    geo_distances: dict[str, float] = {}
    if body.lat is not None and body.lng is not None:
        radius_km = max(3.0, min(float(body.radius_km or 30.0), 100.0))
        lat_delta = radius_km / 111.0
        lng_base = 111.0 * max(math.cos(math.radians(body.lat)), 0.1)
        lng_delta = radius_km / lng_base
        q = (
            q.filter(MissingPet.lat.isnot(None), MissingPet.lng.isnot(None))
            .filter(MissingPet.lat >= body.lat - lat_delta, MissingPet.lat <= body.lat + lat_delta)
            .filter(MissingPet.lng >= body.lng - lng_delta, MissingPet.lng <= body.lng + lng_delta)
        )
        geo_candidates = q.order_by(MissingPet.created_at.desc()).limit(500).all()

        def _distance(p: MissingPet) -> float:
            return _haversine_km(body.lat, body.lng, p.lat, p.lng)

        candidates = [p for p in geo_candidates if p.lat is not None and p.lng is not None and _distance(p) <= radius_km]
        geo_distances = {p.id: _distance(p) for p in candidates}
        candidates = sorted(candidates, key=lambda p: geo_distances.get(p.id, 999999.0))
    else:
        candidates = q.order_by(MissingPet.created_at.desc()).limit(200).all()

    candidates, visual_distances = _rank_candidates_by_visual_fingerprint(db, candidates, finder_photo_bytes)
    if geo_distances:
        candidates = sorted(
            candidates,
            key=lambda p: (
                visual_distances.get(p.id, 999),
                geo_distances.get(p.id, 999999.0),
            ),
        )

    results: list[dict] = []
    analyzed = 0
    for mp in candidates:
        if analyzed >= max_candidates:
            break
        if not mp.photo_url:
            continue
        analyzed += 1
        score, analysis = _analyze_photo_compatibility(mp.photo_url, body.finder_photos[:2], mp.characteristics)
        if score < 50:
            continue
        item = _mp_to_dict(mp)
        item["score"] = score
        item.update(_compatibility_payload(score, analysis))
        if mp.id in visual_distances:
            item["visual_distance"] = visual_distances[mp.id]
        if mp.id in geo_distances:
            item["distance_km"] = round(geo_distances[mp.id], 2)
        else:
            item["distance_km"] = None
        results.append(item)

    results.sort(key=lambda p: (p.get("score") or 0, -(p.get("distance_km") or 999999)), reverse=True)
    return {
        "analyzed": analyzed,
        "total_active_with_photo": len(candidates),
        "photo_quality": quality,
        "matches": results[:8],
    }


@router.post("/{mp_id}/analyze-photo")
def analyze_photo(mp_id: str, body: PhotoAnalysisBody, db: Session = Depends(get_db)):
    """Pré-análise de compatibilidade sem criar report — usado antes de enviar aviso."""
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id, MissingPet.status == "active").first()
    if not mp or not mp.photo_url or not body.finder_photos:
        return {"score": None, "analysis": None}
    try:
        quality = _assess_finder_photos_quality([_decode_finder_photo(photo) for photo in body.finder_photos[:2]])
        if not quality.get("ok"):
            return {
                "score": None,
                "analysis": quality.get("message"),
                "photo_quality": quality,
                **_compatibility_payload(None, quality.get("message")),
            }
    except Exception:
        quality = None
    score, analysis = _analyze_photo_compatibility(mp.photo_url, body.finder_photos, mp.characteristics)
    return {
        "score": score if score >= 50 else None,
        "analysis": analysis if analysis else None,
        "photo_quality": quality,
        **_compatibility_payload(score if score >= 50 else None, analysis),
    }


def _delayed_rebroadcast(mp_id: str, delay_seconds: int) -> None:
    """Re-broadcast agendado para maximizar o alcance nas primeiras horas."""
    import time
    time.sleep(delay_seconds)
    try:
        from ..db import SessionLocal
        db = SessionLocal()
        try:
            mp = db.query(MissingPet).filter(
                MissingPet.id == mp_id, MissingPet.status == "active"
            ).first()
            if mp:
                sent = _broadcast_missing_pet(mp)
                print(f"[rebroadcast] delay={delay_seconds//3600}h pet={mp_id[:8]} sent={sent}", flush=True)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"[rebroadcast] error: {e}")


def _run_async(coro):
    """Run an async task from sync FastAPI/background contexts."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    result: dict[str, Any] = {}
    error: dict[str, BaseException] = {}

    def _runner():
        try:
            result["value"] = asyncio.run(coro)
        except BaseException as exc:
            error["value"] = exc

    t = threading.Thread(target=_runner)
    t.start()
    t.join()
    if error:
        raise error["value"]
    return result.get("value")


def _json_from_model_text(text: str) -> dict:
    import re

    cleaned = (text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    if cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    cleaned = cleaned.strip()

    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", cleaned)
        if not m:
            raise
        return json.loads(m.group())


def _normalize_reference_photo_urls(pet_photo_url) -> list[str]:
    if not pet_photo_url:
        return []
    if isinstance(pet_photo_url, (list, tuple)):
        return [str(x).strip() for x in pet_photo_url if str(x).strip()]
    value = str(pet_photo_url).strip()
    if not value:
        return []
    if value.startswith("["):
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except Exception:
            pass
    if "\n" in value:
        return [x.strip() for x in value.splitlines() if x.strip()]
    if "," in value and not value.startswith("data:"):
        return [x.strip() for x in value.split(",") if x.strip()]
    return [value]


def _reference_url_to_fetch_url(photo_url: str) -> str:
    if photo_url.startswith("http"):
        return photo_url
    path = photo_url.lstrip("/")
    if path.startswith("uploads/"):
        return f"http://localhost:8000/{path}"
    return f"http://localhost:8000/uploads/{path}"


def _mime_from_name_or_data(value: str, default: str = "image/jpeg") -> str:
    lower = (value or "").lower()
    if lower.startswith("data:") and ";" in lower:
        return lower.split(";", 1)[0].replace("data:", "") or default
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return default


def _decode_finder_photo(photo_b64: str) -> tuple[bytes, str]:
    raw = photo_b64.split(",", 1)[-1] if "," in photo_b64 else photo_b64
    return _base64.b64decode(raw), _mime_from_name_or_data(photo_b64)


def _compute_photo_dhash(photo_bytes: bytes) -> dict:
    """Small perceptual fingerprint used only to pre-rank candidates before AI."""
    from PIL import Image, ImageOps

    image = Image.open(io.BytesIO(photo_bytes))
    image = ImageOps.exif_transpose(image)
    width, height = image.size
    gray = image.convert("L").resize((9, 8))
    pixels = list(gray.getdata())
    value = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            value = (value << 1) | (1 if left > right else 0)
    return {"dhash": f"{value:016x}", "width": width, "height": height}


def _hash_distance(hex_a: str | None, hex_b: str | None) -> int | None:
    if not hex_a or not hex_b:
        return None
    try:
        return (int(hex_a, 16) ^ int(hex_b, 16)).bit_count()
    except Exception:
        return None


def _finder_photo_hashes(finder_photos: list[tuple[bytes, str]]) -> list[str]:
    hashes: list[str] = []
    for photo_bytes, _mime in finder_photos[:2]:
        try:
            hashes.append(str(_compute_photo_dhash(photo_bytes)["dhash"]))
        except Exception as exc:
            logger.warning(f"Finder photo fingerprint failed: {exc}")
    return hashes


def _get_or_create_photo_fingerprint(db: Session, mp: MissingPet) -> MissingPetPhotoFingerprint | None:
    if not mp.photo_url:
        return None
    reference_urls = _normalize_reference_photo_urls(mp.photo_url)
    if not reference_urls:
        return None
    photo_url = reference_urls[0]
    existing = (
        db.query(MissingPetPhotoFingerprint)
        .filter(
            MissingPetPhotoFingerprint.missing_pet_id == mp.id,
            MissingPetPhotoFingerprint.photo_url == photo_url,
        )
        .first()
    )
    if existing:
        return existing
    try:
        photo_bytes, _mime = _load_reference_photo(photo_url)
        fingerprint = _compute_photo_dhash(photo_bytes)
        row = MissingPetPhotoFingerprint(
            id=str(uuid.uuid4()),
            missing_pet_id=mp.id,
            photo_url=photo_url,
            dhash=str(fingerprint["dhash"]),
            width=int(fingerprint.get("width") or 0) or None,
            height=int(fingerprint.get("height") or 0) or None,
            created_at=datetime.now(timezone.utc),
        )
        db.add(row)
        db.commit()
        return row
    except Exception as exc:
        db.rollback()
        logger.warning(f"Missing pet photo fingerprint failed ({mp.id}): {exc}")
        return None


def _rank_candidates_by_visual_fingerprint(
    db: Session,
    candidates: list[MissingPet],
    finder_photos: list[tuple[bytes, str]],
) -> tuple[list[MissingPet], dict[str, int]]:
    finder_hashes = _finder_photo_hashes(finder_photos)
    if not finder_hashes or not candidates:
        return candidates, {}

    distances: dict[str, int] = {}
    for mp in candidates:
        fingerprint = _get_or_create_photo_fingerprint(db, mp)
        if not fingerprint:
            continue
        min_distance = min(
            (d for d in (_hash_distance(finder_hash, fingerprint.dhash) for finder_hash in finder_hashes) if d is not None),
            default=None,
        )
        if min_distance is not None:
            distances[mp.id] = min_distance

    if not distances:
        return candidates, {}

    ranked = sorted(candidates, key=lambda p: (distances.get(p.id, 999), p.created_at or datetime.min.replace(tzinfo=timezone.utc)))
    return ranked, distances


def _assess_finder_photo_quality(photo: tuple[bytes, str]) -> dict:
    try:
        from PIL import Image, ImageStat

        image = Image.open(io.BytesIO(photo[0])).convert("L")
        width, height = image.size
        resized = image.resize((min(width, 256), max(1, round(height * min(width, 256) / max(width, 1)))))
        stat = ImageStat.Stat(resized)
        brightness = float(stat.mean[0])
        contrast = float(stat.stddev[0])
        warnings: list[str] = []
        if width < 360 or height < 360:
            warnings.append("foto pequena")
        if brightness < 35:
            warnings.append("foto muito escura")
        if brightness > 225:
            warnings.append("foto muito clara")
        if contrast < 18:
            warnings.append("baixo contraste")
        return {
            "ok": len(warnings) == 0,
            "width": width,
            "height": height,
            "brightness": round(brightness, 1),
            "contrast": round(contrast, 1),
            "warnings": warnings,
        }
    except Exception as exc:
        logger.warning(f"Photo quality assessment failed: {exc}")
        return {"ok": True, "warnings": []}


def _assess_finder_photos_quality(finder_photos: list[tuple[bytes, str]]) -> dict:
    checks = [_assess_finder_photo_quality(photo) for photo in finder_photos]
    blocking = [check for check in checks if not check.get("ok")]
    warnings = sorted({warning for check in checks for warning in check.get("warnings", [])})
    return {
        "ok": not blocking,
        "checks": checks,
        "warnings": warnings,
        "message": "Envie uma foto mais nítida, com boa luz e o pet visível." if blocking else None,
    }


def _load_reference_photo(photo_url: str) -> tuple[bytes, str]:
    import urllib.request

    url = _reference_url_to_fetch_url(photo_url)
    with urllib.request.urlopen(url, timeout=15) as resp:
        return resp.read(), _mime_from_name_or_data(photo_url)


def _pet_match_prompt(n_finder_photos: int, characteristics: str | None) -> str:
    finder_text = (
        "As demais imagens são fotos tiradas por quem diz ter encontrado o pet."
        if n_finder_photos > 1
        else "A segunda imagem é a foto tirada por quem diz ter encontrado o pet."
    )
    characteristics_text = ""
    if characteristics and characteristics.strip():
        characteristics_text = (
            " O tutor descreveu estas características adicionais do pet: "
            f"{characteristics.strip()}. Considere isso na comparação, mas não ignore "
            "o que vir das fotos se o texto divergir muito do que é visível."
        )
    return (
        f"Você recebeu {n_finder_photos + 1} fotos. A primeira é foto de referência "
        f"do pet desaparecido. {finder_text}{characteristics_text} "
        "Compare pelagem, cor, raça, porte, marcações, orelhas, focinho, olhos e demais traços visíveis. "
        "Use as características do tutor apenas como pista complementar. "
        "Responda SOMENTE em JSON válido: "
        "{\"score\": <inteiro 0 a 100>, \"analysis\": \"<frase curta em português, máx 80 chars>\"}. "
        "score=100 significa certamente o mesmo animal; score=0 significa certamente diferente."
    )


async def _score_with_gemini(
    reference: tuple[bytes, str],
    finder_photos: list[tuple[bytes, str]],
    characteristics: str | None,
) -> dict:
    import google.generativeai as genai

    api_key = os.environ.get("GEMINI_API_KEY", "")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY não configurada")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel("gemini-2.5-flash")
    prompt = _pet_match_prompt(len(finder_photos), characteristics)
    parts: list[Any] = [
        prompt,
        {"inline_data": {"mime_type": reference[1], "data": _base64.b64encode(reference[0]).decode()}},
    ]
    for photo_bytes, mime in finder_photos:
        parts.append({"inline_data": {"mime_type": mime, "data": _base64.b64encode(photo_bytes).decode()}})

    response = await asyncio.to_thread(model.generate_content, parts)
    data = _json_from_model_text(response.text)
    return {"engine": "gemini", "score": int(data.get("score", 0)), "analysis": str(data.get("analysis", ""))}


async def _score_with_openai(
    reference: tuple[bytes, str],
    finder_photos: list[tuple[bytes, str]],
    characteristics: str | None,
) -> dict:
    from openai import AsyncOpenAI

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY não configurada")

    client = AsyncOpenAI(api_key=api_key)
    prompt = _pet_match_prompt(len(finder_photos), characteristics)
    content: list[dict[str, Any]] = [{"type": "text", "text": prompt}]
    all_photos = [reference] + finder_photos
    for photo_bytes, mime in all_photos:
        encoded = _base64.b64encode(photo_bytes).decode()
        content.append({
            "type": "image_url",
            "image_url": {"url": f"data:{mime};base64,{encoded}", "detail": "high"},
        })

    response = await client.chat.completions.create(
        model=os.environ.get("PETMOL_OPENAI_VISION_MODEL", "gpt-4-turbo"),
        messages=[{"role": "user", "content": content}],
        max_tokens=400,
        temperature=0.1,
    )
    data = _json_from_model_text(response.choices[0].message.content or "")
    return {"engine": "gpt-4-vision", "score": int(data.get("score", 0)), "analysis": str(data.get("analysis", ""))}


def _consensus_pet_match(results: list[dict]) -> tuple[int, str]:
    valid = [
        r for r in results
        if not isinstance(r, Exception) and isinstance(r, dict) and r.get("score") is not None
    ]
    if not valid:
        return 0, ""
    for result in valid:
        result["score"] = max(0, min(100, int(result.get("score") or 0)))

    if len(valid) == 1:
        return valid[0]["score"], valid[0].get("analysis", "")

    valid = sorted(valid, key=lambda r: r["score"], reverse=True)
    high, low = valid[0], valid[-1]
    if abs(high["score"] - low["score"]) <= 15:
        score = round(sum(r["score"] for r in valid) / len(valid))
        analysis_source = high
    else:
        score = low["score"]
        analysis_source = low
    return score, analysis_source.get("analysis", "")


def _valid_pet_match_results(results: list[Any]) -> list[dict]:
    return [
        r for r in results
        if not isinstance(r, Exception) and isinstance(r, dict) and r.get("score") is not None
    ]


async def _analyze_reference_against_finders(
    reference: tuple[bytes, str],
    finder_photos: list[tuple[bytes, str]],
    characteristics: str | None,
) -> tuple[int, str]:
    tasks = []
    if os.environ.get("GEMINI_API_KEY"):
        tasks.append(_score_with_gemini(reference, finder_photos, characteristics))
    if os.environ.get("OPENAI_API_KEY"):
        tasks.append(_score_with_openai(reference, finder_photos, characteristics))
    if not tasks:
        return 0, ""

    results = await asyncio.gather(*tasks, return_exceptions=True)
    for result in results:
        if isinstance(result, Exception):
            logger.warning(f"Pet compat engine failed: {result}")
    score, analysis = _consensus_pet_match(list(results))
    if len(tasks) >= 2 and len(_valid_pet_match_results(list(results))) < 2:
        score = min(score, 74)
        analysis = analysis or "Apenas uma IA conseguiu avaliar; confirme manualmente."
    return score, analysis


def _analyze_photo_compatibility(pet_photo_url, finder_photos_b64: list, characteristics: str | None = None) -> tuple:
    """Compare pet photos with Gemini and OpenAI Vision, using conservative consensus."""
    try:
        if not finder_photos_b64:
            return 0, ""

        reference_urls = _normalize_reference_photo_urls(pet_photo_url)
        if not reference_urls:
            return 0, ""

        finder_photos = [_decode_finder_photo(b64) for b64 in finder_photos_b64[:3]]
        best_score = 0
        best_analysis = ""

        for reference_url in reference_urls:
            try:
                reference = _load_reference_photo(reference_url)
                score, analysis = _run_async(
                    _analyze_reference_against_finders(reference, finder_photos, characteristics)
                )
                if score > best_score:
                    best_score = score
                    best_analysis = analysis
            except Exception as e:
                logger.warning(f"Pet compat reference failed ({reference_url}): {e}")

        return best_score, best_analysis
    except Exception as e:
        logger.error(f"Pet compat analysis failed: {e}")
    return 0, ""


def _push_compat_score(score: int, analysis: str, owner_user_id, pet_name: str, report_id: str) -> None:
    """Envia push com % de compatibilidade ao dono quando o score já é conhecido (via pré-análise)."""
    try:
        subs = _load_subscriptions()
        owner_sub = subs.get(str(owner_user_id))
        if not owner_sub:
            return
        emoji = "🔎" if score >= 90 else "⚠️" if score >= 75 else "❓"
        label = _compatibility_label(score)
        _send_push(owner_sub, {
            "title": f"{emoji} Possível match para {pet_name}",
            "body": f"{score}% - {label}. Confira as fotos antes de confirmar.",
            "tag": f"compat-{report_id}",
            "renotify": False,
            "requireInteraction": False,
            "icon": "/icons/icon-192x192.png",
            "data": {"url": "/home"},
        })
    except Exception as e:
        logger.error(f"Push compatibilidade falhou: {e}")


def _push_owner_found(mp: MissingPet, finder_contact: str, finder_location: str | None, mp_id: str) -> None:
    """Envia push imediato ao dono quando alguém reporta possível localização do pet."""
    try:
        subs = _load_subscriptions()
        owner_sub = subs.get(str(mp.user_id))
        if not owner_sub:
            return
        loc = f" em {finder_location}" if finder_location else ""
        _send_push(owner_sub, {
            "title": f"🔎 Possível localização de {mp.pet_name}",
            "body": f"Alguém enviou um pet parecido{loc}. Contato: {finder_contact}. Confira antes de confirmar.",
            "tag": f"found-report-{mp_id}",
            "renotify": True,
            "requireInteraction": True,
            "icon": "/icons/icon-192x192.png",
            "data": {"url": f"/home"},
        })
    except Exception as e:
        logger.error(f"Push ao tutor falhou: {e}")


def _analyze_and_save(report_id: str, mp_photo_url: str, finder_photos: list, owner_user_id: str, pet_name: str, mp_id: str, characteristics: str | None = None) -> None:
    """Roda análise de foto em background e salva o score — depois envia push com o resultado."""
    try:
        from ..db import SessionLocal
        score, analysis = _analyze_photo_compatibility(mp_photo_url, finder_photos, characteristics)
        if score <= 0:
            return
        db = SessionLocal()
        try:
            rep = db.query(FoundReport).filter(FoundReport.id == report_id).first()
            if rep:
                rep.compatibility_score = score
                rep.compatibility_analysis = analysis
                db.commit()
        finally:
            db.close()
        # Segundo push com a triagem de compatibilidade
        try:
            subs = _load_subscriptions()
            owner_sub = subs.get(str(owner_user_id))
            if owner_sub:
                emoji = "🔎" if score >= 90 else "⚠️" if score >= 75 else "❓"
                label = _compatibility_label(score)
                _send_push(owner_sub, {
                    "title": f"{emoji} Possível match para {pet_name}",
                    "body": f"{score}% - {label}. Confira as fotos antes de confirmar.",
                    "tag": f"compat-{report_id}",
                    "renotify": False,
                    "requireInteraction": False,
                    "icon": "/icons/icon-192x192.png",
                    "data": {"url": f"/home"},
                })
        except Exception as e:
            logger.error(f"Push compatibilidade falhou: {e}")
    except Exception as e:
        logger.error(f"_analyze_and_save error: {e}")


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
        return {"id": existing.id, "status": "already_reported",
                "compatibility_score": existing.compatibility_score,
                "compatibility_analysis": existing.compatibility_analysis}

    # Se o frontend já rodou a pré-análise Gemini, reusar o score — evita duas chamadas
    has_pre_score = body.pre_score is not None and body.pre_score > 0

    report = FoundReport(
        id=str(uuid.uuid4()),
        missing_pet_id=mp_id,
        finder_contact=body.finder_contact.strip(),
        finder_location=body.finder_location,
        notes=body.notes,
        finder_photos=json.dumps(body.finder_photos) if body.finder_photos else None,
        finder_user_id=body.finder_user_id,
        compatibility_score=body.pre_score if has_pre_score else None,
        compatibility_analysis=body.pre_analysis if has_pre_score else None,
        created_at=datetime.now(timezone.utc),
    )
    db.add(report)
    db.commit()
    report_id = report.id

    # Push IMEDIATO para o dono (antes de qualquer análise)
    threading.Thread(
        target=_push_owner_found,
        args=(mp, body.finder_contact.strip(), body.finder_location, mp_id),
        daemon=True,
    ).start()

    if has_pre_score:
        # Score já conhecido — envia push com % imediatamente
        threading.Thread(
            target=_push_compat_score,
            args=(body.pre_score, body.pre_analysis or "", mp.user_id, mp.pet_name, report_id),
            daemon=True,
        ).start()
    elif body.finder_photos and mp.photo_url:
        # Sem pré-análise — roda Gemini em background
        threading.Thread(
            target=_analyze_and_save,
            args=(report_id, mp.photo_url, body.finder_photos, mp.user_id, mp.pet_name, mp_id, mp.characteristics),
            daemon=True,
        ).start()

    return {
        "id": report_id,
        "status": "reported",
        "compatibility_score": body.pre_score if has_pre_score else None,
        "compatibility_analysis": body.pre_analysis if has_pre_score else None,
    }

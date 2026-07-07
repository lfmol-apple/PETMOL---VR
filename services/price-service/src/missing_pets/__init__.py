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


class PhotoAnalysisBody(BaseModel):
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
        MAX_NO_LOCATION = 50

        for user_id, subscription in subs.items():
            if user_id in excluded or user_id == str(mp.user_id):
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

        if newly_notified:
            _mark_notified(mp.id, newly_notified)

        print(
            f"[broadcast] DONE: {sent} enviados, {skipped} fora do raio, "
            f"{len(removed)} removidos (pet={mp.id})",
            flush=True,
        )
        return sent
    except Exception as e:
        print(f"[broadcast] ERRO: {e}", flush=True)
        logger.error(f"_broadcast_missing_pet error: {e}")
    return 0


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def create_missing_pet(
    body: MissingPetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = str(current_user.id)

    # Bloqueia se já existe alerta ativo para o mesmo pet — só pode reabrir após confirmar encontrado
    existing_q = db.query(MissingPet).filter(
        MissingPet.user_id == user_id,
        MissingPet.status == "active",
    )
    if body.pet_id:
        existing_q = existing_q.filter(MissingPet.pet_id == body.pet_id)
    else:
        existing_q = existing_q.filter(MissingPet.pet_name == body.pet_name)

    if existing_q.first():
        raise HTTPException(
            status_code=409,
            detail="Já existe um alerta ativo para este pet. Confirme que foi encontrado antes de criar um novo alerta.",
        )

    mp = MissingPet(
        id=str(uuid.uuid4()),
        user_id=user_id,
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
    notified_count = _broadcast_missing_pet(mp)

    # Re-broadcasts nas primeiras 3 horas para maximizar o alcance
    for delay in [3600, 7200]:
        t = threading.Thread(target=_delayed_rebroadcast, args=(mp.id, delay), daemon=True)
        t.start()

    return {"id": mp.id, "status": "created", "notified_count": notified_count}


@router.get("")
def list_missing_pets(include_found: bool = False, db: Session = Depends(get_db)):
    q = db.query(MissingPet)
    if not include_found:
        q = q.filter(MissingPet.status == "active")
    return [_mp_to_dict(p) for p in q.order_by(MissingPet.created_at.desc()).limit(200).all()]


@router.get("/my-found-reports")
def my_found_reports(db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    """Retorna found_reports pendentes para os missing pets do usuário logado."""
    user_id = str(current_user.id)
    my_pets = (
        db.query(MissingPet)
        .filter(MissingPet.user_id == user_id, MissingPet.status == "active")
        .all()
    )
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
    if not mp or str(mp.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sem permissão")
    report.dismissed = 1
    db.commit()
    return {"status": "dismissed"}


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
    if not mp or str(mp.user_id) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Sem permissão")
    photos = json.loads(report.finder_photos) if report.finder_photos else []
    return {
        "photos": photos,
        "compatibility_score": report.compatibility_score,
        "compatibility_analysis": report.compatibility_analysis,
    }


@router.get("/my-active")
def my_active_alerts(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Alertas ativos criados pelo próprio usuário (seus pets desaparecidos)."""
    pets = (
        db.query(MissingPet)
        .filter(MissingPet.user_id == str(current_user.id), MissingPet.status == "active")
        .all()
    )
    return [{"id": p.id, "pet_id": p.pet_id, "pet_name": p.pet_name} for p in pets]


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

    # Pets do próprio usuário que já foram encontrados
    owned_found = (
        db.query(MissingPet)
        .filter(MissingPet.user_id == user_id, MissingPet.status == "found")
        .order_by(MissingPet.found_at.desc())
        .limit(20)
        .all()
    )

    # Pets de outros usuários onde o usuário foi notificado e já foram encontrados
    notified_data = _load_mp_notified()
    notified_pet_ids = [mp_id for mp_id, rec in notified_data.items() if user_id in rec.get("notified", [])]
    helped_found = []
    if notified_pet_ids:
        helped_found = (
            db.query(MissingPet)
            .filter(MissingPet.id.in_(notified_pet_ids), MissingPet.status == "found", MissingPet.user_id != user_id)
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
        [_fmt(p, "owner") for p in owned_found]
        + [_fmt(p, "finder") for p in helped_found]
    )


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


class PhotoUploadBody(BaseModel):
    photo_base64: str  # data:image/jpeg;base64,... or raw base64


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


@router.post("/{mp_id}/analyze-photo")
def analyze_photo(mp_id: str, body: PhotoAnalysisBody, db: Session = Depends(get_db)):
    """Pré-análise de compatibilidade sem criar report — usado antes de enviar aviso."""
    mp = db.query(MissingPet).filter(MissingPet.id == mp_id, MissingPet.status == "active").first()
    if not mp or not mp.photo_url or not body.finder_photos:
        return {"score": None, "analysis": None}
    score, analysis = _analyze_photo_compatibility(mp.photo_url, body.finder_photos)
    return {
        "score": score if score > 0 else None,
        "analysis": analysis if analysis else None,
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


def _analyze_photo_compatibility(pet_photo_url: str, finder_photos_b64: list) -> tuple:
    """Gemini Vision: compara até 2 fotos do achador com a foto de referência do pet."""
    try:
        import base64 as _b64
        import urllib.request
        import re
        import google.generativeai as genai

        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key or not finder_photos_b64:
            return 0, ""

        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")

        if pet_photo_url.startswith("http"):
            url = pet_photo_url
        else:
            path = pet_photo_url.lstrip('/')
            if path.startswith('uploads/'):
                url = f"http://localhost:8000/{path}"
            else:
                url = f"http://localhost:8000/uploads/{path}"
        with urllib.request.urlopen(url, timeout=15) as resp:
            pet_bytes = resp.read()

        pet_mime = "image/jpeg"
        for ext, mime in [(".png", "image/png"), (".webp", "image/webp")]:
            if pet_photo_url.lower().endswith(ext):
                pet_mime = mime

        parts = [{"inline_data": {"mime_type": pet_mime, "data": _b64.b64encode(pet_bytes).decode()}}]
        n_fotos = min(len(finder_photos_b64), 2)
        for b64 in finder_photos_b64[:n_fotos]:
            raw = b64.split(",")[-1] if "," in b64 else b64
            finder_bytes = _b64.b64decode(raw)
            finder_mime = "image/jpeg"
            if "data:" in b64 and ";" in b64:
                finder_mime = b64.split(";")[0].replace("data:", "")
            parts.append({"inline_data": {"mime_type": finder_mime, "data": _b64.b64encode(finder_bytes).decode()}})

        extra = " A SEGUNDA e TERCEIRA são fotos tiradas por quem diz ter encontrado o pet." if n_fotos > 1 else " A SEGUNDA é foto tirada por quem diz ter encontrado o pet."
        prompt = (
            f"Você recebeu {n_fotos + 1} fotos. A PRIMEIRA é a foto do pet desaparecido (referência).{extra} "
            "Compare: pelagem, cor, raça, porte, marcações, orelhas, focinho e demais traços visíveis. "
            "Responda SOMENTE em JSON válido: {\"score\": <inteiro 0 a 100>, \"analysis\": \"<frase curta em português, máx 80 chars>\"} "
            "onde score=100 = certamente o mesmo animal, score=0 = certamente diferente."
        )
        parts.append(prompt)

        response = model.generate_content(parts)
        text = response.text.strip()
        m = re.search(r'\{[^}]+\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            return int(data.get("score", 0)), str(data.get("analysis", ""))
    except Exception as e:
        logger.error(f"Gemini compat analysis failed: {e}")
    return 0, ""


def _push_owner_found(mp: MissingPet, finder_contact: str, finder_location: str | None, mp_id: str) -> None:
    """Envia push imediato ao dono quando alguém reporta ter encontrado o pet."""
    try:
        subs = _load_subscriptions()
        owner_sub = subs.get(str(mp.user_id))
        if not owner_sub:
            return
        loc = f" em {finder_location}" if finder_location else ""
        _send_push(owner_sub, {
            "title": f"🎉 {mp.pet_name} foi encontrado!",
            "body": f"Alguém encontrou seu pet{loc}. Contato: {finder_contact}. Toque para ver detalhes.",
            "tag": f"found-report-{mp_id}",
            "renotify": True,
            "requireInteraction": True,
            "icon": "/icons/icon-192x192.png",
            "data": {"url": f"/home"},
        })
    except Exception as e:
        logger.error(f"Push ao tutor falhou: {e}")


def _analyze_and_save(report_id: str, mp_photo_url: str, finder_photos: list, owner_user_id: str, pet_name: str, mp_id: str) -> None:
    """Roda Gemini em background e salva o score — depois envia push com o resultado."""
    try:
        from ..db import SessionLocal
        score, analysis = _analyze_photo_compatibility(mp_photo_url, finder_photos)
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
        # Segundo push com o % de compatibilidade
        try:
            subs = _load_subscriptions()
            owner_sub = subs.get(str(owner_user_id))
            if owner_sub:
                emoji = "✅" if score >= 70 else "⚠️" if score >= 40 else "❓"
                _send_push(owner_sub, {
                    "title": f"{emoji} Análise de foto: {score}% compatível",
                    "body": f"{pet_name}: {analysis or 'Confira as fotos na tela inicial.'}",
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
    report_id = report.id

    # Push IMEDIATO para o dono (antes de qualquer análise)
    threading.Thread(
        target=_push_owner_found,
        args=(mp, body.finder_contact.strip(), body.finder_location, mp_id),
        daemon=True,
    ).start()

    # Gemini Vision em background — analisa e depois envia segundo push com %
    if body.finder_photos and mp.photo_url:
        threading.Thread(
            target=_analyze_and_save,
            args=(report_id, mp.photo_url, body.finder_photos, mp.user_id, mp.pet_name, mp_id),
            daemon=True,
        ).start()

    return {
        "id": report_id,
        "status": "reported",
        "compatibility_score": None,
        "compatibility_analysis": None,
    }

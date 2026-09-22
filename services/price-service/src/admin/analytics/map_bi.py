"""Mapa interativo dos tutores.

Usa SOMENTE a localização já persistida em `User.lat/lng` (mesma coluna do
alerta de Pet Sumido — não é uma coleta nova, não pede permissão nova, não
mexe em nada do app nativo). `location_source` diz a origem:
  - "gps"  → localização precisa, o tutor autorizou no app.
  - "city" → centro geocodificado da cidade informada no cadastro (menos
             preciso — o ponto não é o endereço real, só a cidade).
Tutor sem lat/lng (nunca autorizou GPS e não informou cidade, ou é de antes
dessa coleta existir) fica de fora do mapa e conta em `unmapped_count` — a
posição nunca é inventada.
"""
from __future__ import annotations

from typing import Any, Optional

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent
from ...pets.models import Pet
from ...user_auth.models import User
from .filters import AnalyticsFilters
from .queries import (
    _aware,
    _classify_device,
    _device_type_filter_clause,
    _feeding_configured_pet_ids,
    _resolve_photo_url,
)


def _apply_common_filters(db: Session, q, f: AnalyticsFilters):
    if f.since:
        q = q.filter(User.created_at >= f.since)
    if f.until:
        q = q.filter(User.created_at <= f.until)
    if f.state:
        q = q.filter(func.lower(User.state) == f.state.lower())
    if f.city:
        q = q.filter(func.lower(User.city) == f.city.lower())
    if f.device_type:
        clause = _device_type_filter_clause(f.device_type)
        if clause is not None:
            q = q.filter(
                db.query(AnalyticsProductEvent.id)
                .filter(AnalyticsProductEvent.user_id == User.id, clause)
                .exists()
            )
    return q


def map_tutors(db: Session, f: AnalyticsFilters, *, has_feeding: Optional[bool] = None) -> dict[str, Any]:
    base = db.query(User.id).join(Pet, Pet.user_id == User.id).distinct()
    base = _apply_common_filters(db, base, f)
    all_with_pet = {r[0] for r in base.all()}

    if has_feeding is not None:
        feeding_pet_ids = _feeding_configured_pet_ids(db)
        users_with_feeding = {
            r[0] for r in db.query(Pet.user_id).filter(Pet.id.in_(feeding_pet_ids or {"__none__"})).distinct()
        }
        all_with_pet = (
            all_with_pet & users_with_feeding if has_feeding
            else all_with_pet - users_with_feeding
        )

    total_with_pet = len(all_with_pet)

    mapped_q = db.query(User).filter(
        User.id.in_(all_with_pet or {"__none__"}),
        User.lat.isnot(None), User.lng.isnot(None),
    )
    mapped_users = mapped_q.all()
    mapped_ids = [u.id for u in mapped_users]

    pet_counts = dict(
        db.query(Pet.user_id, func.count(Pet.id)).filter(Pet.user_id.in_(mapped_ids or {"__none__"}))
        .group_by(Pet.user_id).all()
    )
    pet_thumbs: dict[str, list[dict]] = {}
    for pid, uid, name, species, photo in (
        db.query(Pet.id, Pet.user_id, Pet.name, Pet.species, Pet.photo)
        .filter(Pet.user_id.in_(mapped_ids or {"__none__"})).all()
    ):
        pet_thumbs.setdefault(uid, []).append(
            {"pet_id": pid, "name": name, "species": species, "photo_url": _resolve_photo_url(photo)}
        )

    last_seen = dict(
        db.query(AnalyticsProductEvent.user_id, func.max(AnalyticsProductEvent.received_at))
        .filter(AnalyticsProductEvent.user_id.in_(mapped_ids or {"__none__"}))
        .group_by(AnalyticsProductEvent.user_id).all()
    )
    latest_meta: dict[str, dict] = {}
    pairs = [(uid, ts) for uid, ts in last_seen.items() if ts is not None]
    if pairs:
        cond = or_(*[
            (AnalyticsProductEvent.user_id == uid) & (AnalyticsProductEvent.received_at == ts)
            for uid, ts in pairs
        ])
        for uid, os_, dclass in (
            db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.os, AnalyticsProductEvent.device_class)
            .filter(cond).all()
        ):
            latest_meta.setdefault(uid, {"os": os_, "device_class": dclass})

    markers = []
    precision_counts = {"gps": 0, "city": 0, "outros": 0}
    for u in mapped_users:
        src = u.location_source if u.location_source in ("gps", "city") else "outros"
        precision_counts[src] += 1
        seen = _aware(last_seen.get(u.id))
        markers.append({
            "user_id": u.id, "name": u.name, "email": u.email,
            "lat": u.lat, "lng": u.lng, "precision": src,
            "city": u.city, "state": u.state,
            "pet_count": pet_counts.get(u.id, 0),
            "pet_thumbnails": pet_thumbs.get(u.id, [])[:4],
            "device_type": _classify_device(*(latest_meta.get(u.id, {}).get(k) for k in ("os", "device_class"))),
            "last_activity": seen.isoformat() if seen else None,
        })

    return {
        "markers": markers,
        "total_tutors_with_pet": total_with_pet,
        "mapped_count": len(markers),
        "unmapped_count": total_with_pet - len(markers),
        "precision": precision_counts,
        "note": (
            "'gps' = localização precisa autorizada no app (mesma do Pet Sumido). "
            "'city' = centro aproximado da cidade informada no cadastro — o ponto "
            "não é o endereço real. Tutores sem nenhuma das duas não aparecem no "
            "mapa (posição nunca é inventada)."
        ),
    }

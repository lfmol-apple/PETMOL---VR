"""Aggregation queries for the admin BI dashboard.

Every function takes a Session and returns plain dicts/lists ready to be
serialised. All heavy lifting is pushed to PostgreSQL (``func.count`` +
``group_by``); Python only classifies already-aggregated rows. Pagination
is mandatory on any list endpoint.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import String, and_, cast, func, or_
from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent
from ...events.models import Event
from ...family.models import FamilyMember
from ...health.models import FeedingPlan
from ...missing_pets import MissingPet
from ...notifications import NativePushToken, PushSubscription
from ...pets.caretaker_models import PetCaretaker
from ...pets.document_models import PetDocument
from ...pets.grooming_models import GroomingRecord
from ...pets.models import Pet
from ...pets.parasite_models import ParasiteControlRecord
from ...pets.vaccine_models import VaccineRecord
from ...services.models import RGPublic
from ...support.models import SupportFeedback
from ...user_auth.models import User
from .filters import AnalyticsFilters
from .state import (
    FEATURE_BY_KEY,
    FEATURE_REGISTRY,
    FeatureState,
    classify_by_next_due,
    classify_by_recency,
    classify_feeding,
)

_DEWORMER_TYPES = ("dewormer", "heartworm")
_FLEA_TYPES = ("flea_tick", "collar", "leishmaniasis")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is not None and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ═══════════════════════════════════════════════════════════════════════════
#  Scope helpers — apply the global geo filter (users table) once.
# ═══════════════════════════════════════════════════════════════════════════

def _user_ids_for_geo(db: Session, f: AnalyticsFilters) -> Optional[set[str]]:
    if not f.has_geo:
        return None
    q = db.query(User.id)
    if f.state:
        q = q.filter(func.lower(User.state) == f.state.lower())
    if f.city:
        q = q.filter(func.lower(User.city) == f.city.lower())
    if f.neighborhood:
        q = q.filter(func.lower(User.neighborhood) == f.neighborhood.lower())
    return {row[0] for row in q.all()}


# ═══════════════════════════════════════════════════════════════════════════
#  OVERVIEW
# ═══════════════════════════════════════════════════════════════════════════

def overview(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    geo_ids = _user_ids_for_geo(db, f)

    def _users_q():
        q = db.query(User)
        if geo_ids is not None:
            q = q.filter(User.id.in_(geo_ids or {"__none__"}))
        return q

    def _pets_q():
        q = db.query(Pet)
        if geo_ids is not None:
            q = q.filter(Pet.user_id.in_(geo_ids or {"__none__"}))
        return q

    total_users = _users_q().count()
    total_pets = _pets_q().count()

    def _new(model, col, days):
        return (
            _users_q().filter(col >= now - timedelta(days=days)).count()
            if model is User
            else _pets_q().filter(col >= now - timedelta(days=days)).count()
        )

    d0 = now - timedelta(hours=24)
    new_users_today = _users_q().filter(User.created_at >= _start_of_day(now)).count()
    new_pets_today = _pets_q().filter(Pet.created_at >= _start_of_day(now)).count()

    # pets per tutor
    pet_counts = dict(
        db.query(Pet.user_id, func.count(Pet.id)).group_by(Pet.user_id).all()
    )
    tutors_with_pet = len(pet_counts)
    tutors_without_pet = total_users - tutors_with_pet
    avg_pets = round(sum(pet_counts.values()) / tutors_with_pet, 2) if tutors_with_pet else 0.0

    # tutors with feeding configured (mirror hasFoodData at SQL level)
    feeding_pet_ids = _feeding_configured_pet_ids(db)
    feeding_user_ids = {
        uid for (uid,) in db.query(Pet.user_id).filter(Pet.id.in_(feeding_pet_ids or {"__none__"})).distinct()
    } if feeding_pet_ids else set()

    # any active health control (vaccine/parasite/grooming/medication ACTIVE)
    states = _pet_feature_states(db, pet_ids=None)
    pets_with_active_control = sum(
        1 for st in states.values()
        if any(st.get(k) == FeatureState.ACTIVE for k in ("vaccine", "dewormer", "flea_tick", "grooming", "medication"))
    )

    active_24h = _active_users(db, now - timedelta(hours=24))
    wau = _active_users(db, now - timedelta(days=7))
    mau = _active_users(db, now - timedelta(days=30))
    sessions_7d = _distinct_sessions(db, now - timedelta(days=7))

    return {
        "generated_at": now.isoformat(),
        "totals": {
            "users": total_users,
            "pets": total_pets,
            "new_users_today": new_users_today,
            "new_users_7d": _users_q().filter(User.created_at >= now - timedelta(days=7)).count(),
            "new_users_30d": _users_q().filter(User.created_at >= now - timedelta(days=30)).count(),
            "new_pets_today": new_pets_today,
            "new_pets_7d": _pets_q().filter(Pet.created_at >= now - timedelta(days=7)).count(),
            "new_pets_30d": _pets_q().filter(Pet.created_at >= now - timedelta(days=30)).count(),
        },
        "engagement": {
            "active_users_24h": active_24h,
            "wau": wau,
            "mau": mau,
            "dau_mau": round(active_24h / mau, 3) if mau else None,
            "sessions_7d": sessions_7d,
            "note": "usuários ativos = user_id autenticado distinto em analytics_product_events na janela; histórico pré-v2 é parcial.",
        },
        "tutors": {
            "with_pet": tutors_with_pet,
            "without_pet": tutors_without_pet,
            "avg_pets_per_tutor": avg_pets,
            "with_feeding_configured": len(feeding_user_ids),
            "pets_with_feeding_configured": len(feeding_pet_ids),
            "pets_with_active_control": pets_with_active_control,
        },
        "platforms": _platform_breakdown(db, now - timedelta(days=30)),
        "app_versions": _version_breakdown(db, now - timedelta(days=30)),
        "top_features": _feature_adoption_summary(db, states),
        "series": {
            "new_users": time_series(db, User, User.created_at, days=30, geo_ids=geo_ids),
            "new_pets": time_series(db, Pet, Pet.created_at, days=30, geo_ids=geo_ids, user_col=Pet.user_id),
            "active_users": active_users_series(db, days=30),
        },
        "data_quality_headline": data_quality(db, headline_only=True),
    }


def _start_of_day(now: datetime) -> datetime:
    return now.replace(hour=0, minute=0, second=0, microsecond=0)


def _active_users(db: Session, since: datetime) -> int:
    return int(
        db.query(func.count(func.distinct(AnalyticsProductEvent.user_id)))
        .filter(AnalyticsProductEvent.user_id.isnot(None))
        .filter(AnalyticsProductEvent.received_at >= since)
        .scalar()
        or 0
    )


def _distinct_sessions(db: Session, since: datetime) -> int:
    return int(
        db.query(func.count(func.distinct(AnalyticsProductEvent.session_id)))
        .filter(AnalyticsProductEvent.session_id.isnot(None))
        .filter(AnalyticsProductEvent.received_at >= since)
        .scalar()
        or 0
    )


def _platform_breakdown(db: Session, since: datetime) -> list[dict[str, Any]]:
    rows = (
        db.query(
            func.coalesce(AnalyticsProductEvent.platform, "unknown"),
            func.count(func.distinct(_identity_expr())),
        )
        .filter(AnalyticsProductEvent.received_at >= since)
        .group_by(func.coalesce(AnalyticsProductEvent.platform, "unknown"))
        .all()
    )
    return sorted(
        [{"platform": p, "users": int(c)} for p, c in rows],
        key=lambda r: r["users"],
        reverse=True,
    )


def _version_breakdown(db: Session, since: datetime) -> list[dict[str, Any]]:
    rows = (
        db.query(
            func.coalesce(AnalyticsProductEvent.app_version, "unknown"),
            func.count(func.distinct(_identity_expr())),
        )
        .filter(AnalyticsProductEvent.received_at >= since)
        .group_by(func.coalesce(AnalyticsProductEvent.app_version, "unknown"))
        .all()
    )
    return sorted(
        [{"version": v, "users": int(c)} for v, c in rows],
        key=lambda r: r["users"],
        reverse=True,
    )[:15]


def _identity_expr():
    return func.coalesce(
        AnalyticsProductEvent.user_id,
        AnalyticsProductEvent.anonymous_id,
        AnalyticsProductEvent.session_id,
        AnalyticsProductEvent.event_id,
    )


# ═══════════════════════════════════════════════════════════════════════════
#  TIME SERIES
# ═══════════════════════════════════════════════════════════════════════════

def time_series(
    db: Session,
    model,
    date_col,
    *,
    days: int = 30,
    geo_ids: Optional[set[str]] = None,
    user_col=None,
) -> list[dict[str, Any]]:
    now = _utcnow()
    since = _start_of_day(now) - timedelta(days=days - 1)
    day_expr = func.date(date_col)
    q = db.query(day_expr, func.count()).filter(date_col >= since)
    if geo_ids is not None and user_col is not None:
        q = q.filter(user_col.in_(geo_ids or {"__none__"}))
    elif geo_ids is not None and model is User:
        q = q.filter(User.id.in_(geo_ids or {"__none__"}))
    rows = dict(q.group_by(day_expr).all())
    out = []
    for i in range(days):
        d = (since + timedelta(days=i)).date()
        out.append({"date": d.isoformat(), "value": int(rows.get(d, 0) or 0)})
    return out


def active_users_series(db: Session, *, days: int = 30) -> list[dict[str, Any]]:
    now = _utcnow()
    since = _start_of_day(now) - timedelta(days=days - 1)
    day_expr = func.date(AnalyticsProductEvent.received_at)
    rows = dict(
        db.query(day_expr, func.count(func.distinct(_identity_expr())))
        .filter(AnalyticsProductEvent.received_at >= since)
        .group_by(day_expr)
        .all()
    )
    out = []
    for i in range(days):
        d = (since + timedelta(days=i)).date()
        out.append({"date": d.isoformat(), "value": int(rows.get(d, 0) or 0)})
    return out


# ═══════════════════════════════════════════════════════════════════════════
#  FEATURE STATE — bulk, no N+1
# ═══════════════════════════════════════════════════════════════════════════

def _feeding_configured_pet_ids(db: Session) -> set[str]:
    """Pets whose feeding plan carries real data (mirror of hasFoodData)."""
    rows = (
        db.query(FeedingPlan)
        .filter(FeedingPlan.deleted_at.is_(None))
        .all()
    )
    out: set[str] = set()
    for p in rows:
        has_items = bool(p.items_json and p.items_json not in ("[]", "", "null"))
        non_kibble_declared = bool(
            p.no_consumption_control and p.mode and p.mode != "kibble" and not p.food_brand
        )
        if (
            has_items
            or p.food_brand
            or p.duration_days is not None
            or p.estimated_end_date is not None
            or non_kibble_declared
        ):
            out.add(p.pet_id)
    return out


def _pet_feature_states(
    db: Session, *, pet_ids: Optional[Iterable[str]]
) -> dict[str, dict[str, FeatureState]]:
    """Return {pet_id: {feature_key: FeatureState}} for the per-pet features.

    One aggregate query per feature. Everything else is Python classification
    of already-reduced rows.
    """
    now = _utcnow()
    pet_id_list = list(pet_ids) if pet_ids is not None else None

    all_pet_ids = (
        set(pet_id_list)
        if pet_id_list is not None
        else {pid for (pid,) in db.query(Pet.id).all()}
    )
    states: dict[str, dict[str, FeatureState]] = {
        pid: {} for pid in all_pet_ids
    }

    def _scoped(q, col):
        if pet_id_list is not None:
            return q.filter(col.in_(pet_id_list))
        return q

    # ── feeding ──
    feed_rows = _scoped(
        db.query(FeedingPlan.pet_id, FeedingPlan.enabled, FeedingPlan.updated_at,
                 FeedingPlan.deleted_at, FeedingPlan.items_json, FeedingPlan.food_brand,
                 FeedingPlan.duration_days, FeedingPlan.estimated_end_date,
                 FeedingPlan.no_consumption_control, FeedingPlan.mode),
        FeedingPlan.pet_id,
    ).all()
    feed_map = {r[0]: r for r in feed_rows}
    for pid in all_pet_ids:
        r = feed_map.get(pid)
        if r is None:
            states[pid]["food"] = FeatureState.NEVER_CONFIGURED
            continue
        has_items = bool(r[4] and r[4] not in ("[]", "", "null"))
        non_kibble = bool(r[8] and r[9] and r[9] != "kibble" and not r[5])
        has_data = has_items or bool(r[5]) or r[6] is not None or r[7] is not None or non_kibble
        states[pid]["food"] = classify_feeding(
            has_data=has_data, enabled=bool(r[1]), updated_at=r[2],
            deleted=r[3] is not None, now=now,
        )

    # ── vaccine ──
    _fill_next_due_feature(
        db, states, all_pet_ids, "vaccine",
        _scoped(
            db.query(VaccineRecord.pet_id,
                     func.max(VaccineRecord.next_dose_date),
                     func.max(VaccineRecord.created_at))
            .filter(VaccineRecord.deleted.is_(False))
            .group_by(VaccineRecord.pet_id),
            VaccineRecord.pet_id,
        ).all(),
        now,
    )

    # ── parasite: dewormer + flea_tick ──
    par_rows = _scoped(
        db.query(ParasiteControlRecord.pet_id, ParasiteControlRecord.type,
                 func.max(func.coalesce(ParasiteControlRecord.collar_expiry_date,
                                        ParasiteControlRecord.next_due_date)),
                 func.max(ParasiteControlRecord.created_at))
        .filter(ParasiteControlRecord.deleted.is_(False))
        .group_by(ParasiteControlRecord.pet_id, ParasiteControlRecord.type),
        ParasiteControlRecord.pet_id,
    ).all()
    dew: dict[str, tuple] = {}
    fle: dict[str, tuple] = {}
    for pid, ptype, next_due, created in par_rows:
        bucket = dew if ptype in _DEWORMER_TYPES else fle if ptype in _FLEA_TYPES else None
        if bucket is None:
            continue
        prev = bucket.get(pid)
        nd = _aware(next_due)
        if prev is None or (nd and (prev[0] is None or nd > prev[0])):
            bucket[pid] = (nd, _aware(created))
    for pid in all_pet_ids:
        for key, bucket in (("dewormer", dew), ("flea_tick", fle)):
            if pid not in bucket:
                states[pid][key] = FeatureState.NEVER_CONFIGURED
            else:
                nd, created = bucket[pid]
                states[pid][key] = classify_by_next_due(nd, last_touch=created, now=now)

    # ── grooming ──
    groom_rows = _scoped(
        db.query(GroomingRecord.pet_id,
                 func.max(func.coalesce(GroomingRecord.next_recommended_date, GroomingRecord.date)),
                 func.max(GroomingRecord.created_at))
        .filter(GroomingRecord.deleted.is_(False))
        .group_by(GroomingRecord.pet_id),
        GroomingRecord.pet_id,
    ).all()
    groom_map = {r[0]: r for r in groom_rows}
    for pid in all_pet_ids:
        r = groom_map.get(pid)
        if r is None:
            states[pid]["grooming"] = FeatureState.NEVER_CONFIGURED
        else:
            states[pid]["grooming"] = classify_by_next_due(
                _aware(r[1]), last_touch=_aware(r[2]), now=now,
            )

    # ── medication (events) ──
    med_rows = _scoped(
        db.query(Event.pet_id,
                 func.max(func.coalesce(Event.next_due_date, Event.scheduled_at)),
                 func.max(Event.created_at))
        .filter(Event.type == "medication", Event.deleted_at.is_(None))
        .group_by(Event.pet_id),
        Event.pet_id,
    ).all()
    med_map = {r[0]: r for r in med_rows}
    for pid in all_pet_ids:
        r = med_map.get(pid)
        if r is None:
            states[pid]["medication"] = FeatureState.NEVER_CONFIGURED
        else:
            states[pid]["medication"] = classify_by_next_due(
                _aware(r[1]), last_touch=_aware(r[2]), now=now,
            )

    # ── weight (pet.weight_value OR weight_check events) ──
    weight_events = _scoped(
        db.query(Event.pet_id, func.max(Event.scheduled_at))
        .filter(Event.type == "weight_check", Event.deleted_at.is_(None))
        .group_by(Event.pet_id),
        Event.pet_id,
    ).all()
    weight_evt_map = {r[0]: _aware(r[1]) for r in weight_events}
    pet_weight_rows = _scoped(
        db.query(Pet.id, Pet.weight_value, Pet.updated_at), Pet.id
    ).all()
    for pid, wv, updated in pet_weight_rows:
        evt = weight_evt_map.get(pid)
        if evt is not None:
            states[pid]["weight"] = classify_by_recency(evt, now=now, active_days=150)
        elif wv is not None:
            states[pid]["weight"] = classify_by_recency(_aware(updated), now=now, active_days=200)
        else:
            states[pid]["weight"] = FeatureState.NEVER_CONFIGURED

    # ── vet visits (events) ──
    vet_rows = _scoped(
        db.query(Event.pet_id, func.max(Event.scheduled_at), func.max(Event.completed_at))
        .filter(Event.type == "vet_appointment", Event.deleted_at.is_(None))
        .group_by(Event.pet_id),
        Event.pet_id,
    ).all()
    vet_map = {r[0]: r for r in vet_rows}
    for pid in all_pet_ids:
        r = vet_map.get(pid)
        if r is None:
            states[pid]["vet_visit"] = FeatureState.NEVER_CONFIGURED
        else:
            latest = max(x for x in (_aware(r[1]), _aware(r[2])) if x is not None)
            states[pid]["vet_visit"] = classify_by_recency(latest, now=now, active_days=210)

    # ── documents ──
    doc_rows = _scoped(
        db.query(PetDocument.pet_id, func.max(PetDocument.created_at))
        .filter(PetDocument.deleted_at.is_(None))
        .group_by(PetDocument.pet_id),
        PetDocument.pet_id,
    ).all()
    doc_map = {r[0]: _aware(r[1]) for r in doc_rows}
    for pid in all_pet_ids:
        if pid not in doc_map:
            states[pid]["documents"] = FeatureState.NEVER_CONFIGURED
        else:
            states[pid]["documents"] = classify_by_recency(doc_map[pid], now=now, active_days=365)

    # ── rg (public) ──
    rg_pet_ids = {
        r[0] for r in db.query(RGPublic.pet_id).filter(RGPublic.is_public.is_(True)).all()
    }
    for pid in all_pet_ids:
        states[pid]["rg"] = FeatureState.ACTIVE if pid in rg_pet_ids else FeatureState.NEVER_CONFIGURED

    return states


def _fill_next_due_feature(db, states, all_pet_ids, key, rows, now):
    m = {r[0]: r for r in rows}
    for pid in all_pet_ids:
        r = m.get(pid)
        if r is None:
            states[pid][key] = FeatureState.NEVER_CONFIGURED
        else:
            states[pid][key] = classify_by_next_due(
                _aware(r[1]), last_touch=_aware(r[2]), now=now,
            )


def _feature_adoption_summary(db, states) -> list[dict[str, Any]]:
    total = len(states) or 1
    out = []
    for key in ("food", "vaccine", "dewormer", "flea_tick", "grooming", "medication", "weight"):
        counts = defaultdict(int)
        for st in states.values():
            counts[st.get(key, FeatureState.NEVER_CONFIGURED)] += 1
        configured = total - counts[FeatureState.NEVER_CONFIGURED]
        out.append({
            "key": key,
            "label": FEATURE_BY_KEY[key].label,
            "configured_pets": configured,
            "active_pets": counts[FeatureState.ACTIVE],
            "adoption_pct": round(configured / total, 3),
        })
    return sorted(out, key=lambda r: r["adoption_pct"], reverse=True)


# ═══════════════════════════════════════════════════════════════════════════
#  FEATURE MATRIX
# ═══════════════════════════════════════════════════════════════════════════

def feature_matrix(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    geo_ids = _user_ids_for_geo(db, f)
    pet_scope = None
    if geo_ids is not None:
        pet_scope = {pid for (pid,) in db.query(Pet.id).filter(Pet.user_id.in_(geo_ids or {"__none__"}))}

    states = _pet_feature_states(db, pet_ids=pet_scope)
    total_pets = len(states) or 1
    pet_to_user = dict(db.query(Pet.id, Pet.user_id).all())
    total_users = (
        db.query(func.count(User.id)).scalar()
        if geo_ids is None else len(geo_ids)
    ) or 1

    rows: list[dict[str, Any]] = []
    for fdef in FEATURE_REGISTRY:
        if fdef.kind in ("operational",) and fdef.scope == "pet":
            counts = defaultdict(int)
            users_with = set()
            for pid, st in states.items():
                s = st.get(fdef.key, FeatureState.NEVER_CONFIGURED)
                counts[s] += 1
                if s != FeatureState.NEVER_CONFIGURED and pid in pet_to_user:
                    users_with.add(pet_to_user[pid])
            configured = total_pets - counts[FeatureState.NEVER_CONFIGURED]
            rows.append({
                "key": fdef.key, "label": fdef.label, "kind": fdef.kind, "scope": "pet",
                "users": len(users_with), "pets": configured,
                "active": counts[FeatureState.ACTIVE], "stale": counts[FeatureState.STALE],
                "inactive": counts[FeatureState.INACTIVE],
                "never_configured": counts[FeatureState.NEVER_CONFIGURED],
                "adoption_pct": round(configured / total_pets, 3),
                "note": fdef.note,
            })
        else:
            rows.append(_feature_matrix_special(db, fdef, geo_ids, total_users, now))

    return {
        "generated_at": now.isoformat(),
        "total_users": total_users if geo_ids is not None else db.query(func.count(User.id)).scalar(),
        "total_pets": len(states),
        "features": rows,
        "state_rules": {
            "active": "próxima ação <= 21d atrasada (ou plano de ração habilitado tocado <= 150d)",
            "stale": "atrasada 21–120d (ração 150–300d)",
            "inactive": "atrasada > 120d / plano desabilitado / > 300d sem toque",
            "never_configured": "nenhum registro real da funcionalidade",
        },
    }


def _feature_matrix_special(db, fdef, geo_ids, total_users, now) -> dict[str, Any]:
    scoped_users = geo_ids  # None => all

    def _u(q):
        if scoped_users is not None:
            return q.filter(_col_in_scope(q, scoped_users))
        return q

    if fdef.key == "missing_pet":
        q = db.query(func.count(func.distinct(MissingPet.user_id))).filter(MissingPet.user_id.isnot(None))
        if scoped_users is not None:
            q = q.filter(MissingPet.user_id.in_(scoped_users or {"__none__"}))
        users = int(q.scalar() or 0)
        active = int(
            db.query(func.count(func.distinct(MissingPet.user_id)))
            .filter(MissingPet.status == "active", MissingPet.user_id.isnot(None))
            .scalar() or 0
        )
        return _special_row(fdef, users, total_users, active=active)

    if fdef.key == "family":
        fam = {r[0] for r in db.query(FamilyMember.user_id).all()}
        care = {r[0] for r in db.query(PetCaretaker.user_id).all()}
        ids = fam | care
        if scoped_users is not None:
            ids &= scoped_users
        return _special_row(fdef, len(ids), total_users, active=len(ids))

    if fdef.key == "push":
        web = {r[0] for r in db.query(PushSubscription.user_id).filter(PushSubscription.disabled_at.is_(None)).all()}
        nat = {r[0] for r in db.query(NativePushToken.user_id).filter(NativePushToken.disabled_at.is_(None)).all()}
        ids = web | nat
        if scoped_users is not None:
            ids &= scoped_users
        return _special_row(fdef, len(ids), total_users, active=len(ids))

    if fdef.key == "store":
        q = (
            db.query(func.count(func.distinct(AnalyticsProductEvent.user_id)))
            .filter(AnalyticsProductEvent.event_name == "store_opened")
            .filter(AnalyticsProductEvent.user_id.isnot(None))
        )
        if scoped_users is not None:
            q = q.filter(AnalyticsProductEvent.user_id.in_(scoped_users or {"__none__"}))
        users = int(q.scalar() or 0)
        recent = int(
            db.query(func.count(func.distinct(AnalyticsProductEvent.user_id)))
            .filter(AnalyticsProductEvent.event_name == "store_opened")
            .filter(AnalyticsProductEvent.user_id.isnot(None))
            .filter(AnalyticsProductEvent.received_at >= now - timedelta(days=30))
            .scalar() or 0
        )
        return _special_row(fdef, users, total_users, active=recent, behavioral=True)

    return _special_row(fdef, 0, total_users, active=0)


def _col_in_scope(q, scoped_users):  # pragma: no cover - defensive
    return True


def _special_row(fdef, users, total_users, *, active, behavioral=False):
    return {
        "key": fdef.key, "label": fdef.label, "kind": fdef.kind, "scope": fdef.scope,
        "users": users, "pets": None,
        "active": active, "stale": None, "inactive": None,
        "never_configured": None,
        "adoption_pct": round(users / total_users, 3) if total_users else 0.0,
        "note": fdef.note + ("" if not behavioral else " (adoção comportamental — sem estado por pet)"),
    }


# ═══════════════════════════════════════════════════════════════════════════
#  FEATURE POPULATION (drill-down)
# ═══════════════════════════════════════════════════════════════════════════

def feature_population(
    db: Session, key: str, state: Optional[str], *, page: int, page_size: int
) -> dict[str, Any]:
    fdef = FEATURE_BY_KEY.get(key)
    if fdef is None:
        return {"error": "unknown_feature", "key": key}

    now = _utcnow()
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    if fdef.scope == "pet" and fdef.kind == "operational":
        states = _pet_feature_states(db, pet_ids=None)
        wanted = None
        if state:
            try:
                wanted = FeatureState(state)
            except ValueError:
                wanted = None
        if wanted is not None:
            matched = [pid for pid, st in states.items() if st.get(key) == wanted]
        else:
            matched = [
                pid for pid, st in states.items()
                if st.get(key, FeatureState.NEVER_CONFIGURED) != FeatureState.NEVER_CONFIGURED
            ]
        total = len(matched)
        page_ids = matched[offset:offset + page_size]
        pets = {
            p.id: p for p in db.query(Pet).filter(Pet.id.in_(page_ids or {"__none__"})).all()
        }
        users = {
            u.id: u for u in db.query(User).filter(
                User.id.in_({pets[i].user_id for i in page_ids if i in pets} or {"__none__"})
            ).all()
        }
        items = []
        for pid in page_ids:
            p = pets.get(pid)
            if not p:
                continue
            u = users.get(p.user_id)
            items.append({
                "pet_id": p.id, "pet_name": p.name, "species": p.species, "breed": p.breed,
                "state": states[pid].get(key, FeatureState.NEVER_CONFIGURED).value,
                "user_id": p.user_id,
                "tutor_email": u.email if u else None,
                "tutor_name": u.name if u else None,
            })
        return {"key": key, "label": fdef.label, "state": state, "total": total,
                "page": page, "page_size": page_size, "items": items}

    # user-scoped populations
    ids = _feature_user_ids(db, key)
    total = len(ids)
    page_ids = sorted(ids)[offset:offset + page_size]
    users = db.query(User).filter(User.id.in_(page_ids or {"__none__"})).all()
    items = [{
        "user_id": u.id, "tutor_email": u.email, "tutor_name": u.name,
        "created_at": _iso(u.created_at), "city": u.city, "state": u.state,
    } for u in users]
    return {"key": key, "label": fdef.label, "state": None, "total": total,
            "page": page, "page_size": page_size, "items": items}


def _feature_user_ids(db: Session, key: str) -> set[str]:
    if key == "missing_pet":
        return {r[0] for r in db.query(MissingPet.user_id).filter(MissingPet.user_id.isnot(None)).all()}
    if key == "family":
        return ({r[0] for r in db.query(FamilyMember.user_id).all()}
                | {r[0] for r in db.query(PetCaretaker.user_id).all()})
    if key == "push":
        return ({r[0] for r in db.query(PushSubscription.user_id).filter(PushSubscription.disabled_at.is_(None)).all()}
                | {r[0] for r in db.query(NativePushToken.user_id).filter(NativePushToken.disabled_at.is_(None)).all()})
    if key == "store":
        return {r[0] for r in db.query(AnalyticsProductEvent.user_id)
                .filter(AnalyticsProductEvent.event_name == "store_opened")
                .filter(AnalyticsProductEvent.user_id.isnot(None)).distinct().all()}
    return set()


# ═══════════════════════════════════════════════════════════════════════════
#  USERS LIST + DETAIL
# ═══════════════════════════════════════════════════════════════════════════

_USER_SORTS = {
    "created_at": User.created_at,
    "email": User.email,
    "name": User.name,
}


def list_users(
    db: Session, f: AnalyticsFilters, *,
    page: int, page_size: int, search: Optional[str],
    sort: str, direction: str,
) -> dict[str, Any]:
    now = _utcnow()
    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    q = db.query(User)
    if search:
        like = f"%{search.strip()}%"
        q = q.filter(or_(User.email.ilike(like), User.name.ilike(like)))
    if f.state:
        q = q.filter(func.lower(User.state) == f.state.lower())
    if f.city:
        q = q.filter(func.lower(User.city) == f.city.lower())
    if f.since:
        q = q.filter(User.created_at >= f.since)
    if f.until:
        q = q.filter(User.created_at <= f.until)

    total = q.count()
    col = _USER_SORTS.get(sort, User.created_at)
    col = col.desc() if direction == "desc" else col.asc()
    users = q.order_by(col).offset((page - 1) * page_size).limit(page_size).all()

    uids = [u.id for u in users]
    pet_counts = dict(
        db.query(Pet.user_id, func.count(Pet.id)).filter(Pet.user_id.in_(uids or {"__none__"}))
        .group_by(Pet.user_id).all()
    )
    last_seen = dict(
        db.query(AnalyticsProductEvent.user_id, func.max(AnalyticsProductEvent.received_at))
        .filter(AnalyticsProductEvent.user_id.in_(uids or {"__none__"}))
        .group_by(AnalyticsProductEvent.user_id).all()
    )
    last_platform = dict(
        db.query(AnalyticsProductEvent.user_id, func.max(AnalyticsProductEvent.platform))
        .filter(AnalyticsProductEvent.user_id.in_(uids or {"__none__"}))
        .filter(AnalyticsProductEvent.platform.isnot(None))
        .group_by(AnalyticsProductEvent.user_id).all()
    )
    pet_ids_by_user = defaultdict(list)
    for pid, uid in db.query(Pet.id, Pet.user_id).filter(Pet.user_id.in_(uids or {"__none__"})).all():
        pet_ids_by_user[uid].append(pid)
    feeding_pet_ids = _feeding_configured_pet_ids(db)
    all_pet_ids = [pid for pids in pet_ids_by_user.values() for pid in pids]
    states = _pet_feature_states(db, pet_ids=all_pet_ids) if all_pet_ids else {}

    items = []
    for u in users:
        pids = pet_ids_by_user.get(u.id, [])
        active_controls = sum(
            1 for pid in pids
            if any(states.get(pid, {}).get(k) == FeatureState.ACTIVE
                   for k in ("vaccine", "dewormer", "flea_tick", "grooming", "medication", "food"))
        )
        seen = _aware(last_seen.get(u.id))
        items.append({
            "user_id": u.id,
            "email": u.email,
            "name": u.name,
            "created_at": _iso(u.created_at),
            "last_activity": _iso(seen),
            "activity_status": _activity_status(seen, now),
            "pets": pet_counts.get(u.id, 0),
            "has_feeding": any(pid in feeding_pet_ids for pid in pids),
            "active_control_pets": active_controls,
            "last_platform": last_platform.get(u.id),
            "city": u.city,
            "state": u.state,
            "email_verified": bool(u.email_verified),
        })

    return {
        "total": total, "page": page, "page_size": page_size,
        "sort": sort, "direction": direction, "items": items,
    }


def _activity_status(last_seen: Optional[datetime], now: datetime) -> str:
    if last_seen is None:
        return "no_analytics"
    age = (now - last_seen).total_seconds() / 86400.0
    if age <= 2:
        return "active"
    if age <= 14:
        return "recent"
    if age <= 45:
        return "cooling"
    return "dormant"


def user_detail(db: Session, user_id: str) -> Optional[dict[str, Any]]:
    u = db.query(User).filter(User.id == user_id).first()
    if not u:
        return None
    now = _utcnow()

    pets = db.query(Pet).filter(Pet.user_id == user_id).order_by(Pet.created_at.asc()).all()
    pet_ids = [p.id for p in pets]
    states = _pet_feature_states(db, pet_ids=pet_ids) if pet_ids else {}

    events_by_name = dict(
        db.query(AnalyticsProductEvent.event_name, func.count())
        .filter(AnalyticsProductEvent.user_id == user_id)
        .group_by(AnalyticsProductEvent.event_name).all()
    )
    last_seen = _aware(
        db.query(func.max(AnalyticsProductEvent.received_at))
        .filter(AnalyticsProductEvent.user_id == user_id).scalar()
    )
    first_seen = _aware(
        db.query(func.min(AnalyticsProductEvent.received_at))
        .filter(AnalyticsProductEvent.user_id == user_id).scalar()
    )
    platforms = [
        {"platform": p or "unknown", "events": int(c)}
        for p, c in db.query(
            AnalyticsProductEvent.platform, func.count()
        ).filter(AnalyticsProductEvent.user_id == user_id)
        .group_by(AnalyticsProductEvent.platform).all()
    ]
    versions = [
        {"version": v or "unknown", "events": int(c)}
        for v, c in db.query(
            AnalyticsProductEvent.app_version, func.count()
        ).filter(AnalyticsProductEvent.user_id == user_id)
        .group_by(AnalyticsProductEvent.app_version).all()
    ]
    active_days_30 = int(
        db.query(func.count(func.distinct(func.date(AnalyticsProductEvent.received_at))))
        .filter(AnalyticsProductEvent.user_id == user_id)
        .filter(AnalyticsProductEvent.received_at >= now - timedelta(days=30))
        .scalar() or 0
    )

    push_web = db.query(func.count(PushSubscription.id)).filter(
        PushSubscription.user_id == user_id, PushSubscription.disabled_at.is_(None)
    ).scalar() or 0
    push_native = db.query(func.count(NativePushToken.id)).filter(
        NativePushToken.user_id == user_id, NativePushToken.disabled_at.is_(None)
    ).scalar() or 0

    missing = db.query(func.count(MissingPet.id)).filter(MissingPet.user_id == user_id).scalar() or 0
    support = db.query(func.count(SupportFeedback.id)).filter(SupportFeedback.user_id == user_id).scalar() or 0

    return {
        "user": {
            "user_id": u.id,
            "email": u.email,
            "name": u.name,
            "phone_present": bool(u.phone),
            "whatsapp_opt_in": bool(u.whatsapp),
            "email_verified": bool(u.email_verified),
            "terms_accepted": bool(u.terms_accepted),
            "terms_version": u.terms_version,
            "created_at": _iso(u.created_at),
            "updated_at": _iso(u.updated_at),
            "address": {
                "city": u.city, "state": u.state, "neighborhood": u.neighborhood,
                "country": u.country, "postal_code_present": bool(u.postal_code),
                "street_present": bool(u.street),
            },
            "monthly_checkin": {
                "day": u.monthly_checkin_day, "hour": u.monthly_checkin_hour,
            },
        },
        "activity": {
            "first_seen": _iso(first_seen),
            "last_activity": _iso(last_seen),
            "activity_status": _activity_status(last_seen, now),
            "active_days_last_30": active_days_30,
            "events_total": sum(events_by_name.values()),
            "events_by_name": events_by_name,
            "platforms": platforms,
            "app_versions": versions,
        },
        "engagement_flags": {
            "push_web_devices": int(push_web),
            "push_native_devices": int(push_native),
            "missing_pet_reports": int(missing),
            "support_messages": int(support),
        },
        "pets": [
            {
                "pet_id": p.id, "name": p.name, "species": p.species, "breed": p.breed,
                "sex": p.sex, "birth_date": _iso(p.birth_date), "age_months": _age_months(p.birth_date, now),
                "weight_value": p.weight_value, "weight_unit": p.weight_unit,
                "neutered": p.neutered, "has_photo": bool(p.photo),
                "created_at": _iso(p.created_at),
                "feature_states": {k: v.value for k, v in states.get(p.id, {}).items()},
            }
            for p in pets
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
#  PET DETAIL
# ═══════════════════════════════════════════════════════════════════════════

def pet_detail(db: Session, pet_id: str) -> Optional[dict[str, Any]]:
    p = db.query(Pet).filter(Pet.id == pet_id).first()
    if not p:
        return None
    now = _utcnow()
    u = db.query(User).filter(User.id == p.user_id).first()
    states = _pet_feature_states(db, pet_ids=[pet_id]).get(pet_id, {})

    feeding = db.query(FeedingPlan).filter(
        FeedingPlan.pet_id == pet_id, FeedingPlan.deleted_at.is_(None)
    ).first()
    vaccines = db.query(VaccineRecord).filter(
        VaccineRecord.pet_id == pet_id, VaccineRecord.deleted.is_(False)
    ).order_by(VaccineRecord.applied_date.desc()).all()
    parasites = db.query(ParasiteControlRecord).filter(
        ParasiteControlRecord.pet_id == pet_id, ParasiteControlRecord.deleted.is_(False)
    ).order_by(ParasiteControlRecord.date_applied.desc()).all()
    grooming = db.query(GroomingRecord).filter(
        GroomingRecord.pet_id == pet_id, GroomingRecord.deleted.is_(False)
    ).order_by(GroomingRecord.date.desc()).all()
    events = db.query(Event).filter(
        Event.pet_id == pet_id, Event.deleted_at.is_(None)
    ).order_by(Event.scheduled_at.desc()).limit(50).all()
    documents = db.query(func.count(PetDocument.id)).filter(
        PetDocument.pet_id == pet_id, PetDocument.deleted_at.is_(None)
    ).scalar() or 0
    caretakers = db.query(func.count(PetCaretaker.id)).filter(PetCaretaker.pet_id == pet_id).scalar() or 0

    return {
        "pet": {
            "pet_id": p.id, "name": p.name, "species": p.species, "breed": p.breed,
            "sex": p.sex, "birth_date": _iso(p.birth_date),
            "age_months": _age_months(p.birth_date, now),
            "weight_value": p.weight_value, "weight_unit": p.weight_unit,
            "neutered": p.neutered, "has_photo": bool(p.photo),
            "insurance_provider": p.insurance_provider,
            "created_at": _iso(p.created_at), "updated_at": _iso(p.updated_at),
        },
        "tutor": {"user_id": p.user_id, "email": u.email if u else None, "name": u.name if u else None},
        "feature_states": {k: v.value for k, v in states.items()},
        "feeding": None if not feeding else {
            "enabled": bool(feeding.enabled), "mode": feeding.mode,
            "food_brand": feeding.food_brand, "package_size_kg": feeding.package_size_kg,
            "daily_amount_g": feeding.daily_amount_g, "duration_days": feeding.duration_days,
            "no_consumption_control": bool(feeding.no_consumption_control),
            "estimated_end_date": _iso(feeding.estimated_end_date),
            "items_count": _json_len(feeding.items_json),
            "updated_at": _iso(feeding.updated_at),
        },
        "counts": {
            "vaccines": len(vaccines), "parasite_controls": len(parasites),
            "grooming": len(grooming), "events": len(events),
            "documents": int(documents), "caretakers": int(caretakers),
        },
        "vaccines": [
            {"id": v.id, "name": v.vaccine_name, "applied": _iso(v.applied_date),
             "next_dose": _iso(v.next_dose_date), "dose_number": v.dose_number}
            for v in vaccines[:30]
        ],
        "parasite_controls": [
            {"id": r.id, "type": r.type, "product": r.product_name,
             "applied": _iso(r.date_applied), "next_due": _iso(r.next_due_date),
             "collar_expiry": _iso(r.collar_expiry_date),
             "has_gtin": bool(r.barcode)}
            for r in parasites[:30]
        ],
        "grooming": [
            {"id": g.id, "type": g.type, "date": _iso(g.date),
             "next_recommended": _iso(g.next_recommended_date), "cost": g.cost}
            for g in grooming[:30]
        ],
        "events": [
            {"id": e.id, "type": e.type, "status": e.status,
             "scheduled_at": _iso(e.scheduled_at), "completed_at": _iso(e.completed_at),
             "next_due": _iso(e.next_due_date), "source": e.source}
            for e in events
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════
#  DATA QUALITY
# ═══════════════════════════════════════════════════════════════════════════

_DQ_LABELS = {
    "users_without_pet": "Tutores sem pet",
    "pets_without_species": "Pets sem espécie válida",
    "pets_without_breed": "Pets sem raça",
    "pets_without_birth": "Pets sem nascimento",
    "pets_without_weight": "Pets sem peso",
    "pets_without_photo": "Pets sem foto",
    "pets_without_feeding": "Pets sem alimentação",
    "feeding_without_gtin": "Alimentação sem GTIN nos itens",
    "parasite_without_gtin": "Antiparasitário sem GTIN",
    "events_unknown_version": "Eventos com app_version=unknown (30d)",
    "events_unknown_platform": "Eventos sem plataforma (30d)",
    "events_without_user": "Eventos sem user_id (30d)",
}
_VALID_SPECIES = ("dog", "cat")


def data_quality(db: Session, *, headline_only: bool = False) -> dict[str, Any]:
    now = _utcnow()
    since30 = now - timedelta(days=30)

    users_total = db.query(func.count(User.id)).scalar() or 0
    pets_total = db.query(func.count(Pet.id)).scalar() or 0

    users_with_pet = {r[0] for r in db.query(Pet.user_id).distinct().all()}
    feeding_pet_ids = _feeding_configured_pet_ids(db)

    metrics = {
        "users_without_pet": users_total - len(users_with_pet),
        "pets_without_species": db.query(func.count(Pet.id)).filter(
            or_(Pet.species.is_(None), func.lower(Pet.species).notin_(_VALID_SPECIES))
        ).scalar() or 0,
        "pets_without_breed": db.query(func.count(Pet.id)).filter(
            or_(Pet.breed.is_(None), func.trim(Pet.breed) == "")
        ).scalar() or 0,
        "pets_without_birth": db.query(func.count(Pet.id)).filter(Pet.birth_date.is_(None)).scalar() or 0,
        "pets_without_weight": db.query(func.count(Pet.id)).filter(Pet.weight_value.is_(None)).scalar() or 0,
        "pets_without_photo": db.query(func.count(Pet.id)).filter(
            or_(Pet.photo.is_(None), func.trim(cast(Pet.photo, String)) == "")
        ).scalar() or 0,
        "pets_without_feeding": pets_total - len(feeding_pet_ids),
        "feeding_without_gtin": _feeding_without_gtin_count(db),
        "parasite_without_gtin": db.query(func.count(func.distinct(ParasiteControlRecord.pet_id))).filter(
            ParasiteControlRecord.deleted.is_(False),
            or_(ParasiteControlRecord.barcode.is_(None), func.trim(ParasiteControlRecord.barcode) == ""),
        ).scalar() or 0,
        "events_unknown_version": db.query(func.count(AnalyticsProductEvent.id)).filter(
            AnalyticsProductEvent.received_at >= since30,
            or_(AnalyticsProductEvent.app_version.is_(None),
                func.lower(AnalyticsProductEvent.app_version) == "unknown"),
        ).scalar() or 0,
        "events_unknown_platform": db.query(func.count(AnalyticsProductEvent.id)).filter(
            AnalyticsProductEvent.received_at >= since30,
            or_(AnalyticsProductEvent.platform.is_(None),
                func.lower(AnalyticsProductEvent.platform) == "unknown"),
        ).scalar() or 0,
        "events_without_user": db.query(func.count(AnalyticsProductEvent.id)).filter(
            AnalyticsProductEvent.received_at >= since30,
            AnalyticsProductEvent.user_id.is_(None),
        ).scalar() or 0,
    }

    events30 = db.query(func.count(AnalyticsProductEvent.id)).filter(
        AnalyticsProductEvent.received_at >= since30
    ).scalar() or 0

    rows = []
    for key, count in metrics.items():
        denom = users_total if key == "users_without_pet" else (
            events30 if key.startswith("events_") else pets_total
        )
        rows.append({
            "key": key,
            "label": _DQ_LABELS[key],
            "count": int(count),
            "of": int(denom),
            "pct": round(int(count) / denom, 3) if denom else 0.0,
            "drilldown": not key.startswith("events_"),
        })
    rows.sort(key=lambda r: r["pct"], reverse=True)

    if headline_only:
        return {"issues": rows[:5]}
    return {"generated_at": now.isoformat(), "issues": rows}


def _feeding_without_gtin_count(db: Session) -> int:
    plans = db.query(FeedingPlan.items_json).filter(
        FeedingPlan.deleted_at.is_(None), FeedingPlan.items_json.isnot(None)
    ).all()
    n = 0
    for (raw,) in plans:
        items = _safe_json_list(raw)
        if items and not any((it or {}).get("barcode") or (it or {}).get("gtin") for it in items):
            n += 1
    return n


def data_quality_population(db: Session, key: str, *, page: int, page_size: int) -> dict[str, Any]:
    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    offset = (page - 1) * page_size

    if key == "users_without_pet":
        with_pet = {r[0] for r in db.query(Pet.user_id).distinct().all()}
        q = db.query(User).filter(User.id.notin_(with_pet or {"__none__"}))
        total = q.count()
        users = q.order_by(User.created_at.desc()).offset(offset).limit(page_size).all()
        return {"key": key, "label": _DQ_LABELS[key], "total": total, "page": page,
                "page_size": page_size, "items": [
                    {"user_id": u.id, "email": u.email, "name": u.name,
                     "created_at": _iso(u.created_at)} for u in users]}

    pet_q = _dq_pet_query(db, key)
    if pet_q is None:
        return {"key": key, "error": "no_drilldown"}
    total = pet_q.count()
    pets = pet_q.order_by(Pet.created_at.desc()).offset(offset).limit(page_size).all()
    users = {u.id: u for u in db.query(User).filter(
        User.id.in_({p.user_id for p in pets} or {"__none__"})
    ).all()}
    return {"key": key, "label": _DQ_LABELS.get(key, key), "total": total, "page": page,
            "page_size": page_size, "items": [
                {"pet_id": p.id, "pet_name": p.name, "species": p.species, "breed": p.breed,
                 "user_id": p.user_id,
                 "tutor_email": users[p.user_id].email if p.user_id in users else None}
                for p in pets]}


def _dq_pet_query(db: Session, key: str):
    if key == "pets_without_species":
        return db.query(Pet).filter(or_(Pet.species.is_(None), func.lower(Pet.species).notin_(_VALID_SPECIES)))
    if key == "pets_without_breed":
        return db.query(Pet).filter(or_(Pet.breed.is_(None), func.trim(Pet.breed) == ""))
    if key == "pets_without_birth":
        return db.query(Pet).filter(Pet.birth_date.is_(None))
    if key == "pets_without_weight":
        return db.query(Pet).filter(Pet.weight_value.is_(None))
    if key == "pets_without_photo":
        return db.query(Pet).filter(or_(Pet.photo.is_(None), func.trim(cast(Pet.photo, String)) == ""))
    if key == "pets_without_feeding":
        feeding_pet_ids = _feeding_configured_pet_ids(db)
        return db.query(Pet).filter(Pet.id.notin_(feeding_pet_ids or {"__none__"}))
    if key == "parasite_without_gtin":
        pids = {r[0] for r in db.query(ParasiteControlRecord.pet_id).filter(
            ParasiteControlRecord.deleted.is_(False),
            or_(ParasiteControlRecord.barcode.is_(None), func.trim(ParasiteControlRecord.barcode) == ""),
        ).all()}
        return db.query(Pet).filter(Pet.id.in_(pids or {"__none__"}))
    if key == "feeding_without_gtin":
        bad = []
        for pid, raw in db.query(FeedingPlan.pet_id, FeedingPlan.items_json).filter(
            FeedingPlan.deleted_at.is_(None), FeedingPlan.items_json.isnot(None)
        ).all():
            items = _safe_json_list(raw)
            if items and not any((it or {}).get("barcode") or (it or {}).get("gtin") for it in items):
                bad.append(pid)
        return db.query(Pet).filter(Pet.id.in_(bad or {"__none__"}))
    return None


# ═══════════════════════════════════════════════════════════════════════════
#  RETENTION (analytics — honest about insufficiency)
# ═══════════════════════════════════════════════════════════════════════════

def retention(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    # first authenticated activity per user
    first_seen = dict(
        db.query(AnalyticsProductEvent.user_id, func.min(func.date(AnalyticsProductEvent.received_at)))
        .filter(AnalyticsProductEvent.user_id.isnot(None))
        .group_by(AnalyticsProductEvent.user_id).all()
    )
    if len(first_seen) < 20:
        return {
            "status": "insufficient_data",
            "message": "Poucos usuários com histórico analítico autenticado (v2). "
                       "Retenção D1/D7/D30 e coortes ficam disponíveis conforme os dados acumulam.",
            "users_with_history": len(first_seen),
        }

    active_dates: dict[str, set] = defaultdict(set)
    for uid, d in db.query(AnalyticsProductEvent.user_id, func.date(AnalyticsProductEvent.received_at)).filter(
        AnalyticsProductEvent.user_id.isnot(None)
    ).distinct().all():
        active_dates[uid].add(d)

    def _retained(offset_days: int, window: int = 1) -> Optional[float]:
        eligible = [uid for uid, d0 in first_seen.items()
                    if (now.date() - d0).days >= offset_days + window]
        if len(eligible) < 20:
            return None
        hit = 0
        for uid in eligible:
            d0 = first_seen[uid]
            target = {d0 + timedelta(days=offset_days + k) for k in range(window)}
            if active_dates[uid] & target:
                hit += 1
        return round(hit / len(eligible), 3)

    return {
        "status": "ok",
        "users_with_history": len(first_seen),
        "d1": _retained(1),
        "d7": _retained(7, window=1),
        "d30": _retained(30, window=1),
        "note": "coorte = data da primeira atividade autenticada; retido = ativo no dia alvo.",
    }


# ═══════════════════════════════════════════════════════════════════════════
#  COMMERCE (read-only from analytics — never a sale)
# ═══════════════════════════════════════════════════════════════════════════

def commerce(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    since = f.since or (now - timedelta(days=30))

    def _count(event_name):
        return int(
            db.query(func.count(AnalyticsProductEvent.id))
            .filter(AnalyticsProductEvent.event_name == event_name,
                    AnalyticsProductEvent.received_at >= since)
            .scalar() or 0
        )

    def _uniq(event_name):
        return int(
            db.query(func.count(func.distinct(_identity_expr())))
            .filter(AnalyticsProductEvent.event_name == event_name,
                    AnalyticsProductEvent.received_at >= since)
            .scalar() or 0
        )

    store_opened_u = _uniq("store_opened")
    offer_viewed = _count("offer_viewed")
    offer_viewed_u = _uniq("offer_viewed")
    click = _count("commerce_click")
    click_u = _uniq("commerce_click")

    # per-merchant from properties_json.merchant
    merchants: dict[str, dict[str, int]] = defaultdict(lambda: {"offer_viewed": 0, "commerce_click": 0})
    for name in ("offer_viewed", "commerce_click"):
        rows = db.query(AnalyticsProductEvent.properties_json).filter(
            AnalyticsProductEvent.event_name == name,
            AnalyticsProductEvent.received_at >= since,
        ).all()
        for (raw,) in rows:
            m = (_safe_json(raw) or {}).get("merchant")
            if m:
                merchants[str(m)[:24]][name] += 1

    return {
        "generated_at": now.isoformat(),
        "window_since": since.isoformat(),
        "store_opened_users": store_opened_u,
        "offer_viewed": offer_viewed,
        "offer_viewed_users": offer_viewed_u,
        "commerce_click": click,
        "commerce_click_users": click_u,
        "ctr_by_exposure": round(click / offer_viewed, 4) if offer_viewed else None,
        "ctr_by_user": round(click_u / offer_viewed_u, 4) if offer_viewed_u else None,
        "by_merchant": [
            {"merchant": k, **v,
             "ctr": round(v["commerce_click"] / v["offer_viewed"], 4) if v["offer_viewed"] else None}
            for k, v in sorted(merchants.items(), key=lambda kv: kv[1]["offer_viewed"], reverse=True)
        ],
        "sales_note": "cliques NÃO são vendas. Sem atribuição de venda — as lojas não expõem conversão por afiliado aqui.",
    }


# ═══════════════════════════════════════════════════════════════════════════
#  ACTIVATION FUNNEL (unique users, DB-derived end state)
# ═══════════════════════════════════════════════════════════════════════════

def activation_funnel(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    total_users = db.query(func.count(User.id)).scalar() or 0
    users_with_pet = {r[0] for r in db.query(Pet.user_id).distinct().all()}

    # profile "basic complete" = pet has species + (breed or birth_date)
    pet_rows = db.query(Pet.user_id, Pet.species, Pet.breed, Pet.birth_date).all()
    users_profile_ok: set[str] = set()
    for uid, sp, br, bd in pet_rows:
        if sp and (br or bd):
            users_profile_ok.add(uid)

    feeding_pet_ids = _feeding_configured_pet_ids(db)
    users_feeding = {
        r[0] for r in db.query(Pet.user_id).filter(Pet.id.in_(feeding_pet_ids or {"__none__"})).distinct()
    }

    # first control configured = any vaccine/parasite/grooming/medication record
    users_control: set[str] = set()
    for model, col in (
        (VaccineRecord, VaccineRecord.pet_id),
        (ParasiteControlRecord, ParasiteControlRecord.pet_id),
        (GroomingRecord, GroomingRecord.pet_id),
    ):
        pids = {r[0] for r in db.query(col).all()}
        for uid in db.query(Pet.user_id).filter(Pet.id.in_(pids or {"__none__"})).distinct():
            users_control.add(uid[0])

    # returned within 7d of signup (analytics)
    first_last = db.query(
        AnalyticsProductEvent.user_id,
        func.min(AnalyticsProductEvent.received_at),
        func.max(AnalyticsProductEvent.received_at),
    ).filter(AnalyticsProductEvent.user_id.isnot(None)).group_by(AnalyticsProductEvent.user_id).all()
    users_returned = {
        uid for uid, first, last in first_last
        if first and last and (_aware(last) - _aware(first)).total_seconds() > 86400
    }

    steps = [
        {"key": "account", "label": "Conta criada", "users": total_users},
        {"key": "pet", "label": "Pet criado", "users": len(users_with_pet)},
        {"key": "profile", "label": "Perfil básico completo", "users": len(users_profile_ok)},
        {"key": "feeding", "label": "Alimentação cadastrada", "users": len(users_feeding)},
        {"key": "control", "label": "Primeiro controle configurado", "users": len(users_control)},
        {"key": "returned", "label": "Retornou (>1 dia de uso)", "users": len(users_returned)},
    ]
    prev = None
    for s in steps:
        s["pct_of_total"] = round(s["users"] / total_users, 3) if total_users else 0.0
        s["pct_from_previous"] = round(s["users"] / prev, 3) if prev else None
        prev = s["users"]
    return {"generated_at": now.isoformat(), "steps": steps,
            "note": "cada passo conta USUÁRIOS ÚNICOS; estado final derivado do banco, não de soma de eventos."}


# ═══════════════════════════════════════════════════════════════════════════
#  small utils
# ═══════════════════════════════════════════════════════════════════════════

def _iso(dt) -> Optional[str]:
    if dt is None:
        return None
    if hasattr(dt, "isoformat"):
        return dt.isoformat()
    return str(dt)


def _age_months(birth, now) -> Optional[int]:
    if birth is None:
        return None
    try:
        b = birth if isinstance(birth, datetime) else datetime(birth.year, birth.month, birth.day, tzinfo=timezone.utc)
    except Exception:
        return None
    return max(0, int((now - _aware(b)).days / 30.44))


def _json_len(raw) -> int:
    return len(_safe_json_list(raw))


def _safe_json_list(raw) -> list:
    import json
    if not raw:
        return []
    try:
        v = json.loads(raw)
        return v if isinstance(v, list) else []
    except Exception:
        return []


def _safe_json(raw) -> Optional[dict]:
    import json
    if not raw:
        return None
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else None
    except Exception:
        return None

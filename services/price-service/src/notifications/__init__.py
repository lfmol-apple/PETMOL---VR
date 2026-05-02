"""
Push Notifications Router for PETMOL
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Tuple, List
import json
import logging
import os
import secrets
from datetime import datetime, timedelta, time
from pywebpush import webpush, WebPushException

from ..db import SessionLocal
from urllib.parse import quote
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from ..events.models import Event
from ..config import get_settings
from ..utils.logging_utils import setup_logger

logger = setup_logger(__name__, "INFO")
router = APIRouter(prefix="/notifications", tags=["Notifications"])

# ── Helper: write a pendency alongside every care push ────────────────────────

def _upsert_pend(
    *,
    user_id: str,
    pet_id,
    pend_id: str,
    type_: str,
    title: str,
    message: str,
    deep_link: str,
    priority: int = 50,
    expires_at=None,
) -> None:
    """Best-effort pendency upsert — failures are logged but never crash the scheduler."""
    if type_ == "vaccine":
        return

    try:
        from .pendencies import upsert_pendency_standalone
        upsert_pendency_standalone(
            user_id=str(user_id),
            pet_id=str(pet_id) if pet_id is not None else None,
            pend_id=pend_id,
            type_=type_,
            title=title,
            message=message,
            deep_link=deep_link,
            priority=priority,
            expires_at=expires_at,
        )
    except Exception as e:
        logger.error(f"_upsert_pend error: {e}")

# Subscriptions file: use a canonical path in production and transparently
# merge any legacy app-local file so deploys do not split active devices.
_DEFAULT_SUBS_FILE = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "push_subscriptions.json")
)
_CANONICAL_SUBS_FILE = os.path.abspath(
    os.environ.get("PUSH_SUBSCRIPTIONS_FILE", "/opt/petmol/logs/push_subscriptions.json")
)
_LEGACY_SUBS_FILE = _DEFAULT_SUBS_FILE


def _resolve_subscriptions_file() -> str:
    canonical_dir = os.path.dirname(_CANONICAL_SUBS_FILE)
    if os.path.isdir(canonical_dir) or not canonical_dir:
        return _CANONICAL_SUBS_FILE
    return _DEFAULT_SUBS_FILE


SUBSCRIPTIONS_FILE = _resolve_subscriptions_file()


class SubscriptionRequest(BaseModel):
    subscription: dict


class NotificationPayload(BaseModel):
    title: str
    body: str
    icon: Optional[str] = None
    badge: Optional[str] = None
    url: Optional[str] = None
    tag: Optional[str] = None
    require_interaction: bool = False
    auto_close_ms: int = 4000


class SendNotificationRequest(BaseModel):
    title: str
    body: str
    url: Optional[str] = "/home"
    tag: Optional[str] = "petmol"
    icon: Optional[str] = None


def _read_subscriptions_file(path: str) -> dict:
    if not os.path.exists(path):
        return {}
    try:
        with open(path, "r") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _is_subscription_entry(value: object) -> bool:
    return isinstance(value, dict) and bool(value.get("endpoint"))


def _merge_subscription_maps(primary: dict, secondary: dict, *, prefer_secondary: bool = False) -> dict:
    merged = dict(primary)
    for user_id, subscription in secondary.items():
        if user_id not in merged:
            merged[user_id] = subscription
            continue

        if not prefer_secondary:
            continue

        if _is_subscription_entry(subscription):
            merged[user_id] = subscription
    return merged


def _load_subscriptions() -> dict:
    subscriptions = _read_subscriptions_file(SUBSCRIPTIONS_FILE)
    if _LEGACY_SUBS_FILE != SUBSCRIPTIONS_FILE:
        legacy_subscriptions = _read_subscriptions_file(_LEGACY_SUBS_FILE)
        merged = _merge_subscription_maps(subscriptions, legacy_subscriptions, prefer_secondary=True)
        if merged != subscriptions:
            _save_subscriptions(merged)
        return merged
    return subscriptions


def _save_subscriptions(data: dict) -> None:
    os.makedirs(os.path.dirname(SUBSCRIPTIONS_FILE), exist_ok=True)
    with open(SUBSCRIPTIONS_FILE, "w") as f:
        json.dump(data, f)


def _send_push(subscription: dict, payload: dict) -> bool:
    """Returns True on success, False if subscription is expired."""
    settings = get_settings()
    if not settings.vapid_private_key or not settings.vapid_public_key:
        logger.error("Push desativado: VAPID keys nao configuradas (vapid_private_key/vapid_public_key ausentes)")
        raise RuntimeError("VAPID keys nao configuradas")

    normalized = _normalize_push_payload(payload)
    try:
        webpush(
            subscription_info={
                "endpoint": subscription["endpoint"],
                "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]},
            },
            data=json.dumps(normalized),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_claims_email},
        )
        return True
    except WebPushException as e:
        if e.response is not None and e.response.status_code in (404, 410):
            return False
        logger.error(f"WebPushException: {e}")
        return True
    except Exception as e:
        logger.error(f"Erro ao enviar push: {e}")
        return True


def _normalize_push_payload(payload: dict) -> dict:
    """Apply a fixed visual/content model to every outgoing push payload."""
    if not isinstance(payload, dict):
        payload = {}

    raw_title = str(payload.get("title") or "").strip()
    raw_body = str(payload.get("body") or "").strip()
    raw_data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
    raw_url = str(raw_data.get("url") or payload.get("url") or "/home").strip() or "/home"

    title = raw_title or "PETMOL"
    if not title.startswith("🐾"):
        title = f"🐾 {title}"

    body = raw_body
    tag = str(payload.get("tag") or "petmol").strip() or "petmol"
    require_interaction = bool(payload.get("requireInteraction", True))

    auto_close_ms = 0
    try:
        auto_close_ms = max(0, int(payload.get("autoCloseMs", 0)))
    except Exception:
        auto_close_ms = 0

    # Notificações persistentes não devem auto-fechar.
    if require_interaction:
        auto_close_ms = 0

    raw_actions = payload.get("actions") if isinstance(payload.get("actions"), list) else []
    normalized_actions = []
    for candidate in raw_actions[:4]:
        if not isinstance(candidate, dict):
            continue
        action = str(candidate.get("action") or "").strip()
        label = str(candidate.get("title") or "").strip()
        if not action or not label:
            continue
        entry = {"action": action, "title": label}
        icon = str(candidate.get("icon") or "").strip()
        if icon:
            entry["icon"] = icon
        normalized_actions.append(entry)

    normalized_data = {"url": raw_url}
    if isinstance(raw_data.get("pet_id"), str):
        normalized_data["pet_id"] = raw_data["pet_id"]
    if isinstance(raw_data.get("type"), str):
        normalized_data["type"] = raw_data["type"]
    if isinstance(raw_data.get("item_name"), str):
        normalized_data["item_name"] = raw_data["item_name"]
    if isinstance(raw_data.get("action_urls"), dict):
        action_urls: dict[str, str] = {}
        for key, value in raw_data["action_urls"].items():
            if isinstance(key, str) and isinstance(value, str) and key.strip() and value.strip():
                action_urls[key.strip()] = value.strip()
        if action_urls:
            normalized_data["action_urls"] = action_urls

    normalized = {
        "title": title,
        "body": body,
        "icon": str(payload.get("icon") or "/icons/icon-192x192.png"),
        "badge": str(payload.get("badge") or "/icons/badge-mono.png"),
        "image": str(payload.get("image") or "/brand/notification-banner.png"),
        "tag": tag,
        "data": normalized_data,
        "actions": normalized_actions,
        "requireInteraction": require_interaction,
        "autoCloseMs": auto_close_ms,
        "renotify": bool(payload.get("renotify", False)),
    }
    return normalized


def _parasite_modal_for_type(type_key: str) -> str:
    normalized = (type_key or "").lower().strip()
    if normalized == "flea_tick":
        return "antipulgas"
    if normalized == "collar":
        return "coleira"
    return "vermifugo"


def send_checkin_pushes() -> None:
    """Deprecated in 4-layer model: monthly review is handled by send_monthly_docs_reminder."""
    return


def _parse_hhmm(value: str) -> Optional[Tuple[int, int]]:
    try:
        if value is None:
            return None

        # Python/SQL TIME objects (e.g. datetime.time) arrive with hour/minute attrs.
        if hasattr(value, "hour") and hasattr(value, "minute"):
            hour = int(getattr(value, "hour"))
            minute = int(getattr(value, "minute"))
            if 0 <= hour <= 23 and 0 <= minute <= 59:
                return hour, minute
            return None

        raw = str(value).strip()
        if not raw:
            return None

        # Accept HH:MM and HH:MM:SS (common DB TIME serialization).
        parts = raw.split(":")
        if len(parts) < 2:
            return None

        hour = int(parts[0])
        minute = int(parts[1])
        if 0 <= hour <= 23 and 0 <= minute <= 59:
            return hour, minute
    except Exception:
        return None
    return None


def _expand_times(base_time: str, frequency: Optional[str]) -> List[str]:
    base = _parse_hhmm(base_time)
    if not base:
        return []
    base_minutes = base[0] * 60 + base[1]
    freq = (frequency or "").strip().lower()
    if freq in ("2x_dia", "12h"):
        slots = [base_minutes, (base_minutes + 12 * 60) % (24 * 60)]
    elif freq in ("3x_dia", "8h"):
        slots = [
            base_minutes,
            (base_minutes + 8 * 60) % (24 * 60),
            (base_minutes + 16 * 60) % (24 * 60),
        ]
    else:
        slots = [base_minutes]
    return [f"{m // 60:02d}:{m % 60:02d}" for m in sorted(set(slots))]


def _matches_reminder_time(now: datetime, reminder_time: Optional[str], default_time: str = "09:00") -> bool:
    hm = _parse_hhmm(str(reminder_time or default_time))
    return bool(hm and hm[0] == now.hour and hm[1] == now.minute)


def _care_time_reached(now: datetime, reminder_time: str, brt) -> bool:
    """Return True when the current time is at or past the configured reminder time.

    Unlike _matches_reminder_time (exact-minute match), this fires on the first
    scheduler tick at or after the configured HH:MM. The per-day pendency dedup
    (tag includes today's date) ensures each item fires only once per day even if
    the job runs many times after the window opens.
    """
    hm = _parse_hhmm(reminder_time)
    if not hm:
        return False
    today = now.date()
    configured_dt = datetime(today.year, today.month, today.day, hm[0], hm[1], tzinfo=brt)
    return now >= configured_dt


def _safe_local_date(value, tzinfo) -> Optional[object]:
    if value is None:
        return None
    if getattr(value, "tzinfo", None) is None:
        return value.date() if hasattr(value, "date") else value
    try:
        return value.astimezone(tzinfo).date()
    except Exception:
        return value.date() if hasattr(value, "date") else value


def _has_active_blocker(
    db,
    *,
    user_id: str,
    min_priority: int,
    pet_id: Optional[str] = None,
) -> bool:
    """Return True when there is an active pendency at/above min_priority.

    If pet_id is provided, matches pet-specific rows and also user-wide rows (pet_id is null).
    """
    from .pendencies import NotificationPendency

    query = db.query(NotificationPendency).filter(
        NotificationPendency.user_id == str(user_id),
        NotificationPendency.status == "active",
        NotificationPendency.priority >= int(min_priority),
    )
    if pet_id is not None:
        query = query.filter(
            (NotificationPendency.pet_id == str(pet_id))
            | (NotificationPendency.pet_id.is_(None))
        )
    return query.first() is not None


def _has_active_type(
    db,
    *,
    user_id: str,
    type_prefix: str,
    pet_id: Optional[str] = None,
) -> bool:
    from .pendencies import NotificationPendency

    query = db.query(NotificationPendency).filter(
        NotificationPendency.user_id == str(user_id),
        NotificationPendency.status == "active",
        NotificationPendency.type.like(f"{type_prefix}%"),
    )
    if pet_id is not None:
        query = query.filter(NotificationPendency.pet_id == str(pet_id))
    return query.first() is not None


def _has_dismissed_prefix(
    db,
    *,
    user_id: str,
    id_prefix: str,
    pet_id: Optional[str] = None,
) -> bool:
    """Dismissed progressive reminders should not be recreated automatically."""
    from .pendencies import NotificationPendency

    query = db.query(NotificationPendency).filter(
        NotificationPendency.user_id == str(user_id),
        NotificationPendency.status == "dismissed",
        NotificationPendency.id.like(f"{id_prefix}%"),
    )
    if pet_id is not None:
        query = query.filter(NotificationPendency.pet_id == str(pet_id))
    return query.first() is not None


def _pendency_exists(db, pend_id: str) -> bool:
    from .pendencies import NotificationPendency
    return db.query(NotificationPendency.id).filter(NotificationPendency.id == str(pend_id)).first() is not None


def _matches_any_preferred_time(
    now: datetime,
    preferred_times: List[str],
    default_time: str,
) -> bool:
    """Return True when `now` matches any user-configured time, else fallback."""
    valid = sorted({str(t) for t in preferred_times if _parse_hhmm(str(t))})
    if valid:
        return any(_matches_reminder_time(now, t, default_time) for t in valid)
    return _matches_reminder_time(now, default_time, default_time)


def send_medication_pushes() -> None:
    """Called every minute by APScheduler. Sends medication reminder pushes by schedule (Brasilia time)."""
    from datetime import timezone

    brt = timezone(timedelta(hours=-3))
    now = datetime.now(brt)
    today = now.date()
    subscriptions = _load_subscriptions()
    if not subscriptions:
        return

    try:
        db = SessionLocal()
        try:
            user_ids = [uid for uid in subscriptions.keys() if uid]
            if not user_ids:
                return

            events = (
                db.query(Event)
                .filter(
                    Event.user_id.in_(user_ids),
                    Event.type.in_(["medicacao", "medication"]),
                    Event.status.in_(["active", "pending", "rescheduled"]),
                )
                .all()
            )

            logger.info(
                "medication_push_tick now=%s subscriptions=%d events=%d",
                now.isoformat(timespec="minutes"),
                len(subscriptions),
                len(events),
            )

            for event in events:
                sub = subscriptions.get(str(event.user_id))
                if not sub:
                    continue

                try:
                    extra = json.loads(event.extra_data or "{}")
                except Exception:
                    extra = {}

                reminder_time = extra.get("reminder_time")
                if not reminder_time:
                    continue

                try:
                    start_dt = event.next_due_date or event.scheduled_at
                    start_date = start_dt.astimezone(brt).date() if start_dt else today
                except Exception:
                    start_date = today

                treatment_days = extra.get("treatment_days")
                applied_dates = extra.get("applied_dates") or []
                skipped_dates = extra.get("skipped_dates") or []
                applied_slots = extra.get("applied_slots") or {}
                skipped_slots = extra.get("skipped_slots") or {}
                treatment_complete = False
                if treatment_days is not None:
                    try:
                        treatment_complete = len(applied_dates) >= int(treatment_days)
                    except Exception:
                        treatment_complete = False

                offset_min = 0
                try:
                    offset_min = max(0, int(extra.get("reminder_offset_minutes", 0)))
                except Exception:
                    offset_min = 0

                frequency = extra.get("frequency")
                reminder_times = extra.get("reminder_times")
                if isinstance(reminder_times, list) and reminder_times:
                    slots = [str(t) for t in reminder_times if _parse_hhmm(str(t))]
                else:
                    slots = _expand_times(str(reminder_time), str(frequency) if frequency else None)

                if not slots:
                    continue

                due_slots_now = []
                for slot in slots:
                    hm = _parse_hhmm(slot)
                    if not hm:
                        continue

                    due_dt = datetime(
                        year=today.year,
                        month=today.month,
                        day=today.day,
                        hour=hm[0],
                        minute=hm[1],
                        tzinfo=brt,
                    ) - timedelta(minutes=offset_min)

                    if due_dt.hour == now.hour and due_dt.minute == now.minute:
                        due_slots_now.append(slot)

                if not due_slots_now:
                    continue

                logger.info(
                    "medication_due_slots event_id=%s user_id=%s pet_id=%s title=%r slots=%s start_date=%s treatment_days=%s applied_count=%d offset_min=%d",
                    event.id,
                    event.user_id,
                    event.pet_id,
                    event.title,
                    due_slots_now,
                    start_date.isoformat(),
                    treatment_days,
                    len(applied_dates),
                    offset_min,
                )

                if today < start_date:
                    logger.info(
                        "medication_skip event_id=%s slot=%s reason=before_start start_date=%s today=%s",
                        event.id,
                        ",".join(due_slots_now),
                        start_date.isoformat(),
                        today.isoformat(),
                    )
                    continue

                if treatment_complete:
                    logger.info(
                        "medication_skip event_id=%s slot=%s reason=treatment_complete applied_count=%d treatment_days=%s",
                        event.id,
                        ",".join(due_slots_now),
                        len(applied_dates),
                        treatment_days,
                    )
                    continue

                for slot in due_slots_now:
                    today_key = today.isoformat()
                    if today_key in applied_dates or today_key in skipped_dates:
                        logger.info(
                            "medication_skip event_id=%s slot=%s reason=day_already_closed applied=%s skipped=%s",
                            event.id,
                            slot,
                            today_key in applied_dates,
                            today_key in skipped_dates,
                        )
                        continue

                    day_applied_slots = [str(s) for s in (applied_slots.get(today_key) or [])]
                    day_skipped_slots = [str(s) for s in (skipped_slots.get(today_key) or [])]
                    if slot in day_applied_slots or slot in day_skipped_slots:
                        logger.info(
                            "medication_skip event_id=%s slot=%s reason=slot_already_closed applied=%s skipped=%s",
                            event.id,
                            slot,
                            slot in day_applied_slots,
                            slot in day_skipped_slots,
                        )
                        continue

                    from urllib.parse import quote
                    item_name_encoded = quote(event.title or "")
                    payload = {
                        "title": f"💊 {event.title}",
                        "body": (
                            f"{offset_min} min para aplicar em {slot}" if offset_min > 0 else f"Hora de aplicar ({slot})"
                        ),
                        "icon": "/icons/icon-192x192.png",
                        "badge": "/icons/badge-mono.png",

                        "image": "/brand/notification-banner.png",
                        "tag": f"petmol-med-{event.id}-{today.isoformat()}-{slot}",
                        "data": {"url": f"/home?modal=medication&petId={event.pet_id}&eventId={event.id}&itemName={item_name_encoded}"},
                        "requireInteraction": True,
                        "autoCloseMs": 0,
                    }

                    ok = _send_push(sub, payload)
                    if ok:
                        logger.info(
                            "medication_push_sent event_id=%s user_id=%s pet_id=%s slot=%s tag=%s",
                            event.id,
                            event.user_id,
                            event.pet_id,
                            slot,
                            payload["tag"],
                        )
                    if not ok:
                        logger.warning(
                            "medication_push_expired_subscription event_id=%s user_id=%s pet_id=%s slot=%s",
                            event.id,
                            event.user_id,
                            event.pet_id,
                            slot,
                        )
                        subscriptions.pop(str(event.user_id), None)
                        _save_subscriptions(subscriptions)
                        break
        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_medication_pushes erro: {e}")


def send_care_pushes() -> None:
    """Simple medication-like scheduler for vaccines/parasites/grooming.

    Runs every minute and sends when local time matches each record's configured reminder
    time. Every control behaves as a scheduled reminder with a daily cadence:
    - first fire at (due_date - alert_days_before) on reminder time
    - if still pending after due date, keep firing once/day on same time
    """
    from datetime import timezone
    import re as _re_v
    import unicodedata as _ud_v

    brt = timezone(timedelta(hours=-3))
    now = datetime.now(brt)
    today = now.date()
    today_str = today.isoformat()

    subscriptions = _load_subscriptions()
    if not subscriptions:
        return

    subscription_user_ids = [
        uid for uid, value in subscriptions.items()
        if _is_subscription_entry(value)
    ]

    logger.info(
        "care_push_tick now=%s subscriptions=%d valid_users=%d",
        now.isoformat(timespec="minutes"),
        len(subscriptions),
        len(subscription_user_ids),
    )

    if not subscription_user_ids:
        return

    def _vgroup_key(vr) -> str:
        if getattr(vr, "vaccine_code", None):
            return vr.vaccine_code
        n = (getattr(vr, "vaccine_name", None) or getattr(vr, "vaccine_type", None) or "").lower().strip()
        n = "".join(c for c in _ud_v.normalize("NFD", n) if _ud_v.category(c) != "Mn")
        n = _re_v.sub(r"\(.*?\)", "", n)
        n = _re_v.sub(r"\b(anual|annual|booster|reforco|dose\s*\d+|\d+[a]\s*dose)\b", "", n)
        n = _re_v.sub(r"[-\u2013\u2014]", " ", n)
        return _re_v.sub(r"\s+", " ", n).strip()

    def _normalize_time(value: Optional[str], default_time: str = "09:00") -> str:
        hm = _parse_hhmm(str(value or ""))
        if hm:
            return f"{hm[0]:02d}:{hm[1]:02d}"
        return default_time

    def _build_care_payload(
        *,
        pet_name: str,
        pet_id: str,
        domain: str,
        record_id: str,
        label: str,
        due_date,
        reminder_time: str,
        deep_link: str,
        cycle_key: str,
    ) -> dict:
        days_to_due = (due_date - today).days
        if days_to_due > 1:
            body = f"Faltam {days_to_due} dias. Toque para ver."
        elif days_to_due == 1:
            body = "Vence amanhã. Toque para ver."
        elif days_to_due == 0:
            body = "Vence hoje. Toque para registrar."
        elif days_to_due == -1:
            body = "Venceu ontem. Toque para atualizar."
        else:
            body = f"Em atraso há {abs(days_to_due)} dias. Toque para atualizar."

        # cycle_key ensures each alert fires at most twice per cycle: once at window entry,
        # once on due date — not every day between them.
        tag = f"petmol-care-{domain}-{record_id}-{cycle_key}"
        return {
            "title": f"🐾 {pet_name} — {label}",
            "body": body,
            "icon": "/icons/icon-192x192.png",
            "badge": "/icons/badge-mono.png",
            "tag": tag,
            "data": {"url": deep_link},
            "requireInteraction": True,
            "autoCloseMs": 0,
            "_deep_link": deep_link,
            "_due_date": due_date,
            "_priority": 75 if days_to_due < 0 else 70,
        }

    try:
        db = SessionLocal()
        try:
            from ..pets.models import Pet
            from ..pets.vaccine_models import VaccineRecord
            from ..pets.parasite_models import ParasiteControlRecord
            from ..pets.grooming_models import GroomingRecord

            pets = db.query(Pet).filter(Pet.user_id.in_(subscription_user_ids)).all()

            parasite_labels = {
                "flea_tick": "Antipulgas",
                "dewormer": "Vermífugo",
                "collar": "Coleira",
                "heartworm": "Antiparasitário cardíaco",
                "leishmaniasis": "Leishmaniose",
            }
            grooming_labels = {
                "bath": "Banho",
                "grooming": "Tosa",
                "bath_grooming": "Banho e Tosa",
                "hygiene": "Higiene",
            }

            for pet in pets:
                sub = subscriptions.get(str(pet.user_id))
                if not _is_subscription_entry(sub):
                    continue

                scheduled_items: list[dict] = []

                vaccines = db.query(VaccineRecord).filter(
                    VaccineRecord.pet_id == pet.id,
                    VaccineRecord.deleted == False,
                ).all()
                latest_vaccines: dict = {}
                for record in vaccines:
                    key = _vgroup_key(record)
                    prev = latest_vaccines.get(key)
                    if not prev or record.applied_date > prev.applied_date:
                        latest_vaccines[key] = record
                for record in latest_vaccines.values():
                    due = _safe_local_date(record.next_dose_date, brt)
                    if not due:
                        logger.info("care_skip pet=%s domain=vaccine id=%s reason=no_due_date", pet.id, record.id)
                        continue
                    alert_days = int(getattr(record, "alert_days_before", None) or 3)
                    reminder_time = _normalize_time(getattr(record, "reminder_time", None), "09:00")
                    start_date = due - timedelta(days=max(0, alert_days))
                    time_ok = _care_time_reached(now, reminder_time, brt)
                    logger.info(
                        "care_eval pet=%s domain=vaccine id=%s due=%s start=%s today=%s reminder_time=%s now_hhmm=%02d:%02d time_ok=%s",
                        pet.id, record.id, due, start_date, today, reminder_time, now.hour, now.minute, time_ok,
                    )
                    if not time_ok or today < start_date or today > due:
                        continue
                    cycle_key = f"start-{start_date.isoformat()}" if today < due else f"due-{due.isoformat()}"
                    scheduled_items.append(
                        _build_care_payload(
                            pet_name=pet.name,
                            pet_id=pet.id,
                            domain="vaccine",
                            record_id=str(record.id),
                            label=f"Vacina {record.vaccine_name}",
                            due_date=due,
                            reminder_time=reminder_time,
                            deep_link=f"/home?modal=vaccines&petId={pet.id}",
                            cycle_key=cycle_key,
                        )
                    )

                parasite_controls = db.query(ParasiteControlRecord).filter(
                    ParasiteControlRecord.pet_id == pet.id,
                    ParasiteControlRecord.deleted == False,
                    ParasiteControlRecord.reminder_enabled == True,
                ).all()
                latest_parasites: dict = {}
                for control in parasite_controls:
                    key = (control.type or "").lower().strip()
                    prev = latest_parasites.get(key)
                    if not prev or control.date_applied > prev.date_applied:
                        latest_parasites[key] = control
                for key, control in latest_parasites.items():
                    due_date = control.next_due_date or (
                        control.collar_expiry_date if (control.type or "").lower().strip() == "collar" else None
                    )
                    due = _safe_local_date(due_date, brt)
                    if not due:
                        logger.info("care_skip pet=%s domain=%s id=%s reason=no_due_date", pet.id, key, control.id)
                        continue
                    alert_days = int(getattr(control, "alert_days_before", None) or getattr(control, "reminder_days", None) or 3)
                    reminder_time = _normalize_time(getattr(control, "reminder_time", None), "09:00")
                    start_date = due - timedelta(days=max(0, alert_days))
                    time_ok = _care_time_reached(now, reminder_time, brt)
                    logger.info(
                        "care_eval pet=%s domain=%s id=%s due=%s start=%s today=%s reminder_time=%s now_hhmm=%02d:%02d time_ok=%s",
                        pet.id, key, control.id, due, start_date, today, reminder_time, now.hour, now.minute, time_ok,
                    )
                    if key == "dewormer":
                        trigger_minus_two = due - timedelta(days=2)
                        if not time_ok or today not in {trigger_minus_two, due}:
                            continue
                        cycle_key = (
                            f"d-2-{due.isoformat()}"
                            if today == trigger_minus_two
                            else f"due-{due.isoformat()}"
                        )
                    else:
                        if not time_ok or today < start_date or today > due:
                            continue
                        cycle_key = f"start-{start_date.isoformat()}" if today < due else f"due-{due.isoformat()}"
                    label = parasite_labels.get(key) or control.product_name or "Antiparasitário"
                    scheduled_items.append(
                        _build_care_payload(
                            pet_name=pet.name,
                            pet_id=pet.id,
                            domain=key or "parasite",
                            record_id=str(control.id),
                            label=label,
                            due_date=due,
                            reminder_time=reminder_time,
                            deep_link=f"/home?modal={_parasite_modal_for_type(key)}&petId={pet.id}",
                            cycle_key=cycle_key,
                        )
                    )

                groomings = db.query(GroomingRecord).filter(
                    GroomingRecord.pet_id == pet.id,
                    GroomingRecord.deleted == False,
                    GroomingRecord.reminder_enabled == True,
                ).all()
                latest_groomings: dict = {}
                for record in groomings:
                    key = (record.type or "").lower().strip()
                    prev = latest_groomings.get(key)
                    if not prev or record.date > prev.date:
                        latest_groomings[key] = record
                for key, record in latest_groomings.items():
                    due = _safe_local_date(record.next_recommended_date, brt)
                    if not due:
                        logger.info("care_skip pet=%s domain=grooming-%s id=%s reason=no_due_date", pet.id, key, record.id)
                        continue
                    alert_days = int(getattr(record, "alert_days_before", None) or getattr(record, "reminder_days_before", None) or 3)
                    reminder_time = _normalize_time(getattr(record, "scheduled_time", None), "09:00")
                    start_date = due - timedelta(days=max(0, alert_days))
                    time_ok = _care_time_reached(now, reminder_time, brt)
                    logger.info(
                        "care_eval pet=%s domain=grooming-%s id=%s due=%s start=%s today=%s reminder_time=%s now_hhmm=%02d:%02d time_ok=%s",
                        pet.id, key, record.id, due, start_date, today, reminder_time, now.hour, now.minute, time_ok,
                    )
                    if not time_ok or today < start_date or today > due:
                        continue
                    cycle_key = f"start-{start_date.isoformat()}" if today < due else f"due-{due.isoformat()}"
                    label = grooming_labels.get(key, "Higiene")
                    scheduled_items.append(
                        _build_care_payload(
                            pet_name=pet.name,
                            pet_id=pet.id,
                            domain=f"grooming-{key or 'default'}",
                            record_id=str(record.id),
                            label=label,
                            due_date=due,
                            reminder_time=reminder_time,
                            deep_link=f"/home?modal=grooming&petId={pet.id}",
                            cycle_key=cycle_key,
                        )
                    )

                logger.info("care_push_tick pet=%s scheduled=%d", pet.id, len(scheduled_items))
                for payload in scheduled_items:
                    if _pendency_exists(db, payload["tag"]):
                        logger.info("care_dedup_skip tag=%s", payload["tag"])
                        continue

                    _upsert_pend(
                        user_id=pet.user_id,
                        pet_id=pet.id,
                        pend_id=payload["tag"],
                        type_="care_simple",
                        title=payload["title"],
                        message=payload["body"],
                        deep_link=payload["_deep_link"],
                        priority=payload["_priority"],
                        expires_at=datetime.combine(payload.get("_due_date", today), time(23, 59, 59)).replace(tzinfo=brt) + timedelta(days=30),
                    )
                    ok = _send_push(sub, payload)
                    if not ok:
                        subscriptions.pop(str(pet.user_id), None)
                        break

                    logger.info("care_push_sent tag=%s pet_id=%s", payload["tag"], pet.id)

            _save_subscriptions(subscriptions)
        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_care_pushes erro: {e}")


def send_care_urgent_pushes() -> None:
    """Temporariamente desativado: controles seguem fluxo simples de send_care_pushes."""
    return


def send_monthly_docs_reminder() -> None:
    """Legacy neutralizado: rotina mensal automática removida."""
    return


def send_no_control_pushes() -> None:
    """Removido: rotina automática sem input do usuário."""
    return


def _food_push_title(pet_name: str, days_left: int) -> str:
    """🐾-branded title. Three tiers: urgent (≤3d), standard (>3d), zero/overdue."""
    if days_left <= 0:
        return f"🐾 A ração de {pet_name} acabou hoje"
    if days_left <= 3:
        return f"🐾 {pet_name} vai ficar sem ração em breve"
    return f"🐾 A ração de {pet_name} acaba em {days_left} {'dia' if days_left == 1 else 'dias'}"


def _food_push_body(brand: str, days_left: int) -> str:
    if days_left <= 0:
        return f"{brand} — hora de comprar. Vamos?"
    if days_left <= 3:
        return f"Restam ~{days_left} {'dia' if days_left == 1 else 'dias'} de {brand}. Resolver agora?"
    return f"{brand} — quer garantir a próxima embalagem?"


def _food_cycle_bucket(days_left: int) -> str:
    if days_left < 0:
        return "D+1+"
    if days_left == 0:
        return "D"
    if days_left == 1:
        return "D-1"
    return "D-3"


def send_food_reminder_pushes() -> None:
    """Daily job at 11:00 BRT.

    For each feeding plan where next_reminder_date <= today:
      - enabled=true, no_consumption_control=false, deleted_at IS NULL
    Creates pendency and sends push.
    - days_left <= 0 => critical priority (80)
    - days_left > 0  => urgent priority (60), skipped when critical is active
    Dedup: plan.last_food_push_date persisted in DB — survives service restarts.
    One push per pet per calendar day.
    Frequency guard: food push only in key cycle windows (D-1, D, D+1).
    """
    from datetime import timezone as _tz, timedelta as _td

    brt = _tz(_td(hours=-3))
    now = datetime.now(brt)

    # Only fire at 11:00 BRT
    if now.hour != 11 or now.minute != 0:
        return

    today = now.date()

    subscriptions = _load_subscriptions()
    if not subscriptions:
        return

    try:
        db = SessionLocal()
        try:
            from ..health.models import FeedingPlan
            from ..pets.models import Pet

            plans = db.query(FeedingPlan).filter(
                FeedingPlan.next_reminder_date <= today,
                FeedingPlan.enabled.is_(True),
                FeedingPlan.no_consumption_control.is_(False),
                FeedingPlan.deleted_at.is_(None),
            ).all()

            expired_ids: list[str] = []

            for plan in plans:
                # Persistent dedup: skip if already pushed today
                if plan.last_food_push_date == today:
                    continue

                pet = db.query(Pet).filter(Pet.id == plan.pet_id).first()
                if not pet:
                    continue

                sub = subscriptions.get(str(pet.user_id))
                if not sub:
                    continue

                days_left = (
                    (plan.estimated_end_date - today).days
                    if plan.estimated_end_date
                    else 0
                )
                # Smart cadence: avoid noisy daily pushes without a concrete moment.
                # Keep only D-1, D and D+1.
                if days_left not in {1, 0, -1}:
                    continue
                priority = 80 if days_left <= 0 else 60
                if priority < 75 and _has_active_blocker(
                    db,
                    user_id=pet.user_id,
                    pet_id=pet.id,
                    min_priority=75,
                ):
                    continue
                brand = plan.food_brand or "Ração"
                pend_id = (
                    f"petmol-food-{plan.pet_id}-"
                    f"{plan.next_reminder_date.isoformat() if plan.next_reminder_date else today.isoformat()}"
                )

                title = _food_push_title(pet.name, days_left)
                body = _food_push_body(brand, days_left)
                deep_link = f"/food?pet_id={pet.id}&mode=buy&source=push"
                action_urls = {
                    "buy": f"/food?pet_id={pet.id}&mode=buy&push_action=buy&source=push",
                    "still_has": f"/food?pet_id={pet.id}&mode=main&push_action=still_has&source=push",
                    "finished": f"/food?pet_id={pet.id}&mode=main&push_action=finished&source=push",
                    "purchase_confirmed": f"/food?pet_id={pet.id}&mode=main&push_action=purchase_confirmed&source=push",
                }

                _upsert_pend(
                    user_id=pet.user_id,
                    pet_id=pet.id,
                    pend_id=pend_id,
                    type_="food",
                    title=title,
                    message=body,
                    deep_link=deep_link,
                    priority=priority,
                )

                payload = {
                    "title": title,
                    "body": body,
                    "icon": "/icons/icon-192x192.png",
                    "badge": "/icons/badge-mono.png",
                    "image": "/brand/notification-banner.png",
                    "tag": pend_id,
                    "data": {
                        "url": deep_link,
                        "pet_id": str(pet.id),
                        "type": "food",
                        "item_name": brand,
                        "action_urls": action_urls,
                    },
                    "actions": [
                        {"action": "buy", "title": "Comprar"},
                        {"action": "still_has", "title": "Ainda tem"},
                        {"action": "finished", "title": "Acabou"},
                        {"action": "purchase_confirmed", "title": "Comprei"},
                    ],
                    "requireInteraction": True,
                    "autoCloseMs": 0,
                }
                ok = _send_push(sub, payload)
                if not ok:
                    expired_ids.append(str(pet.user_id))
                else:
                    # Persist dedup date so restart cannot double-send today
                    plan.last_food_push_date = today
                    try:
                        from ..analytics.models import AnalyticsEvent
                        event = AnalyticsEvent(
                            lead_id=secrets.token_hex(16),
                            source="notifications",
                            cta_type="food_alert_sent",
                            target=None,
                            pet_id=pet.id,
                            metadata_json=json.dumps({
                                "pet_id": pet.id,
                                "days_left": days_left,
                                "cycle_bucket": _food_cycle_bucket(days_left),
                                "next_reminder_date": plan.next_reminder_date.isoformat() if plan.next_reminder_date else None,
                                "estimated_end_date": plan.estimated_end_date.isoformat() if plan.estimated_end_date else None,
                                "scheduled_hour_brt": 11,
                            }, ensure_ascii=False)[:500],
                        )
                        db.add(event)
                    except Exception:
                        # Metric ingestion must never block push delivery.
                        pass
                    db.commit()
                    logger.info(f"Push ração enviado -> pet {pet.id} user {pet.user_id} days_left={days_left}")

            if expired_ids:
                for uid in expired_ids:
                    subscriptions.pop(uid, None)
                _save_subscriptions(subscriptions)

        finally:
            db.close()
    except Exception as e:
        logger.error(f"send_food_reminder_pushes erro: {e}")


@router.get("/settings")
async def get_notification_settings(
    current_user: User = Depends(get_current_user),
):
    """Return the user's notification preferences."""
    return {
        "monthly_checkin_day": current_user.monthly_checkin_day,
        "monthly_checkin_hour": current_user.monthly_checkin_hour,
        "monthly_checkin_minute": current_user.monthly_checkin_minute,
        "push_enabled": {
            "vaccine": True,
            "parasite": True,
            "grooming": True,
            "medication": True,
            "food": True,
        },
    }


class NotificationSettingsPatch(BaseModel):
    monthly_checkin_day: Optional[int] = None
    monthly_checkin_hour: Optional[int] = None
    monthly_checkin_minute: Optional[int] = None


@router.patch("/settings")
async def patch_notification_settings(
    body: NotificationSettingsPatch,
    current_user: User = Depends(get_current_user),
):
    """Update the user's notification preferences."""
    if body.monthly_checkin_day is not None:
        if not (1 <= body.monthly_checkin_day <= 28):
            raise HTTPException(status_code=422, detail="monthly_checkin_day deve estar entre 1 e 28")
    if body.monthly_checkin_hour is not None:
        if not (0 <= body.monthly_checkin_hour <= 23):
            raise HTTPException(status_code=422, detail="monthly_checkin_hour deve estar entre 0 e 23")
    if body.monthly_checkin_minute is not None:
        if not (0 <= body.monthly_checkin_minute <= 59):
            raise HTTPException(status_code=422, detail="monthly_checkin_minute deve estar entre 0 e 59")

    from ..user_auth.models import User as UserModel
    from ..db import get_db as _get_db
    db = next(_get_db())
    try:
        db_user = db.query(UserModel).filter(UserModel.id == current_user.id).first()
        if db_user is None:
            raise HTTPException(status_code=404, detail="Usuário não encontrado")
        if body.monthly_checkin_day is not None:
            db_user.monthly_checkin_day = body.monthly_checkin_day
        if body.monthly_checkin_hour is not None:
            db_user.monthly_checkin_hour = body.monthly_checkin_hour
        if body.monthly_checkin_minute is not None:
            db_user.monthly_checkin_minute = body.monthly_checkin_minute
        db.commit()
        db.refresh(db_user)
        return {
            "monthly_checkin_day": db_user.monthly_checkin_day,
            "monthly_checkin_hour": db_user.monthly_checkin_hour,
            "monthly_checkin_minute": db_user.monthly_checkin_minute,
        }
    finally:
        db.close()


@router.get("/vapid-public-key")
async def get_vapid_public_key():
    """Return VAPID public key for frontend push subscription."""
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="Push nao configurado")
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe_to_push(
    request: SubscriptionRequest,
    current_user: User = Depends(get_current_user),
):
    sub = request.subscription
    endpoint = sub.get("endpoint")
    keys = sub.get("keys", {})
    p256dh = keys.get("p256dh")
    auth = keys.get("auth")
    if not all([endpoint, p256dh, auth]):
        raise HTTPException(status_code=400, detail="Subscription invalida")
    subscriptions = _load_subscriptions()
    subscriptions[str(current_user.id)] = {"endpoint": endpoint, "p256dh": p256dh, "auth": auth}
    _save_subscriptions(subscriptions)
    return {"success": True}


@router.delete("/subscribe")
async def unsubscribe_from_push(current_user: User = Depends(get_current_user)):
    subscriptions = _load_subscriptions()
    subscriptions.pop(str(current_user.id), None)
    _save_subscriptions(subscriptions)
    return {"success": True}


@router.post("/test")
async def send_test_notification(current_user: User = Depends(get_current_user)):
    """Send a test push to the current user (useful during setup)."""
    subscriptions = _load_subscriptions()
    sub = subscriptions.get(str(current_user.id))
    if not sub:
        raise HTTPException(status_code=404, detail="Nenhuma subscription encontrada")
    payload = {
        "title": "Teste PETMOL",
        "body": "Push funcionando! Clique para abrir os lembretes.",
        "icon": "/icons/icon-192x192.png",
        "badge": "/icons/badge-mono.png",

        "image": "/brand/notification-banner.png",
        "tag": "petmol-test",
        "data": {"url": "/home"},
        "requireInteraction": False,
        "autoCloseMs": 4000,
    }
    ok = _send_push(sub, payload)
    if not ok:
        subscriptions.pop(str(current_user.id), None)
        _save_subscriptions(subscriptions)
        raise HTTPException(status_code=410, detail="Subscription expirada")
    return {"success": True, "message": "Notificacao de teste enviada"}


@router.post("/sentinel")
async def send_push_sentinel(current_user: User = Depends(get_current_user)):
    """Send a low-noise sentinel push and log an internal alert if delivery fails."""
    subscriptions = _load_subscriptions()
    sub = subscriptions.get(str(current_user.id))
    if not sub:
        logger.error("push_sentinel_failed user_id=%s reason=no_subscription", current_user.id)
        raise HTTPException(status_code=404, detail="Nenhuma subscription encontrada")

    payload = {
        "title": "PETMOL",
        "body": "Verificacao de notificacao concluida.",
        "icon": "/icons/icon-192x192.png",
        "badge": "/icons/badge-mono.png",
        "tag": "petmol-push-sentinel",
        "data": {"url": "/home"},
        "requireInteraction": False,
        "autoCloseMs": 2500,
    }
    ok = _send_push(sub, payload)
    if not ok:
        subscriptions.pop(str(current_user.id), None)
        _save_subscriptions(subscriptions)
        logger.error("push_sentinel_failed user_id=%s reason=expired_subscription", current_user.id)
        raise HTTPException(status_code=410, detail="Subscription expirada")
    logger.info("push_sentinel_ok user_id=%s", current_user.id)
    return {"success": True, "message": "Sentinela enviada"}


@router.post("/send")
async def send_notification(
    request: SendNotificationRequest,
    current_user: User = Depends(get_current_user),
):
    """Legacy neutralizado: endpoint de envio direto desativado."""
    _ = request
    return {
        "success": False,
        "reason": "disabled_keep_only_user_scheduled_notifications_and_test",
        "user_id": str(current_user.id),
    }


@router.post("/send-on-open")
async def send_on_open(current_user: User = Depends(get_current_user)):
    """Deprecated: overdue controls are now dispatched only by the 20:00 daily job."""
    return {
        "sent": 0,
        "reason": "disabled_use_daily_20h_job",
        "user_id": str(current_user.id),
    }

#!/usr/bin/env bash

set -Eeuo pipefail

PROD_HOST="${PROD_HOST:-root@147.93.33.24}"
APP_DIR="${PROD_APP_DIR:-/opt/petmol/app}"
SERVICE_DIR="${APP_DIR}/services/price-service"
TARGET_USER="${TARGET_USER:-00000000-0000-0000-0000-000000000001}"

ssh "${PROD_HOST}" 'bash -s' <<EOF
set -Eeuo pipefail

APP_DIR="${APP_DIR}"
SERVICE_DIR="${SERVICE_DIR}"
TARGET_USER="${TARGET_USER}"
export TARGET_USER

printf '===== services =====\n'
printf 'petmol-web: '
systemctl is-active petmol-web
printf 'petmol-api: '
systemctl is-active petmol-api

printf '\n===== endpoints =====\n'
printf 'GET /health -> '
curl -fsS http://127.0.0.1:8000/health
printf '\n\nGET /notifications/vapid-public-key -> '
curl -fsS http://127.0.0.1:8000/notifications/vapid-public-key
printf '\n'

printf '\n===== journal medication lines =====\n'
journalctl -u petmol-api --since '20 minutes ago' --no-pager \
  | grep -E 'medication_push_tick|medication_due_slots|medication_push_sent|medication_push_expired_subscription' \
  | tail -n 20 || true

printf '\n===== api.log medication lines =====\n'
grep -E 'medication_push_tick|medication_due_slots|medication_push_sent|medication_push_expired_subscription' /opt/petmol/logs/api.log \
  | tail -n 20 || true

printf '\n===== user reminder audit =====\n'
cd "${SERVICE_DIR}"
.venv/bin/python - <<'PY'
import json
import os
import re
import unicodedata
from datetime import datetime, timedelta, timezone

import src.main  # noqa: F401
import src.notifications as notifications
from psycopg2.extras import RealDictCursor
from sqlalchemy.engine import make_url
import psycopg2
from src.config import get_settings

target_user = os.environ["TARGET_USER"]
settings = get_settings()
subs = notifications._load_subscriptions()
brt = timezone(timedelta(hours=-3))
now = datetime.now(brt)
today = now.date()
timeline = []


def iso_or_none(value):
    return value.isoformat(timespec="minutes") if value else None


def describe_push_timing(push_dt):
    if not push_dt:
        return None
    push_day = push_dt.date()
    if push_day == today:
        return f"hoje {push_dt.strftime('%H:%M')}"
    if push_day == today + timedelta(days=1):
        return f"amanhã {push_dt.strftime('%H:%M')}"
    return push_dt.strftime("%d/%m/%Y %H:%M")


def human_status(category, raw_status, push_dt):
    when = describe_push_timing(push_dt)
    if category == "medication":
        if raw_status == "active":
            return f"medicação ativa, próximo push {when}"
        if raw_status == "pending":
            return f"pendente, próximo push {when}"
        if raw_status == "rescheduled":
            return f"reagendada, próximo push {when}"
        return raw_status
    if category == "checkin":
        return f"check-in mensal em {when}"
    if raw_status == "overdue_daily_09:00":
        return f"atrasado, push diário às 09:00; próximo {when}"
    if raw_status == "today_09:00":
        return f"vence hoje, push às 09:00; próximo {when}"
    if raw_status.startswith("advance_day_"):
        return f"aviso antecipado, próximo push {when}"
    if raw_status == "no_push_today":
        return f"agendado, próximo push {when}"
    if raw_status == "scheduled":
        return f"agendado para {when}"
    return raw_status


def next_daily_nine(reference_dt, day):
    candidate = datetime(day.year, day.month, day.day, 9, 0, tzinfo=brt)
    if candidate > reference_dt:
        return candidate
    return candidate + timedelta(days=1)


def normalize_vaccine_key(record):
    if record.get("vaccine_code"):
        return record["vaccine_code"]
    name = (record.get("vaccine_name") or record.get("vaccine_type") or "").lower().strip()
    name = "".join(ch for ch in unicodedata.normalize("NFD", name) if unicodedata.category(ch) != "Mn")
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r"\b(anual|annual|booster|reforco|dose\s*\d+|\d+[a]\s*dose)\b", "", name)
    name = re.sub(r"[-\u2013\u2014]", " ", name)
    return re.sub(r"\s+", " ", name).strip()


def compute_medication_next_push(extra, start_date, active_status):
    reminder_time = extra.get("reminder_time")
    reminder_times = extra.get("reminder_times")
    frequency = extra.get("frequency")
    if isinstance(reminder_times, list) and reminder_times:
        slots = [str(slot) for slot in reminder_times if notifications._parse_hhmm(str(slot))]
    else:
        slots = notifications._expand_times(str(reminder_time), str(frequency) if frequency else None)

    if not slots or not active_status:
        return None, slots

    treatment_days = extra.get("treatment_days")
    applied_dates = extra.get("applied_dates") or []
    skipped_dates = extra.get("skipped_dates") or []
    applied_slots = extra.get("applied_slots") or {}
    skipped_slots = extra.get("skipped_slots") or {}
    if treatment_days is not None:
        try:
            if len(applied_dates) >= int(treatment_days):
                return None, slots
        except Exception:
            pass

    today_key = today.isoformat()
    if today_key in applied_dates or today_key in skipped_dates:
        day_cursor = max(today + timedelta(days=1), start_date)
        first = notifications._parse_hhmm(slots[0])
        return datetime(day_cursor.year, day_cursor.month, day_cursor.day, first[0], first[1], tzinfo=brt), slots

    offset_min = 0
    try:
        offset_min = max(0, int(extra.get("reminder_offset_minutes", 0)))
    except Exception:
        offset_min = 0

    day_cursor = max(today, start_date)
    for day_offset in range(0, 3):
        candidate_day = day_cursor + timedelta(days=day_offset)
        candidate_key = candidate_day.isoformat()
        if candidate_key in applied_dates or candidate_key in skipped_dates:
            continue

        closed_applied = {str(slot) for slot in (applied_slots.get(candidate_key) or [])}
        closed_skipped = {str(slot) for slot in (skipped_slots.get(candidate_key) or [])}
        for slot in slots:
            if slot in closed_applied or slot in closed_skipped:
                continue
            hm = notifications._parse_hhmm(slot)
            if not hm:
                continue
            due_dt = datetime(candidate_day.year, candidate_day.month, candidate_day.day, hm[0], hm[1], tzinfo=brt) - timedelta(minutes=offset_min)
            if due_dt > now:
                return due_dt, slots

    hm = notifications._parse_hhmm(slots[0])
    fallback_day = day_cursor + timedelta(days=1)
    return datetime(fallback_day.year, fallback_day.month, fallback_day.day, hm[0], hm[1], tzinfo=brt), slots

print("NOW_BRT", now.isoformat(timespec="minutes"))
print("SUBSCRIPTION_COUNT", len(subs))
print("TARGET_USER_HAS_SUB", bool(subs.get(target_user)))

url = make_url(settings.database_url)
conn = psycopg2.connect(
    host=url.host,
    port=url.port,
    user=url.username,
    password=url.password,
    dbname=url.database,
)
cur = conn.cursor(cursor_factory=RealDictCursor)

cur.execute(
    "select name, monthly_checkin_day, monthly_checkin_hour, monthly_checkin_minute from users where id=%s",
    (target_user,),
)
user = cur.fetchone()
if user:
    checkin_today = today.day == user["monthly_checkin_day"]
    next_checkin_date = today
    if not checkin_today:
        if today.day < user["monthly_checkin_day"]:
            next_checkin_date = today.replace(day=user["monthly_checkin_day"])
        else:
            month = today.month + 1
            year = today.year
            if month == 13:
                month = 1
                year += 1
            next_checkin_date = today.replace(year=year, month=month, day=user["monthly_checkin_day"])
    next_checkin_push = datetime(
        next_checkin_date.year,
        next_checkin_date.month,
        next_checkin_date.day,
        user["monthly_checkin_hour"],
        user["monthly_checkin_minute"],
        tzinfo=brt,
    )
    if checkin_today and next_checkin_push <= now:
        month = today.month + 1
        year = today.year
        if month == 13:
            month = 1
            year += 1
        next_checkin_push = datetime(
            year,
            month,
            user["monthly_checkin_day"],
            user["monthly_checkin_hour"],
            user["monthly_checkin_minute"],
            tzinfo=brt,
        )
    print(
        "CHECKIN",
        {
            "day": user["monthly_checkin_day"],
            "hour": user["monthly_checkin_hour"],
            "minute": user["monthly_checkin_minute"],
            "fires_today": checkin_today,
            "next_push_brt": iso_or_none(next_checkin_push),
        },
    )
    timeline.append(
        {
            "category": "checkin",
            "pet": None,
            "label": "Check-in mensal",
            "next_push": next_checkin_push,
            "status": "due_today" if checkin_today else "scheduled",
        }
    )

cur.execute("select id, name from pets where user_id=%s order by name", (target_user,))
pets = cur.fetchall()
pet_ids = [row["id"] for row in pets]
pet_names = {row["id"]: row["name"] for row in pets}
print("PETS", [row["name"] for row in pets])

if pet_ids:
    cur.execute(
        """
        select id, pet_id, title, status, next_due_date, scheduled_at, extra_data
        from events
        where user_id=%s
          and pet_id = any(%s)
          and type in ('medicacao', 'medication')
          and status <> 'cancelled'
        order by title
        """,
        (target_user, pet_ids),
    )
    print("MEDICATIONS")
    for row in cur.fetchall():
        extra = row["extra_data"] or {}
        if isinstance(extra, str):
            extra = json.loads(extra)

        reminder_time = extra.get("reminder_time")
        reminder_times = extra.get("reminder_times") or []
        treatment_days = extra.get("treatment_days")
        applied_dates = extra.get("applied_dates") or []
        skipped_dates = extra.get("skipped_dates") or []
        start_dt = row.get("next_due_date") or row.get("scheduled_at")
        start_date = start_dt.astimezone(brt).date() if start_dt and hasattr(start_dt, "astimezone") else today
        active_status = row["status"] in {"active", "pending", "rescheduled"}
        next_push, candidate_slots = compute_medication_next_push(extra, start_date, active_status)

        due_now = False
        for slot in candidate_slots:
            parsed = notifications._parse_hhmm(slot)
            if not parsed:
                continue
            if parsed[0] == now.hour and parsed[1] == now.minute:
                due_now = True

        print(
            {
                "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                "event_id": row["id"],
                "title": row["title"],
                "status": row["status"],
                "active_status": active_status,
                "reminder_time": reminder_time,
                "reminder_times": candidate_slots,
                "treatment_days": treatment_days,
                "applied_count": len(applied_dates),
                "skipped_count": len(skipped_dates),
                "due_now": due_now,
                "next_push_brt": iso_or_none(next_push),
            }
        )
        if next_push:
            timeline.append(
                {
                    "category": "medication",
                    "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                    "label": row["title"],
                    "next_push": next_push,
                    "status": row["status"],
                }
            )

    cur.execute(
        """
        select pet_id, vaccine_name, vaccine_type, vaccine_code, applied_date, next_dose_date
        from vaccine_records
        where pet_id = any(%s)
          and deleted = false
        order by pet_id, applied_date desc
        """,
        (pet_ids,),
    )
    latest_vaccines = {}
    for row in cur.fetchall():
        key = (row["pet_id"], normalize_vaccine_key(row))
        if key not in latest_vaccines:
            latest_vaccines[key] = row
    print("VACCINES")
    for row in latest_vaccines.values():
        due = row["next_dose_date"].astimezone(brt).date()
        days_left = (due - today).days
        if days_left < 0:
            behavior = "overdue_daily_09:00"
            next_push = next_daily_nine(now, today)
        elif days_left == 0:
            behavior = "today_09:00"
            next_push = next_daily_nine(now, today)
        elif days_left == 10:
            behavior = "advance_day_10d_at_09:00"
            next_push = datetime(today.year, today.month, today.day, 9, 0, tzinfo=brt) if now < datetime(today.year, today.month, today.day, 9, 0, tzinfo=brt) else datetime(due.year, due.month, due.day, 9, 0, tzinfo=brt)
        else:
            behavior = "no_push_today"
            next_push = datetime(due.year, due.month, due.day, 9, 0, tzinfo=brt) if days_left > 0 else None
        print(
            {
                "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                "item": row["vaccine_name"],
                "due_date": due.isoformat(),
                "days_left": days_left,
                "behavior": behavior,
                "fires_today": days_left <= 0 or days_left == 10,
                "next_push_brt": iso_or_none(next_push),
            }
        )
        if next_push:
            timeline.append(
                {
                    "category": "vaccine",
                    "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                    "label": row["vaccine_name"],
                    "next_push": next_push,
                    "status": behavior,
                }
            )

    cur.execute(
        """
        select pet_id, type, product_name, date_applied, next_due_date, alert_days_before, reminder_days
        from parasite_control_records
        where pet_id = any(%s)
          and deleted = false
        order by pet_id, date_applied desc
        """,
        (pet_ids,),
    )
    latest_parasites = {}
    for row in cur.fetchall():
        key = (row["pet_id"], (row["type"] or "").lower().strip())
        if key not in latest_parasites:
            latest_parasites[key] = row
    print("PARASITES")
    for row in latest_parasites.values():
        due = row["next_due_date"].astimezone(brt).date() if row["next_due_date"] else None
        advance = row["alert_days_before"] or row["reminder_days"] or 0
        days_left = (due - today).days if due else None
        push_day = due - timedelta(days=advance) if due else None
        if due is None:
            behavior = "no_due_date"
            next_push = None
            fires_today = False
        elif days_left < 0:
            behavior = "overdue_daily_09:00"
            next_push = next_daily_nine(now, today)
            fires_today = True
        elif days_left == 0:
            behavior = "today_09:00"
            next_push = next_daily_nine(now, today)
            fires_today = True
        elif push_day == today:
            behavior = f"advance_day_{advance}d_at_09:00"
            next_push = datetime(today.year, today.month, today.day, 9, 0, tzinfo=brt) if now < datetime(today.year, today.month, today.day, 9, 0, tzinfo=brt) else datetime(due.year, due.month, due.day, 9, 0, tzinfo=brt)
            fires_today = True
        else:
            behavior = "no_push_today"
            next_push = datetime(push_day.year, push_day.month, push_day.day, 9, 0, tzinfo=brt) if push_day and push_day > today else datetime(due.year, due.month, due.day, 9, 0, tzinfo=brt)
            fires_today = False
        print(
            {
                "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                "type": row["type"],
                "product": row["product_name"],
                "due_date": due.isoformat() if due else None,
                "advance_days": advance,
                "computed_push_day": push_day.isoformat() if push_day else None,
                "days_left": days_left,
                "behavior": behavior,
                "fires_today": fires_today,
                "next_push_brt": iso_or_none(next_push),
            }
        )
        if next_push:
            timeline.append(
                {
                    "category": "parasite",
                    "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                    "label": f"{row['type']} - {row['product_name']}",
                    "next_push": next_push,
                    "status": behavior,
                }
            )

    cur.execute(
        """
        select pet_id, type, date, next_recommended_date, reminder_enabled, alert_days_before, reminder_days_before
        from grooming_records
        where pet_id = any(%s)
          and deleted = false
        order by pet_id, date desc
        """,
        (pet_ids,),
    )
    latest_grooming = {}
    for row in cur.fetchall():
        key = (row["pet_id"], (row["type"] or "").lower().strip())
        if key not in latest_grooming:
            latest_grooming[key] = row
    print("GROOMING")
    for row in latest_grooming.values():
        due = row["next_recommended_date"].astimezone(brt).date() if row["next_recommended_date"] else None
        advance = row["reminder_days_before"] or row["alert_days_before"] or 0
        enabled = bool(row["reminder_enabled"])
        days_left = (due - today).days if due else None
        push_day = due - timedelta(days=advance) if due else None
        if not enabled:
            behavior = "disabled"
            next_push = None
            fires_today = False
        elif due is None:
            behavior = "no_due_date"
            next_push = None
            fires_today = False
        elif days_left < 0:
            behavior = "overdue_daily_09:00"
            next_push = next_daily_nine(now, today)
            fires_today = True
        elif days_left == 0:
            behavior = "today_09:00"
            next_push = next_daily_nine(now, today)
            fires_today = True
        elif push_day == today:
            behavior = f"advance_day_{advance}d_at_09:00"
            next_push = datetime(today.year, today.month, today.day, 9, 0, tzinfo=brt) if now < datetime(today.year, today.month, today.day, 9, 0, tzinfo=brt) else datetime(due.year, due.month, due.day, 9, 0, tzinfo=brt)
            fires_today = True
        else:
            behavior = "no_push_today"
            next_push = datetime(push_day.year, push_day.month, push_day.day, 9, 0, tzinfo=brt) if push_day and push_day > today else datetime(due.year, due.month, due.day, 9, 0, tzinfo=brt)
            fires_today = False
        print(
            {
                "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                "type": row["type"],
                "reminder_enabled": enabled,
                "due_date": due.isoformat() if due else None,
                "advance_days": advance,
                "computed_push_day": push_day.isoformat() if push_day else None,
                "days_left": days_left,
                "behavior": behavior,
                "fires_today": fires_today,
                "next_push_brt": iso_or_none(next_push),
            }
        )
        if next_push:
            timeline.append(
                {
                    "category": "grooming",
                    "pet": pet_names.get(row["pet_id"], row["pet_id"]),
                    "label": row["type"],
                    "next_push": next_push,
                    "status": behavior,
                }
            )

print("TIMELINE")
ordered_timeline = sorted(timeline, key=lambda entry: entry["next_push"])
if ordered_timeline:
    first = ordered_timeline[0]
    print(
        "NEXT_PUSH",
        {
            "next_push_brt": iso_or_none(first["next_push"]),
            "when": describe_push_timing(first["next_push"]),
            "category": first["category"],
            "pet": first["pet"],
            "label": first["label"],
            "status": human_status(first["category"], first["status"], first["next_push"]),
        },
    )
for item in ordered_timeline:
    print(
        {
            "next_push_brt": iso_or_none(item["next_push"]),
            "when": describe_push_timing(item["next_push"]),
            "category": item["category"],
            "pet": item["pet"],
            "label": item["label"],
            "status": human_status(item["category"], item["status"], item["next_push"]),
        }
    )

cur.close()
conn.close()
PY
EOF
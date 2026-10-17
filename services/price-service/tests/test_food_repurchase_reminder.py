from datetime import date, datetime, timedelta, timezone

from src.db import SessionLocal
from src.health.models import FeedingRepurchaseIntent
from src.health.repurchase_reminder import send_repurchase_reminders
from tests.test_feeding_flow import _headers, _signup_login_and_pet

# 13h de Brasília (dentro da janela 10h–19h)
NOON = datetime(2026, 10, 20, 16, 0, tzinfo=timezone.utc)


def _setup(client, cid, email):
    token, pet_id = _signup_login_and_pet(client, cid, email)
    h = _headers(cid, token)
    started = (NOON - timedelta(days=40)).date().isoformat()
    assert client.post(f"/health/pets/{pet_id}/feeding/plan",
                       json={"food_brand": "Golden", "package_size_kg": 15, "daily_amount_g": 300,
                             "last_refill_date": started}, headers=h).status_code in (200, 201)
    assert client.post(f"/health/pets/{pet_id}/feeding/repurchase-intent", headers=h).status_code == 204
    return h, pet_id


def _age_intent(pet_id, hours):
    db = SessionLocal()
    try:
        row = db.query(FeedingRepurchaseIntent).filter_by(pet_id=pet_id).one()
        row.clicked_at = NOON - timedelta(hours=hours)
        db.commit()
    finally:
        db.close()


def test_reminder_sent_once_after_20h(client):
    h, pet_id = _setup(client, "cid-rep1", "rep1@example.com")
    calls = []
    push = lambda uid, payload: calls.append(payload) or 1

    _age_intent(pet_id, 5)
    assert send_repurchase_reminders(now=NOON, push=push) == 0

    _age_intent(pet_id, 24)
    assert send_repurchase_reminders(now=NOON, push=push) == 1
    assert "Chegou a ração" in calls[0]["title"] and pet_id in calls[0]["data"]["url"]
    assert send_repurchase_reminders(now=NOON, push=push) == 0  # só uma vez


def test_no_reminder_if_restocked_or_outside_hours(client):
    h, pet_id = _setup(client, "cid-rep2", "rep2@example.com")
    _age_intent(pet_id, 24)
    push = lambda uid, payload: 1
    night = datetime(2026, 10, 20, 2, 0, tzinfo=timezone.utc)  # 23h BRT
    assert send_repurchase_reminders(now=night, push=push) == 0

    assert client.post(f"/health/pets/{pet_id}/feeding/plan/restock", json={}, headers=h).status_code == 200
    assert send_repurchase_reminders(now=NOON, push=push) == 0

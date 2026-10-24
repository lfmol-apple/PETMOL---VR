"""Ajuste da duração da ração: o tutor escolhe os dias; acabou antes, ainda tem e desfazer."""
from datetime import date, timedelta

from src.db import SessionLocal
from src.health.models import FeedingAdjustment
from tests.test_feeding_flow import _headers, _signup_login_and_pet


def _setup(client, cid, email, days_ago=12):
    token, pet_id = _signup_login_and_pet(client, cid, email)
    h = _headers(cid, token)
    r = client.post(
        f"/health/pets/{pet_id}/feeding/plan",
        json={"food_brand": "Ração Teste", "package_size_kg": 10, "daily_amount_g": 333,
              "last_refill_date": (date.today() - timedelta(days=days_ago)).isoformat()},
        headers=h,
    )
    assert r.status_code in (200, 201), r.text
    return pet_id, h


def _adjust(client, pet_id, h, **body):
    return client.patch(f"/health/pets/{pet_id}/feeding/plan/adjust", json=body, headers=h)


def test_tutor_chooses_duration_and_undo_restores(client):
    pet_id, h = _setup(client, "cid-adj-1", "adj1@example.com")
    r = _adjust(client, pet_id, h, action="set_duration", duration_days=14)
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["previous_duration_days"] == 30
    assert b["duration_days"] == 14            # exatamente o que o tutor escolheu
    assert b["duration_adjusted"] is True
    assert b["estimated_days_left"] == 2
    assert abs(b["daily_amount_g"] - 714.3) < 0.2   # 10 kg em 14 dias

    undo = _adjust(client, pet_id, h, action="set_duration", duration_days=b["previous_duration_days"])
    assert undo.status_code == 200, undo.text
    assert undo.json()["duration_days"] == 30
    assert undo.json()["estimated_days_left"] == 18

    with SessionLocal() as db:
        rows = db.query(FeedingAdjustment).filter(FeedingAdjustment.pet_id == pet_id).order_by(FeedingAdjustment.created_at).all()
    assert [(x.action, x.from_duration_days, x.to_duration_days) for x in rows] == [
        ("set_duration", 30, 14), ("set_duration", 14, 30)]


def test_finished_early_learns_real_duration(client):
    pet_id, h = _setup(client, "cid-adj-2", "adj2@example.com")
    r = _adjust(client, pet_id, h, action="finished_early")
    assert r.status_code == 200, r.text
    b = r.json()
    assert b["duration_days"] == 12 and b["duration_adjusted"] is True
    assert b["estimated_end_date"][:10] == date.today().isoformat()
    assert abs(b["daily_amount_g"] - 833.3) < 0.2


def test_finished_early_right_after_restock_does_not_learn(client):
    pet_id, h = _setup(client, "cid-adj-3", "adj3@example.com", days_ago=1)
    b = _adjust(client, pet_id, h, action="finished_early").json()
    assert b["duration_adjusted"] is False
    assert b["duration_days"] in (None, 30)


def test_still_has_extends_duration_not_only_reminder(client):
    pet_id, h = _setup(client, "cid-adj-4", "adj4@example.com")
    b = _adjust(client, pet_id, h, action="still_has", days=3).json()
    assert b["duration_adjusted"] is True
    assert b["duration_days"] == 33
    assert b["estimated_days_left"] == 21


def test_tutor_choice_is_respected_within_sane_bounds(client):
    pet_id, h = _setup(client, "cid-adj-6", "adj6@example.com")
    assert _adjust(client, pet_id, h, action="set_duration").status_code == 422
    b = _adjust(client, pet_id, h, action="set_duration", duration_days=200).json()
    assert b["duration_days"] == 200           # sem "corrigir" a escolha do tutor
    b = _adjust(client, pet_id, h, action="set_duration", duration_days=1000).json()
    assert b["duration_days"] == 365           # teto de um ano
    b = _adjust(client, pet_id, h, action="set_duration", duration_days=2).json()
    assert b["duration_days"] == 12            # nunca abaixo do que já passou

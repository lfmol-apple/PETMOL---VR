"""Rotina do pet — lembrete de banho e tosa (18/10/2026). Tudo atrás de routine_bath_enabled."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from src.config import get_settings
from src.db import SessionLocal
from src.notifications import Reminder
from src.pets.grooming_models import GroomingRecord
from src.pets.models import Pet
from src.routine.bath import RoutineBath, bath_routine_active, ensure_bath_reminders, next_bath_at
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

UTC = timezone.utc
SP = "America/Sao_Paulo"


@pytest.fixture
def flag(monkeypatch):
    def _set(on: bool):
        monkeypatch.setenv("ROUTINE_BATH_ENABLED", "true" if on else "false")
        get_settings.cache_clear()
    _set(True)
    yield _set
    monkeypatch.delenv("ROUTINE_BATH_ENABLED", raising=False)
    get_settings.cache_clear()


def _mk(db, name="Baby"):
    u = User(id=str(uuid.uuid4()), email=f"rb.{uuid.uuid4().hex[:8]}@example.com", name="Tutor",
             password_hash=hash_password("x"))
    db.add(u); db.commit()
    p = Pet(id=str(uuid.uuid4()), user_id=u.id, name=name, species="dog")
    db.add(p); db.commit()
    return u.id, p.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}


def _cfg(db, uid, pid, **kw):
    c = RoutineBath(pet_id=pid, user_id=uid, enabled=True, interval_days=15, time="10:30", tz=SP,
                    started_on=datetime(2026, 10, 1).date(), **kw)
    db.add(c); db.commit()
    return c


def _bath(db, pid, when):
    db.add(GroomingRecord(id=str(uuid.uuid4()), pet_id=pid, type="bath", date=when)); db.commit()


def test_proximo_aviso_e_ultimo_banho_mais_intervalo_na_hora_escolhida(flag):
    db = SessionLocal()
    try:
        uid, pid, _ = _mk(db)
        cfg = _cfg(db, uid, pid)
        _bath(db, pid, datetime(2026, 10, 10, 15, 0, tzinfo=UTC))      # 12:00 em SP, dia 10
        now = datetime(2026, 10, 16, 15, 0, tzinfo=UTC)
        # 10/10 + 15 dias = 25/10 às 10:30 SP (= 13:30 UTC)
        assert next_bath_at(db, cfg, now) == datetime(2026, 10, 25, 13, 30, tzinfo=UTC)
    finally:
        db.close()


def test_sem_banho_registrado_conta_do_dia_em_que_ligou(flag):
    db = SessionLocal()
    try:
        uid, pid, _ = _mk(db)
        cfg = _cfg(db, uid, pid)      # started_on 01/10
        now = datetime(2026, 10, 2, 12, 0, tzinfo=UTC)
        assert next_bath_at(db, cfg, now) == datetime(2026, 10, 16, 13, 30, tzinfo=UTC)
    finally:
        db.close()


def test_vencido_avisa_uma_vez_por_ciclo_e_nao_insiste(flag):
    db = SessionLocal()
    try:
        uid, pid, _ = _mk(db)
        cfg = _cfg(db, uid, pid)
        _bath(db, pid, datetime(2026, 9, 1, 15, 0, tzinfo=UTC))       # bem vencido
        now = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)               # 09:00 SP: 10:30 ainda vem hoje
        assert next_bath_at(db, cfg, now) == datetime(2026, 10, 16, 13, 30, tzinfo=UTC)
        later = datetime(2026, 10, 16, 20, 0, tzinfo=UTC)             # já passou das 10:30: amanhã
        assert next_bath_at(db, cfg, later) == datetime(2026, 10, 17, 13, 30, tzinfo=UTC)
        # já avisou neste ciclo -> espera o tutor
        db.add(Reminder(user_id=uid, pet_id=pid, type="bath", title="t", body="b",
                        remind_at=datetime(2026, 10, 16, 13, 30, tzinfo=UTC), sent=True)); db.commit()
        assert next_bath_at(db, cfg, later) is None
    finally:
        db.close()


def test_job_cria_um_lembrete_e_desligado_limpa(flag):
    db = SessionLocal()
    try:
        uid, pid, _ = _mk(db)
        _cfg(db, uid, pid)
        ensure_bath_reminders(datetime(2026, 10, 2, 12, 0, tzinfo=UTC))
        ensure_bath_reminders(datetime(2026, 10, 2, 12, 5, tzinfo=UTC))   # idempotente
        rows = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "bath").all()
        assert len(rows) == 1 and "banho de Baby" in rows[0].title
        flag(False)
        ensure_bath_reminders()
        assert db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "bath").count() == 0
    finally:
        db.close()


def test_api_ligar_registrar_e_adiar(client, flag):
    db = SessionLocal()
    try:
        uid, pid, hdr = _mk(db)
    finally:
        db.close()
    r = client.get(f"/pets/{pid}/routine/bath", headers=hdr)
    assert r.status_code == 200 and r.json()["enabled"] is False and r.json()["interval_days"] == 15

    r = client.put(f"/pets/{pid}/routine/bath", headers=hdr,
                   json={"enabled": True, "interval_days": 10, "time": "09:15", "with_grooming": True,
                         "tz": SP, "petshop_phone": "11999998888"})
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] and body["interval_days"] == 10 and body["time"] == "09:15"
    assert body["petshop_phone"] == "11999998888" and body["next_at"]

    r = client.post(f"/pets/{pid}/routine/bath/done", headers=hdr)
    assert r.status_code == 200 and r.json()["last_bath_on"]
    db = SessionLocal()
    try:
        rec = db.query(GroomingRecord).filter(GroomingRecord.pet_id == pid).one()
        assert rec.type == "bath_grooming" and rec.location_phone == "11999998888" and rec.reminder_enabled is False
    finally:
        db.close()

    r = client.post(f"/pets/{pid}/routine/bath/snooze", headers=hdr)
    assert r.status_code == 200 and r.json()["next_at"]

    assert client.put(f"/pets/{pid}/routine/bath", headers=hdr,
                      json={"enabled": True, "interval_days": 0, "time": "09:15"}).status_code == 422
    assert client.put(f"/pets/{pid}/routine/bath", headers=hdr,
                      json={"enabled": True, "interval_days": 7, "time": "25:61"}).status_code == 422


def test_recurso_desligado_responde_404_e_nao_envia(client, flag):
    flag(False)
    db = SessionLocal()
    try:
        uid, pid, hdr = _mk(db)
        assert client.get(f"/pets/{pid}/routine/bath", headers=hdr).status_code == 404
        assert bath_routine_active(db, pid) is False
    finally:
        db.close()


def test_rotina_ligada_suprime_aviso_antigo_de_grooming_do_pet(flag):
    db = SessionLocal()
    try:
        uid, pid, _ = _mk(db)
        assert bath_routine_active(db, pid) is False
        _cfg(db, uid, pid)
        assert bath_routine_active(db, pid) is True
        flag(False)
        assert bath_routine_active(db, pid) is False     # recurso desligado: nada é suprimido
    finally:
        db.close()

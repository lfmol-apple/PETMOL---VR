"""Lembretes de banho e tosa: desativar / retomar (18/10/2026)."""
import uuid
from datetime import date, datetime, timedelta, timezone

from src.db import SessionLocal
from src.notifications import Reminder
from src.pets.grooming_routine import GroomingRoutineSetting, grooming_paused
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _mk(db):
    u = User(id=str(uuid.uuid4()), email=f"gr.{uuid.uuid4().hex[:8]}@example.com", name="Tutor",
             password_hash=hash_password("x"))
    db.add(u); db.commit()
    p = Pet(id=str(uuid.uuid4()), user_id=u.id, name="Baby", species="dog")
    db.add(p); db.commit()
    return u.id, p.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}


def test_padrao_e_ativo_sem_linha(client):
    db = SessionLocal()
    try:
        uid, pid, hdr = _mk(db)
    finally:
        db.close()
    r = client.get(f"/pets/{pid}/grooming-routine", headers=hdr)
    assert r.status_code == 200 and r.json() == {"active": True, "resumed_on": None}


def test_desativar_cancela_avisos_pendentes_e_preserva_historico(client):
    db = SessionLocal()
    try:
        uid, pid, hdr = _mk(db)
        when = datetime.now(timezone.utc) + timedelta(days=3)
        db.add(Reminder(user_id=uid, pet_id=pid, type="grooming", title="t", body="b", remind_at=when))
        db.add(Reminder(user_id=uid, pet_id=pid, type="food", title="t", body="b", remind_at=when))
        db.commit()
    finally:
        db.close()
    client.post(f"/pets/{pid}/grooming", headers=hdr, json={"type": "bath", "date": "2026-09-01T12:00:00Z"})

    r = client.put(f"/pets/{pid}/grooming-routine", headers=hdr, json={"active": False})
    assert r.status_code == 200 and r.json()["active"] is False

    db = SessionLocal()
    try:
        left = [x.type for x in db.query(Reminder).filter(Reminder.pet_id == pid).all()]
        assert left == ["food"]                       # só o de banho/tosa foi cancelado
        assert grooming_paused(db, pid) is True
    finally:
        db.close()
    assert len(client.get(f"/pets/{pid}/grooming", headers=hdr).json()) == 1     # histórico intacto


def test_retomar_marca_o_dia_e_zera_a_contagem_sem_apagar_nada(client):
    db = SessionLocal()
    try:
        uid, pid, hdr = _mk(db)
    finally:
        db.close()
    client.put(f"/pets/{pid}/grooming-routine", headers=hdr, json={"active": False})
    r = client.put(f"/pets/{pid}/grooming-routine", headers=hdr, json={"active": True})
    assert r.json() == {"active": True, "resumed_on": date.today().isoformat()}
    # ligar de novo estando ativo não muda o dia de retomada
    again = client.put(f"/pets/{pid}/grooming-routine", headers=hdr, json={"active": True})
    assert again.json()["resumed_on"] == date.today().isoformat()
    db = SessionLocal()
    try:
        assert grooming_paused(db, pid) is False
    finally:
        db.close()


def test_envio_pula_aviso_de_banho_de_pet_desativado(client, monkeypatch):
    import src.notifications as notif
    db = SessionLocal()
    try:
        uid, pid, hdr = _mk(db)
        past = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.add(Reminder(user_id=uid, pet_id=pid, type="grooming", title="t", body="b", remind_at=past))
        db.add(GroomingRoutineSetting(pet_id=pid, active=False))
        db.commit()
        rid = db.query(Reminder).filter(Reminder.pet_id == pid).one().id
    finally:
        db.close()
    sent = []
    monkeypatch.setattr(notif, "push_to_user", lambda *a, **k: sent.append(a) or 1, raising=False)
    notif.send_due_reminders()
    assert sent == []
    db = SessionLocal()
    try:
        assert db.query(Reminder).filter(Reminder.id == rid).one().sent is False   # fica pendente, não é enviado
    finally:
        db.close()


def test_so_o_dono_ou_acesso_ao_pet(client):
    db = SessionLocal()
    try:
        _, pid, _ = _mk(db)
        _, _, other = _mk(db)
    finally:
        db.close()
    assert client.get(f"/pets/{pid}/grooming-routine", headers=other).status_code == 404
    assert client.put(f"/pets/{pid}/grooming-routine", headers=other, json={"active": False}).status_code == 404

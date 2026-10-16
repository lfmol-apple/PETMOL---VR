"""Rotina do pet — lembrete de passeio (16/10/2026). Tudo atrás de routine_walk_enabled."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from src.config import get_settings
from src.db import SessionLocal
from src.notifications import Reminder
from src.pets.models import Pet
from src.routine import (
    RoutineWalk, ensure_walk_reminders, next_occurrence,
)
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

UTC = timezone.utc
SP = "America/Sao_Paulo"


@pytest.fixture
def flag(monkeypatch):
    def _set(on: bool):
        monkeypatch.setenv("ROUTINE_WALK_ENABLED", "true" if on else "false")
        get_settings.cache_clear()
    _set(True)
    yield _set
    monkeypatch.delenv("ROUTINE_WALK_ENABLED", raising=False)
    get_settings.cache_clear()


def _mk(db, name="Baby"):
    u = User(id=str(uuid.uuid4()), email=f"rw.{uuid.uuid4().hex[:8]}@example.com", name="Tutor",
             password_hash=hash_password("x"))
    db.add(u); db.commit()
    p = Pet(id=str(uuid.uuid4()), user_id=u.id, name=name, species="dog")
    db.add(p); db.commit()
    return u.id, p.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}


def test_proxima_ocorrencia_respeita_dias_horario_e_fuso():
    # Sexta 16/10/2026 às 17:00 em SP (= 20:00 UTC): 18:00 de hoje ainda vem.
    now = datetime(2026, 10, 16, 20, 0, tzinfo=UTC)
    got = next_occurrence([1, 2, 3, 4, 5], ["18:00"], SP, now)
    assert got == datetime(2026, 10, 16, 21, 0, tzinfo=UTC)
    # Já passou das 18h na sexta: só segunda (sáb/dom fora).
    now = datetime(2026, 10, 16, 22, 0, tzinfo=UTC)
    got = next_occurrence([1, 2, 3, 4, 5], ["18:00"], SP, now)
    assert got == datetime(2026, 10, 19, 21, 0, tzinfo=UTC)
    # Exatamente na hora não repete o mesmo horário.
    now = datetime(2026, 10, 16, 21, 0, tzinfo=UTC)
    assert next_occurrence([5], ["18:00"], SP, now) == datetime(2026, 10, 23, 21, 0, tzinfo=UTC)


def test_varios_passeios_no_dia_escolhem_o_proximo_horario():
    todos = [1, 2, 3, 4, 5, 6, 7]
    horarios = ["07:30", "12:00", "18:00"]
    # 17:00 em SP -> o próximo é 18:00 de hoje; 18:30 -> já no dia seguinte às 07:30.
    assert next_occurrence(todos, horarios, SP, datetime(2026, 10, 16, 20, 0, tzinfo=UTC)) == datetime(2026, 10, 16, 21, 0, tzinfo=UTC)
    assert next_occurrence(todos, horarios, SP, datetime(2026, 10, 16, 21, 30, tzinfo=UTC)) == datetime(2026, 10, 17, 10, 30, tzinfo=UTC)
    # 09:00 em SP -> 12:00 do mesmo dia.
    assert next_occurrence(todos, horarios, SP, datetime(2026, 10, 16, 12, 0, tzinfo=UTC)) == datetime(2026, 10, 16, 15, 0, tzinfo=UTC)


def test_api_aceita_varios_horarios_ordena_remove_repetidos_e_limita(client, flag):
    db = SessionLocal()
    try:
        _, pid, h = _mk(db)
    finally:
        db.close()
    r = client.put(f"/pets/{pid}/routine/walk",
                   json={"enabled": True, "times": ["18:00", "07:30", "18:00"], "tz": SP}, headers=h)
    assert r.status_code == 200 and r.json()["times"] == ["07:30", "18:00"]
    r = client.get(f"/pets/{pid}/routine/walk", headers=h)
    assert r.json()["times"] == ["07:30", "18:00"]
    sete = [f"{h:02d}:00" for h in range(8, 15)]
    assert client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": sete}, headers=h).status_code == 422
    assert client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": []}, headers=h).status_code == 422


def test_minuto_qualquer_07_03_e_respeitado_no_agendamento(client, flag):
    # 07:03 em SP = 10:03 UTC; o lembrete é criado exatamente nesse minuto.
    assert next_occurrence([1, 2, 3, 4, 5, 6, 7], ["07:03"], SP, datetime(2026, 10, 16, 9, 0, tzinfo=UTC)) == datetime(2026, 10, 16, 10, 3, tzinfo=UTC)
    db = SessionLocal()
    try:
        _, pid, h = _mk(db)
    finally:
        db.close()
    r = client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": ["07:03", "19:47"], "tz": SP}, headers=h)
    assert r.status_code == 200 and r.json()["times"] == ["07:03", "19:47"]
    db = SessionLocal()
    try:
        row = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).one()  # noqa: E712
        local = row.remind_at.replace(tzinfo=UTC).astimezone(__import__("zoneinfo").ZoneInfo(SP))
        assert (local.hour, local.minute) in ((7, 3), (19, 47)) and local.second == 0
    finally:
        db.close()


def test_fuso_invalido_cai_no_padrao():
    now = datetime(2026, 10, 16, 20, 0, tzinfo=UTC)
    assert next_occurrence([1, 2, 3, 4, 5, 6, 7], ["18:00"], "Lugar/Nenhum", now) == datetime(2026, 10, 16, 21, 0, tzinfo=UTC)


def test_recurso_desligado_responde_404(client):
    db = SessionLocal()
    try:
        _, pid, h = _mk(db)
    finally:
        db.close()
    assert client.get(f"/pets/{pid}/routine/walk", headers=h).status_code == 404
    assert client.put(f"/pets/{pid}/routine/walk", json={"enabled": True}, headers=h).status_code == 404


def test_ligar_cria_um_lembrete_e_desligar_apaga(client, flag):
    db = SessionLocal()
    try:
        _, pid, h = _mk(db, "Mel")
    finally:
        db.close()
    r = client.get(f"/pets/{pid}/routine/walk", headers=h)
    assert r.status_code == 200 and r.json()["enabled"] is False

    r = client.put(f"/pets/{pid}/routine/walk",
                   json={"enabled": True, "days": [1, 2, 3, 4, 5, 6, 7], "times": ["07:30"], "tz": SP}, headers=h)
    assert r.status_code == 200 and r.json()["enabled"] is True and r.json()["times"] == ["07:30"]
    db = SessionLocal()
    try:
        rows = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).all()  # noqa: E712
        assert len(rows) == 1 and "Mel" in rows[0].title
    finally:
        db.close()

    # Mudar o horário troca o aviso pendente (nunca dois).
    client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": ["19:00"], "tz": SP}, headers=h)
    db = SessionLocal()
    try:
        assert db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).count() == 1  # noqa: E712
    finally:
        db.close()

    client.put(f"/pets/{pid}/routine/walk", json={"enabled": False}, headers=h)
    db = SessionLocal()
    try:
        assert db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).count() == 0  # noqa: E712
    finally:
        db.close()


def test_pet_de_outro_tutor_nao_acessa(client, flag):
    db = SessionLocal()
    try:
        _, pid, _ = _mk(db)
        _, _, h_outro = _mk(db)
    finally:
        db.close()
    assert client.get(f"/pets/{pid}/routine/walk", headers=h_outro).status_code in (403, 404)
    assert client.put(f"/pets/{pid}/routine/walk", json={"enabled": True}, headers=h_outro).status_code in (403, 404)


def test_horario_invalido_recusado(client, flag):
    db = SessionLocal()
    try:
        _, pid, h = _mk(db)
    finally:
        db.close()
    assert client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": ["25:99"]}, headers=h).status_code == 422


def test_job_cria_o_proximo_depois_de_enviado_e_descarta_aviso_velho(client, flag):
    db = SessionLocal()
    try:
        uid, pid, h = _mk(db)
    finally:
        db.close()
    client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": ["18:00"], "tz": SP}, headers=h)
    db = SessionLocal()
    try:
        first = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk").one()
        first.sent = True                        # o envio de sempre consumiu o aviso
        db.commit()
    finally:
        db.close()
    ensure_walk_reminders()
    db = SessionLocal()
    try:
        pend = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).all()  # noqa: E712
        assert len(pend) == 1                    # o próximo foi criado
        pend[0].remind_at = datetime.now(UTC) - timedelta(hours=3)   # API ficou fora do ar
        db.commit()
    finally:
        db.close()
    ensure_walk_reminders()                      # velho some e um novo, no futuro, entra
    db = SessionLocal()
    try:
        pend = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).all()  # noqa: E712
        assert len(pend) == 1 and pend[0].remind_at.replace(tzinfo=UTC) > datetime.now(UTC)
    finally:
        db.close()


def test_interruptor_desligado_limpa_pendentes_e_nao_envia(client, flag, monkeypatch):
    db = SessionLocal()
    try:
        _, pid, h = _mk(db)
    finally:
        db.close()
    client.put(f"/pets/{pid}/routine/walk", json={"enabled": True, "times": ["18:00"], "tz": SP}, headers=h)
    # Vence agora e o interruptor é desligado: send_due_reminders NÃO pode mandar.
    db = SessionLocal()
    try:
        r = db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk").one()
        r.remind_at = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()
    flag(False)
    sent = []
    monkeypatch.setattr("src.notifications._send_push", lambda *a, **k: sent.append(1) or (True, False))
    monkeypatch.setattr("src.notifications.push_native_ios_to_user", lambda *a, **k: sent.append(1) or 1)
    from src.notifications import send_due_reminders
    send_due_reminders()
    assert sent == []
    ensure_walk_reminders()                      # e o job limpa as linhas pendentes
    db = SessionLocal()
    try:
        assert db.query(Reminder).filter(Reminder.pet_id == pid, Reminder.type == "walk", Reminder.sent == False).count() == 0  # noqa: E712
    finally:
        db.close()

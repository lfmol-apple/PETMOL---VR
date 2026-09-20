"""send_due_reminders — um lembrete ANTIGO herdado (título/deep-link em
formato velho) não pode virar um 2º push junto do novo, para os tipos em
que o `type` já é a identidade por pet.
"""
import uuid
from datetime import datetime, timezone, timedelta

import pytest

from src.db import SessionLocal, Base, engine
import src.notifications as notif
from src.notifications import Reminder, PushSubscription


@pytest.fixture(autouse=True)
def _iso(monkeypatch):
    Base.metadata.create_all(bind=engine)
    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    monkeypatch.setattr(notif, "apns_configured", lambda: False)
    yield sent


def _sub(db, user_id):
    db.add(PushSubscription(
        id=str(uuid.uuid4()), user_id=user_id,
        endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a",
    ))
    db.commit()


def _rem(db, user_id, pet_id, rtype, title, remind_at, created_at):
    r = Reminder(
        id=str(uuid.uuid4()), user_id=user_id, pet_id=pet_id, type=rtype,
        title=title, remind_at=remind_at, sent=False, created_at=created_at,
    )
    db.add(r)
    db.commit()
    return r.id


def test_grooming_stale_plus_fresh_sends_only_one(_iso):
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    with SessionLocal() as db:
        _sub(db, uid)
        # antigo (título/formato velho) criado há 30 dias
        old_id = _rem(db, uid, pid, "grooming", "Tosa: Rex",
                      past, past - timedelta(days=30))
        # novo, criado agora, título atual
        new_id = _rem(db, uid, pid, "grooming", "✂️ Tosa: Rex",
                      past, datetime.now(timezone.utc))

    notif.send_due_reminders()

    assert len(sent) == 1  # só um push
    with SessionLocal() as db:
        assert db.query(Reminder).get(old_id).sent is True   # consumido, sem push
        assert db.query(Reminder).get(new_id).sent is True


def test_native_user_gets_only_apns_not_web(_iso, monkeypatch):
    """Usuário com token nativo ativo: lembrete só por APNs, nunca também
    Web Push (senão chega 2x — app nativo + PWA)."""
    sent_web = _iso
    apns_calls = []
    monkeypatch.setattr(notif, "apns_configured", lambda: True)
    monkeypatch.setattr(notif, "send_apns", lambda tok, payload: (apns_calls.append(tok) or (True, False)))

    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        _sub(db, uid)  # subscription WEB (PWA)
        db.add(notif.NativePushToken(id=str(uuid.uuid4()), user_id=uid, platform="ios", token="ios-tok"))
        db.commit()
        _rem(db, uid, pid, "dewormer", "🪱 Vermífugo", now - timedelta(minutes=1), now)

    notif.send_due_reminders()

    assert apns_calls == ["ios-tok"]   # foi por APNs
    assert sent_web == []              # NÃO foi por Web Push


def test_two_vaccines_different_dates_both_send(_iso):
    """vacina NÃO colapsa por (user,pet,type) — datas diferentes = eventos diferentes."""
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        _sub(db, uid)
        _rem(db, uid, pid, "vaccine", "V8", now - timedelta(minutes=2), now)
        _rem(db, uid, pid, "vaccine", "Antirrábica", now - timedelta(minutes=1), now)

    notif.send_due_reminders()
    assert len(sent) == 2


def _med(db, uid, pid, name, remind_at, created_at):
    r = Reminder(
        id=str(uuid.uuid4()), user_id=uid, pet_id=pid, type="medication",
        title="💊 Medicação", body=f"Hora de dar {name} para Baby. Toque para registrar a dose.",
        remind_at=remind_at, sent=False, created_at=created_at,
    )
    db.add(r)
    db.commit()
    return r.id


def test_medication_short_names_in_grouped_push(_iso):
    """Nomes longos cadastrados (com ' para ' no meio) viram nome curto no aviso."""
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    with SessionLocal() as db:
        _sub(db, uid)
        for i, n in enumerate([
            "Zelotril 50mg Antibacteriano para Cães e Gatos - 12 comprimidos",
            "Prediderm 5 mg Anti-inflamatório para Cães - 10 comprimidos",
            "Cistimicin Vet Suplemento Alimentar para Cães e Gatos - 30 comprimidos",
        ]):
            _med(db, uid, pid, n, past, datetime.now(timezone.utc) - timedelta(seconds=i))
    notif.send_due_reminders()
    assert len(sent) == 1
    assert sent[0]["title"].startswith("💊 Hora dos remédios")
    body = sent[0]["body"]
    assert "Zelotril 50mg" in body and "Prediderm 5 mg" in body and "Cistimicin" in body
    assert "Antibacteriano" not in body and "comprimidos" not in body


def test_four_medications_same_time_send_one_push_listing_all(_iso):
    """Antes: só 1 dos 4 remédios do mesmo horário chegava (os outros eram
    descartados como 'duplicados'). Agora: 1 aviso que lista os 4."""
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    ids = []
    with SessionLocal() as db:
        _sub(db, uid)
        for i, n in enumerate(["Zelotril 50mg", "Prediderm 5 mg", "Dipirona Gotas", "Cistimicin"]):
            ids.append(_med(db, uid, pid, n, past, datetime.now(timezone.utc) - timedelta(seconds=i)))

    notif.send_due_reminders()

    assert len(sent) == 1
    body = sent[0]["body"]
    for n in ["Zelotril 50mg", "Prediderm 5 mg", "Dipirona", "Cistimicin"]:
        assert n in body
    with SessionLocal() as db:
        assert all(db.query(Reminder).get(i).sent is True for i in ids)


def test_single_medication_keeps_its_own_text(_iso):
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    with SessionLocal() as db:
        _sub(db, uid)
        _med(db, uid, pid, "Zelotril 50mg", past, datetime.now(timezone.utc))
    notif.send_due_reminders()
    assert len(sent) == 1 and sent[0]["title"] == "💊 Medicação"
    assert "Hora de dar Zelotril 50mg para Baby" in sent[0]["body"]


def test_same_medication_twice_is_still_deduplicated(_iso):
    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    with SessionLocal() as db:
        _sub(db, uid)
        _med(db, uid, pid, "Zelotril 50mg", past, datetime.now(timezone.utc))
        _med(db, uid, pid, "Zelotril 50mg", past, datetime.now(timezone.utc) - timedelta(seconds=5))
    notif.send_due_reminders()
    assert len(sent) == 1 and "Zelotril 50mg" in sent[0]["body"]


def test_medication_without_destination_is_kept_for_retry_then_dropped(_iso, monkeypatch):
    """Sem destino ativo o lembrete de remédio não é descartado na hora; passada
    a janela de 2h, é consumido para não acumular."""
    monkeypatch.setattr(notif, "apns_configured", lambda: True)  # canal existe, mas o usuário não tem token
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    recente = datetime.now(timezone.utc) - timedelta(minutes=3)
    velho = datetime.now(timezone.utc) - timedelta(hours=3)
    with SessionLocal() as db:
        novo = _med(db, uid, pid, "Zelotril 50mg", recente, datetime.now(timezone.utc))
        antigo = _med(db, str(uuid.uuid4()), str(uuid.uuid4()), "Prediderm", velho, datetime.now(timezone.utc))

    notif.send_due_reminders()

    with SessionLocal() as db:
        assert db.query(Reminder).get(novo).sent is False    # tenta de novo
        assert db.query(Reminder).get(antigo).sent is True   # janela de 2h passou


def test_push_test_opens_medication_when_user_has_active_medication(monkeypatch, client):
    """O 'Enviar teste' do Perfil leva ao sheet da Medicação quando há remédio ativo."""
    from src.events.models import Event
    from src.pets.models import Pet

    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    monkeypatch.setattr(notif, "apns_configured", lambda: False)

    cid = "cid-push-test-med"
    su = client.post("/auth/signup", json={"name": "Tutor Teste", "email": "push.test.med@example.com", "password": "senha123", "terms_accepted": True},
                     headers={"X-PETMOL-CLIENT-ID": cid})
    assert su.status_code in (200, 201), su.text
    login = client.post("/auth/login", json={"email": "push.test.med@example.com", "password": "senha123"},
                        headers={"X-PETMOL-CLIENT-ID": cid})
    token = login.json()["access_token"]
    h = {"X-PETMOL-CLIENT-ID": cid, "Authorization": f"Bearer {token}"}
    uid = client.get("/auth/me", headers=h).json()["id"]
    pet = client.post("/pets", json={"name": "Baby", "species": "dog"}, headers=h).json()
    pid = pet.get("id") or pet.get("pet_id")

    with SessionLocal() as db:
        _sub(db, uid)
        db.add(Event(id=str(uuid.uuid4()), user_id=uid, pet_id=pid, type="medicacao", title="Dipirona",
                     status="active", scheduled_at=datetime.now(timezone.utc)))
        db.commit()

    r = client.post("/notifications/test", headers=h)
    assert r.status_code == 200, r.text
    assert sent and sent[0]["data"]["url"].startswith(f"/home?modal=medication&petId={pid}&eventId=")
    assert "Medicação de Baby" in sent[0]["body"]


def test_grouped_medication_push_deep_link_carries_event_ids(_iso):
    """O toque leva ao(s) remédio(s) do aviso: eventId=<id1>,<id2>."""
    from src.events.models import Event

    sent = _iso
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    past = datetime.now(timezone.utc) - timedelta(minutes=1)
    ev_ids = []
    with SessionLocal() as db:
        _sub(db, uid)
        for i, n in enumerate(["Zelotril 50mg", "Prediderm 5 mg"]):
            e = Event(id=str(uuid.uuid4()), user_id=uid, pet_id=pid, type="medicacao", title=n,
                      status="active", scheduled_at=datetime.now(timezone.utc))
            db.add(e); db.commit(); ev_ids.append(e.id)
            r = Reminder(id=str(uuid.uuid4()), user_id=uid, pet_id=pid, type="medication", title=f"💊 {n}",
                         body=f"Hora de dar {n} para Baby. Toque para registrar a dose.",
                         remind_at=past, sent=False, created_at=datetime.now(timezone.utc) - timedelta(seconds=i))
            db.add(r); db.commit()
    notif.send_due_reminders()
    assert len(sent) == 1
    url = sent[0]["data"]["url"]
    assert url.startswith(f"/home?modal=medication&petId={pid}&eventId=")
    assert set(url.split("eventId=")[1].split(",")) == set(ev_ids)


def test_lost_medication_reminder_alerts_admin_by_email(_iso, monkeypatch):
    """Remédio sem destino por mais de 2h: consome E avisa o admin por e-mail."""
    monkeypatch.setattr(notif, "apns_configured", lambda: True)
    mails = []
    monkeypatch.setattr("src.mailer.send_mail", lambda **kw: mails.append(kw) or True)
    uid, pid = str(uuid.uuid4()), str(uuid.uuid4())
    velho = datetime.now(timezone.utc) - timedelta(hours=3)
    with SessionLocal() as db:
        _med(db, uid, pid, "Zelotril 50mg", velho, datetime.now(timezone.utc))
    notif.send_due_reminders()
    assert len(mails) == 1
    assert "não entregue" in mails[0]["subject"] and "Zelotril 50mg" in mails[0]["body_text"]

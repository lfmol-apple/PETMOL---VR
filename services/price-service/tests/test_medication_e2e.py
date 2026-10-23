"""Ciclo completo da medicação, pela API real: cadastro (todas as frequências),
lembretes do servidor, envio/agrupamento, toque (deep link), dose aplicada/pulada,
conclusão, cancelamento e exclusão."""
import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest

import src.notifications as notif
from src.db import SessionLocal
from src.notifications import MedicationLostNotice, PushSubscription, Reminder
from src.notifications.medication_sync import reconcile_medication_reminders

BRT = timezone(timedelta(hours=-3))


@pytest.fixture()
def ctx(client, monkeypatch):
    sent = []
    monkeypatch.setattr(notif, "_send_push", lambda sub, payload: (sent.append(payload) or (True, False)))
    monkeypatch.setattr(notif, "apns_configured", lambda: False)
    email = f"med.e2e.{uuid.uuid4().hex[:8]}@example.com"
    # client-id único por teste (não um CID fixo de módulo) — o rate limiter
    # de /auth/signup agrupa por X-PETMOL-CLIENT-ID (5 req/300s); um CID
    # compartilhado por todo o arquivo tropeça sozinho quando o arquivo passa
    # de 5 testes que usam `ctx` (achado real ao adicionar o 6º, 11/10/2026).
    h0 = {"X-PETMOL-CLIENT-ID": f"cid-med-e2e-{uuid.uuid4().hex[:8]}"}
    su = client.post("/auth/signup", json={"name": "Tutor E2E", "email": email, "password": "senha123", "terms_accepted": True}, headers=h0)
    assert su.status_code in (200, 201), su.text
    tok = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=h0).json()["access_token"]
    h = {**h0, "Authorization": f"Bearer {tok}"}
    uid = client.get("/auth/me", headers=h).json()["id"]
    pet = client.post("/pets", json={"name": "Baby", "species": "dog"}, headers=h).json()
    pid = pet.get("id") or pet.get("pet_id")
    with SessionLocal() as db:
        db.add(PushSubscription(id=str(uuid.uuid4()), user_id=uid, endpoint=f"https://push.example/{uid}", p256dh="k", auth="a"))
        db.commit()
    return type("C", (), {"client": client, "h": h, "uid": uid, "pid": pid, "sent": sent})


def _create(c, title, extra, start_hhmm="00:00"):
    start = datetime.now(BRT).replace(hour=0, minute=0, second=0, microsecond=0)
    r = c.client.post("/events", headers=c.h, json={
        "pet_id": c.pid, "type": "medicacao", "title": title, "status": "active", "source": "manual",
        "scheduled_at": start.astimezone(timezone.utc).isoformat(),
        "next_due_date": start.astimezone(timezone.utc).isoformat(),
        "extra_data": json.dumps(extra),
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _reminders(c, title=None):
    with SessionLocal() as db:
        q = db.query(Reminder).filter(Reminder.pet_id == c.pid, Reminder.type == "medication")
        rows = q.all()
        return [r for r in rows if title is None or title in (r.title or "")]


def _due_now(c):
    """Simula a passagem do tempo: todos os lembretes pendentes ficam vencidos."""
    with SessionLocal() as db:
        for r in db.query(Reminder).filter(Reminder.pet_id == c.pid, Reminder.sent == False):  # noqa: E712
            r.remind_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()


def _aware(dt):
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _now_hhmm_plus(minutes):
    return (datetime.now(BRT) + timedelta(minutes=minutes)).strftime("%H:%M")


def test_lifecycle_all_frequencies_and_notifications(ctx):
    c = ctx
    t = _now_hhmm_plus(30)
    ids = {
        "Zelotril 50mg": _create(c, "Zelotril 50mg Antibacteriano para Cães", {"frequency_mode": "vezes_dia", "times_per_day": 1, "first_dose_time": t, "reminder_times": [t], "treatment_days": 10}),
        "Prediderm 5 mg": _create(c, "Prediderm 5 mg Anti-inflamatório para Cães", {"frequency_mode": "vezes_dia", "times_per_day": 1, "first_dose_time": t, "reminder_times": [t], "treatment_days": 7}),
        "Dipirona": _create(c, "Dipirona Gotas para Cães", {"frequency_mode": "intervalo", "interval_minutes": 480, "first_dose_time": t, "reminder_times": [t], "treatment_days": 7}),
        "Reforço": _create(c, "Reforço vermífugo", {"frequency_mode": "intervalo_dias", "custom_interval_days": 15, "total_doses": 2, "first_dose_time": t, "reminder_times": [t]}),
        "SOS": _create(c, "Analgésico SOS", {"frequency_mode": "conforme_necessidade"}),
    }

    # 1) o servidor cria os lembretes (o app não criou nenhum)
    assert _reminders(c) == []
    assert reconcile_medication_reminders() >= 3
    assert _reminders(c, "Analgésico SOS") == []           # SOS nunca gera lembrete
    assert reconcile_medication_reminders() == 0            # idempotente

    # 2) tempo passa: os 4 remédios do mesmo minuto viram UM aviso com todos os nomes
    _due_now(c)
    notif.send_due_reminders()
    assert len(c.sent) == 1, [p["body"] for p in c.sent]
    body = c.sent[0]["body"]
    for nome in ("Zelotril 50mg", "Prediderm 5 mg", "Dipirona", "Reforço"):
        assert nome in body, body
    # 3) toque: deep link com os eventIds dos remédios do aviso
    url = c.sent[0]["data"]["url"]
    assert url.startswith(f"/home?modal=medication&petId={c.pid}&eventId=")
    assert set(url.split("eventId=")[1].split(",")) == {ids["Zelotril 50mg"], ids["Prediderm 5 mg"], ids["Dipirona"], ids["Reforço"]}
    # 4) tudo dado como enviado; nada fica pendente para repetir
    assert all(r.sent for r in _reminders(c) if _aware(r.remind_at) <= datetime.now(timezone.utc))

    # 5) aplicar dose de hoje: o slot não gera mais lembrete
    hoje = datetime.now(BRT).strftime("%Y-%m-%d")
    r = c.client.post(f"/events/{ids['Zelotril 50mg']}/apply-dose", headers=c.h, json={"date": hoje})
    assert r.status_code == 200, r.text
    assert hoje in json.loads(r.json()["extra_data"])["applied_dates"]

    # 6) pular dose e desfazer
    r = c.client.post(f"/events/{ids['Prediderm 5 mg']}/skip-dose", headers=c.h, json={"date": hoje})
    assert r.status_code == 200, r.text
    r = c.client.post(f"/events/{ids['Prediderm 5 mg']}/unskip-dose", headers=c.h, json={"date": hoje})
    assert r.status_code == 200, r.text


def test_completed_cancelled_deleted_never_remind(ctx):
    c = ctx
    t = _now_hhmm_plus(30)
    base = {"frequency_mode": "vezes_dia", "times_per_day": 1, "first_dose_time": t, "reminder_times": [t], "treatment_days": 3}
    done, cancelled, deleted = (_create(c, n, dict(base)) for n in ("Concluído", "Cancelado", "Excluído"))

    assert c.client.patch(f"/events/{cancelled}", headers=c.h, json={"status": "cancelled"}).status_code == 200
    assert c.client.delete(f"/events/{deleted}", headers=c.h).status_code == 204
    # conclui: todas as 3 doses aplicadas
    hoje = datetime.now(BRT).date()
    for i in range(3):
        d = (hoje + timedelta(days=i)).strftime("%Y-%m-%d")
        assert c.client.post(f"/events/{done}/apply-dose", headers=c.h, json={"date": d}).status_code == 200
    ev = c.client.get(f"/events/{done}", headers=c.h).json()
    assert ev["status"] == "completed"

    reconcile_medication_reminders()
    assert _reminders(c) == []


def test_reminder_falls_back_and_tries_again_without_destination(ctx, monkeypatch):
    """Sem nenhum destino ativo o lembrete de remédio NÃO é descartado na hora."""
    c = ctx
    with SessionLocal() as db:
        db.query(PushSubscription).filter(PushSubscription.user_id == c.uid).delete()
        db.commit()
    monkeypatch.setattr(notif, "apns_configured", lambda: True)  # canal existe, mas o tutor não tem token
    t = _now_hhmm_plus(30)
    _create(c, "Zelotril 50mg", {"frequency_mode": "vezes_dia", "times_per_day": 1, "first_dose_time": t, "reminder_times": [t], "treatment_days": 5})
    reconcile_medication_reminders()
    _due_now(c)
    notif.send_due_reminders()
    assert any(not r.sent for r in _reminders(c) if _aware(r.remind_at) <= datetime.now(timezone.utc))


def test_reminder_without_destination_after_2h_notifies_tutor(ctx, monkeypatch):
    """Achado real (11/10/2026): 4 tutores com conta nova nunca tinham
    registrado push em nenhum canal — o único aviso ia pro admin, ninguém
    avisava o próprio tutor. Depois de 2h sem destino, além do e-mail interno
    (_alert_admin_medication_lost) agora também sai um e-mail pro tutor
    citando o remédio específico (_notify_tutor_medication_lost)."""
    c = ctx
    with SessionLocal() as db:
        db.query(PushSubscription).filter(PushSubscription.user_id == c.uid).delete()
        db.commit()
    monkeypatch.setattr(notif, "apns_configured", lambda: True)  # canal existe, mas o tutor não tem token

    sent_mails = []
    monkeypatch.setattr("src.mailer.send_mail", lambda **kw: (sent_mails.append(kw) or True))

    t = _now_hhmm_plus(30)
    _create(c, "Apoquel 16mg", {"frequency_mode": "vezes_dia", "times_per_day": 1, "first_dose_time": t, "reminder_times": [t], "treatment_days": 5})
    reconcile_medication_reminders()
    with SessionLocal() as db:
        for r in db.query(Reminder).filter(Reminder.pet_id == c.pid, Reminder.sent == False):  # noqa: E712
            r.remind_at = datetime.now(timezone.utc) - timedelta(hours=2, minutes=1)
        db.commit()

    notif.send_due_reminders()

    assert all(r.sent for r in _reminders(c))
    # 1 e-mail pro admin (_alert_admin_medication_lost) + 1 pro tutor (_notify_tutor_medication_lost)
    assert len(sent_mails) == 2, sent_mails
    admin_mail = next(m for m in sent_mails if "não entregue" in m["subject"])
    tutor_mail = next(m for m in sent_mails if m is not admin_mail)
    assert tutor_mail["to"] == c.client.get("/auth/me", headers=c.h).json()["email"]
    assert "Baby" in tutor_mail["subject"]
    assert "Apoquel" in tutor_mail["subject"]
    assert "Ativar notificações" in tutor_mail["body_text"]
    assert tutor_mail.get("body_html") and "Apoquel" in tutor_mail["body_html"]
    # Cada aviso fica gravado (o histórico do mailer vive só na memória).
    with SessionLocal() as db:
        notices = db.query(MedicationLostNotice).filter(MedicationLostNotice.user_id == c.uid).all()
    assert sorted(n.audience for n in notices) == ["admin", "tutor"]
    assert all(n.email_ok and "Apoquel" in (n.medications or "") and n.pet_id == c.pid for n in notices)


def test_lost_notice_records_failed_email(ctx, monkeypatch):
    """Se o servidor de e-mail recusar, o registro marca email_ok=False."""
    c = ctx
    with SessionLocal() as db:
        db.query(PushSubscription).filter(PushSubscription.user_id == c.uid).delete()
        db.commit()
    monkeypatch.setattr(notif, "apns_configured", lambda: True)
    monkeypatch.setattr("src.mailer.send_mail", lambda **kw: False)

    t = _now_hhmm_plus(30)
    _create(c, "Apoquel 16mg", {"frequency_mode": "vezes_dia", "times_per_day": 1, "first_dose_time": t, "reminder_times": [t], "treatment_days": 5})
    reconcile_medication_reminders()
    with SessionLocal() as db:
        for r in db.query(Reminder).filter(Reminder.pet_id == c.pid, Reminder.sent == False):  # noqa: E712
            r.remind_at = datetime.now(timezone.utc) - timedelta(hours=2, minutes=1)
        db.commit()
    notif.send_due_reminders()

    with SessionLocal() as db:
        notices = db.query(MedicationLostNotice).filter(MedicationLostNotice.user_id == c.uid).all()
    assert len(notices) == 2 and not any(n.email_ok for n in notices)


def test_deleting_medication_event_purges_its_pending_reminders(ctx):
    """DELETE /events/{id} de uma medicação apaga os lembretes pendentes dela
    (achado real: dono excluiu o remédio, aviso continuou chegando)."""
    c = ctx
    t = _now_hhmm_plus(30)
    eid = _create(c, "Meloxinew 1mg", {"frequency_mode": "intervalo", "interval_minutes": 480, "first_dose_time": t, "reminder_times": [t], "treatment_days": 10})
    reconcile_medication_reminders()
    assert _reminders(c, "Meloxinew 1mg") != []

    r = c.client.delete(f"/events/{eid}", headers=c.h)
    assert r.status_code == 204, r.text
    assert _reminders(c, "Meloxinew 1mg") == []

    _due_now(c)
    notif.send_due_reminders()
    assert c.sent == []


def test_list_events_order_is_stable_when_scheduled_at_ties(ctx):
    """Achado real (28/09/2026): duas medicações cadastradas juntas caem no
    mesmo scheduled_at (`_create` usa meia-noite do dia atual) — sem um 2º
    critério de ordenação, o Postgres não garante a mesma ordem entre uma
    consulta e outra, e os cartões de "Medicamentos Ativos"/"Tratamento em
    Andamento" trocavam de posição na tela sem nenhuma mudança de dados."""
    c = ctx
    id_a = _create(c, "Prediderm 5mg", {"frequency_mode": "vezes_dia", "times_per_day": 1, "treatment_days": 3})
    id_b = _create(c, "Analgésico Cronidor", {"frequency_mode": "vezes_dia", "times_per_day": 3, "treatment_days": 5})
    id_c = _create(c, "Dipirona Gotas", {"frequency_mode": "vezes_dia", "times_per_day": 3, "treatment_days": 5})

    orders = set()
    for _ in range(5):
        r = c.client.get("/events", headers=c.h, params={"pet_id": c.pid})
        assert r.status_code == 200, r.text
        ids = [ev["id"] for ev in r.json() if ev["id"] in (id_a, id_b, id_c)]
        assert len(ids) == 3
        orders.add(tuple(ids))

    assert len(orders) == 1, f"ordem instável entre chamadas: {orders}"

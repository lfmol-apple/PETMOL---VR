"""Campanha de ativação — degrau Alimentação (28/09/2026).

Segmento: tutores com pelo menos 1 pet, NENHUM com alimentação configurada.
Quem tem push ativo recebe push+e-mail; quem não tem recebe só e-mail.
Disparo único e manual — sem tracking de "já mandei", por decisão do dono.
"""
import time
import uuid

from src.config import get_settings
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import PushSubscription
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password

TOKEN = "campanha-teste-token"
READONLY_KEY = "campanha-teste-readonly"


def _enable_token(monkeypatch, token: str = TOKEN) -> None:
    monkeypatch.setenv("COMMS_OPS_TRIGGER_TOKEN", token)
    monkeypatch.setenv("ADMIN_OPS_API_KEY", READONLY_KEY)
    get_settings.cache_clear()


def _mk_user(db, *, email: str, name: str) -> str:
    u = User(id=str(uuid.uuid4()), email=email, name=name, password_hash=hash_password("x"))
    db.add(u)
    db.commit()
    return u.id


def _mk_pet(db, *, user_id: str, name: str) -> str:
    p = Pet(id=str(uuid.uuid4()), user_id=user_id, name=name, species="dog")
    db.add(p)
    db.commit()
    return p.id


def _mk_feeding(db, *, pet_id: str) -> None:
    db.add(FeedingPlan(id=str(uuid.uuid4()), pet_id=pet_id, species="dog", country_code="BR", food_brand="Golden"))
    db.commit()


def _mk_push_subscription(db, *, user_id: str) -> None:
    db.add(PushSubscription(
        id=str(uuid.uuid4()), user_id=user_id,
        endpoint=f"https://push.example/{user_id}", p256dh="k", auth="a",
    ))
    db.commit()


def _wait_done(client, timeout=5.0):
    status_headers = {"X-Admin-Api-Key": READONLY_KEY}
    deadline = time.time() + timeout
    while time.time() < deadline:
        r = client.get("/v1/admin/campaigns/food-activation/status", headers=status_headers)
        assert r.status_code == 200, r.text
        if r.json()["phase"] in ("done", "error"):
            return r.json()
        time.sleep(0.05)
    raise AssertionError("campanha não terminou a tempo")


def test_sem_token_recusa_com_401(client):
    r = client.post("/v1/admin/campaigns/food-activation/run", json={}, headers={"X-Sync-Token": "qualquer"})
    assert r.status_code == 401


def test_token_errado_recusa_com_401(monkeypatch, client):
    _enable_token(monkeypatch)
    r = client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": True},
                     headers={"X-Sync-Token": "errado"})
    assert r.status_code == 401


def test_dry_run_conta_certo_e_nao_envia_nada(monkeypatch, client):
    """3 tutores: 1 já tem alimentação (fora), 1 sem alimentação + push (push+email),
    1 sem alimentação sem push (só email). dry_run=true não manda nada de verdade."""
    _enable_token(monkeypatch)
    sent = {"email": [], "push": []}
    monkeypatch.setattr("src.admin.activation_campaign_router.send_mail",
                        lambda **kw: sent["email"].append(kw) or True)
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user",
                        lambda uid, payload: sent["push"].append((uid, payload)) or 1)

    db = SessionLocal()
    try:
        uid_ok = _mk_user(db, email=f"ok.{uuid.uuid4().hex[:6]}@example.com", name="Tutor Ok")
        pid_ok = _mk_pet(db, user_id=uid_ok, name="Rex")
        _mk_feeding(db, pet_id=pid_ok)

        uid_push = _mk_user(db, email=f"push.{uuid.uuid4().hex[:6]}@example.com", name="Tutor Push")
        _mk_pet(db, user_id=uid_push, name="Baby")
        _mk_push_subscription(db, user_id=uid_push)

        uid_nopush = _mk_user(db, email=f"nopush.{uuid.uuid4().hex[:6]}@example.com", name="Tutor Sem Push")
        _mk_pet(db, user_id=uid_nopush, name="Nina")
    finally:
        db.close()

    headers = {"X-Sync-Token": TOKEN}
    r = client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": True}, headers=headers)
    assert r.status_code == 200, r.text
    assert r.json()["started"] is True

    status = _wait_done(client)
    result = status["result"]
    assert result["dry_run"] is True
    assert result["push_and_email"] >= 1
    assert result["email_only"] >= 1
    # nada de verdade foi enviado em dry run
    assert sent["email"] == []
    assert sent["push"] == []


def test_send_de_verdade_manda_push_e_email_pro_grupo_certo(monkeypatch, client):
    _enable_token(monkeypatch)
    sent = {"email": [], "push": []}
    monkeypatch.setattr("src.admin.activation_campaign_router.send_mail",
                        lambda **kw: sent["email"].append(kw) or True)
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user",
                        lambda uid, payload: sent["push"].append((uid, payload)) or 1)

    db = SessionLocal()
    try:
        uid_push = _mk_user(db, email=f"push2.{uuid.uuid4().hex[:6]}@example.com", name="Ana Push")
        _mk_pet(db, user_id=uid_push, name="Thor")
        _mk_push_subscription(db, user_id=uid_push)

        uid_nopush = _mk_user(db, email=f"nopush2.{uuid.uuid4().hex[:6]}@example.com", name="Beto Sem Push")
        _mk_pet(db, user_id=uid_nopush, name="Mel")
    finally:
        db.close()

    headers = {"X-Sync-Token": TOKEN}
    r = client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False}, headers=headers)
    assert r.status_code == 200, r.text

    status = _wait_done(client)
    result = status["result"]
    assert result["dry_run"] is False

    # os dois tutores (push e sem push) recebem e-mail
    emails_sent_to = {e["to"] for e in sent["email"]}
    assert any("push2" in addr for addr in emails_sent_to)
    assert any("nopush2" in addr for addr in emails_sent_to)
    # só quem tem push recebe push
    push_recipients = {uid for uid, _ in sent["push"]}
    assert uid_push in push_recipients
    assert uid_nopush not in push_recipients
    # o texto do e-mail usa o nome do pet
    thor_email = next(e for e in sent["email"] if "push2" in e["to"])
    assert "Thor" in thor_email["body_text"]


def test_pet_com_alimentacao_configurada_nao_entra_na_campanha(monkeypatch, client):
    _enable_token(monkeypatch)
    sent_emails = []
    monkeypatch.setattr("src.admin.activation_campaign_router.send_mail",
                        lambda **kw: sent_emails.append(kw["to"]) or True)
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user", lambda uid, payload: 0)

    db = SessionLocal()
    try:
        email = f"completo.{uuid.uuid4().hex[:6]}@example.com"
        uid = _mk_user(db, email=email, name="Tutor Completo")
        pid = _mk_pet(db, user_id=uid, name="Completo")
        _mk_feeding(db, pet_id=pid)
    finally:
        db.close()

    headers = {"X-Sync-Token": TOKEN}
    client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False}, headers=headers)
    _wait_done(client)
    assert email not in sent_emails

"""Campanha de ativação — degrau Alimentação (28/09/2026).

Segmento: tutores com pelo menos 1 pet, NENHUM com alimentação configurada.
Desde 16/10/2026 (decisão do dono) a campanha é SÓ PUSH: quem não tem push não recebe nada
(nenhum e-mail de campanha sai mais) e as campanhas só de e-mail respondem 410.
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
    """3 tutores: 1 já tem alimentação (fora), 1 sem alimentação + push (entra),
    1 sem alimentação sem push (ignorado). dry_run=true não manda nada de verdade."""
    _enable_token(monkeypatch)
    sent = {"push": []}
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
    assert result["total"] >= 1
    assert result["sem_aviso_ignorados"] >= 1
    assert "email_only" not in result and "push_and_email" not in result
    # nada de verdade foi enviado em dry run
    assert sent["push"] == []


def test_send_de_verdade_manda_so_push_e_so_para_quem_tem_aviso(monkeypatch, client):
    _enable_token(monkeypatch)
    sent = {"push": []}
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

    # só quem tem push recebe push; quem não tem não recebe NADA (nenhum e-mail)
    push_recipients = {uid for uid, _ in sent["push"]}
    assert uid_push in push_recipients
    assert uid_nopush not in push_recipients
    assert result["sent_push"] >= 1
    assert not any("email" in k for k in result)


def _mk_event(db, *, user_id: str, days_ago: float):
    from datetime import datetime, timedelta, timezone
    from src.analytics.models import AnalyticsProductEvent
    db.add(AnalyticsProductEvent(
        event_id=str(uuid.uuid4()), user_id=user_id, anonymous_id=str(uuid.uuid4()),
        session_id=str(uuid.uuid4()), event_name="app_open", platform="web",
        received_at=datetime.now(timezone.utc) - timedelta(days=days_ago),
    ))
    db.commit()


def test_pet_com_alimentacao_configurada_nao_entra_na_campanha(monkeypatch, client):
    _enable_token(monkeypatch)
    pushed = []
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user",
                        lambda uid, payload: pushed.append(uid) or 1)

    db = SessionLocal()
    try:
        email = f"completo.{uuid.uuid4().hex[:6]}@example.com"
        uid = _mk_user(db, email=email, name="Tutor Completo")
        pid = _mk_pet(db, user_id=uid, name="Completo")
        _mk_push_subscription(db, user_id=uid)
        _mk_feeding(db, pet_id=pid)
    finally:
        db.close()

    headers = {"X-Sync-Token": TOKEN}
    client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False}, headers=headers)
    _wait_done(client)
    assert uid not in pushed


def test_campanhas_so_de_email_respondem_410_com_token_e_401_sem_token(monkeypatch, client):
    _enable_token(monkeypatch)
    h = {"X-Sync-Token": TOKEN}
    assert client.post("/v1/admin/campaigns/push-location-activation/run", json={"dry_run": False}, headers=h).status_code == 410
    assert client.post("/v1/admin/campaigns/push-second-chance/run", json={"dry_run": False}, headers=h).status_code == 410
    assert client.post("/v1/admin/campaigns/push-location-activation/preview", json={"to": "a@b.com", "tutor_name": "X", "pet_names": []}, headers=h).status_code == 410
    assert client.post("/v1/admin/campaigns/push-second-chance/run", json={"dry_run": False}, headers={"X-Sync-Token": "errado"}).status_code == 401


def test_push_location_preview_sem_token_recusa_com_401(client):
    r = client.post("/v1/admin/campaigns/push-location-activation/preview",
                     json={"to": "qualquer@example.com"}, headers={"X-Sync-Token": "errado"})
    assert r.status_code == 401


def test_food_registra_contato_e_segundo_disparo_nao_repete(monkeypatch, client):
    _enable_token(monkeypatch)
    sent = {"push": []}
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user",
                        lambda uid, payload: sent["push"].append((uid, payload)) or 1)
    db = SessionLocal()
    try:
        uid = _mk_user(db, email=f"rep.{uuid.uuid4().hex[:6]}@example.com", name="Rita")
        pet_id = _mk_pet(db, user_id=uid, name="Bolt")
        _mk_push_subscription(db, user_id=uid)
    finally:
        db.close()

    headers = {"X-Sync-Token": TOKEN}
    assert client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False}, headers=headers).status_code == 200
    first = _wait_done(client)["result"]
    assert first["sent_push"] == 1 and "sent_email" not in first
    # o toque no push abre a Alimentação do pet
    assert sent["push"][0][1]["data"]["url"] == f"/home?modal=food&petId={pet_id}"

    # segundo disparo logo em seguida: ninguém repetido
    sent["push"].clear()
    assert client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False}, headers=headers).status_code == 200
    second = _wait_done(client)["result"]
    assert second["skipped_recent"] >= 1
    assert sent["push"] == []


def test_food_preview_e_conversion(monkeypatch, client):
    _enable_token(monkeypatch)
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user", lambda uid, payload: 1)
    db = SessionLocal()
    try:
        uid = _mk_user(db, email=f"conv.{uuid.uuid4().hex[:6]}@example.com", name="Caio")
        pet_id = _mk_pet(db, user_id=uid, name="Nina")
        _mk_push_subscription(db, user_id=uid)
    finally:
        db.close()
    ro = {"X-Admin-Api-Key": READONLY_KEY}
    pre = client.get("/v1/admin/campaigns/food-activation/preview", headers=ro).json()
    assert pre["eligible"] >= 1 and "email_only" not in pre

    client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False}, headers={"X-Sync-Token": TOKEN})
    _wait_done(client)
    assert client.get("/v1/admin/campaigns/food-activation/conversion", headers=ro).json()["converted"] == 0

    db = SessionLocal()
    try:
        _mk_feeding(db, pet_id=pet_id)   # depois do envio, o tutor cadastra a ração
    finally:
        db.close()
    conv = client.get("/v1/admin/campaigns/food-activation/conversion", headers=ro).json()
    assert conv["contacted_total"] >= 1 and conv["converted"] >= 1


def test_food_email_texto_final_e_concordancia_no_plural():
    from src.admin.activation_campaign_router import _email_copy
    subject, body = _email_copy("Karen Reis", ["Mel"])
    assert subject == "Ainda falta cadastrar a ração do seu pet no PETMOL"
    assert body.startswith("Oi Karen, vimos que Mel ainda não tem a ração cadastrada no PETMOL.")
    assert body.endswith('E não se esqueça, ative as notificações!')
    _, plural = _email_copy("Priscila", ["Vianna", "Vanda Juliane"])
    assert "ainda não têm a ração" in plural


def test_food_push_texto_e_variacoes_de_pets():
    from src.admin.activation_campaign_router import _push_payload
    one = _push_payload(["Mel"], "p1")
    assert one["title"] == "Mel confia em você 🐾"
    assert one["body"] == "Cadastre a ração e a gente avisa antes de acabar. Leva 1 minuto."
    assert one["data"]["url"] == "/home?modal=food&petId=p1"
    assert _push_payload(["Vianna", "Vanda"], "p")["title"] == "Vianna e Vanda confiam em você 🐾"
    assert _push_payload(["A", "B", "C"], "p")["title"] == "Seus pets confiam em você 🐾"
    assert _push_payload([], None)["title"] == "Seu pet confia em você 🐾"


def test_food_results_mede_janela_antes_e_depois_e_controle(monkeypatch, client):
    from datetime import datetime, timedelta, timezone
    from src.admin.activation_campaign_router import (
        CAMPAIGN_FOOD, CAMPAIGN_FOOD_HOLDOUT, ActivationCampaignContact,
    )
    _enable_token(monkeypatch)
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        sent = now - timedelta(days=3)
        ids = {}
        for key in ("t_ok", "t_late", "t_none", "c_ok", "c_none"):
            uid = _mk_user(db, email=f"{key}.{uuid.uuid4().hex[:6]}@example.com", name=key)
            ids[key] = (uid, _mk_pet(db, user_id=uid, name=key))
            db.add(ActivationCampaignContact(
                campaign=CAMPAIGN_FOOD if key.startswith("t_") else CAMPAIGN_FOOD_HOLDOUT,
                user_id=uid, sent_at=sent))
        db.commit()
        # t_ok e c_ok cadastram a ração 1 dia depois do envio; t_late só 10 dias depois (fora da janela de 7)
        for key, delta in (("t_ok", 1), ("c_ok", 1), ("t_late", 10)):
            _mk_feeding(db, pet_id=ids[key][1])
            from src.health.models import FeedingPlan
            plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == ids[key][1]).first()
            plan.created_at = sent + timedelta(days=delta)
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/campaigns/food-activation/results", headers={"X-Admin-Api-Key": READONLY_KEY})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["contacted"]["total"] == 3 and body["holdout"]["total"] == 2
    assert body["contacted"]["converted_window"] == 1      # t_ok; t_late ficou fora da janela
    assert body["holdout"]["converted_window"] == 1        # c_ok
    assert body["contacted"]["converted_total"] == 2       # t_ok + t_late (hoje têm ração)
    assert body["lift_vs_holdout"] == round(1 / 3 - 1 / 2, 4)
    assert body["series"] and body["first_sent_at"]


def test_food_holdout_100_nao_envia_e_registra_controle(monkeypatch, client):
    _enable_token(monkeypatch)
    sent = {"push": []}
    monkeypatch.setattr("src.admin.activation_campaign_router.push_to_user", lambda uid, payload: sent["push"].append(uid) or 1)
    db = SessionLocal()
    try:
        uid = _mk_user(db, email=f"hold.{uuid.uuid4().hex[:6]}@example.com", name="Helena")
        _mk_pet(db, user_id=uid, name="Luma")
    finally:
        db.close()
    r = client.post("/v1/admin/campaigns/food-activation/run", json={"dry_run": False, "holdout_pct": 100},
                    headers={"X-Sync-Token": TOKEN})
    assert r.status_code == 200 and r.json()["holdout_pct"] == 100
    result = _wait_done(client)["result"]
    assert result["total"] == 0 and result["holdout"] >= 1
    assert sent["push"] == []
    res = client.get("/v1/admin/campaigns/food-activation/results", headers={"X-Admin-Api-Key": READONLY_KEY}).json()
    assert res["holdout"]["total"] >= 1


def _set_created(db, user_id, days_ago):
    from datetime import datetime, timedelta, timezone
    u = db.query(User).filter(User.id == user_id).first()
    u.created_at = datetime.now(timezone.utc) - timedelta(days=days_ago)
    db.commit()


def test_segunda_chance_texto_plural_e_sem_nome():
    from src.admin.activation_campaign_router import _email_copy_push_second
    s, t, h = _email_copy_push_second("Priscila Silva", ["Vianna", "Vanda Juliane"])
    assert "Vianna e Vanda Juliane" in s and "sumirem" in t and "Oi, Priscila!" in t
    s2, t2, _ = _email_copy_push_second(None, [])
    assert "seu pet" in s2 and t2.startswith("Oi!")



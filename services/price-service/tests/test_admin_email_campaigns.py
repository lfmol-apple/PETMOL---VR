"""Aba E-mails: campanhas, envio SEM limite semanal, opt-out respeitado, remoção e histórico antigo."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import src.admin.email_campaigns as ec
from src.admin.activation_campaign_router import ActivationCampaignContact, ActivationOptOut
from src.admin.deps import get_current_admin
from src.db import SessionLocal
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


def _user(db, name, email=None):
    u = User(id=str(uuid.uuid4()), email=email or f"{uuid.uuid4().hex[:8]}@example.com", name=name, password_hash=hash_password("x"))
    db.add(u); db.commit()
    return u


@pytest.fixture
def admin(client):
    db = SessionLocal()
    try:
        a = _user(db, "Dono Admin", "dono@example.com")
        admin = SimpleNamespace(id=a.id, name=a.name, email=a.email)
    finally:
        db.close()
    client.app.dependency_overrides[get_current_admin] = lambda: (admin, None)
    yield admin
    client.app.dependency_overrides.pop(get_current_admin, None)


@pytest.fixture
def outbox(monkeypatch):
    sent = []
    import src.mailer as mailer
    monkeypatch.setattr(mailer, "send_mail", lambda **kw: sent.append(kw) or True)
    monkeypatch.setattr(ec, "_run", ec._run)          # roda de verdade…
    monkeypatch.setattr(ec, "PAUSE_SECONDS", 0)       # …sem esperar
    monkeypatch.setattr(ec.threading, "Thread", lambda target, args, daemon: SimpleNamespace(start=lambda: target(*args)))
    return sent


def _new(client, name="Black Friday"):
    r = client.post("/v1/admin/email-campaigns", json={"name": name, "subject": "{nome}, novidade para {pets}", "body": "Oi {nome}!\n\nVeja o que há de novo para {pets}."})
    assert r.status_code == 200
    return r.json()["id"]


def test_lista_traz_o_historico_antigo_e_remover_tira_da_lista(client, admin):
    data = client.get("/v1/admin/email-campaigns").json()
    templates = {c["template"] for c in data["campaigns"]}
    assert {"recado", "foto"} <= templates
    antiga = next(c for c in data["campaigns"] if c["template"] == "recado")
    assert client.delete(f"/v1/admin/email-campaigns/{antiga['id']}").status_code == 200
    assert all(c["id"] != antiga["id"] for c in client.get("/v1/admin/email-campaigns").json()["campaigns"])
    # histórico antigo não dispara
    foto = next(c for c in client.get("/v1/admin/email-campaigns").json()["campaigns"] if c["template"] == "foto")
    assert client.post(f"/v1/admin/email-campaigns/{foto['id']}/send", json={"confirm_count": 1}).status_code == 409


def test_envia_para_todos_sem_limite_semanal_e_personaliza(client, admin, outbox):
    db = SessionLocal()
    try:
        ontem = _user(db, "Ana Souza")                       # já recebeu OUTRA campanha ontem: não conta
        db.add(Pet(id=str(uuid.uuid4()), user_id=ontem.id, name="Baby", species="dog")); db.commit()
        db.add(ActivationCampaignContact(campaign="email_racao__nofood", user_id=ontem.id, sent_at=datetime.now(timezone.utc))); db.commit()
        parou = _user(db, "Parou")
        db.add(ActivationOptOut(user_id=parou.id)); db.commit()
        _user(db, "Visitante", "x@petmol.guest")
        _user(db, "Bia")
    finally:
        db.close()
    cid = _new(client)
    prev = client.post(f"/v1/admin/email-campaigns/{cid}/preview", json={"segment": "todos", "audience": {"kind": "all"}}).json()
    assert prev["will_send"] == 3                              # admin + Ana + Bia; Parou e @petmol.guest ficam de fora
    assert prev["sample"]["subject"].startswith("Ana, novidade para Baby") or prev["sample"]["subject"].endswith("seu pet")
    r = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={"segment": "todos", "audience": {"kind": "all"}, "confirm_count": 3})
    assert r.status_code == 200
    assert len(outbox) == 3
    ana = next(m for m in outbox if m["to"] != "dono@example.com" and "Baby" in m["subject"])
    assert "Ana, novidade para Baby" == ana["subject"] and "Parar de receber" in ana["body_html"]
    st = client.get("/v1/admin/email-campaigns").json()["campaigns"]
    assert next(c for c in st if c["id"] == cid)["sent"] == 3


def test_reenviar_so_alcanca_quem_faltou_e_contagem_errada_e_recusada(client, admin, outbox):
    db = SessionLocal()
    try:
        _user(db, "Bia")
    finally:
        db.close()
    cid = _new(client)
    body = {"segment": "todos", "audience": {"kind": "all"}}
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 99}).status_code == 409
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 2}).status_code == 200
    assert len(outbox) == 2
    again = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 0})
    assert again.status_code == 422                            # ninguém novo: nada duplicado
    db = SessionLocal()
    try:
        _user(db, "Caio")
    finally:
        db.close()
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 1}).status_code == 200
    assert len(outbox) == 3


def test_teste_so_para_o_admin_e_nao_registra(client, admin, outbox):
    cid = _new(client)
    assert client.post(f"/v1/admin/email-campaigns/{cid}/test").status_code == 200
    assert [m["to"] for m in outbox] == ["dono@example.com"]
    r = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={"audience": {"kind": "test"}})
    assert r.status_code == 200 and len(outbox) == 2
    assert next(c for c in client.get("/v1/admin/email-campaigns").json()["campaigns"] if c["id"] == cid)["sent"] == 0


def test_segmento_sem_pet(client, admin):
    db = SessionLocal()
    try:
        com = _user(db, "Com Pet")
        db.add(Pet(id=str(uuid.uuid4()), user_id=com.id, name="Rex", species="dog")); db.commit()
        _user(db, "Sem Pet")
    finally:
        db.close()
    cid = _new(client)
    prev = client.post(f"/v1/admin/email-campaigns/{cid}/preview", json={"segment": "sem_pet", "audience": {"kind": "all"}}).json()
    assert prev["will_send"] == 2                              # admin (sem pet) + "Sem Pet"


def test_sem_admin_nao_acessa(client):
    assert client.get("/v1/admin/email-campaigns").status_code in (401, 403)
    assert client.get("/v1/admin/missing-pets").status_code in (401, 403)


def test_pets_sumidos_lista_com_contagens(client, admin):
    from src.missing_pets import MissingPet, MissingPetNotification
    db = SessionLocal()
    try:
        tutor = _user(db, "Tutor Triste", "triste@example.com")
        mp = MissingPet(id=str(uuid.uuid4()), user_id=tutor.id, pet_name="Mel", species="dog", contact="x", status="active")
        db.add(mp); db.commit()
        db.add(MissingPetNotification(missing_pet_id=mp.id, user_id=admin.id, reason="nearby")); db.commit()
    finally:
        db.close()
    d = client.get("/v1/admin/missing-pets?status=active").json()
    assert d["active"] == 1 and d["items"][0]["pet_name"] == "Mel"
    assert d["items"][0]["tutor_email"] == "triste@example.com" and d["items"][0]["notified"] == 1


def test_desempenho_conta_cada_coisa_na_data_em_que_aconteceu(client, admin):
    from datetime import timedelta
    from src.health.models import FeedingPlan
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        u = _user(db, "Nova")
        u.created_at = now - timedelta(days=2)               # conta criada anteontem…
        db.add(Pet(id="p-desemp", user_id=u.id, name="Rex", species="dog", created_at=now)); db.commit()   # …pet hoje
        db.add(FeedingPlan(pet_id="p-desemp", species="dog", country_code="BR", food_brand="Premier", created_at=now)); db.commit()
        _user(db, "Visitante", "g@petmol.guest")
    finally:
        db.close()
    hoje = client.get("/v1/admin/performance", params={"since": (now - timedelta(hours=6)).isoformat()}).json()["totals"]
    assert hoje["pets"] == 1 and hoje["alimentacao"] == 1       # pet e ração contam hoje
    assert hoje["cadastros"] == 1                               # só a conta do admin criada agora; "Nova" é de anteontem, guest nunca conta
    tudo = client.get("/v1/admin/performance").json()
    assert tudo["totals"]["cadastros"] == 2 and tudo["series"]


def test_desempenho_separa_iphone_e_android(client, admin):
    from datetime import timedelta
    from src.analytics.install_models import AppInstall
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.add(AppInstall(platform="ios", created_at=now))
        db.add(AppInstall(platform="android", created_at=now))
        db.add(AppInstall(platform="android", created_at=now))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    d = client.get("/v1/admin/performance", params={"since": (now - timedelta(hours=6)).isoformat()}).json()
    assert set(d["platforms"]) == {"ios", "android"}
    assert d["platforms"]["android"]["totals"]["downloads"] == 2 and d["platforms"]["ios"]["totals"]["downloads"] == 1
    assert d["totals"]["downloads"] == 3

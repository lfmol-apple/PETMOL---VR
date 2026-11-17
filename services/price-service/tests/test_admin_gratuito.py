"""Aba Gratuito: congelamento dos números, antes × agora, quem passou a ter, quadro de situações e trava de troca."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

import src.admin.gratuito_router as gr
from src.admin.deps import get_current_admin
from src.admin.performance_router import _compute
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import NativePushToken
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


def _user(db, name, gps=False, email=None):
    u = User(id=str(uuid.uuid4()), email=email or f"{uuid.uuid4().hex[:8]}@example.com", name=name, password_hash=hash_password("x"))
    if gps:
        u.location_source = "gps"; u.lat = -19.9; u.lng = -43.9
    db.add(u); db.commit()
    return u


def _pet(db, user, food=False):
    pid = str(uuid.uuid4())
    db.add(Pet(id=pid, user_id=user.id, name="Rex", species="dog")); db.commit()
    if food:
        db.add(FeedingPlan(pet_id=pid, species="dog", country_code="BR", food_brand="Premier", created_at=datetime.now(timezone.utc))); db.commit()
    return pid


def _push(db, user):
    db.add(NativePushToken(id=str(uuid.uuid4()), user_id=user.id, platform="ios", token=f"t-{user.id}")); db.commit()


@pytest.fixture
def admin(client):
    db = SessionLocal()
    try:
        a = _user(db, "Dono Admin", email="dono@example.com")
        adm = SimpleNamespace(id=a.id, name=a.name, email=a.email)
    finally:
        db.close()
    client.app.dependency_overrides[get_current_admin] = lambda: (adm, None)
    yield adm
    client.app.dependency_overrides.pop(get_current_admin, None)


def test_sem_congelar_mostra_so_o_agora_e_o_quadro(client, admin):
    d = client.get("/v1/admin/gratuito/summary").json()
    assert d["baseline"] is None and "cards" not in d
    assert d["now"]["cadastros"] >= 1 and sum(s["people"] for s in d["situations"]) == d["now"]["cadastros"]


def test_os_numeros_batem_com_a_aba_desempenho(client, admin):
    db = SessionLocal()
    try:
        a = _user(db, "A"); _pet(db, a, food=True); _push(db, a)
        b = _user(db, "B"); _pet(db, b)
        totals = _compute(db, None, None, None, None)["totals"]
        sets = gr._sets(db)
    finally:
        db.close()
    assert len(sets["pets"]) == totals["pets"] and len(sets["alimentacao"]) == totals["alimentacao"] and len(sets["notificacoes"]) == totals["notificacoes"]
    assert len(sets["cadastros"]) == totals["cadastros"]


def test_congela_uma_vez_e_trocar_exige_confirmacao(client, admin):
    assert client.post("/v1/admin/gratuito/baseline", json={}).status_code == 200
    assert client.post("/v1/admin/gratuito/baseline", json={}).status_code == 409          # não recomeça sem querer
    r = client.post("/v1/admin/gratuito/baseline", json={"replace": True})
    assert r.status_code == 200
    db = SessionLocal()
    try:
        rows = db.query(gr.GratuitoBaseline).all()
    finally:
        db.close()
    assert len(rows) == 2 and sum(1 for x in rows if x.replaced_at is None) == 1           # o anterior fica guardado como substituído


def test_antes_e_depois_contam_quem_passou_a_ter_quem_entrou_ja_com_e_quem_deixou(client, admin):
    db = SessionLocal()
    try:
        sem_racao = _user(db, "Sem ração");  _pet(db, sem_racao)
        com_racao = _user(db, "Com ração");  _pet(db, com_racao, food=True)
        com_push = _user(db, "Com push");    _pet(db, com_push, food=True); _push(db, com_push)
        ids = {"sem": str(sem_racao.id), "com_push": str(com_push.id)}
    finally:
        db.close()
    assert client.post("/v1/admin/gratuito/baseline", json={}).status_code == 200
    base = client.get("/v1/admin/gratuito/summary").json()["baseline"]["values"]

    db = SessionLocal()
    try:
        _pet_row = db.query(Pet).filter(Pet.user_id == ids["sem"]).first()
        db.add(FeedingPlan(pet_id=_pet_row.id, species="dog", country_code="BR", food_brand="Premier", created_at=datetime.now(timezone.utc)))  # passou a ter ração
        novo = _user(db, "Novo", gps=True); _pet(db, novo, food=True); _push(db, novo)                                                        # entrou já com tudo
        db.query(NativePushToken).filter(NativePushToken.user_id == ids["com_push"]).update({"disabled_at": datetime.now(timezone.utc)})      # deixou de ter notificação
        db.commit()
    finally:
        db.close()

    d = client.get("/v1/admin/gratuito/summary").json()
    cards = {c["key"]: c for c in d["cards"]}
    food = cards["alimentacao"]
    assert food["before"]["abs"] == base["alimentacao"] and food["now"]["abs"] == base["alimentacao"] + 2   # +1 que passou a ter, +1 novo
    assert food["moved"] == 1 and food["new_with"] == 1 and food["lost"] == 0
    assert food["moved_pct"] is not None and 0 < food["moved_pct"] <= 100
    push = cards["notificacoes"]
    assert push["lost"] == 1 and push["new_with"] == 1 and push["moved"] == 0
    assert cards["cadastros"]["moved"] == 1                                                                     # cadastros novos desde o congelamento
    assert cards["localizacao"]["new_with"] == 1
    assert d["baseline"]["taken_by"] == "dono@example.com"
    assert sum(s["people"] for s in d["situations"]) == d["now"]["cadastros"]


def test_sem_admin_nao_acessa(client):
    assert client.get("/v1/admin/gratuito/summary").status_code in (401, 403)
    assert client.post("/v1/admin/gratuito/baseline", json={}).status_code in (401, 403)


# ── E-mail: grupos, progresso por pessoa e envio ────────────────────────────

@pytest.fixture
def outbox(monkeypatch):
    import src.admin.email_campaigns as ec
    import src.mailer as mailer
    sent = []
    monkeypatch.setattr(mailer, "send_mail", lambda **kw: sent.append(kw) or True)
    monkeypatch.setattr(ec, "PAUSE_SECONDS", 0)
    monkeypatch.setattr(ec.threading, "Thread", lambda target, args, daemon: SimpleNamespace(start=lambda: target(*args)))
    return sent


def _pet_named(db, user, name, sex=None, food=False):
    pid = str(uuid.uuid4())
    db.add(Pet(id=pid, user_id=user.id, name=name, species="dog", sex=sex)); db.commit()
    if food:
        db.add(FeedingPlan(pet_id=pid, species="dog", country_code="BR", food_brand="Premier", created_at=datetime.now(timezone.utc))); db.commit()


def test_grupos_do_email_dia0_e_dia3_e_o_progresso_de_cada_pessoa(client, admin):
    from src.admin.activation_campaign_router import ActivationOptOut
    db = SessionLocal()
    try:
        sem_pet = _user(db, "Sem pet")
        sem_racao = _user(db, "Ana"); _pet_named(db, sem_racao, "Baby", "male")
        com_push = _user(db, "Bia"); _pet_named(db, com_push, "Mel", "female"); _push(db, com_push)
        tudo = _user(db, "Caio", gps=True); _pet_named(db, tudo, "Rex", "male", food=True); _push(db, tudo)
        parou = _user(db, "Parou"); db.add(ActivationOptOut(user_id=parou.id)); db.commit()
        _user(db, "Visitante", email="v@petmol.guest")
        d0 = {t["user_id"]: t for t in gr.gratuito_targets(db, "dia0")}
        d3 = {t["user_id"]: t for t in gr.gratuito_targets(db, "dia3")}
        ids = {k: str(v.id) for k, v in dict(sem_pet=sem_pet, sem_racao=sem_racao, com_push=com_push, tudo=tudo, parou=parou).items()}
    finally:
        db.close()
    assert ids["sem_pet"] in d0 and ids["sem_racao"] in d0                       # sem notificação: o e-mail é o canal
    assert ids["com_push"] not in d0 and ids["com_push"] in d3                   # tem notificação e falta ração/localização: 2º contato
    assert ids["tudo"] not in d0 and ids["tudo"] not in d3                       # tem tudo: ninguém recebe
    assert ids["parou"] not in d0 and ids["parou"] not in d3                     # pediu para parar
    assert all("@petmol.guest" not in t["email"] for t in {**d0, **d3}.values())
    assert d0[ids["sem_racao"]]["pet_of"] == "do Baby" and d3[ids["com_push"]]["pet_of"] == "da Mel"
    assert d0[ids["sem_pet"]]["progress"] == {"pet": False, "food": False, "push": False, "location": False}
    assert d3[ids["com_push"]]["progress"] == {"pet": True, "food": False, "push": True, "location": False}


def test_envio_leva_o_conteudo_certo_para_cada_pessoa_e_nao_repete(client, admin, outbox):
    db = SessionLocal()
    try:
        ana = _user(db, "Ana Lima"); _pet_named(db, ana, "Baby", "male")
        bia = _user(db, "Bia Rocha"); _pet_named(db, bia, "Mel", "female", food=True)           # tem ração, sem notificação
        sem_pet = _user(db, "Caio Sem")
    finally:
        db.close()
    cid = client.get("/v1/admin/gratuito/summary").json()["email"]["campaign_id"]
    body = {"segment": "gratuito_dia0", "audience": {"kind": "all"}}
    prev = client.post(f"/v1/admin/email-campaigns/{cid}/preview", json=body).json()
    assert prev["will_send"] == 4                                                              # admin + Ana + Bia + Caio (nenhum tem notificação)
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 4}).status_code == 200
    by = {m["to"]: m["body_html"] for m in outbox}
    ana_html = next(h for to, h in by.items() if "Cadastrar a ração do Baby" in h)
    assert "Ative as notificações" in ana_html and "65.625.299/0001-15" in ana_html and "/api/v1/email/click/ec_" in ana_html
    bia_html = next(h for to, h in by.items() if "Obrigado por já ter cadastrado a ração" in h)
    assert "Cadastre a ração" not in bia_html                                                  # já tem: não pede de novo
    assert any("Cadastrar o meu pet" in h for h in by.values())                                # sem pet: pede o pet
    assert client.post(f"/v1/admin/email-campaigns/{cid}/send", json={**body, "confirm_count": 0}).status_code == 422   # ninguém novo


def test_envio_sem_escolher_o_grupo_e_recusado_e_a_trava_da_empresa_existe(client, admin, outbox):
    cid = client.get("/v1/admin/gratuito/summary").json()["email"]["campaign_id"]
    r = client.post(f"/v1/admin/email-campaigns/{cid}/send", json={"segment": "todos", "audience": {"kind": "all"}, "confirm_count": 1})
    assert r.status_code == 422 and "grupo do e-mail" in r.json()["detail"]
    import src.admin.email_gratuito as eg
    assert eg.ready_problems(eg.COMPANY_LINE) == []


def test_percentual_ignora_downloads_e_cadastros(client, admin):
    client.post("/v1/admin/gratuito/baseline", json={})
    cards = {c["key"]: c for c in client.get("/v1/admin/gratuito/summary").json()["cards"]}
    assert cards["downloads"]["before"]["pct"] is None and cards["downloads"]["now"]["pct"] is None
    assert cards["cadastros"]["before"]["pct"] is None and cards["cadastros"]["denominator"] == "base dos percentuais"
    assert cards["pets"]["denominator"] == "das pessoas cadastradas"

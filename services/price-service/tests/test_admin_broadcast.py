"""Notificação personalizada enviada pelo dono (admin/hoje e admin/dashboard2).

Cobre: personalização (tutor + pets), público (todos / quantidade / só eu / segmentos), regras de segurança
(push ativo, opt-out, 1 por semana, contagem confirmada, um envio por vez) e a medição do êxito
(o tutor fazer algo no app depois do envio)."""
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import src.admin.broadcast_router as br
from src.admin.activation_campaign_router import ActivationCampaignContact, ActivationOptOut
from src.admin.deps import get_current_admin
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import PushSubscription
from src.pets.models import Pet
from src.pets.vaccine_models import VaccineRecord
from src.user_auth.models import User
from src.user_auth.security import hash_password


# ── personalização (pura) ────────────────────────────────────────────────────

def test_personalizacao_tutor_e_pets():
    assert br.pets_phrase(["Baby"]) == "Baby"
    assert br.pets_phrase(["Baby", "Mel"]) == "Baby e Mel"
    assert br.pets_phrase(["Baby", "Mel", "Rex"]) == "Baby, Mel e Rex"
    assert br.pets_phrase(["Baby", "Mel", "Rex", "Bob", "Zeca"]) == "Baby, Mel, Rex e mais 2"
    assert br.pets_phrase([]) == "seu pet"

    t, b = br.personalize("aproveite 10% de desconto na Petz usando o cupom petmol.", "Leonardo Mol", ["Baby", "Mel"])
    assert t == "Leonardo, uma novidade para Baby e Mel"
    assert b == "Aproveite 10% de desconto na Petz usando o cupom petmol."

    # {tutor} e {pets} na mensagem também são trocados; sem nome do tutor não sobra vírgula solta no título
    t, b = br.personalize("{tutor}, cadastre a ração de {pets}.", None, ["Baby"])
    assert t == "Uma novidade para Baby" and b == "Você, cadastre a ração de Baby."
    # sem pet cadastrado o título não fica torto
    t, _ = br.personalize("oi", "Ana", [])
    assert t == "Ana, uma novidade para o seu pet"


def test_titulo_com_gancho_leva_tutor_e_pets_e_a_info_principal_primeiro():
    tpl = "{tutor}, 10% OFF na Petz para {pets}"
    t, b = br.personalize("Use o cupom PETMOL nas lojas Petz.", "Leonardo Mol", ["Baby", "Mel"], tpl)
    assert t == "Leonardo, 10% OFF na Petz para Baby e Mel" and b == "Use o cupom PETMOL nas lojas Petz."
    # sem nome do tutor o título continua fazendo sentido
    t, _ = br.personalize("x y z", None, ["Baby"], "{tutor}, 10% OFF na Petz para {pets}")
    assert t == "10% OFF na Petz para Baby"
    # modelo vazio volta ao título padrão; títulos longos são cortados
    assert br.personalize("oi oi", "Ana", ["Baby"], "  ")[0] == "Ana, uma novidade para Baby"
    longo, _ = br.personalize("oi oi", "Ana", ["Baby", "Mel", "Rex", "Bob", "Zeca"], "{tutor}, 10% OFF na Petz hoje para {pets} aproveitarem")
    assert len(longo) <= 65 and longo.endswith("…")


def test_toque_na_notificacao_leva_a_tela_certa_lojas_para_oferta_e_cupom():
    assert br._push_payload("B1", "t", "b")["data"]["url"] == "/home?b=B1"
    assert br._push_payload("B1", "t", "b", "loja")["data"]["url"] == "/home?modal=loja&b=B1"
    assert br._push_payload("B1", "t", "b", "food")["data"]["url"] == "/home?modal=food&b=B1"
    open_by_goal = {g["key"]: g["open"] for g in br.GOAL_CATALOG}
    assert open_by_goal["cupom"] == "loja" and open_by_goal["compra_racao"] == "loja"
    assert open_by_goal["racao"] == "food" and open_by_goal["abrir"] == "home"
    assert all(g["open"] in br.DESTINATIONS for g in br.GOAL_CATALOG)


def test_catalogo_de_metas_completo_e_coerente():
    keys = [g["key"] for g in br.GOAL_CATALOG]
    assert len(keys) == len(set(keys))
    for g in br.GOAL_CATALOG:
        assert g["segment"] in br.SEGMENTS and g["message"] and g["why"] and g["success"] and g["label"]
        assert "{tutor}" in g["title"] and len(g["title"]) <= 60   # gancho com o nome do tutor, curto o bastante
    assert {"pet", "foto", "racao", "vacina", "parasitas", "medicacao", "banho", "tutorial", "gps", "cupom",
            "compra_racao", "abrir"} <= set(keys)


# ── fixtures ─────────────────────────────────────────────────────────────────

def _mk_user(db, name, email=None, *, push=True):
    uid = str(uuid.uuid4())
    db.add(User(id=uid, email=email or f"{uid[:8]}@example.com", name=name, password_hash=hash_password("x")))
    db.commit()
    if push:
        db.add(PushSubscription(id=str(uuid.uuid4()), user_id=uid, endpoint=f"https://push.example/{uid}",
                                p256dh="k", auth="a"))
        db.commit()
    return uid


def _mk_pet(db, uid, name, photo=None):
    pid = str(uuid.uuid4())
    db.add(Pet(id=pid, user_id=uid, name=name, species="dog", photo=photo))
    db.commit()
    return pid


@pytest.fixture()
def adm(client, monkeypatch):
    """Admin simulado + push falso (registra o que seria enviado) + envio síncrono."""
    sent = []
    monkeypatch.setattr(br, "push_to_user", lambda uid, payload: (sent.append((uid, payload)) or 1))
    monkeypatch.setattr(br, "_spawn", lambda fn, *a: fn(*a))
    monkeypatch.setattr(br.time, "sleep", lambda s: None)
    with SessionLocal() as db:
        # limpa o que outros testes deixaram: este arquivo conta pessoas
        for model in (br.AdminBroadcastRecipient, br.AdminBroadcast, ActivationCampaignContact, ActivationOptOut,
                      FeedingPlan, VaccineRecord, PushSubscription, Pet):
            db.query(model).delete()
        db.commit()
        admin_id = _mk_user(db, "Dono Admin", "dono@example.com")
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id=admin_id), None)
    yield SimpleNamespace(client=client, sent=sent, admin_id=admin_id)
    client.app.dependency_overrides.pop(get_current_admin, None)


def _body(**kw):
    base = {"message": "cadastre a ração de {pets}.", "segment": "todos", "audience": {"kind": "all"}}
    base.update(kw)
    return base


# ── público e segurança ──────────────────────────────────────────────────────

def test_so_eu_envia_so_para_o_admin_e_nao_gasta_a_cota_semanal(adm):
    with SessionLocal() as db:
        outro = _mk_user(db, "Outra Pessoa")
        _mk_pet(db, outro, "Rex")
        _mk_pet(db, adm.admin_id, "Baby")
    body = _body(audience={"kind": "test"})
    prev = adm.client.post("/v1/admin/broadcast/preview", json=body).json()
    assert prev["will_send"] == 1 and prev["sample"]["title"] == "Dono, uma novidade para Baby"

    r = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 1})
    assert r.status_code == 200, r.text
    assert [uid for uid, _ in adm.sent] == [adm.admin_id]
    # o teste não conta como "já recebeu esta semana": um envio real depois ainda alcança o admin
    again = adm.client.post("/v1/admin/broadcast/preview", json=_body()).json()
    assert again["will_send"] == 2


def test_todos_e_quantidade_com_confirmacao_obrigatoria(adm):
    with SessionLocal() as db:
        for i in range(5):
            u = _mk_user(db, f"Tutor {i}")
            _mk_pet(db, u, f"Pet{i}")
    prev = adm.client.post("/v1/admin/broadcast/preview", json=_body()).json()
    assert prev["will_send"] == 6            # 5 tutores + o admin (todos têm push)

    # contagem errada → recusa (nada é enviado)
    r = adm.client.post("/v1/admin/broadcast/send", json={**_body(), "confirm_count": 5})
    assert r.status_code == 409 and adm.sent == []

    # "quantos eu quiser": 3 pessoas sorteadas
    body = _body(audience={"kind": "count", "count": 3})
    assert adm.client.post("/v1/admin/broadcast/preview", json=body).json()["will_send"] == 3
    r = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 3})
    assert r.status_code == 200 and len(adm.sent) == 3
    assert len({uid for uid, _ in adm.sent}) == 3
    # cada payload leva tutor + pet no título e abre a Home com o id do envio
    uid0, payload = adm.sent[0]
    assert payload["title"].endswith(("Pet0", "Pet1", "Pet2", "Pet3", "Pet4", "seu pet")) or "uma novidade para" in payload["title"]
    assert payload["data"]["url"].startswith("/home?b=")     # sem meta/destino: abre a Home

    # meta "cupom" abre as lojas; o dono também pode escolher o destino na mão
    adm.sent.clear()
    cupom = _body(goal="cupom", audience={"kind": "test"})
    assert adm.client.post("/v1/admin/broadcast/preview", json=cupom).json()["destination"] == "loja"
    adm.client.post("/v1/admin/broadcast/send", json={**cupom, "confirm_count": 1})
    assert adm.sent[-1][1]["data"]["url"].startswith("/home?modal=loja&b=")
    # um envio por vez: o anterior (teste) já terminou, então um novo com destino manual passa
    adm.sent.clear()
    manual = _body(audience={"kind": "test"}, destination="vaccines")
    adm.client.post("/v1/admin/broadcast/send", json={**manual, "confirm_count": 1})
    assert adm.sent[-1][1]["data"]["url"].startswith("/home?modal=vaccines&b=")


def test_quantidade_maior_que_o_publico_envia_para_todos_os_elegiveis(adm):
    with SessionLocal() as db:
        _mk_user(db, "Só Um")
    body = _body(audience={"kind": "count", "count": 500})
    assert adm.client.post("/v1/admin/broadcast/preview", json=body).json()["will_send"] == 2


def test_ninguem_sem_push_nem_quem_pediu_para_parar_nem_quem_ja_recebeu_na_semana(adm):
    with SessionLocal() as db:
        _mk_user(db, "Sem Push", push=False)
        parou = _mk_user(db, "Parou")
        db.add(ActivationOptOut(user_id=parou))
        recente = _mk_user(db, "Recebeu")
        db.add(ActivationCampaignContact(campaign="food", user_id=recente,
                                         sent_at=datetime.now(timezone.utc) - timedelta(days=2)))
        antigo = _mk_user(db, "Recebeu Há Tempo")
        db.add(ActivationCampaignContact(campaign="food", user_id=antigo,
                                         sent_at=datetime.now(timezone.utc) - timedelta(days=9)))
        db.commit()
    prev = adm.client.post("/v1/admin/broadcast/preview", json=_body()).json()
    assert prev["will_send"] == 2            # o admin + "Recebeu Há Tempo"
    assert prev["skipped"]["opt_out"] == 1 and prev["skipped"]["weekly_cap"] == 1

    adm.client.post("/v1/admin/broadcast/send", json={**_body(), "confirm_count": 2})
    # segundo envio logo depois: ninguém mais pode receber (1 por semana)
    r = adm.client.post("/v1/admin/broadcast/send", json={**_body(), "confirm_count": 0})
    assert r.status_code == 422


def test_um_envio_por_vez(adm, monkeypatch):
    monkeypatch.setattr(br, "_spawn", lambda fn, *a: None)   # fica "enviando" (não termina)
    with SessionLocal() as db:
        _mk_user(db, "Alguém")
    r = adm.client.post("/v1/admin/broadcast/send", json={**_body(), "confirm_count": 2})
    assert r.status_code == 200
    r2 = adm.client.post("/v1/admin/broadcast/send", json={**_body(), "confirm_count": 2})
    assert r2.status_code == 409 and "andamento" in r2.json()["detail"]


def test_segmentos(adm):
    with SessionLocal() as db:
        a = _mk_user(db, "Sem Ração Sem Foto")
        _mk_pet(db, a, "Nina")                                   # sem ração, sem foto
        b = _mk_user(db, "Com Ração")
        pb = _mk_pet(db, b, "Thor", photo="data:image/png;base64,AAAA")
        db.add(FeedingPlan(id=str(uuid.uuid4()), pet_id=pb, species="dog", country_code="BR", food_brand="Golden"))
        _mk_user(db, "Sem Pet")
        db.commit()
    segs = adm.client.get("/v1/admin/broadcast/segments").json()
    assert segs["segments"]["sem_racao"]["eligible"] == 1
    assert segs["segments"]["sem_foto"]["eligible"] == 1
    assert segs["segments"]["sem_pet"]["eligible"] == 2        # "Sem Pet" + o admin
    assert segs["segments"]["todos"]["eligible"] == 4
    goal = {g["key"]: g for g in segs["goals"]}
    assert goal["racao"]["eligible"] == 1 and goal["foto"]["segment"] == "sem_foto"


def test_meta_desconhecida_e_mensagem_vazia_sao_recusadas(adm):
    assert adm.client.post("/v1/admin/broadcast/preview", json=_body(goal="inventada")).status_code == 422
    assert adm.client.post("/v1/admin/broadcast/preview", json=_body(message="a")).status_code == 422
    assert adm.client.post("/v1/admin/broadcast/preview",
                           json=_body(audience={"kind": "count"})).status_code == 422


def test_sem_login_de_admin_recusa(client):
    client.app.dependency_overrides.pop(get_current_admin, None)
    assert client.get("/v1/admin/broadcast/segments").status_code in (401, 403)
    assert client.post("/v1/admin/broadcast/send", json=_body() | {"confirm_count": 1}).status_code in (401, 403)


# ── êxito: o tutor fez algo no app? ──────────────────────────────────────────

def _evt(db, uid, name, when, props=None):
    db.add(AnalyticsProductEvent(event_id=str(uuid.uuid4()), event_name=name, user_id=uid,
                                 received_at=when, properties_json=props))
    db.commit()


def test_exito_mede_entregue_tocou_abriu_agiu_e_meta(adm):
    with SessionLocal() as db:
        tocou, abriu, agiu, nada = (_mk_user(db, n) for n in ("Tocou", "Abriu", "Agiu", "Nada"))
        for u in (tocou, abriu, agiu, nada):
            _mk_pet(db, u, "Pet")
    body = _body(goal="vacina", audience={"kind": "all"})
    total = adm.client.post("/v1/admin/broadcast/preview", json=body).json()["will_send"]
    r = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": total})
    bid = r.json()["id"]

    now = datetime.now(timezone.utc)
    with SessionLocal() as db:
        _evt(db, tocou, "broadcast_opened", now, f'{{"broadcast": "{bid}"}}')
        _evt(db, abriu, "app_open", now)
        _evt(db, agiu, "app_open", now)
        # a meta "vacina": a vacina foi CRIADA depois do envio
        pid = db.query(Pet.id).filter(Pet.user_id == agiu).first()[0]
        db.add(VaccineRecord(id=str(uuid.uuid4()), pet_id=pid, vaccine_name="V10", applied_date=now,
                             next_dose_date=now + timedelta(days=365)))
        db.commit()
        # evento antigo (antes do envio) não conta
        _evt(db, nada, "pet_created", now - timedelta(days=3))

    h = adm.client.get("/v1/admin/broadcast/history").json()["items"][0]
    m = h["metrics"]
    assert h["id"] == bid and h["goal"] == "vacina"
    assert m["delivered"] == total
    assert m["tapped"] == 1
    assert m["opened"] == 3            # tocou + abriu + agiu
    assert m["acted"] == 1             # só quem cadastrou a vacina "fez algo"; tocar/abrir não contam como ação
    assert m["goal_hit"] == 1 and m["goal_label"] == "Cadastrar a vacina / carteirinha"
    assert m["window_closed"] is False

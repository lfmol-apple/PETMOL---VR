"""Radar de promoções: lista pública, admin, e a vigia que avisa o dono (véspera e dia, sem repetir)."""
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

import pytest

from src import store_promos as sp
from src.admin_alerts import AdminEventLog  # importa antes: cria a tabela fora de qualquer transação aberta
from src.admin.deps import get_current_admin
from src.config import get_settings
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import hash_password


@pytest.fixture()
def adm(client):
    with SessionLocal() as db:
        db.query(sp.StorePromoRow).delete()
        db.query(AdminEventLog).delete()
        db.commit()
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id="admin"), None)
    yield client
    client.app.dependency_overrides.pop(get_current_admin, None)


def _promo(**kw):
    base = {"name": "Semana do Pet", "merchants": ["cobasi", "petz"], "detail": "Ofertas em ração.",
            "starts_on": (date.today() + timedelta(days=3)).isoformat(),
            "ends_on": (date.today() + timedelta(days=6)).isoformat(), "source": "https://exemplo.com/semana"}
    base.update(kw)
    return base


def test_primeira_leitura_planta_as_campanhas_verificadas_e_nao_repete(adm):
    with SessionLocal() as db:
        assert sp.ensure_seed(db) == 4
        assert sp.ensure_seed(db) == 0
        ids = {r.id for r in db.query(sp.StorePromoRow).all()}
    assert {"11-11-2026", "black-friday-2026"} <= ids


def test_cadastrar_listar_e_apagar(adm):
    with SessionLocal() as db:
        sp.ensure_seed(db)
    r = adm.post("/v1/admin/store-promos", json=_promo())
    assert r.status_code == 201
    pid = r.json()["id"]
    assert pid.startswith("semana-do-pet-")
    lst = adm.get("/v1/admin/store-promos").json()["promos"]
    assert pid in [p["id"] for p in lst]
    got = adm.get(f"/v1/admin/store-promos/{pid}").json()
    assert got["merchantsLabel"] == "Cobasi e Petz"
    assert "{tutor}" in got["message"]["title"] and "Semana do Pet" in got["message"]["title"]
    # a meta existe no catálogo do envio (para medir o êxito = ir à Loja) e abre a Loja
    from src.admin import broadcast_router as br
    assert got["message"]["goal"] in br.GOALS
    assert br._GOAL[got["message"]["goal"]]["open"] == "loja"
    assert adm.delete(f"/v1/admin/store-promos/{pid}").status_code == 204
    assert adm.get(f"/v1/admin/store-promos/{pid}").status_code == 404


def test_dados_invalidos_sao_recusados(adm):
    assert adm.post("/v1/admin/store-promos", json=_promo(merchants=["magalu"])).status_code == 422
    assert adm.post("/v1/admin/store-promos", json=_promo(merchants=[])).status_code == 422
    hoje = date.today().isoformat()
    assert adm.post("/v1/admin/store-promos", json=_promo(starts_on=hoje, ends_on=(date.today() - timedelta(days=1)).isoformat())).status_code == 422


def test_lista_publica_traz_so_no_ar_ou_ate_7_dias(adm):
    hoje = sp.today_brt()
    fmt = lambda d: d.isoformat()
    adm.post("/v1/admin/store-promos", json=_promo(name="No ar", starts_on=fmt(hoje - timedelta(days=1)), ends_on=fmt(hoje + timedelta(days=1))))
    adm.post("/v1/admin/store-promos", json=_promo(name="Em breve", starts_on=fmt(hoje + timedelta(days=5)), ends_on=fmt(hoje + timedelta(days=6))))
    adm.post("/v1/admin/store-promos", json=_promo(name="Longe", starts_on=fmt(hoje + timedelta(days=20)), ends_on=fmt(hoje + timedelta(days=21))))
    adm.post("/v1/admin/store-promos", json=_promo(name="Passou", starts_on=fmt(hoje - timedelta(days=9)), ends_on=fmt(hoje - timedelta(days=5))))
    body = adm.get("/commerce/promos").json()
    assert [p["name"] for p in body["promos"]] == ["No ar", "Em breve"]


def test_vigia_avisa_o_dono_na_vespera_e_no_dia_sem_repetir(adm, monkeypatch):
    owner_email = get_settings().admin_master_email.lower()
    with SessionLocal() as db:
        if not db.query(User).filter(User.email == owner_email).first():
            db.add(User(id=str(uuid.uuid4()), email=owner_email, name="Dono", password_hash=hash_password("x")))
            db.commit()
    amanha = sp.today_brt() + timedelta(days=1)
    pid = adm.post("/v1/admin/store-promos", json=_promo(name="Dia do Pet", starts_on=amanha.isoformat(), ends_on=amanha.isoformat())).json()["id"]

    pushes = []
    import src.notifications as notifications
    monkeypatch.setattr(notifications, "push_to_user", lambda uid, payload: pushes.append((uid, payload)) or 1)

    assert sp.notify_owner_about_promos(today=sp.today_brt()) == 1          # véspera
    title = pushes[0][1]["title"]
    assert "amanhã" in title and "Dia do Pet" in title
    assert pushes[0][1]["data"]["url"] == f"/admin/hoje?promo={pid}#enviar-notificacao"
    assert sp.notify_owner_about_promos(today=sp.today_brt()) == 0          # não repete
    assert sp.notify_owner_about_promos(today=amanha) == 1                  # no dia, novo aviso
    assert "hoje" in pushes[-1][1]["title"]
    assert sp.notify_owner_about_promos(today=amanha) == 0


def test_so_admin_mexe(client):
    assert client.post("/v1/admin/store-promos", json=_promo()).status_code in (401, 403)
    assert client.get("/v1/admin/store-promos").status_code in (401, 403)

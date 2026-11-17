"""Plano B da campanha de link: ao abrir o app, o tutor recebe o link da campanha que acabou de ser enviada a ele (uma vez só)."""
import uuid
from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from src.admin.push_campaigns import PushCampaign, PushCampaignRecipient, PushLinkOpen
from src.db import SessionLocal
from src.main import app
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _tutor():
    with SessionLocal() as db:
        u = User(id=str(uuid.uuid4()), email=f"pl.{uuid.uuid4().hex[:8]}@example.com", name="Tutor", password_hash=hash_password("x"))
        db.add(u); db.commit()
        return u.id, {"Authorization": f"Bearer {create_access_token(u.id)}"}


def _send(uid, *, url="https://meli.la/abc", state="accepted", ago=timedelta(minutes=2)):
    with SessionLocal() as db:
        c = PushCampaign(name="Camp", message="Oferta", destination="produto", product_url=url, product_title="Ração X", content_hash="h", status="active")
        db.add(c); db.flush()
        batch = str(uuid.uuid4())
        db.add(PushCampaignRecipient(campaign_id=c.id, user_id=uid, batch_id=batch, state=state, finished_at=datetime.now(timezone.utc) - ago))
        db.commit()
        return batch


def test_abriu_o_app_logo_depois_do_envio_devolve_o_link_uma_vez():
    uid, h = _tutor()
    batch = _send(uid)
    c = TestClient(app)
    got = c.get("/notifications/pending-link", headers=h).json()["pending"]
    assert got["url"] == "https://meli.la/abc" and got["batch_id"] == batch and got["title"] == "Ração X"
    assert c.post("/notifications/pending-link/consume", headers=h, json={"batch_id": batch, "via": "app_open"}).json() == {"ok": True}
    assert c.get("/notifications/pending-link", headers=h).json() == {"pending": None}          # já abriu: não repete
    assert c.post("/notifications/pending-link/consume", headers=h, json={"batch_id": batch}).status_code == 200   # idempotente


def test_nao_devolve_envio_antigo_nem_nao_aceito_nem_de_outro_tutor():
    uid, h = _tutor()
    other, _ = _tutor()
    _send(uid, ago=timedelta(minutes=45))                    # vencido (janela de 30 min)
    _send(uid, state="failed")                               # o provedor não aceitou
    _send(other)                                             # é de outro tutor
    c = TestClient(app)
    assert c.get("/notifications/pending-link", headers=h).json() == {"pending": None}


def test_exige_login():
    c = TestClient(app)
    assert c.get("/notifications/pending-link").status_code in (401, 403)
    assert c.post("/notifications/pending-link/consume", json={"batch_id": "x"}).status_code in (401, 403)

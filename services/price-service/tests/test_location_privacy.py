"""Localização do tutor: guardada arredondada (~110 m), sem histórico, e "parar de compartilhar" apaga tudo."""
from src.db import SessionLocal
from src.notifications import PushSubscription
from src.user_auth.models import User


def _h(cid, token=None):
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _login(client, n):
    cid, email = f"cid-loc{n}", f"loc{n}@example.com"
    client.post("/auth/signup", json={"name": "Tutor", "email": email, "password": "senha123", "terms_accepted": True}, headers=_h(cid))
    tok = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_h(cid)).json()["access_token"]
    return cid, tok


def test_gps_e_guardado_arredondado_a_3_casas(client):
    cid, tok = _login(client, 1)
    r = client.patch("/auth/me", json={"lat": -19.917299999, "lng": -43.934559999}, headers=_h(cid, tok))
    assert r.status_code == 200, r.text
    me = client.get("/auth/me", headers=_h(cid, tok)).json()
    assert (me["lat"], me["lng"]) == (-19.917, -43.935)
    assert me["location_source"] == "gps"


def test_parar_de_compartilhar_apaga_a_localizacao_do_usuario_e_das_assinaturas(client):
    cid, tok = _login(client, 2)
    client.patch("/auth/me", json={"lat": -19.9, "lng": -43.9}, headers=_h(cid, tok))
    db = SessionLocal()
    try:
        uid = db.query(User).filter(User.email == "loc2@example.com").one().id
        db.add(PushSubscription(user_id=str(uid), endpoint="e", p256dh="p", auth="a", lat=-19.9, lng=-43.9))
        db.commit()
    finally:
        db.close()

    r = client.delete("/auth/me/location", headers=_h(cid, tok))
    assert r.status_code == 200 and r.json() == {"ok": True}

    me = client.get("/auth/me", headers=_h(cid, tok)).json()
    assert me["lat"] is None and me["lng"] is None and me["location_source"] is None
    db = SessionLocal()
    try:
        sub = db.query(PushSubscription).filter(PushSubscription.user_id == str(uid)).one()
        assert sub.lat is None and sub.lng is None
    finally:
        db.close()


def test_parar_de_compartilhar_exige_login(client):
    assert client.delete("/auth/me/location").status_code == 401

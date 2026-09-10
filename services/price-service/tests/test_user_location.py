"""Localização persistida no usuário (não na push subscription)."""


def _headers(cid, token=None):
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup(client, cid, email):
    client.post("/auth/signup", json={"name": "Tutor", "email": email, "password": "senha123",
                                      "terms_accepted": True}, headers=_headers(cid))
    return client.post("/auth/login", json={"email": email, "password": "senha123"},
                       headers=_headers(cid)).json()["access_token"]


def test_patch_me_stores_gps_location(client):
    token = _signup(client, "cid-loc1", "loc1@example.com")
    r = client.patch("/auth/me", json={"lat": -19.9167, "lng": -43.9345}, headers=_headers("cid-loc1", token))
    assert r.status_code == 200, r.text
    body = r.json()
    assert abs(body["lat"] + 19.9167) < 0.001
    assert body["location_source"] == "gps"

    me = client.get("/auth/me", headers=_headers("cid-loc1", token)).json()
    assert me["lat"] is not None and me["location_source"] == "gps"


def test_patch_me_rejects_bad_coords(client):
    token = _signup(client, "cid-loc2", "loc2@example.com")
    r = client.patch("/auth/me", json={"lat": "abc", "lng": 1}, headers=_headers("cid-loc2", token))
    assert r.status_code == 422


def test_user_location_helper_prefers_user_over_subscription():
    import uuid
    from src.db import SessionLocal, Base, engine
    from src.notifications import PushSubscription
    from src.user_auth.models import User
    from src.missing_pets import _user_location
    from src.user_auth.security import hash_password

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        uid = str(uuid.uuid4())
        db.add(User(id=uid, email=f"{uid}@x.com", password_hash=hash_password("x"), name="T",
                    lat=-10.0, lng=-20.0, location_source="gps"))
        db.add(PushSubscription(id=str(uuid.uuid4()), user_id=uid, endpoint="e", p256dh="k", auth="a",
                                lat=-99.0, lng=-99.0))
        db.commit()
        assert _user_location(db, uid) == (-10.0, -20.0)
    finally:
        db.query(PushSubscription).filter_by(user_id=uid).delete()
        db.query(User).filter_by(id=uid).delete()
        db.commit()
        db.close()


def test_geocode_place_returns_none_on_empty():
    from src.geocoding import geocode_place
    assert geocode_place("") is None

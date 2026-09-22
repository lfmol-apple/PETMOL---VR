"""Mapa interativo dos tutores — só com localização já persistida (User.lat/lng),
nunca inventada. gps (Pet Sumido) vs city (centro aproximado) distinguidos."""
from datetime import datetime, timezone
from uuid import uuid4

from src.admin.models import AdminUser
from src.db import SessionLocal
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

NOW = datetime.now(timezone.utc)


def _admin_headers():
    db = SessionLocal()
    try:
        u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin")
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="master"))
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _seed_tutors():
    """4 tutores com pet: A (GPS preciso), B (centro da cidade), C (sem
    localização nenhuma — não pode aparecer no mapa), D (localização mas
    sem pet — não conta em nenhum lugar do mapa)."""
    db = SessionLocal()
    try:
        a = User(email=f"a-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Ana",
                 city="Belo Horizonte", state="MG", lat=-19.9167, lng=-43.9345, location_source="gps")
        b = User(email=f"b-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Beto",
                 city="Curitiba", state="PR", lat=-25.4284, lng=-49.2733, location_source="city")
        c = User(email=f"c-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Carla")
        d = User(email=f"d-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Duda",
                 lat=-23.5505, lng=-46.6333, location_source="gps")
        db.add_all([a, b, c, d])
        db.commit()

        pet_a = Pet(user_id=a.id, name="Rex", species="dog", photo="pets/rex.jpg")
        pet_b = Pet(user_id=b.id, name="Mia", species="cat")
        pet_c = Pet(user_id=c.id, name="Bidu", species="dog")
        db.add_all([pet_a, pet_b, pet_c])
        db.commit()
        return {"a": a.id, "b": b.id, "c": c.id, "d": d.id}
    finally:
        db.close()


def test_map_only_includes_tutors_with_pet_and_location(client):
    headers = _admin_headers()
    ids = _seed_tutors()

    r = client.get("/v1/admin/analytics/map-tutors", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()

    by_id = {m["user_id"]: m for m in body["markers"]}
    assert ids["a"] in by_id      # tem pet + GPS
    assert ids["b"] in by_id      # tem pet + cidade
    assert ids["c"] not in by_id  # tem pet, sem localização — não inventa posição
    assert ids["d"] not in by_id  # tem localização, sem pet — não é marcador

    assert body["total_tutors_with_pet"] == 3   # a, b, c
    assert body["mapped_count"] == 2            # a, b
    assert body["unmapped_count"] == 1          # c
    assert body["precision"]["gps"] == 1
    assert body["precision"]["city"] == 1


def test_map_marker_has_pet_thumbnail_and_precision_label(client):
    headers = _admin_headers()
    ids = _seed_tutors()

    r = client.get("/v1/admin/analytics/map-tutors", headers=headers)
    by_id = {m["user_id"]: m for m in r.json()["markers"]}

    a = by_id[ids["a"]]
    assert a["precision"] == "gps"
    assert a["pet_count"] == 1
    assert a["pet_thumbnails"][0]["name"] == "Rex"
    assert a["pet_thumbnails"][0]["photo_url"]
    assert a["lat"] == -19.9167 and a["lng"] == -43.9345

    b = by_id[ids["b"]]
    assert b["precision"] == "city"


def test_map_filters_by_city(client):
    headers = _admin_headers()
    ids = _seed_tutors()

    r = client.get("/v1/admin/analytics/map-tutors?city=Curitiba", headers=headers)
    markers = r.json()["markers"]
    assert [m["user_id"] for m in markers] == [ids["b"]]


def test_map_filters_by_feeding_status(client):
    headers = _admin_headers()
    ids = _seed_tutors()
    db = SessionLocal()
    try:
        from src.health.models import FeedingPlan
        pet_a_id = db.query(Pet.id).filter(Pet.user_id == ids["a"]).scalar()
        db.add(FeedingPlan(pet_id=pet_a_id, species="dog", country_code="BR", food_brand="Golden",
                            items_json='[{"gtin":"789"}]', daily_amount_g=200, duration_days=30, enabled=True))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/map-tutors?has_feeding=true", headers=headers)
    assert [m["user_id"] for m in r.json()["markers"]] == [ids["a"]]

    r2 = client.get("/v1/admin/analytics/map-tutors?has_feeding=false", headers=headers)
    assert [m["user_id"] for m in r2.json()["markers"]] == [ids["b"]]

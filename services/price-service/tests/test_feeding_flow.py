"""Cadastrar ração -> calcular término -> registrar compra (restock)."""
from datetime import date, timedelta

from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog


def _register_catalog_product(gtin: str) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Ração Teste", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_login_and_pet(client, cid: str, email: str) -> tuple[str, str]:
    client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    login = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_headers(cid))
    token = login.json()["access_token"]

    pet = client.post("/pets", json={"name": "Thor", "species": "dog"}, headers=_headers(cid, token))
    return token, pet.json()["id"]


def test_feeding_plan_create_estimate_and_restock(client):
    token, pet_id = _signup_login_and_pet(client, "cid-feeding", "tutor.racao@example.com")
    headers = _headers("cid-feeding", token)

    create = client.post(
        f"/health/pets/{pet_id}/feeding/plan",
        json={
            "food_brand": "Golden Fórmula",
            "package_size_kg": 15,
            "daily_amount_g": 300,
            "last_refill_date": date.today().isoformat(),
        },
        headers=headers,
    )
    assert create.status_code in (200, 201), create.text

    plan = client.get(f"/health/pets/{pet_id}/feeding/plan", headers=headers)
    assert plan.status_code == 200, plan.text
    body = plan.json()
    # 15kg a 300g/dia dura 50 dias — deve existir uma data estimada de término.
    end_date = body["estimate"]["estimated_end_date"]
    assert end_date is not None
    assert date.fromisoformat(end_date[:10]) >= date.today() + timedelta(days=45)

    restock = client.post(f"/health/pets/{pet_id}/feeding/plan/restock", json={}, headers=headers)
    assert restock.status_code == 200, restock.text

    after_restock = client.get(f"/health/pets/{pet_id}/feeding/plan", headers=headers).json()
    end_date_2 = after_restock["estimate"]["estimated_end_date"]
    assert date.fromisoformat(end_date_2[:10]) >= date.today() + timedelta(days=45)


def test_feeding_plan_requires_pet_ownership(client):
    token_a, pet_a = _signup_login_and_pet(client, "cid-feed-a", "tutor.racaoa@example.com")
    client.post(
        "/auth/signup",
        json={"name": "Tutor B", "email": "tutor.racaob@example.com", "password": "senha123", "terms_accepted": True},
        headers=_headers("cid-feed-b"),
    )
    login_b = client.post(
        "/auth/login", json={"email": "tutor.racaob@example.com", "password": "senha123"}, headers=_headers("cid-feed-b")
    )
    token_b = login_b.json()["access_token"]

    resp = client.post(
        f"/health/pets/{pet_a}/feeding/plan",
        json={"food_brand": "Ração Alheia", "package_size_kg": 10, "daily_amount_g": 200},
        headers=_headers("cid-feed-b", token_b),
    )
    assert resp.status_code == 404


def test_feeding_item_barcode_resolves_product_id_when_already_catalogued(client):
    gtin = "7896011223344"
    product_id = _register_catalog_product(gtin)

    token, pet_id = _signup_login_and_pet(client, "cid-feed-barcode", "tutor.racaobarcode@example.com")
    headers = _headers("cid-feed-barcode", token)

    create = client.post(
        f"/health/pets/{pet_id}/feeding/plan",
        json={
            "items": [{
                "label": "Ração Catalogada",
                "food_brand": "Marca Teste",
                "package_size_kg": 10,
                "daily_amount_g": 200,
                "barcode": gtin,
                "is_primary": True,
            }],
        },
        headers=headers,
    )
    assert create.status_code in (200, 201), create.text

    plan = client.get(f"/health/pets/{pet_id}/feeding/plan", headers=headers)
    assert plan.status_code == 200, plan.text
    items = plan.json()["plan"]["items"]
    assert items[0]["barcode"] == gtin
    assert items[0]["product_id"] == product_id


def test_feeding_item_uncatalogued_barcode_has_no_product_id(client):
    token, pet_id = _signup_login_and_pet(client, "cid-feed-unknown", "tutor.racaounk@example.com")
    headers = _headers("cid-feed-unknown", token)

    create = client.post(
        f"/health/pets/{pet_id}/feeding/plan",
        json={
            "items": [{
                "label": "Ração Desconhecida",
                "package_size_kg": 10,
                "daily_amount_g": 200,
                "barcode": "0000000000000",
                "is_primary": True,
            }],
        },
        headers=headers,
    )
    assert create.status_code in (200, 201), create.text

    plan = client.get(f"/health/pets/{pet_id}/feeding/plan", headers=headers)
    items = plan.json()["plan"]["items"]
    assert items[0]["product_id"] is None


def test_feeding_item_product_id_is_never_accepted_directly_from_client(client):
    token, pet_id = _signup_login_and_pet(client, "cid-feed-inject", "tutor.racaoinj@example.com")
    headers = _headers("cid-feed-inject", token)

    create = client.post(
        f"/health/pets/{pet_id}/feeding/plan",
        json={
            "items": [{
                "label": "Ração Qualquer",
                "package_size_kg": 10,
                "daily_amount_g": 200,
                "product_id": 999999,
                "is_primary": True,
            }],
        },
        headers=headers,
    )
    assert create.status_code in (200, 201), create.text

    plan = client.get(f"/health/pets/{pet_id}/feeding/plan", headers=headers)
    items = plan.json()["plan"]["items"]
    assert items[0]["product_id"] is None

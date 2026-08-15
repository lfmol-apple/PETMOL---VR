"""GTIN/EAN escaneado em controle parasitário — permite resolver oferta
comercial por identidade exata (AwinFeedProvider), mesmo caminho já usado
por FeedingPlanItemEntry.barcode pra ração (ver docs/AFFILIATES.md)."""


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


def test_barcode_persisted_on_create_and_returned_on_list(client):
    token, pet_id = _signup_login_and_pet(client, "cid-parasite", "tutor.parasita@example.com")
    headers = _headers("cid-parasite", token)

    create = client.post(
        f"/pets/{pet_id}/parasites",
        json={
            "type": "flea_tick",
            "product_name": "Coleira Seresto",
            "date_applied": "2026-08-14T00:00:00Z",
            "barcode": "7891234567890",
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text
    assert create.json()["barcode"] == "7891234567890"

    listed = client.get(f"/pets/{pet_id}/parasites", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["barcode"] == "7891234567890"


def test_barcode_optional_defaults_to_none(client):
    token, pet_id = _signup_login_and_pet(client, "cid-parasite-2", "tutor.parasita2@example.com")
    headers = _headers("cid-parasite-2", token)

    create = client.post(
        f"/pets/{pet_id}/parasites",
        json={
            "type": "dewormer",
            "product_name": "Vermífugo Genérico",
            "date_applied": "2026-08-14T00:00:00Z",
        },
        headers=headers,
    )
    assert create.status_code == 201, create.text
    assert create.json()["barcode"] is None


def test_barcode_untouched_by_partial_update(client):
    """PATCH que não menciona `barcode` não deve apagar um valor já salvo
    (endpoint usa exclude_unset — comportamento esperado, coberto aqui pra
    não regredir silenciosamente)."""
    token, pet_id = _signup_login_and_pet(client, "cid-parasite-3", "tutor.parasita3@example.com")
    headers = _headers("cid-parasite-3", token)

    create = client.post(
        f"/pets/{pet_id}/parasites",
        json={
            "type": "collar",
            "product_name": "Coleira Scalibor",
            "date_applied": "2026-08-14T00:00:00Z",
            "barcode": "7899999999999",
        },
        headers=headers,
    )
    record_id = create.json()["id"]

    update = client.patch(
        f"/pets/{pet_id}/parasites/{record_id}",
        json={"cost": 89.9},
        headers=headers,
    )
    assert update.status_code == 200, update.text
    assert update.json()["barcode"] == "7899999999999"

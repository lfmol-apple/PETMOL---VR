"""Import por IA nasce 'não conferido' (is_confirmed=False) até o tutor confirmar."""


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_pet(client, cid, email):
    client.post("/auth/signup", json={"name": "Tutor", "email": email, "password": "senha123",
                                      "terms_accepted": True}, headers=_headers(cid))
    token = client.post("/auth/login", json={"email": email, "password": "senha123"},
                        headers=_headers(cid)).json()["access_token"]
    pet = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=_headers(cid, token))
    return token, pet.json()["id"]


def _bulk(client, cid, token, pet_id, needs_review):
    return client.post(
        f"/health/pets/{pet_id}/vaccines/bulk-confirm",
        json={
            "country_code": "BR",
            "species": "dog",
            "needs_review": needs_review,
            "vaccines": [
                {"display_name": "Vanguard Plus", "applied_on": "2024-03-15",
                 "next_due_on": "2025-03-15", "source": "ocr_card"}
            ],
        },
        headers=_headers(cid, token),
    )


def test_ocr_import_is_unconfirmed(client):
    token, pet_id = _signup_pet(client, "cid-nr1", "nr1@example.com")
    r = _bulk(client, "cid-nr1", token, pet_id, needs_review=True)
    assert r.status_code == 200, r.text
    v = r.json()["vaccines"][0]
    assert v["is_confirmed"] is False

    # o tutor confirma o registro
    patched = client.patch(f"/vaccines/{v['id']}", json={"is_confirmed": True},
                           headers=_headers("cid-nr1", token))
    assert patched.status_code == 200, patched.text
    assert patched.json()["is_confirmed"] is True


def test_manual_bulk_import_stays_confirmed(client):
    token, pet_id = _signup_pet(client, "cid-nr2", "nr2@example.com")
    r = _bulk(client, "cid-nr2", token, pet_id, needs_review=False)
    assert r.status_code == 200, r.text
    assert r.json()["vaccines"][0]["is_confirmed"] is True


def test_ocr_brand_preserved_in_notes_when_canonicalized(client):
    token, pet_id = _signup_pet(client, "cid-nr4", "nr4@example.com")
    r = client.post(
        f"/health/pets/{pet_id}/vaccines/bulk-confirm",
        json={
            "country_code": "BR", "species": "dog", "needs_review": True,
            "vaccines": [{"display_name": "Antirrábica", "brand": "Nobivac Raiva",
                          "applied_on": "2024-05-01", "next_due_on": "2025-05-01"}],
        },
        headers=_headers("cid-nr4", token),
    )
    assert r.status_code == 200, r.text
    notes = (r.json()["vaccines"][0].get("notes") or "")
    assert "Nobivac Raiva" in notes


def test_plain_vaccine_create_is_confirmed(client):
    token, pet_id = _signup_pet(client, "cid-nr3", "nr3@example.com")
    r = client.post(f"/pets/{pet_id}/vaccines", json={
        "vaccine_name": "V10", "applied_date": "2026-01-10", "next_dose_date": "2027-01-10",
    }, headers=_headers("cid-nr3", token))
    assert r.status_code == 201, r.text
    assert r.json().get("is_confirmed", True) is True

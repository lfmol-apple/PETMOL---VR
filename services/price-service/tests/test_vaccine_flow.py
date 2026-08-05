"""Cadastrar vacina -> lembrete -> editar, plus cross-user isolation."""


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

    pet = client.post("/pets", json={"name": "Nina", "species": "cat"}, headers=_headers(cid, token))
    return token, pet.json()["id"]


def test_create_vaccine_with_reminder_and_edit(client):
    token, pet_id = _signup_login_and_pet(client, "cid-vaccine", "tutor.vacina@example.com")

    create = client.post(
        f"/pets/{pet_id}/vaccines",
        json={
            "vaccine_name": "Raiva / Rabies",
            "applied_date": "2026-08-01",
            "next_dose_date": "2027-08-01",
            "reminder_enabled": True,
            "reminder_date": "2027-07-25",
            "reminder_time": "09:00",
        },
        headers=_headers("cid-vaccine", token),
    )
    assert create.status_code == 201, create.text
    vaccine = create.json()
    assert vaccine["vaccine_name"] == "Raiva / Rabies"

    listing = client.get(f"/pets/{pet_id}/vaccines", headers=_headers("cid-vaccine", token))
    assert listing.status_code == 200
    assert any(v["id"] == vaccine["id"] for v in listing.json())

    edit = client.patch(
        f"/vaccines/{vaccine['id']}",
        json={"notes": "Aplicada na clínica X"},
        headers=_headers("cid-vaccine", token),
    )
    assert edit.status_code == 200, edit.text
    assert edit.json()["notes"] == "Aplicada na clínica X"


def test_vaccine_next_dose_before_applied_date_rejected(client):
    token, pet_id = _signup_login_and_pet(client, "cid-vaccine-baddate", "tutor.vacinadata@example.com")

    resp = client.post(
        f"/pets/{pet_id}/vaccines",
        json={
            "vaccine_name": "Leptospirose",
            "applied_date": "2026-08-01",
            "next_dose_date": "2026-07-01",  # before applied_date — invalid
        },
        headers=_headers("cid-vaccine-baddate", token),
    )
    assert resp.status_code == 422


def test_vaccine_isolated_between_users(client):
    token_a, pet_a = _signup_login_and_pet(client, "cid-vac-a", "tutor.vaca@example.com")
    token_b, _pet_b = _signup_login_and_pet(client, "cid-vac-b", "tutor.vacb@example.com")

    create = client.post(
        f"/pets/{pet_a}/vaccines",
        json={
            "vaccine_name": "V10",
            "applied_date": "2026-08-01",
            "next_dose_date": "2027-08-01",
        },
        headers=_headers("cid-vac-a", token_a),
    )
    vaccine_id = create.json()["id"]

    edit_by_b = client.patch(
        f"/vaccines/{vaccine_id}",
        json={"notes": "tentativa de outro usuário"},
        headers=_headers("cid-vac-b", token_b),
    )
    assert edit_by_b.status_code in (403, 404)

    delete_by_b = client.delete(f"/vaccines/{vaccine_id}", headers=_headers("cid-vac-b", token_b))
    assert delete_by_b.status_code in (403, 404)

    # A's vaccine record must be untouched.
    still_there = client.get(f"/pets/{pet_a}/vaccines", headers=_headers("cid-vac-a", token_a))
    matching = [v for v in still_there.json() if v["id"] == vaccine_id]
    assert len(matching) == 1
    assert matching[0]["notes"] != "tentativa de outro usuário"

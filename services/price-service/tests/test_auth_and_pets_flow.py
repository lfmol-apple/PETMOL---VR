"""Signup -> login -> pet CRUD, plus the ownership boundary between users."""


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_and_login(client, cid: str, email: str) -> str:
    signup = client.post(
        "/auth/signup",
        json={"name": "Tutor Teste", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    assert signup.status_code == 200, signup.text

    login = client.post(
        "/auth/login",
        json={"email": email, "password": "senha123"},
        headers=_headers(cid),
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_signup_login_and_first_pet(client):
    token = _signup_and_login(client, "cid-signup-pet", "tutor.pet@example.com")

    create = client.post(
        "/pets",
        json={"name": "Baby", "species": "dog"},
        headers=_headers("cid-signup-pet", token),
    )
    assert create.status_code == 201, create.text
    pet = create.json()
    assert pet["name"] == "Baby"
    assert pet["user_id"]  # server-assigned, not client-supplied

    get_resp = client.get(f"/pets/{pet['id']}", headers=_headers("cid-signup-pet", token))
    assert get_resp.status_code == 200
    assert get_resp.json()["id"] == pet["id"]

    listing = client.get("/pets", headers=_headers("cid-signup-pet", token))
    assert listing.status_code == 200
    assert any(p["id"] == pet["id"] for p in listing.json())


def test_login_wrong_password_rejected(client):
    _signup_and_login(client, "cid-wrongpw", "tutor.wrongpw@example.com")

    bad_login = client.post(
        "/auth/login",
        json={"email": "tutor.wrongpw@example.com", "password": "senha-errada"},
        headers=_headers("cid-wrongpw"),
    )
    assert bad_login.status_code == 401


def test_pet_isolated_between_users(client):
    """User A's pet must be invisible and unreachable to User B — even by guessing the pet_id."""
    token_a = _signup_and_login(client, "cid-owner-a", "tutor.a@example.com")
    token_b = _signup_and_login(client, "cid-owner-b", "tutor.b@example.com")

    created = client.post(
        "/pets",
        json={"name": "Rex", "species": "dog"},
        headers=_headers("cid-owner-a", token_a),
    )
    pet_id = created.json()["id"]

    # B never sees A's pet in their own listing.
    listing_b = client.get("/pets", headers=_headers("cid-owner-b", token_b))
    assert all(p["id"] != pet_id for p in listing_b.json())

    # B cannot fetch, edit, or delete A's pet by pet_id — expect 404, not a leaked 200/403.
    get_b = client.get(f"/pets/{pet_id}", headers=_headers("cid-owner-b", token_b))
    assert get_b.status_code == 404

    patch_b = client.patch(
        f"/pets/{pet_id}", json={"name": "Sequestrado"}, headers=_headers("cid-owner-b", token_b)
    )
    assert patch_b.status_code == 404

    delete_b = client.delete(f"/pets/{pet_id}", headers=_headers("cid-owner-b", token_b))
    assert delete_b.status_code == 404

    # A still has the pet, untouched.
    get_a = client.get(f"/pets/{pet_id}", headers=_headers("cid-owner-a", token_a))
    assert get_a.status_code == 200
    assert get_a.json()["name"] == "Rex"


def test_pets_require_authentication(client):
    resp = client.get("/pets", headers=_headers("cid-anon"))
    assert resp.status_code in (401, 403)

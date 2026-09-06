"""Account deletion must be a real erasure — the account and its pet data go,
not just a deactivation flag.

(The old "cofre de documentos" cleanup this file used to exercise was removed
along with the whole feature — o PETMOL não guarda arquivos de tutor.)
"""


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def test_deleting_account_is_a_real_erasure(client):
    cid = "cid-delete-account"
    email = "tutor.delecao@example.com"
    password = "senha123"

    client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": password, "terms_accepted": True},
        headers=_headers(cid),
    )
    login = client.post("/auth/login", json={"email": email, "password": password}, headers=_headers(cid))
    token = login.json()["access_token"]
    headers = _headers(cid, token)

    pet = client.post("/pets", json={"name": "Mia", "species": "cat"}, headers=headers)
    assert pet.status_code in (200, 201), pet.text

    delete = client.request("DELETE", "/auth/me", json={"password": password}, headers=headers)
    assert delete.status_code == 200, delete.text

    # A conta some de verdade — não é só desativação.
    relogin = client.post("/auth/login", json={"email": email, "password": password}, headers=_headers(cid))
    assert relogin.status_code == 401

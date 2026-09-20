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


def test_admin_delete_user_purges_pets_and_related_rows(client):
    """A exclusão pelo painel admin apaga o mesmo que a do app: sem isso a
    conta com pets dava 500 (FK) e dados sem FK ficavam órfãos."""
    from sqlalchemy import text

    from src.admin.deps import get_current_admin
    from src.db import SessionLocal
    from src.main import app

    cid = "cid-admin-delete"
    email = "tutor.admin.delecao@example.com"
    client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    login = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_headers(cid))
    token = login.json()["access_token"]
    headers = _headers(cid, token)
    pet = client.post("/pets", json={"name": "Mia", "species": "cat"}, headers=headers)
    assert pet.status_code in (200, 201), pet.text
    user_id = client.get("/auth/me", headers=headers).json()["id"]

    db = SessionLocal()
    try:
        db.execute(text(
            "INSERT INTO reminders (id, user_id, type, title, body, remind_at, sent, retry_count, created_at) "
            "VALUES ('rem-admin-del', :u, 'food', 't', 'b', '2026-10-01 09:00:00', 0, 0, '2026-09-20 10:00:00')"
        ), {"u": user_id})
        db.commit()
    finally:
        db.close()

    app.dependency_overrides[get_current_admin] = lambda: (type("U", (), {"id": "outro"})(), "adm")
    try:
        r = client.delete(f"/v1/admin/users/{user_id}")
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
    assert r.status_code == 200, r.text

    db = SessionLocal()
    try:
        assert db.execute(text("SELECT count(*) FROM pets WHERE user_id = :u"), {"u": user_id}).scalar() == 0
        assert db.execute(text("SELECT count(*) FROM reminders WHERE user_id = :u"), {"u": user_id}).scalar() == 0
        assert db.execute(text("SELECT count(*) FROM users WHERE id = :u"), {"u": user_id}).scalar() == 0
    finally:
        db.close()

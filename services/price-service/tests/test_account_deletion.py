"""Account deletion must be a real erasure — DB rows AND the files on disk.

Deleting only the DB row while leaving the uploaded file behind means the
document technically still exists on the server after the user asked to be
forgotten (LGPD's "direito ao apagamento" wouldn't hold up).
"""
from pathlib import Path

from src.pets.document_router import DOCS_UPLOAD_DIR


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def test_deleting_account_removes_uploaded_document_from_disk(client):
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
    pet_id = pet.json()["id"]

    upload = client.post(
        f"/pets/{pet_id}/documents/upload",
        files={"files": ("exame.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 32, "image/jpeg")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    doc = upload.json()["created"][0]

    stored_files_before = list(DOCS_UPLOAD_DIR.glob("*"))
    assert any(doc["id"] in f.name or f.stat().st_size > 0 for f in stored_files_before) or stored_files_before, (
        "upload didn't actually write a file — test setup is wrong, not the fix"
    )

    delete = client.request(
        "DELETE", "/auth/me", json={"password": password}, headers=headers
    )
    assert delete.status_code == 200, delete.text

    stored_files_after = list(DOCS_UPLOAD_DIR.glob("*"))
    assert len(stored_files_after) < len(stored_files_before) or len(stored_files_after) == 0, (
        f"file still on disk after account deletion: {stored_files_after}"
    )

    # DB side: the account is really gone, not just deactivated.
    relogin = client.post("/auth/login", json={"email": email, "password": password}, headers=_headers(cid))
    assert relogin.status_code == 401

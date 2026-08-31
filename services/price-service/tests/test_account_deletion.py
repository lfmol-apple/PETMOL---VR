"""Account deletion must be a real erasure — DB rows AND the files on disk.

Deleting only the DB row while leaving the uploaded file behind means the
document technically still exists on the server after the user asked to be
forgotten (LGPD's "direito ao apagamento" wouldn't hold up).

Uploading new documents was removed from the product (the PETMOL is not a
document repository), so this test seeds a legacy `pet_documents` row + file
directly to exercise the retained on-disk cleanup in delete_account().
"""
import uuid

from src.db import SessionLocal
from src.pets.document_models import PetDocument
from src.pets.document_router import DOCS_UPLOAD_DIR


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _seed_legacy_document(pet_id: str) -> str:
    """Write a file to the upload dir and insert a matching legacy row."""
    DOCS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    storage_key = f"{uuid.uuid4().hex}_exame.jpg"
    (DOCS_UPLOAD_DIR / storage_key).write_bytes(b"\xff\xd8\xff\xe0" + b"\x00" * 32)
    db = SessionLocal()
    try:
        doc = PetDocument(
            pet_id=pet_id,
            kind="file",
            title="Exame (legado)",
            source="upload",
            storage_key=storage_key,
            mime_type="image/jpeg",
            size_bytes=36,
        )
        db.add(doc)
        db.commit()
        return storage_key
    finally:
        db.close()


def test_deleting_account_removes_legacy_document_from_disk(client):
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

    storage_key = _seed_legacy_document(pet_id)
    assert (DOCS_UPLOAD_DIR / storage_key).is_file(), "test setup failed to write the file"

    delete = client.request(
        "DELETE", "/auth/me", json={"password": password}, headers=headers
    )
    assert delete.status_code == 200, delete.text

    assert not (DOCS_UPLOAD_DIR / storage_key).exists(), (
        "legacy document file still on disk after account deletion"
    )

    # DB side: the account is really gone, not just deactivated.
    relogin = client.post("/auth/login", json={"email": email, "password": password}, headers=_headers(cid))
    assert relogin.status_code == 401

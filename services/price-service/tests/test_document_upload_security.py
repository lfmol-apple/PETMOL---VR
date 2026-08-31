"""Regression test for the SVG/script inline-serving fix.

Uploading documents was removed from the product, but serve_document_file()
still serves the legacy acervo. mime_type on a legacy document is whatever
Content-Type the uploader once declared — never verified against file bytes.
serve_document_file() must only serve a fixed allowlist of genuinely safe
types inline (image/svg+xml is NOT on it, since SVG can carry a <script>
that executes when opened inline); everything else is forced to download.
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


def _signup_login_and_pet(client, cid: str, email: str) -> tuple[str, str]:
    client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    login = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_headers(cid))
    token = login.json()["access_token"]
    pet = client.post("/pets", json={"name": "Bolinha", "species": "dog"}, headers=_headers(cid, token))
    return token, pet.json()["id"]


def _seed_legacy_document(pet_id: str, filename: str, content: bytes, mime: str) -> str:
    DOCS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    storage_key = f"{uuid.uuid4().hex}_{filename}"
    (DOCS_UPLOAD_DIR / storage_key).write_bytes(content)
    db = SessionLocal()
    try:
        doc = PetDocument(
            pet_id=pet_id, kind="file", title=filename, source="upload",
            storage_key=storage_key, mime_type=mime, size_bytes=len(content),
        )
        db.add(doc)
        db.commit()
        db.refresh(doc)
        return doc.id
    finally:
        db.close()


def test_svg_legacy_document_is_not_served_inline(client):
    token, pet_id = _signup_login_and_pet(client, "cid-doc-svg", "tutor.docsvg@example.com")

    malicious_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    doc_id = _seed_legacy_document(pet_id, "exame.svg", malicious_svg, "image/svg+xml")

    served = client.get(
        f"/pets/{pet_id}/documents/{doc_id}/file",
        params={"token": token},
    )
    assert served.status_code == 200
    disposition = served.headers.get("content-disposition", "")
    assert "inline" not in disposition, (
        f"SVG served inline — Content-Disposition was {disposition!r}, "
        "browser would execute any embedded <script>"
    )
    assert "attachment" in disposition


def test_real_jpeg_legacy_document_is_still_served_inline(client):
    """The hardening must not break legitimate photo viewing."""
    token, pet_id = _signup_login_and_pet(client, "cid-doc-jpeg", "tutor.docjpeg@example.com")

    fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 32
    doc_id = _seed_legacy_document(pet_id, "foto.jpg", fake_jpeg, "image/jpeg")

    served = client.get(
        f"/pets/{pet_id}/documents/{doc_id}/file",
        params={"token": token},
    )
    assert served.status_code == 200
    assert "inline" in served.headers.get("content-disposition", "")

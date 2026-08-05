"""Regression test for the SVG/script inline-serving fix.

mime_type on a document is whatever Content-Type the uploader declared —
never verified against file bytes. serve_document_file() used to serve
anything starting with "image/" inline, including image/svg+xml (SVG can
carry a <script> that executes when the browser opens it inline). It must
now only serve a fixed allowlist of genuinely safe types inline; everything
else is forced to download (Content-Disposition: attachment).
"""


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


def test_svg_upload_is_not_served_inline(client):
    token, pet_id = _signup_login_and_pet(client, "cid-doc-svg", "tutor.docsvg@example.com")
    headers = _headers("cid-doc-svg", token)

    malicious_svg = b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"
    upload = client.post(
        f"/pets/{pet_id}/documents/upload",
        files={"files": ("exame.svg", malicious_svg, "image/svg+xml")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    created = upload.json()["created"]
    assert len(created) == 1
    doc_id = created[0]["id"]

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


def test_real_jpeg_upload_is_still_served_inline(client):
    """The hardening must not break legitimate photo viewing."""
    token, pet_id = _signup_login_and_pet(client, "cid-doc-jpeg", "tutor.docjpeg@example.com")
    headers = _headers("cid-doc-jpeg", token)

    # Minimal valid-enough JPEG header bytes — the endpoint doesn't validate
    # magic bytes, only the declared content_type, which is what this test targets.
    fake_jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 32
    upload = client.post(
        f"/pets/{pet_id}/documents/upload",
        files={"files": ("foto.jpg", fake_jpeg, "image/jpeg")},
        headers=headers,
    )
    assert upload.status_code == 201, upload.text
    doc_id = upload.json()["created"][0]["id"]

    served = client.get(
        f"/pets/{pet_id}/documents/{doc_id}/file",
        params={"token": token},
    )
    assert served.status_code == 200
    assert "inline" in served.headers.get("content-disposition", "")

"""Consentimento de IA por usuário para fotos enviadas ao Gemini."""


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


def test_ai_consent_user_scoped(client):
    token_a = _signup_and_login(client, "cid-ai-a", "ai-a@example.com")
    token_b = _signup_and_login(client, "cid-ai-b", "ai-b@example.com")

    granted = client.post("/vision/consent/ai-photo", headers=_headers("cid-ai-a", token_a))
    assert granted.status_code == 200
    assert granted.json()["granted"] is True

    a_state = client.get("/vision/consent/ai-photo", headers=_headers("cid-ai-a", token_a))
    b_state = client.get("/vision/consent/ai-photo", headers=_headers("cid-ai-b", token_b))

    assert a_state.json()["granted"] is True
    assert b_state.json()["granted"] is False


def test_user_b_does_not_inherit_user_a_consent(client):
    token_a = _signup_and_login(client, "cid-ai-inherit-a", "inherit-a@example.com")
    token_b = _signup_and_login(client, "cid-ai-inherit-b", "inherit-b@example.com")

    assert client.post("/vision/consent/ai-photo", headers=_headers("cid-ai-inherit-a", token_a)).status_code == 200

    resp = client.post(
        "/vision/identify-product-photo",
        json={"image": "aGVsbG8=", "pet_id": "pet-b", "hint": "food"},
        headers=_headers("cid-ai-inherit-b", token_b),
    )

    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "ai_photo_consent_required"


def test_ai_consent_revocation(client):
    token = _signup_and_login(client, "cid-ai-revoke", "revoke@example.com")

    assert client.post("/vision/consent/ai-photo", headers=_headers("cid-ai-revoke", token)).json()["granted"] is True
    revoked = client.delete("/vision/consent/ai-photo", headers=_headers("cid-ai-revoke", token))
    state = client.get("/vision/consent/ai-photo", headers=_headers("cid-ai-revoke", token))

    assert revoked.status_code == 200
    assert revoked.json()["granted"] is False
    assert revoked.json()["revoked_at"] is not None
    assert state.json()["granted"] is False


def test_no_gemini_request_without_current_user_consent(client, monkeypatch):
    token = _signup_and_login(client, "cid-ai-no-call", "no-call@example.com")
    called = {"value": False}

    class FailIfInstantiated:
        def __init__(self, *_args, **_kwargs):
            called["value"] = True
            raise AssertionError("VisionService must not be instantiated without consent")

    monkeypatch.setenv("GOOGLE_API_KEY", "test-key")
    monkeypatch.setattr("src.vision.router.VisionService", FailIfInstantiated)

    resp = client.post(
        "/vision/identify-product-photo",
        json={"image": "aGVsbG8=", "pet_id": "pet-a", "hint": "food"},
        headers=_headers("cid-ai-no-call", token),
    )

    assert resp.status_code == 403
    assert resp.json()["detail"]["error"] == "ai_photo_consent_required"
    assert called["value"] is False

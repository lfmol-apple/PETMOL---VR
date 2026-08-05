"""Recuperação de senha: solicitar -> confirmar -> logar com a nova senha."""
from urllib.parse import urlparse, parse_qs


def _headers(cid: str) -> dict:
    return {"X-PETMOL-CLIENT-ID": cid}


def test_password_reset_request_confirm_and_relogin(client, monkeypatch):
    email = "tutor.resenha@example.com"
    cid = "cid-pwreset"

    signup = client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": "senha-antiga", "terms_accepted": True},
        headers=_headers(cid),
    )
    assert signup.status_code == 200, signup.text

    captured = {}

    def fake_send(to_email, reset_url, ttl_minutes):
        captured["url"] = reset_url
        return True

    # The endpoint does `from ..email_otp import send_password_reset_email` inline
    # (not a module-level name on router), so patch the source module instead.
    monkeypatch.setattr("src.email_otp.send_password_reset_email", fake_send)

    req = client.post("/auth/password-reset/request", json={"email": email}, headers=_headers(cid))
    assert req.status_code == 200, req.text
    assert "url" in captured, "endpoint didn't call the email sender — token never generated"

    token = parse_qs(urlparse(captured["url"]).query)["token"][0]

    confirm = client.post(
        "/auth/password-reset/confirm",
        json={"token": token, "password": "senha-nova-123"},
        headers=_headers(cid),
    )
    assert confirm.status_code == 200, confirm.text

    old_login = client.post("/auth/login", json={"email": email, "password": "senha-antiga"}, headers=_headers(cid))
    assert old_login.status_code == 401

    new_login = client.post("/auth/login", json={"email": email, "password": "senha-nova-123"}, headers=_headers(cid))
    assert new_login.status_code == 200


def test_password_reset_token_cannot_be_reused(client, monkeypatch):
    email = "tutor.resenha2@example.com"
    cid = "cid-pwreset-reuse"

    client.post(
        "/auth/signup",
        json={"name": "Tutor", "email": email, "password": "senha-antiga", "terms_accepted": True},
        headers=_headers(cid),
    )

    captured = {}
    monkeypatch.setattr(
        "src.email_otp.send_password_reset_email",
        lambda to_email, reset_url, ttl_minutes: captured.setdefault("url", reset_url) or True,
    )
    client.post("/auth/password-reset/request", json={"email": email}, headers=_headers(cid))
    token = parse_qs(urlparse(captured["url"]).query)["token"][0]

    first = client.post(
        "/auth/password-reset/confirm", json={"token": token, "password": "primeira-nova"}, headers=_headers(cid)
    )
    assert first.status_code == 200

    second = client.post(
        "/auth/password-reset/confirm", json={"token": token, "password": "segunda-nova"}, headers=_headers(cid)
    )
    assert second.status_code >= 400, "token de reset reutilizado deveria falhar"


def test_password_reset_request_unknown_email_does_not_leak(client):
    resp = client.post(
        "/auth/password-reset/request",
        json={"email": "ninguem@example.com"},
        headers=_headers("cid-pwreset-unknown"),
    )
    # Mesma resposta genérica de sucesso, para não revelar quais e-mails existem.
    assert resp.status_code == 200
    assert resp.json()["ok"] is True

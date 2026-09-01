"""Fale com o Petmol — persiste no banco E notifica a caixa da gerência por e-mail."""
import src.support.router as support_router


def _headers(cid: str, token: str | None = None) -> dict:
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup_and_login(client, cid: str, email: str) -> str:
    client.post(
        "/auth/signup",
        json={"name": "Tutor Suporte", "email": email, "password": "senha123", "terms_accepted": True},
        headers=_headers(cid),
    )
    login = client.post(
        "/auth/login",
        json={"email": email, "password": "senha123"},
        headers=_headers(cid),
    )
    assert login.status_code == 200, login.text
    return login.json()["access_token"]


def test_feedback_persists_and_emails_inbox(client, monkeypatch):
    captured: dict = {}

    def fake_send(*, to, subject, body_text, body_html=None, reply_to=None):
        captured.update(to=to, subject=subject, body_text=body_text, reply_to=reply_to)
        return True

    monkeypatch.setattr(support_router, "send_mail", fake_send)

    token = _signup_and_login(client, "cid-sup-a", "sup.a@example.com")
    resp = client.post(
        "/support/feedback",
        json={"category": "suggestion", "message": "Seria ótimo ter modo escuro.", "platform": "web"},
        headers=_headers("cid-sup-a", token),
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["status"] == "new"

    assert captured["to"] == "gerenciamento@petmol.com.br"
    assert "Fale com o Petmol" in captured["subject"]
    assert "modo escuro" in captured["body_text"]
    assert captured["reply_to"] == "sup.a@example.com"


def test_feedback_still_ok_when_email_raises(client, monkeypatch):
    def boom(**_):
        raise RuntimeError("smtp down")

    monkeypatch.setattr(support_router, "send_mail", boom)

    token = _signup_and_login(client, "cid-sup-b", "sup.b@example.com")
    resp = client.post(
        "/support/feedback",
        json={"category": "bug", "message": "achei um bug"},
        headers=_headers("cid-sup-b", token),
    )
    assert resp.status_code == 201, resp.text


def test_feedback_anonymous_has_no_reply_to(client, monkeypatch):
    captured: dict = {}

    def fake_send(*, to, subject, body_text, body_html=None, reply_to=None):
        captured.update(reply_to=reply_to, to=to)
        return True

    monkeypatch.setattr(support_router, "send_mail", fake_send)

    resp = client.post(
        "/support/feedback",
        json={"category": "help", "message": "não consigo cadastrar"},
        headers=_headers("cid-sup-anon"),
    )
    assert resp.status_code == 201, resp.text
    assert captured["reply_to"] is None


def test_feedback_rejects_bad_category(client):
    resp = client.post(
        "/support/feedback",
        json={"category": "xpto", "message": "oi"},
        headers=_headers("cid-sup-c"),
    )
    assert resp.status_code == 400

"""Aviso único do registro rápido de vacina: só quem tem data provavelmente errada,
prévia sem e-mails, e cada tutor recebe uma única vez."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.main import app

SP = ZoneInfo("America/Sao_Paulo")


@pytest.fixture(autouse=True)
def _admin(monkeypatch):
    app.dependency_overrides[get_current_admin] = lambda: ("fake-user", "fake-admin")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("fake-user", "fake-admin")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def _h(cid, token=None):
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _tutor(client, n):
    cid, email = f"cid-vn{n}", f"vn{n}@example.com"
    client.post("/auth/signup", json={"name": "Tutor Teste", "email": email, "password": "senha123",
                                      "terms_accepted": True}, headers=_h(cid))
    token = client.post("/auth/login", json={"email": email, "password": "senha123"}, headers=_h(cid)).json()["access_token"]
    pet_id = client.post("/pets", json={"name": "Rex", "species": "dog"}, headers=_h(cid, token)).json()["id"]
    return cid, token, pet_id


def _vaccine(client, cid, token, pet_id, applied_on, source, name="Antirrábica"):
    r = client.post(f"/health/pets/{pet_id}/vaccines/bulk-confirm", json={
        "country_code": "BR", "species": "dog",
        "vaccines": [{"display_name": name, "applied_on": applied_on, "source": source,
                      "confirmed_by_user": True, "record_type": "confirmed_application"}],
    }, headers=_h(cid, token))
    assert r.status_code == 200, r.text


def _window():
    now = datetime.now(timezone.utc)
    return {"since": (now - timedelta(hours=1)).isoformat(), "until": (now + timedelta(hours=1)).isoformat()}


def test_only_probably_wrong_quick_add_dates_are_targeted(client):
    today = datetime.now(SP).date()
    a = _tutor(client, 1)   # quick_add com a data de hoje → avisar
    _vaccine(client, *a, today.isoformat(), "quick_add")
    b = _tutor(client, 2)   # quick_add com data escolhida meses atrás → NÃO avisar
    _vaccine(client, *b, (today - timedelta(days=182)).isoformat(), "quick_add")
    c = _tutor(client, 3)   # formulário completo (outra origem) com data de hoje → NÃO avisar
    _vaccine(client, *c, today.isoformat(), "manual")

    r = client.get("/v1/admin/notices/vaccine-date/preview", params=_window())
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["users_affected"] == 1 and body["records_affected"] == 1
    assert body["to_notify_now"] == 1
    assert "@" not in r.text                     # prévia não vaza e-mail


def test_send_notifies_once_by_push_and_email_and_never_twice(client, monkeypatch):
    today = datetime.now(SP).date()
    a = _tutor(client, 4)
    _vaccine(client, *a, today.isoformat(), "quick_add", name="V10")
    pushes, mails = [], []
    monkeypatch.setattr("src.notifications.push_to_user", lambda uid, payload: pushes.append((uid, payload)) or 1)
    monkeypatch.setattr("src.mailer.send_mail", lambda **kw: mails.append(kw) or True)

    r1 = client.post("/v1/admin/notices/vaccine-date/send", json=_window())
    assert r1.status_code == 200, r1.text
    assert r1.json()["users"] == 1 and r1.json()["emails"] == 1 and r1.json()["push_devices"] == 1
    assert len(pushes) == 1 and len(mails) == 1
    assert "V10 — Rex" in mails[0]["body_text"]
    assert mails[0]["to"] == "vn4@example.com"

    r2 = client.post("/v1/admin/notices/vaccine-date/send", json=_window())
    assert r2.json()["users"] == 0                       # segunda chamada não reenvia
    assert len(pushes) == 1 and len(mails) == 1
    assert client.get("/v1/admin/notices/vaccine-date/preview", params=_window()).json()["already_notified"] == 1

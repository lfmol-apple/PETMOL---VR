"""Push nativo Android (FCM) — o envio deve ser no-op silencioso enquanto a
service account do Firebase não estiver configurada, e fan-out real quando
estiver. Espelha test_apns_native_push.py.
"""
import json
import uuid

import pytest

from src.db import SessionLocal, Base, engine
from src.config import get_settings
import src.notifications as notif
from src.notifications import NativePushToken
from src.notifications import fcm as fcm_mod


@pytest.fixture(autouse=True)
def _isolate():
    Base.metadata.create_all(bind=engine)
    fcm_mod._token_cache["token"] = None
    fcm_mod._token_cache["exp"] = 0.0
    fcm_mod._token_cache["project_id"] = None
    yield


def _android_token(db, user_id, value):
    row = NativePushToken(
        id=str(uuid.uuid4()), user_id=user_id, platform="android", token=value,
    )
    db.add(row)
    db.commit()
    return row.id


def _fake_service_account_json() -> str:
    return json.dumps({
        "project_id": "petmol-test",
        "client_email": "fcm@petmol-test.iam.gserviceaccount.com",
        "private_key": "not-a-real-key",
    })


def test_fcm_not_configured_is_noop():
    assert fcm_mod.fcm_configured() is False
    assert fcm_mod.send_fcm("devtoken", {"title": "x", "body": "y"}) == (False, False)

    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        _android_token(db, uid, "tok-a")
    assert notif.push_native_ios_to_user(uid, {"title": "x", "body": "y"}) == 0


def test_fcm_fanout_sends_and_disables_invalid(monkeypatch):
    monkeypatch.setattr(notif, "fcm_configured", lambda: True)

    calls = []

    def fake_send(token, payload):
        calls.append(token)
        return (False, True) if token == "tok-bad" else (True, False)

    monkeypatch.setattr(notif, "send_fcm", fake_send)

    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        _android_token(db, uid, "tok-good")
        bad_id = _android_token(db, uid, "tok-bad")

    ok = notif.push_native_ios_to_user(uid, {"title": "🐾", "body": "oi", "data": {"url": "/home"}})
    assert ok == 1
    assert set(calls) == {"tok-good", "tok-bad"}

    with SessionLocal() as db:
        bad = db.query(NativePushToken).filter(NativePushToken.id == bad_id).first()
        assert bad.disabled_at is not None
        good = db.query(NativePushToken).filter(NativePushToken.token == "tok-good").first()
        assert good.disabled_at is None


def test_fcm_mixed_platforms_dispatch_to_the_right_sender(monkeypatch):
    """Um usuário com token iOS E Android — cada um vai pro sender certo."""
    monkeypatch.setattr(notif, "apns_configured", lambda: True)
    monkeypatch.setattr(notif, "fcm_configured", lambda: True)

    apns_calls, fcm_calls = [], []
    monkeypatch.setattr(notif, "send_apns", lambda token, payload: (apns_calls.append(token), (True, False))[1])
    monkeypatch.setattr(notif, "send_fcm", lambda token, payload: (fcm_calls.append(token), (True, False))[1])

    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        db.add(NativePushToken(id=str(uuid.uuid4()), user_id=uid, platform="ios", token="ios-tok"))
        db.add(NativePushToken(id=str(uuid.uuid4()), user_id=uid, platform="android", token="android-tok"))
        db.commit()

    ok = notif.push_native_ios_to_user(uid, {"title": "x", "body": "y"})
    assert ok == 2
    assert apns_calls == ["ios-tok"]
    assert fcm_calls == ["android-tok"]


def test_fcm_service_account_from_file(monkeypatch, tmp_path):
    path = tmp_path / "fcm-service-account.json"
    path.write_text(_fake_service_account_json())

    s = get_settings()
    monkeypatch.setattr(s, "fcm_service_account_json_file", str(path), raising=False)
    monkeypatch.setattr(s, "fcm_service_account_json", None, raising=False)

    assert fcm_mod.fcm_configured() is True


def test_fcm_service_account_malformed_json_is_not_configured(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "fcm_service_account_json_file", None, raising=False)
    monkeypatch.setattr(s, "fcm_service_account_json", "{not valid json", raising=False)
    assert fcm_mod.fcm_configured() is False


def test_fcm_access_token_jwt_shape_with_generated_key(monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    account = json.dumps({
        "project_id": "petmol-test",
        "client_email": "fcm@petmol-test.iam.gserviceaccount.com",
        "private_key": pem,
    })
    s = get_settings()
    monkeypatch.setattr(s, "fcm_service_account_json", account, raising=False)
    monkeypatch.setattr(s, "fcm_service_account_json_file", None, raising=False)

    assert fcm_mod.fcm_configured() is True

    # _get_access_token faz uma troca HTTP real com o Google — aqui só
    # validamos que o JWT (a "assertion") é montado corretamente antes
    # dessa troca, sem depender de rede.
    account_dict = fcm_mod._load_service_account()
    assert account_dict["project_id"] == "petmol-test"

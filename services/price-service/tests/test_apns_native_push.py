"""Push nativo iOS (APNs) — o envio deve ser no-op silencioso enquanto a
APNs Auth Key não estiver configurada, e fan-out real quando estiver.
"""
import uuid

import pytest

from src.db import SessionLocal, Base, engine
from src.config import get_settings
import src.notifications as notif
from src.notifications import NativePushToken
from src.notifications import apns as apns_mod


@pytest.fixture(autouse=True)
def _isolate():
    Base.metadata.create_all(bind=engine)
    apns_mod._jwt_cache["token"] = None
    apns_mod._jwt_cache["exp"] = 0.0
    yield


def _ios_token(db, user_id, value):
    row = NativePushToken(
        id=str(uuid.uuid4()), user_id=user_id, platform="ios", token=value,
    )
    db.add(row)
    db.commit()
    return row.id


def test_apns_not_configured_is_noop():
    assert apns_mod.apns_configured() is False
    assert apns_mod.send_apns("devtoken", {"title": "x", "body": "y"}) == (False, False)

    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        _ios_token(db, uid, "tok-a")
    assert notif.push_native_ios_to_user(uid, {"title": "x", "body": "y"}) == 0


def test_apns_fanout_sends_and_disables_invalid(monkeypatch):
    monkeypatch.setattr(notif, "apns_configured", lambda: True)

    calls = []

    def fake_send(token, payload):
        calls.append(token)
        return (False, True) if token == "tok-bad" else (True, False)

    monkeypatch.setattr(notif, "send_apns", fake_send)

    uid = str(uuid.uuid4())
    with SessionLocal() as db:
        _ios_token(db, uid, "tok-good")
        bad_id = _ios_token(db, uid, "tok-bad")

    ok = notif.push_native_ios_to_user(uid, {"title": "🐾", "body": "oi", "data": {"url": "/home"}})
    assert ok == 1
    assert set(calls) == {"tok-good", "tok-bad"}

    with SessionLocal() as db:
        bad = db.query(NativePushToken).filter(NativePushToken.id == bad_id).first()
        assert bad.disabled_at is not None
        good = db.query(NativePushToken).filter(NativePushToken.token == "tok-good").first()
        assert good.disabled_at is None


def test_apns_key_from_file(monkeypatch, tmp_path):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()
    p8 = tmp_path / "AuthKey_ABC123.p8"
    p8.write_text(pem)

    s = get_settings()
    monkeypatch.setattr(s, "apns_auth_key_p8_file", str(p8), raising=False)
    monkeypatch.setattr(s, "apns_auth_key_p8", None, raising=False)
    monkeypatch.setattr(s, "apns_key_id", "ABC1234567", raising=False)
    monkeypatch.setattr(s, "apns_team_id", "TEAM123456", raising=False)
    apns_mod._jwt_cache["token"] = None
    apns_mod._jwt_cache["exp"] = 0.0

    assert apns_mod.apns_configured() is True
    assert apns_mod._build_jwt().count(".") == 2


def test_apns_jwt_shape_with_generated_key(monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    key = ec.generate_private_key(ec.SECP256R1())
    pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode()

    s = get_settings()
    monkeypatch.setattr(s, "apns_auth_key_p8", pem, raising=False)
    monkeypatch.setattr(s, "apns_key_id", "ABC123KEYID", raising=False)
    monkeypatch.setattr(s, "apns_team_id", "TEAM123456", raising=False)

    token = apns_mod._build_jwt()
    assert token and token.count(".") == 2
    # cacheia
    assert apns_mod._build_jwt() == token

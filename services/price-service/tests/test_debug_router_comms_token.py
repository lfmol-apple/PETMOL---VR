"""apns-test/fcm-test mandam push de VERDADE pra um usuário escolhido por
e-mail — achado real, 28/09/2026: usavam a chave admin read-only (pensada só
pra leitura, sem rastro por ação) em vez do token de escrita/comunicação.
Corrigido pra exigir o mesmo token de domínio das campanhas de e-mail/push
(COMMS_OPS_TRIGGER_TOKEN) — nunca a chave read-only, nunca o token de loja."""
import uuid

from src.config import get_settings
from src.db import SessionLocal
from src.notifications import NativePushToken
from src.user_auth.models import User
from src.user_auth.security import hash_password

TOKEN = "comms-teste-token"
READONLY_KEY = "readonly-teste-key"


def _enable_comms_token(monkeypatch, token: str = TOKEN) -> None:
    monkeypatch.setenv("COMMS_OPS_TRIGGER_TOKEN", token)
    monkeypatch.setenv("ADMIN_OPS_API_KEY", READONLY_KEY)
    get_settings.cache_clear()


def _mk_user_with_ios_token(db) -> str:
    email = f"apns.{uuid.uuid4().hex[:8]}@example.com"
    u = User(id=str(uuid.uuid4()), email=email, name="Teste APNs", password_hash=hash_password("x"))
    db.add(u)
    db.commit()
    db.add(NativePushToken(id=str(uuid.uuid4()), user_id=u.id, platform="ios", token="tok-ios-fake"))
    db.commit()
    return email


def test_apns_test_sem_token_recusa_com_401(client):
    r = client.post("/v1/admin/debug/apns-test", params={"email": "qualquer@example.com"})
    assert r.status_code == 401


def test_apns_test_com_chave_readonly_recusa_com_401(monkeypatch, client):
    """A chave read-only NUNCA deve funcionar aqui — é rota de escrita (manda push de verdade)."""
    _enable_comms_token(monkeypatch)
    email = None
    db = SessionLocal()
    try:
        email = _mk_user_with_ios_token(db)
    finally:
        db.close()
    r = client.post("/v1/admin/debug/apns-test", params={"email": email},
                     headers={"X-Admin-Api-Key": READONLY_KEY})
    assert r.status_code == 401


def test_apns_test_token_errado_recusa_com_401(monkeypatch, client):
    _enable_comms_token(monkeypatch)
    r = client.post("/v1/admin/debug/apns-test", params={"email": "qualquer@example.com"},
                     headers={"X-Comms-Token": "errado"})
    assert r.status_code == 401


def test_apns_test_com_token_certo_funciona(monkeypatch, client):
    _enable_comms_token(monkeypatch)
    monkeypatch.setattr("src.admin.debug_router.send_apns", lambda token, payload, host_override=None: (True, False))

    db = SessionLocal()
    try:
        email = _mk_user_with_ios_token(db)
    finally:
        db.close()

    r = client.post("/v1/admin/debug/apns-test", params={"email": email},
                     headers={"X-Comms-Token": TOKEN})
    assert r.status_code == 200, r.text
    assert r.json()["email"] == email


def test_fcm_test_sem_token_recusa_com_401(client):
    r = client.post("/v1/admin/debug/fcm-test", params={"email": "qualquer@example.com"})
    assert r.status_code == 401


def test_fcm_test_com_chave_readonly_recusa_com_401(monkeypatch, client):
    _enable_comms_token(monkeypatch)
    db = SessionLocal()
    try:
        email = f"fcm.{uuid.uuid4().hex[:8]}@example.com"
        u = User(id=str(uuid.uuid4()), email=email, name="Teste FCM", password_hash=hash_password("x"))
        db.add(u)
        db.commit()
        db.add(NativePushToken(id=str(uuid.uuid4()), user_id=u.id, platform="android", token="tok-android-fake"))
        db.commit()
    finally:
        db.close()
    r = client.post("/v1/admin/debug/fcm-test", params={"email": email},
                     headers={"X-Admin-Api-Key": READONLY_KEY})
    assert r.status_code == 401

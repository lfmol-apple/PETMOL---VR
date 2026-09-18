"""Bug real (18/09/2026, relatado ao vivo pelo dono): "uma conta disparando
alerta na outra". Causa raiz: o endpoint de Web Push (e o token nativo
FCM/APNs) pertencem ao APARELHO/navegador, não à conta. Trocar de conta no
mesmo aparelho sem isso deixava a conta antiga "dona" do endpoint/token pra
sempre — ela continuava recebendo os pushes desse aparelho mesmo depois de
outra conta logar nele (exatamente o cenário de um dev testando várias
contas no mesmo celular)."""
import uuid

from src.db import SessionLocal, Base, engine
from src.notifications import PushSubscription, NativePushToken


def _headers(cid, token=None):
    h = {"X-PETMOL-CLIENT-ID": cid}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


def _signup(client, cid, email):
    client.post("/auth/signup", json={"name": "Tutor", "email": email, "password": "senha123",
                                      "terms_accepted": True}, headers=_headers(cid))
    return client.post("/auth/login", json={"email": email, "password": "senha123"},
                       headers=_headers(cid)).json()["access_token"]


def test_subscribing_on_a_device_disables_the_previous_accounts_subscription(client):
    endpoint = f"https://push.example/shared-device-{uuid.uuid4()}"
    token_a = _signup(client, "cid-handoff-a", f"a-{uuid.uuid4()}@example.com")
    token_b = _signup(client, "cid-handoff-b", f"b-{uuid.uuid4()}@example.com")

    sub_body = {
        "subscription": {"endpoint": endpoint, "keys": {"p256dh": "k", "auth": "a"}},
    }
    r = client.post("/notifications/subscribe", json=sub_body, headers=_headers("cid-handoff-a", token_a))
    assert r.status_code == 200, r.text

    with SessionLocal() as db:
        row_a = db.query(PushSubscription).filter_by(endpoint=endpoint).one()
        assert row_a.disabled_at is None

    # Mesmo aparelho/navegador, outra conta loga e se inscreve com o MESMO endpoint.
    r = client.post("/notifications/subscribe", json=sub_body, headers=_headers("cid-handoff-b", token_b))
    assert r.status_code == 200, r.text

    with SessionLocal() as db:
        rows = db.query(PushSubscription).filter_by(endpoint=endpoint).all()
        by_user = {row.user_id: row for row in rows}
        assert by_user[row_a.user_id].disabled_at is not None, (
            "conta A continua ativa neste endpoint depois de B se inscrever no mesmo aparelho"
        )
        b_user_id = [uid for uid in by_user if uid != row_a.user_id][0]
        assert by_user[b_user_id].disabled_at is None


def test_registering_native_token_on_a_device_disables_the_previous_accounts_token(client):
    Base.metadata.create_all(bind=engine)
    device_token = f"fcm-token-{uuid.uuid4()}"
    token_a = _signup(client, "cid-native-a", f"na-{uuid.uuid4()}@example.com")
    token_b = _signup(client, "cid-native-b", f"nb-{uuid.uuid4()}@example.com")

    body = {"platform": "android", "token": device_token}
    r = client.post("/notifications/native-device", json=body, headers=_headers("cid-native-a", token_a))
    assert r.status_code == 200, r.text

    r = client.post("/notifications/native-device", json=body, headers=_headers("cid-native-b", token_b))
    assert r.status_code == 200, r.text

    with SessionLocal() as db:
        rows = db.query(NativePushToken).filter_by(token=device_token).all()
        by_user = {row.user_id: row for row in rows}
        assert len(by_user) == 2
        disabled_count = sum(1 for row in by_user.values() if row.disabled_at is not None)
        active_count = sum(1 for row in by_user.values() if row.disabled_at is None)
        assert disabled_count == 1, "conta antiga deveria ter sido desativada neste token"
        assert active_count == 1

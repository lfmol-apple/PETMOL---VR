"""Som do aviso de Pet Sumido: desligado por padrão; ligar é só trocar o env (ver push_sound.py)."""
import pytest

from src.config import get_settings
from src.notifications.push_sound import apns_sound, fcm_channel_id, push_sound_style

NEARBY = {"title": "t", "body": "b", "tag": "missing-pet-123"}
RADIUS = {"title": "t", "body": "b", "tag": "missing-pet-radius-123"}
EXPIRED = {"title": "t", "body": "b", "tag": "missing-pet-expired-123"}
OTHER = {"title": "t", "body": "b", "tag": "petmol-install"}


def test_ligado_por_padrao_so_no_aviso_de_pet_sumido_proximo():
    """Decisão do dono (26/09/2026): o som do PETMOL vem ligado; o resto segue com o som do sistema."""
    assert get_settings().push_sound_style == "petmol"
    for p in (NEARBY, RADIUS):
        assert apns_sound(p) == "petmol.caf" and fcm_channel_id(p) == "petsumido_petmol"
    for p in (EXPIRED, OTHER):
        assert apns_sound(p) == "default" and fcm_channel_id(p) is None


def test_voltar_ao_padrao_e_so_trocar_o_valor(monkeypatch):
    """PUSH_SOUND_STYLE=default (ou vazio) = som do sistema, exatamente como antes."""
    for value in ("default", "", None):
        monkeypatch.setattr(get_settings(), "push_sound_style", value, raising=False)
        for p in (NEARBY, RADIUS, EXPIRED, OTHER):
            assert apns_sound(p) == "default"
            assert fcm_channel_id(p) is None


@pytest.mark.parametrize("style,ios,android", [
    ("petmol", "petmol.caf", "petsumido_petmol"),
    ("latido", "latido.caf", "petsumido_latido"),
    (" LATIDO ", "latido.caf", "petsumido_latido"),
])
def test_ligado_so_muda_o_aviso_de_pet_sumido_proximo(monkeypatch, style, ios, android):
    monkeypatch.setattr(get_settings(), "push_sound_style", style, raising=False)
    for p in (NEARBY, RADIUS):
        assert apns_sound(p) == ios
        assert fcm_channel_id(p) == android
    for p in (EXPIRED, OTHER):  # vencido e qualquer outra notificação: som do sistema
        assert apns_sound(p) == "default"
        assert fcm_channel_id(p) is None


def test_valor_invalido_no_env_vira_default(monkeypatch):
    monkeypatch.setattr(get_settings(), "push_sound_style", "buzina", raising=False)
    assert push_sound_style(NEARBY) == "default"
    assert apns_sound(NEARBY) == "default" and fcm_channel_id(NEARBY) is None


def test_payload_real_do_apns_e_do_fcm(monkeypatch):
    """O corpo enviado ao APNs/FCM usa o som certo (e o de sempre quando desligado)."""
    import src.notifications.apns as apns
    import src.notifications.fcm as fcm

    sent = {}

    class Resp:
        status_code = 200
        def json(self): return {}

    class Client:
        def post(self, url, headers=None, content=None, json=None, **kw):
            import json as _j
            sent["body"] = _j.loads(content.decode("utf-8"))
            return Resp()

    monkeypatch.setattr(apns, "apns_configured", lambda: True)
    monkeypatch.setattr(apns, "_build_jwt", lambda: "jwt")
    monkeypatch.setattr(apns, "_get_send_client", lambda: Client())
    monkeypatch.setattr(fcm, "fcm_configured", lambda: True)
    monkeypatch.setattr(fcm, "_get_access_token", lambda: "tok")
    monkeypatch.setattr(fcm, "_token_cache", {"project_id": "p"}, raising=False)
    monkeypatch.setattr(fcm, "_get_send_client", lambda: Client())
    monkeypatch.setattr(fcm, "_log_attempt", lambda *a, **k: None)
    monkeypatch.setattr(apns, "_log_attempt", lambda *a, **k: None)

    def apns_sound_sent():
        apns.send_apns("tok", dict(NEARBY)); return sent["body"]["aps"]["sound"]
    def fcm_android_sent():
        fcm.send_fcm("tok", dict(NEARBY)); return sent["body"]["message"].get("android")

    monkeypatch.setattr(get_settings(), "push_sound_style", "default", raising=False)
    assert apns_sound_sent() == "default" and fcm_android_sent() is None
    monkeypatch.setattr(get_settings(), "push_sound_style", "latido", raising=False)
    assert apns_sound_sent() == "latido.caf"
    assert fcm_android_sent() == {"notification": {"channel_id": "petsumido_latido"}}

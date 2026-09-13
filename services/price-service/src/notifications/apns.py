"""Envio de push nativo iOS via APNs (HTTP/2 + JWT ES256).

No-op silencioso enquanto `apns_auth_key_p8` / `apns_key_id` / `apns_team_id`
não estiverem configurados — o token do dispositivo continua sendo coletado
(tabela `native_push_tokens`), só não há pra onde mandar ainda. Ligar =
setar as 3 envs + restart. Ver docs/MOBILE_RELEASE_CHECKLIST.md.
"""
import json
import logging
import time
from base64 import urlsafe_b64encode
from typing import Optional, Tuple

from ..config import get_settings

logger = logging.getLogger(__name__)

_PROD_HOST = "api.push.apple.com"
_SANDBOX_HOST = "api.sandbox.push.apple.com"

# A APNs aceita reusar o mesmo JWT por até 1h — renovamos aos 50 min.
_jwt_cache: dict = {"token": None, "exp": 0.0}


def _load_auth_key_pem() -> Optional[str]:
    """Conteúdo PEM da APNs Auth Key. Três formas de fornecer, nessa ordem:
      1. APNS_AUTH_KEY_P8_FILE — caminho pro arquivo .p8 no servidor
         (recomendado: `scp` o .p8 e aponta pra ele; nada de multi-linha
         no api.env).
      2. APNS_AUTH_KEY_P8 — o PEM inline. Aceita `\\n` literais (erro comum
         ao colar num .env de uma linha só).
    """
    s = get_settings()
    path = getattr(s, "apns_auth_key_p8_file", None)
    if path:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return fh.read()
        except OSError as e:
            logger.error("APNs: não consegui ler APNS_AUTH_KEY_P8_FILE (%s): %s", path, e)
            return None
    raw = s.apns_auth_key_p8
    if raw:
        return raw.replace("\\n", "\n")
    return None


def apns_configured() -> bool:
    s = get_settings()
    return bool(_load_auth_key_pem() and s.apns_key_id and s.apns_team_id)


def _b64url(raw: bytes) -> str:
    return urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _build_jwt() -> Optional[str]:
    s = get_settings()
    now = time.time()
    if _jwt_cache["token"] and now < _jwt_cache["exp"]:
        return _jwt_cache["token"]
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

        pem = _load_auth_key_pem()
        if not pem:
            return None
        key = serialization.load_pem_private_key(pem.encode("utf-8"), password=None)
        header = _b64url(json.dumps({"alg": "ES256", "kid": s.apns_key_id}, separators=(",", ":")).encode())
        claims = _b64url(json.dumps({"iss": s.apns_team_id, "iat": int(now)}, separators=(",", ":")).encode())
        signing_input = f"{header}.{claims}".encode("ascii")
        der = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
        r, sig_s = decode_dss_signature(der)
        raw_sig = r.to_bytes(32, "big") + sig_s.to_bytes(32, "big")
        token = f"{header}.{claims}.{_b64url(raw_sig)}"
        _jwt_cache["token"] = token
        _jwt_cache["exp"] = now + 50 * 60
        return token
    except Exception as e:  # chave malformada, cryptography ausente, etc.
        logger.error("APNs JWT build failed: %s", e)
        return None


def send_apns(device_token: str, payload: dict) -> Tuple[bool, bool]:
    """Envia UMA notificação para um device token iOS.

    Retorna `(ok, invalid)`. `invalid=True` quando o token deve ser
    desativado no banco (410 Unregistered / BadDeviceToken / etc.).
    """
    if not apns_configured():
        return (False, False)
    jwt = _build_jwt()
    if not jwt:
        return (False, False)

    s = get_settings()
    host = _SANDBOX_HOST if s.apns_use_sandbox else _PROD_HOST

    aps: dict = {
        "alert": {"title": payload.get("title") or "PETMOL", "body": payload.get("body") or ""},
        "sound": "default",
    }
    # APNs badge é NÚMERO — o payload do Web Push usa "badge" pra um caminho
    # de imagem, então só passamos adiante se for int.
    if isinstance(payload.get("badge"), int):
        aps["badge"] = payload["badge"]
    body: dict = {"aps": aps}
    data = payload.get("data")
    if isinstance(data, dict):
        for k, v in data.items():
            if k != "aps":
                body[k] = v

    try:
        import httpx

        with httpx.Client(http2=True, timeout=10.0) as client:
            resp = client.post(
                f"https://{host}/3/device/{device_token}",
                headers={
                    "authorization": f"bearer {jwt}",
                    "apns-topic": s.apns_topic,
                    "apns-push-type": "alert",
                    "apns-priority": "10",
                },
                content=json.dumps(body).encode("utf-8"),
            )
        if resp.status_code == 200:
            return (True, False)
        reason = ""
        try:
            reason = (resp.json() or {}).get("reason", "")
        except Exception:
            pass
        invalid = resp.status_code == 410 or reason in {
            "BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic", "TopicDisallowed",
        }
        logger.warning("APNs %s (%s) token=…%s", resp.status_code, reason, (device_token or "")[-6:])
        return (False, invalid)
    except Exception as e:  # h2 ausente, rede, etc. — nunca propaga
        logger.error("APNs send error: %s", e)
        return (False, False)

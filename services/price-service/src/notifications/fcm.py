"""Envio de push nativo Android via Firebase Cloud Messaging (HTTP v1 API).

No-op silencioso enquanto `fcm_service_account_json` / `fcm_service_account_json_file`
não estiverem configurados — o token do dispositivo continua sendo coletado
(tabela `native_push_tokens`), só não há pra onde mandar ainda. Ligar =
setar a env + restart. Ver docs/MOBILE_RELEASE_CHECKLIST.md.

Implementado sem o SDK `firebase-admin` (evita puxar essa dependência pesada
só por isto) — o fluxo é o mesmo que o SDK faz por baixo: assina um JWT com
a chave privada da conta de serviço, troca por um access token OAuth2 no
Google, e chama a API HTTP v1 do FCM com esse token. Mesmo estilo de
apns.py (JWT + HTTP direto), pra manter os dois arquivos parecidos.
"""
import json
import threading
import logging
import time
from base64 import urlsafe_b64encode
from datetime import datetime, timezone
from typing import Optional, Tuple

from ..config import get_settings

from .push_sound import fcm_channel_id

logger = logging.getLogger(__name__)

_TOKEN_URI = "https://oauth2.googleapis.com/token"
_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"

# Access token OAuth2 dura 1h — renovamos aos 50 min, mesmo padrão do
# cache de JWT em apns.py.
_token_cache: dict = {"token": None, "exp": 0.0, "project_id": None}

# Mesmo diagnóstico temporário do apns.py — guarda a resposta REAL do FCM
# pra cada tentativa de envio, sem precisar de SSH pra ler logs do servidor.
# Lido via GET /v1/admin/debug/fcm-log (admin-gated). Remover quando o push
# nativo estiver 100% confiável.
_RECENT_ATTEMPTS: list = []


def get_recent_fcm_attempts() -> list:
    return list(_RECENT_ATTEMPTS)


def _log_attempt(device_token: str, status_code: Optional[int], reason: str, ok: bool, error: str = "") -> None:
    _RECENT_ATTEMPTS.append({
        "at": datetime.now(timezone.utc).isoformat(),
        "token_suffix": (device_token or "")[-8:],
        "status_code": status_code,
        "reason": reason,
        "ok": ok,
        "error": error,
    })
    del _RECENT_ATTEMPTS[:-60]


def _load_service_account() -> Optional[dict]:
    """Conteúdo do JSON da conta de serviço. Duas formas de fornecer, nessa
    ordem (mesmo padrão da chave APNs em apns.py):
      1. FCM_SERVICE_ACCOUNT_JSON_FILE — caminho pro arquivo .json no
         servidor (recomendado: `scp` o .json e aponta pra ele).
      2. FCM_SERVICE_ACCOUNT_JSON — o JSON inline.
    """
    s = get_settings()
    path = getattr(s, "fcm_service_account_json_file", None)
    raw: Optional[str] = None
    if path:
        try:
            with open(path, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as e:
            logger.error("FCM: não consegui ler FCM_SERVICE_ACCOUNT_JSON_FILE (%s): %s", path, e)
            return None
    else:
        raw = s.fcm_service_account_json
    if not raw:
        return None
    try:
        data = json.loads(raw)
    except Exception as e:
        logger.error("FCM: service account JSON malformado: %s", e)
        return None
    if not all(data.get(k) for k in ("project_id", "client_email", "private_key")):
        logger.error("FCM: service account JSON sem project_id/client_email/private_key")
        return None
    return data


def fcm_configured() -> bool:
    return _load_service_account() is not None


def _b64url(raw: bytes) -> str:
    return urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _get_access_token() -> Optional[str]:
    now = time.time()
    if _token_cache["token"] and now < _token_cache["exp"]:
        return _token_cache["token"]
    account = _load_service_account()
    if not account:
        return None
    try:
        from cryptography.hazmat.primitives import hashes, serialization
        from cryptography.hazmat.primitives.asymmetric import padding

        key = serialization.load_pem_private_key(
            account["private_key"].encode("utf-8"), password=None,
        )
        header = _b64url(json.dumps({"alg": "RS256", "typ": "JWT"}, separators=(",", ":")).encode())
        claims = _b64url(json.dumps({
            "iss": account["client_email"],
            "scope": _SCOPE,
            "aud": _TOKEN_URI,
            "iat": int(now),
            "exp": int(now) + 3600,
        }, separators=(",", ":")).encode())
        signing_input = f"{header}.{claims}".encode("ascii")
        signature = key.sign(signing_input, padding.PKCS1v15(), hashes.SHA256())
        assertion = f"{header}.{claims}.{_b64url(signature)}"

        import httpx

        with httpx.Client(timeout=10.0) as client:
            resp = client.post(_TOKEN_URI, data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            })
        if resp.status_code != 200:
            logger.error("FCM: falha ao trocar JWT por access token (%s): %s", resp.status_code, resp.text[:200])
            return None
        body = resp.json()
        token = body.get("access_token")
        if not token:
            return None
        _token_cache["token"] = token
        _token_cache["exp"] = now + min(int(body.get("expires_in", 3600)), 3600) - 10 * 60
        _token_cache["project_id"] = account["project_id"]
        return token
    except Exception as e:  # chave malformada, cryptography ausente, rede, etc.
        logger.error("FCM access token build failed: %s", e)
        return None


_send_client = None
_send_client_lock = threading.Lock()


def _get_send_client():
    """Cliente httpx compartilhado (pool de conexões keep-alive). Antes cada
    push abria um cliente novo = handshake TCP+TLS com o FCM a cada envio,
    somando centenas de ms POR usuário num alerta de Pet Sumido."""
    global _send_client
    if _send_client is None:
        with _send_client_lock:
            if _send_client is None:
                import httpx
                _send_client = httpx.Client(
                    timeout=10.0,
                    limits=httpx.Limits(max_connections=32, max_keepalive_connections=16),
                )
    return _send_client


def send_fcm(device_token: str, payload: dict) -> Tuple[bool, bool]:
    """Envia UMA notificação para um device token Android.

    Retorna `(ok, invalid)`. `invalid=True` quando o token deve ser
    desativado no banco (UNREGISTERED / NOT_FOUND / etc.)."""
    if not fcm_configured():
        return (False, False)
    access_token = _get_access_token()
    if not access_token:
        return (False, False)
    project_id = _token_cache["project_id"]

    notification: dict = {
        "title": payload.get("title") or "PETMOL",
        "body": payload.get("body") or "",
    }
    # FCM exige que todo valor em `data` seja string — diferente do Web
    # Push/APNs, onde o payload pode carregar dict/bool/int direto.
    data: dict = {}
    raw_data = payload.get("data")
    if isinstance(raw_data, dict):
        for k, v in raw_data.items():
            data[k] = v if isinstance(v, str) else json.dumps(v)

    message: dict = {"token": device_token, "notification": notification}
    channel_id = fcm_channel_id(payload)  # None = canal padrão (comportamento de sempre)
    if channel_id:
        message["android"] = {"notification": {"channel_id": channel_id}}
    if data:
        message["data"] = data

    try:
        client = _get_send_client()
        resp = client.post(
            f"https://fcm.googleapis.com/v1/projects/{project_id}/messages:send",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
            content=json.dumps({"message": message}).encode("utf-8"),
        )
        if resp.status_code == 200:
            _log_attempt(device_token, 200, "", True)
            return (True, False)
        reason = ""
        try:
            reason = ((resp.json() or {}).get("error") or {}).get("status", "")
        except Exception:
            pass
        invalid = reason in {"UNREGISTERED", "NOT_FOUND", "INVALID_ARGUMENT"}
        logger.warning("FCM %s (%s) token=…%s", resp.status_code, reason, (device_token or "")[-6:])
        _log_attempt(device_token, resp.status_code, reason, False)
        return (False, invalid)
    except Exception as e:  # rede, etc. — nunca propaga
        logger.error("FCM send error: %s", e)
        _log_attempt(device_token, None, "", False, error=str(e)[:200])
        return (False, False)

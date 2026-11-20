"""Marcador de "versão atual" do app nativo (docs/PLANO_ASSINATURA.md §5).

O app nativo é uma casca que carrega o site ao vivo; a casca de hoje anexa só `PetmolApp` ao User-Agent
(sem número de versão). A casca nova (com planos) vai anexar a versão (`PetmolApp/2.x`). Este módulo grava,
UMA vez por conta, a 1ª vez que vimos o app nativo:

  - `native_app_first_seen_at`  quando
  - `native_app_first_version`  "unversioned" (casca atual) ou o número de versão
  - `legacy_app_user`           True se a 1ª vez foi SEM versão e ainda dentro de `legacy_marker_until`

Regras: só escreve se estiver ligado (`legacy_marker_enabled`), nunca desfaz, nunca levanta exceção para quem
chama (autenticação não pode quebrar por causa do marcador) e só faz 1 escrita por conta na vida.
"""
from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from ..config import get_settings

logger = logging.getLogger(__name__)

UNVERSIONED = "unversioned"
_UA_RE = re.compile(r"PetmolApp(?:/([0-9][0-9A-Za-z.\-]{0,30}))?")


def parse_native_ua(user_agent: Optional[str]) -> Tuple[bool, Optional[str]]:
    """(é_app_nativo, versão|None). `PetmolApp` sem /versão => (True, None)."""
    if not isinstance(user_agent, str) or not user_agent:
        return False, None
    m = _UA_RE.search(user_agent)
    if not m:
        return False, None
    return True, m.group(1)


def _until() -> Optional[datetime]:
    raw = (getattr(get_settings(), "legacy_marker_until", "") or "").strip()
    if not raw:
        return None
    try:
        dt = datetime.fromisoformat(raw)
    except ValueError:
        logger.warning("LEGACY_MARKER_UNTIL inválido (%r): ignorado", raw)
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def record_native_client(db: Session, user, user_agent: Optional[str]) -> bool:
    """Grava o marcador se for a 1ª vez que vemos o app nativo para esta conta. Devolve True se gravou."""
    try:
        if not getattr(get_settings(), "legacy_marker_enabled", False):
            return False
        if getattr(user, "native_app_first_seen_at", None) is not None:
            return False
        is_native, version = parse_native_ua(user_agent)
        if not is_native:
            return False
        now = datetime.now(timezone.utc)
        limit = _until()
        user.native_app_first_seen_at = now
        user.native_app_first_version = version or UNVERSIONED
        user.legacy_app_user = bool(version is None and (limit is None or now <= limit))
        db.commit()
        return True
    except Exception:  # noqa: BLE001 — o marcador nunca pode derrubar a autenticação
        logger.exception("legacy_marker: falha ao gravar (ignorada)")
        try:
            db.rollback()
        except Exception:  # noqa: BLE001
            pass
        return False

"""Dependencies for admin authentication.

Supports either:
- Bearer token in Authorization header
- Cookie session (same as user_auth)
"""

from typing import Optional, Tuple

from fastapi import Depends, HTTPException, status, Cookie, Header
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..user_auth.models import User
from ..user_auth.router import COOKIE_NAME
from ..user_auth.security import decode_token
from .models import AdminUser


def _extract_token(
    authorization: Optional[str],
    cookie_token: Optional[str],
) -> Optional[str]:
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "", 1).strip()
    return cookie_token


def get_current_admin(
    db: Session = Depends(get_db),
    authorization: Optional[str] = Header(default=None),
    cookie_token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
) -> Tuple[User, AdminUser]:
    token = _extract_token(authorization, cookie_token)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(token)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    # The admin_users table alone is not enough to grant access — only the
    # single hardcoded master email may ever pass, even if a stray row
    # exists in admin_users for someone else.
    settings = get_settings()
    if user.email.strip().lower() != settings.admin_master_email.strip().lower():
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso admin negado")

    admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
    if not admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso admin negado")

    return user, admin

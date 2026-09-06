"""Dependencies for authenticated users."""
from typing import Optional

from fastapi import Depends, HTTPException, status, Cookie, Header
from sqlalchemy.orm import Session

from ..db import get_db
from .models import User
from .router import COOKIE_NAME
from .security import decode_token


def get_current_user(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    # Try Bearer token first, then cookie
    token_to_use = None
    if authorization and authorization.startswith("Bearer "):
        token_to_use = authorization.replace("Bearer ", "")
    elif token:
        token_to_use = token
    
    if not token_to_use:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Não autenticado")

    token_data = decode_token(token_to_use)
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")

    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Usuário não encontrado")

    return user


def get_current_user_optional(
    authorization: Optional[str] = Header(default=None),
    token: Optional[str] = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """Como get_current_user, mas nunca levanta 401 — devolve None quando não
    há credencial válida. Para endpoints públicos que só querem SABER se quem
    chamou é um usuário logado (ex.: rotular 'Usuário PETMOL' vs 'Relato não
    verificado' no Pet Sumido)."""
    try:
        return get_current_user(authorization=authorization, token=token, db=db)
    except HTTPException:
        return None
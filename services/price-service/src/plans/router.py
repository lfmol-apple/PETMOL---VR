"""GET /plans/me — plano efetivo + limites + uso. Só leitura; 404 com a flag desligada."""
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..pets.models import Pet
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .service import resolve_plan

router = APIRouter(prefix="/plans", tags=["Plans"])


@router.get("/me")
def my_plan(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    user_agent: Optional[str] = Header(default=None),
):
    if not get_settings().plans_enabled:
        raise HTTPException(status_code=404, detail="Not found")
    info = resolve_plan(db, user, user_agent)
    return {
        "plan": info.plan,
        "reason": info.reason,
        "limits": info.limits,
        "usage": {"pets": db.query(Pet).filter(Pet.user_id == user.id).count()},
        "legacy_app_user": bool(getattr(user, "legacy_app_user", False)),
    }

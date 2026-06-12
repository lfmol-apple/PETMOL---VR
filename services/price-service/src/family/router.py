"""Family sharing router."""
import secrets
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .models import FamilyGroup, FamilyMember, FamilyInvite

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/family", tags=["Family"])


# ─── Schemas ───────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    invite_name: Optional[str] = None  # e.g. "Leilane"


class InviteResponse(BaseModel):
    token: str
    invite_url: str
    expires_at: str


class InviteInfoResponse(BaseModel):
    valid: bool
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    group_name: Optional[str] = None
    invite_name: Optional[str] = None
    already_used: bool = False
    expired: bool = False


class MemberOut(BaseModel):
    user_id: str
    name: Optional[str]
    email: str
    role: str
    joined_at: str

    class Config:
        from_attributes = True


class FamilyStatusResponse(BaseModel):
    is_owner: bool
    groups_as_owner: List[dict]
    groups_as_member: List[dict]


# ─── Helpers ───────────────────────────────────────────────────────────────

def _get_or_create_group(owner: User, db: Session) -> FamilyGroup:
    """Ensure the owner has exactly one family group."""
    group = db.query(FamilyGroup).filter(FamilyGroup.owner_id == owner.id).first()
    if not group:
        group = FamilyGroup(
            owner_id=owner.id,
            name=f"Família {(owner.name or '').split()[0]}",  # "Família Leonardo"
        )
        db.add(group)
        db.commit()
        db.refresh(group)
    return group


def _get_frontend_base_url() -> str:
    import os
    return os.environ.get("FRONTEND_URL", "http://localhost:3000")


# ─── Endpoints ─────────────────────────────────────────────────────────────

@router.post("/invite", response_model=InviteResponse)
def create_invite(
    body: InviteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Generate a one-time invite link. Valid for 7 days."""
    group = _get_or_create_group(current_user, db)

    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(days=7)

    invite = FamilyInvite(
        group_id=group.id,
        token=token,
        invited_by=current_user.id,
        invite_name=body.invite_name,
        expires_at=expires_at,
    )
    db.add(invite)
    db.commit()

    base = _get_frontend_base_url()
    invite_url = f"{base}/invite/{token}"

    return InviteResponse(
        token=token,
        invite_url=invite_url,
        expires_at=expires_at.isoformat(),
    )


@router.get("/invite/{invite_token}", response_model=InviteInfoResponse)
def validate_invite(invite_token: str, db: Session = Depends(get_db)):
    """Public endpoint — validate token and return context for registration page."""
    invite = db.query(FamilyInvite).filter(FamilyInvite.token == invite_token).first()
    if not invite:
        return InviteInfoResponse(valid=False)

    now = datetime.now(timezone.utc)
    expired = invite.expires_at.replace(tzinfo=timezone.utc) < now if invite.expires_at.tzinfo is None else invite.expires_at < now
    already_used = invite.used_at is not None

    if expired or already_used:
        return InviteInfoResponse(valid=False, expired=expired, already_used=already_used)

    # Get owner info
    owner = db.query(User).filter(User.id == invite.invited_by).first()

    group = invite.group
    return InviteInfoResponse(
        valid=True,
        owner_name=owner.name if owner else None,
        owner_email=owner.email if owner else None,
        group_name=group.name if group else None,
        invite_name=invite.invite_name,
    )


@router.post("/join/{invite_token}")
def join_family(
    invite_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Authenticated user joins family group via invite token."""
    invite = db.query(FamilyInvite).filter(FamilyInvite.token == invite_token).first()
    if not invite:
        raise HTTPException(status_code=404, detail="Convite não encontrado")

    now = datetime.now(timezone.utc)
    expires = invite.expires_at.replace(tzinfo=timezone.utc) if invite.expires_at.tzinfo is None else invite.expires_at
    if expires < now:
        raise HTTPException(status_code=410, detail="Convite expirado")
    if invite.used_at is not None:
        raise HTTPException(status_code=409, detail="Convite já utilizado")

    group = invite.group

    # Don't allow owner to join their own group as member
    if group.owner_id == current_user.id:
        raise HTTPException(status_code=400, detail="Você já é o dono deste grupo")

    # Check if already a member
    existing = db.query(FamilyMember).filter(
        FamilyMember.group_id == group.id,
        FamilyMember.user_id == current_user.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Você já faz parte desta família")

    # Add member
    member = FamilyMember(group_id=group.id, user_id=current_user.id, role="member")
    db.add(member)

    # Mark invite as used
    invite.used_at = now
    invite.used_by = current_user.id
    db.commit()

    return {"success": True, "message": f"Bem-vindo(a) à {group.name}!"}


@router.get("/members", response_model=List[MemberOut])
def list_members(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return all members of the current user's family group (owner only)."""
    group = db.query(FamilyGroup).filter(FamilyGroup.owner_id == current_user.id).first()
    if not group:
        return []

    result = []
    # Include the owner themselves
    result.append(MemberOut(
        user_id=current_user.id,
        name=current_user.name,
        email=current_user.email,
        role="owner",
        joined_at=group.created_at.isoformat(),
    ))
    for m in group.members:
        member_user = db.query(User).filter(User.id == m.user_id).first()
        if member_user:
            result.append(MemberOut(
                user_id=member_user.id,
                name=member_user.name,
                email=member_user.email,
                role=m.role,
                joined_at=m.joined_at.isoformat(),
            ))
    return result


@router.delete("/members/{member_user_id}", status_code=204)
def remove_member(
    member_user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Owner removes a family member."""
    group = db.query(FamilyGroup).filter(FamilyGroup.owner_id == current_user.id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")

    member = db.query(FamilyMember).filter(
        FamilyMember.group_id == group.id,
        FamilyMember.user_id == member_user_id,
    ).first()
    if not member:
        raise HTTPException(status_code=404, detail="Membro não encontrado")

    db.delete(member)
    db.commit()


@router.get("/status", response_model=FamilyStatusResponse)
def family_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return family groups the user owns and/or belongs to."""
    owned = db.query(FamilyGroup).filter(FamilyGroup.owner_id == current_user.id).all()
    memberships = db.query(FamilyMember).filter(FamilyMember.user_id == current_user.id).all()

    groups_as_owner = []
    for g in owned:
        owner_user = db.query(User).filter(User.id == g.owner_id).first()
        groups_as_owner.append({
            "group_id": g.id,
            "name": g.name,
            "member_count": len(g.members),
            "owner_name": owner_user.name if owner_user else None,
        })

    groups_as_member = []
    for m in memberships:
        g = m.group
        owner_user = db.query(User).filter(User.id == g.owner_id).first()
        groups_as_member.append({
            "group_id": g.id,
            "name": g.name,
            "owner_id": str(g.owner_id),
            "owner_name": owner_user.name if owner_user else None,
            "owner_email": owner_user.email if owner_user else None,
        })

    return FamilyStatusResponse(
        is_owner=len(owned) > 0,
        groups_as_owner=groups_as_owner,
        groups_as_member=groups_as_member,
    )

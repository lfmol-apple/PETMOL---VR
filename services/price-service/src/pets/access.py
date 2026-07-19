"""Shared pet access helpers."""
from fastapi import HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from ..family.models import FamilyGroup, FamilyMember
from .caretaker_models import PetCaretaker
from .models import Pet


def accessible_pets_query(db: Session, user_id: str):
    """Pets owned by the user or linked through family/caretaker sharing."""
    family_owner_ids = (
        select(FamilyGroup.owner_id)
        .join(FamilyMember, FamilyMember.group_id == FamilyGroup.id)
        .filter(FamilyMember.user_id == user_id)
    )
    return (
        db.query(Pet)
        .outerjoin(
            PetCaretaker,
            (PetCaretaker.pet_id == Pet.id) & (PetCaretaker.user_id == user_id),
        )
        .filter(
            or_(
                Pet.user_id == user_id,
                PetCaretaker.user_id == user_id,
                Pet.user_id.in_(family_owner_ids),
            )
        )
        .distinct()
    )


def get_accessible_pet_or_404(db: Session, user_id: str, pet_id: str) -> Pet:
    pet = accessible_pets_query(db, user_id).filter(Pet.id == pet_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")
    return pet


def get_owned_pet_or_404(db: Session, user_id: str, pet_id: str) -> Pet:
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user_id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")
    return pet

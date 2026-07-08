"""API routes for pets."""
from typing import Optional, List
import json
import secrets
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Response, status, UploadFile, File
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from ..db import get_db
from .parasite_models import ParasiteControlRecord as _pcr  # noqa: F401 register
from .grooming_models import GroomingRecord as _gr  # noqa: F401 register
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from ..user_auth.security import create_access_token, hash_password
from ..user_auth.router import COOKIE_NAME, _cookie_settings
from .models import Pet
from .caretaker_models import PetCaretaker
from .schemas import PetCreate, PetOut, PetUpdate
from .upload import save_pet_photo, delete_pet_photo
from .vaccine_models import VaccineRecord
from .vaccine_schemas import VaccineRecordCreate, VaccineRecordOut, VaccineRecordUpdate
import uuid

router = APIRouter(tags=["Pets"])


def _parse_optional_date(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value))


def _get_accessible_owner_ids(user_id: str, db: Session) -> List[str]:
    """Return list of user_ids whose pets the current user can access.
    SILENCIADO: compartilhamento familiar desativado — retorna apenas o próprio usuário.
    Para reativar acesso familiar, restaurar o bloco de FamilyMember abaixo.
    """
    # SILENCIADO — family lookup removido temporariamente
    # from ..family.models import FamilyGroup, FamilyMember
    # owner_ids = {user_id}
    # memberships = db.query(FamilyMember).filter(FamilyMember.user_id == user_id).all()
    # for m in memberships:
    #     group = db.query(FamilyGroup).filter(FamilyGroup.id == m.group_id).first()
    #     if group:
    #         owner_ids.add(group.owner_id)
    # return list(owner_ids)
    return [user_id]


@router.get("/pets", response_model=list[PetOut])
def list_pets(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    owner_ids = _get_accessible_owner_ids(user.id, db)
    return (
        db.query(Pet)
        .options(
            selectinload(Pet.vaccine_records),
            selectinload(Pet.parasite_control_records),
            selectinload(Pet.grooming_records),
        )
        .filter(Pet.user_id.in_(owner_ids))
        .order_by(Pet.created_at.asc())
        .all()
    )


@router.post("/pets", response_model=PetOut, status_code=status.HTTP_201_CREATED)
def create_pet(
    payload: PetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Serializar health_data para JSON string
    health_data_str = None
    if payload.health_data is not None:
        health_data_str = json.dumps(payload.health_data) if not isinstance(payload.health_data, str) else payload.health_data

    pet = Pet(
        id=payload.id if payload.id else None,
        user_id=user.id,
        name=payload.name,
        species=payload.species,
        breed=payload.breed,
        birth_date=payload.birth_date,
        sex=payload.sex,
        weight_value=payload.weight_value,
        weight_unit=payload.weight_unit,
        photo=payload.photo,
        neutered=payload.neutered,
        health_data=health_data_str,
        insurance_provider=payload.insurance_provider,
    )
    db.add(pet)
    db.commit()
    db.refresh(pet)
    return pet


def _get_pet_or_404(db: Session, user_id: str, pet_id: str) -> Pet:
    owner_ids = _get_accessible_owner_ids(user_id, db)
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id.in_(owner_ids)).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")
    return pet


@router.get("/pets/{pet_id}", response_model=PetOut)
def get_pet(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pet = (
        db.query(Pet)
        .options(
            selectinload(Pet.vaccine_records),
            selectinload(Pet.parasite_control_records),
            selectinload(Pet.grooming_records),
        )
        .filter(Pet.id == pet_id, Pet.user_id == user.id)
        .first()
    )
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")
    return pet


@router.put("/pets/{pet_id}", response_model=PetOut)
@router.patch("/pets/{pet_id}", response_model=PetOut)
def update_pet(
    pet_id: str,
    payload: PetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pet = _get_pet_or_404(db, user.id, pet_id)

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == 'health_data' and value is not None:
            # Serializar health_data para JSON string
            value = json.dumps(value) if not isinstance(value, str) else value
        setattr(pet, field, value)

    db.commit()
    db.refresh(pet)
    return pet


@router.delete("/pets/{pet_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pet(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    pet = _get_pet_or_404(db, user.id, pet_id)
    
    # Deletar foto se existir
    if pet.photo:
        delete_pet_photo(pet.photo)
    
    db.delete(pet)
    db.commit()


@router.post("/pets/{pet_id}/photo", response_model=dict)
async def upload_pet_photo(
    pet_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload de foto do pet."""
    pet = _get_pet_or_404(db, user.id, pet_id)
    
    # Deletar foto antiga se existir
    if pet.photo:
        delete_pet_photo(pet.photo)
    
    # Salvar nova foto
    photo_path = await save_pet_photo(file)
    pet.photo = photo_path
    
    db.commit()
    db.refresh(pet)
    
    return {"photo_url": f"/uploads/{photo_path}"}


# ========================================
# Vaccine Management Routes
# ========================================

@router.get("/pets/{pet_id}/vaccines", response_model=List[VaccineRecordOut])
def list_vaccines(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista todas as vacinas de um pet."""
    # Verificar se o pet existe e pertence ao usuário
    pet = _get_pet_or_404(db, user.id, pet_id)
    
    # Buscar vacinas não deletadas
    vaccines = db.query(VaccineRecord).filter(
        VaccineRecord.pet_id == pet_id,
        VaccineRecord.deleted == False
    ).order_by(VaccineRecord.applied_date.desc()).all()
    
    return vaccines


@router.post("/pets/{pet_id}/vaccines", response_model=VaccineRecordOut, status_code=status.HTTP_201_CREATED)
def create_vaccine(
    pet_id: str,
    payload: VaccineRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Adiciona uma nova vacina para um pet."""
    # Verificar se o pet existe e pertence ao usuário
    pet = _get_pet_or_404(db, user.id, pet_id)
    
    # Criar nova vacina
    vaccine = VaccineRecord(
        id=str(uuid.uuid4()),
        pet_id=pet_id,
        vaccine_name=payload.vaccine_name,
        dose_number=payload.dose_number,
        applied_date=payload.applied_date,
        next_dose_date=payload.next_dose_date,
        alert_days_before=payload.alert_days_before,
        reminder_date=_parse_optional_date(payload.reminder_date),
        reminder_time=(payload.reminder_time or "")[:5] or None,
        reminder_enabled=payload.reminder_enabled,
        notes=payload.notes,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        deleted=False,
    )
    
    db.add(vaccine)
    db.commit()
    db.refresh(vaccine)
    # SILENCIADO: notificação para família desativada temporariamente
    # from ..family.utils import send_family_push
    # actor_name = (user.name or user.email).split()[0]
    # send_family_push(pet_id, user.id, { ... }, db)
    return vaccine


@router.get("/vaccines/{vaccine_id}", response_model=VaccineRecordOut)
def get_vaccine(
    vaccine_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Busca uma vacina específica por ID."""
    vaccine = db.query(VaccineRecord).filter(
        VaccineRecord.id == vaccine_id,
        VaccineRecord.deleted == False
    ).first()
    
    if not vaccine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vacina não encontrada"
        )
    
    # Verificar se o pet pertence ao usuário
    pet = db.query(Pet).filter(
        Pet.id == vaccine.pet_id,
        Pet.user_id == user.id
    ).first()
    
    if not pet:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para acessar esta vacina"
        )
    
    return vaccine


@router.patch("/vaccines/{vaccine_id}", response_model=VaccineRecordOut)
def update_vaccine(
    vaccine_id: str,
    payload: VaccineRecordUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Atualiza informações de uma vacina."""
    vaccine = db.query(VaccineRecord).filter(
        VaccineRecord.id == vaccine_id,
        VaccineRecord.deleted == False
    ).first()
    
    if not vaccine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vacina não encontrada"
        )
    
    # Verificar se o pet pertence ao usuário
    pet = db.query(Pet).filter(
        Pet.id == vaccine.pet_id,
        Pet.user_id == user.id
    ).first()
    
    if not pet:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para editar esta vacina"
        )
    
    # Atualizar campos
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "reminder_date":
            value = _parse_optional_date(value)
        if field == "reminder_time" and isinstance(value, str):
            value = value[:5] or None
        setattr(vaccine, field, value)
    
    vaccine.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(vaccine)
    
    return vaccine


@router.delete("/vaccines/{vaccine_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_vaccine(
    vaccine_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Deleta uma vacina (soft delete)."""
    vaccine = db.query(VaccineRecord).filter(
        VaccineRecord.id == vaccine_id
    ).first()
    
    if not vaccine:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vacina não encontrada"
        )
    
    # Verificar se o pet pertence ao usuário
    pet = db.query(Pet).filter(
        Pet.id == vaccine.pet_id,
        Pet.user_id == user.id
    ).first()
    
    if not pet:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Você não tem permissão para deletar esta vacina"
        )
    
    # Soft delete
    vaccine.deleted = True
    vaccine.deleted_at = datetime.utcnow()
    vaccine.updated_at = datetime.utcnow()
    
    db.commit()


# ── Caretaker / invite endpoints ────────────────────────────────────────────

def _resolve_photo_url(photo: str | None) -> str | None:
    if not photo:
        return None
    if photo.startswith("http"):
        return photo
    clean = photo.lstrip("/")
    if not clean.startswith("uploads/"):
        clean = f"uploads/{clean}"
    import os
    base = os.environ.get("FRONTEND_URL", "https://petmol.com.br")
    return f"{base}/{clean}"


@router.get("/pets/{pet_id}/invite-link")
def get_invite_link(
    pet_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Retorna (ou gera) o link fixo de convite para cuidadores do pet."""
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    if not pet.invite_token:
        pet.invite_token = secrets.token_urlsafe(20)
        db.commit()
        db.refresh(pet)
    import os
    base = os.environ.get("FRONTEND_URL", "https://petmol.com.br")
    return {
        "invite_url": f"{base}/cuidar/{pet.invite_token}",
        "token": pet.invite_token,
    }


@router.get("/pets/join/{invite_token}")
def get_invite_info(invite_token: str, db: Session = Depends(get_db)):
    """Público — retorna info do pet para a landing page do convite."""
    pet = db.query(Pet).filter(Pet.invite_token == invite_token).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Convite inválido")
    owner = db.query(User).filter(User.id == pet.user_id).first()
    return {
        "pet_id": pet.id,
        "pet_name": pet.name,
        "species": pet.species,
        "breed": pet.breed,
        "photo_url": _resolve_photo_url(pet.photo),
        "owner_name": (owner.name or "").split()[0] if owner else "",
    }


@router.post("/pets/join/{invite_token}")
def join_as_caretaker(
    invite_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Usuário autenticado entra como cuidador do pet via token."""
    pet = db.query(Pet).filter(Pet.invite_token == invite_token).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Convite inválido")
    if pet.user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Você já é o dono deste pet")
    existing = db.query(PetCaretaker).filter(
        PetCaretaker.pet_id == pet.id,
        PetCaretaker.user_id == current_user.id,
    ).first()
    if existing:
        return {"success": True, "message": f"Você já cuida de {pet.name}!"}
    caretaker = PetCaretaker(
        id=str(uuid.uuid4()),
        pet_id=pet.id,
        user_id=current_user.id,
    )
    db.add(caretaker)
    db.commit()
    return {"success": True, "message": f"Bem-vindo(a)! Agora você cuida de {pet.name} 🐾"}


@router.get("/pets/{pet_id}/caretakers")
def list_caretakers(
    pet_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista cuidadores do pet (dono apenas)."""
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    rows = db.query(PetCaretaker).filter(PetCaretaker.pet_id == pet_id).all()
    result = []
    for r in rows:
        u = db.query(User).filter(User.id == r.user_id).first()
        if u:
            result.append({"user_id": r.user_id, "name": u.name, "email": u.email, "joined_at": r.joined_at.isoformat()})
    return result


@router.delete("/pets/{pet_id}/caretakers/{user_id}", status_code=204)
def remove_caretaker(
    pet_id: str,
    user_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Dono remove um cuidador."""
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == current_user.id).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Pet não encontrado")
    row = db.query(PetCaretaker).filter(
        PetCaretaker.pet_id == pet_id,
        PetCaretaker.user_id == user_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cuidador não encontrado")
    db.delete(row)
    db.commit()


class GuestJoinBody(BaseModel):
    name: str


@router.post("/pets/join/{invite_token}/guest")
def guest_join(
    invite_token: str,
    body: GuestJoinBody,
    response: Response,
    db: Session = Depends(get_db),
):
    """Cria conta leve (sem email/senha) e entra como cuidador via link de convite."""
    pet = db.query(Pet).filter(Pet.invite_token == invite_token).first()
    if not pet:
        raise HTTPException(status_code=404, detail="Convite inválido")

    guest_id = str(uuid.uuid4())
    guest_email = f"guest_{guest_id}@petmol.guest"
    guest = User(
        id=guest_id,
        name=body.name.strip() or "Cuidador",
        email=guest_email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        email_verified=True,
    )
    db.add(guest)
    db.add(PetCaretaker(
        id=str(uuid.uuid4()),
        pet_id=pet.id,
        user_id=guest_id,
    ))
    db.commit()

    token = create_access_token(user_id=guest_id)
    response.set_cookie(COOKIE_NAME, token, **_cookie_settings())
    return {"access_token": token, "pet_name": pet.name, "user_id": guest_id}

"""CRUD router for grooming records."""
import json
from uuid import uuid4
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .models import Pet
from .grooming_models import GroomingRecord
from .grooming_schemas import GroomingRecordCreate, GroomingRecordUpdate, GroomingRecordOut

router = APIRouter(prefix="/pets/{pet_id}/grooming", tags=["Grooming"])


def _get_pet_owned(db: Session, pet_id: str, user: User) -> Pet:
    pet = db.query(Pet).filter(Pet.id == pet_id, Pet.user_id == user.id).first()
    if not pet:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Pet não encontrado")
    return pet


def _serialize_reschedule_history(value) -> Optional[str]:
    """Normaliza reschedule_history para JSON string."""
    if value is None:
        return None
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False)


@router.get("", response_model=List[GroomingRecordOut])
def list_grooming_records(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista registros de banho/tosa ativos do pet."""
    _get_pet_owned(db, pet_id, user)
    records = (
        db.query(GroomingRecord)
        .filter(GroomingRecord.pet_id == pet_id, GroomingRecord.deleted == False)
        .order_by(GroomingRecord.date.desc())
        .all()
    )
    # Deserializar reschedule_history para retorno
    for r in records:
        if r.reschedule_history and isinstance(r.reschedule_history, str):
            try:
                r.reschedule_history = json.loads(r.reschedule_history)
            except Exception:
                r.reschedule_history = []
    return records


@router.post("", response_model=GroomingRecordOut, status_code=status.HTTP_201_CREATED)
def create_grooming_record(
    pet_id: str,
    payload: GroomingRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cria novo registro de banho/tosa."""
    _get_pet_owned(db, pet_id, user)
    record_id = payload.id or str(uuid4())
    # Evita duplicata na migração (upsert)
    existing = db.query(GroomingRecord).filter(GroomingRecord.id == record_id).first()
    if existing:
        return existing
    data = payload.model_dump(exclude={"id"})
    data["reschedule_history"] = _serialize_reschedule_history(data.get("reschedule_history"))
    record = GroomingRecord(id=record_id, pet_id=pet_id, **data)
    db.add(record)
    db.commit()
    db.refresh(record)
    if record.reschedule_history and isinstance(record.reschedule_history, str):
        try:
            record.reschedule_history = json.loads(record.reschedule_history)
        except Exception:
            record.reschedule_history = []
    # Push família desativado: notificações centralizadas no modelo oficial de 4 camadas.
    return record


@router.patch("/{record_id}", response_model=GroomingRecordOut)
def update_grooming_record(
    pet_id: str,
    record_id: str,
    payload: GroomingRecordUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Atualiza registro de banho/tosa."""
    _get_pet_owned(db, pet_id, user)
    record = db.query(GroomingRecord).filter(
        GroomingRecord.id == record_id,
        GroomingRecord.pet_id == pet_id,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "reschedule_history":
            value = _serialize_reschedule_history(value)
        setattr(record, field, value)
    db.commit()
    db.refresh(record)
    if record.reschedule_history and isinstance(record.reschedule_history, str):
        try:
            record.reschedule_history = json.loads(record.reschedule_history)
        except Exception:
            record.reschedule_history = []
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_grooming_record(
    pet_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete de registro de banho/tosa."""
    _get_pet_owned(db, pet_id, user)
    record = db.query(GroomingRecord).filter(
        GroomingRecord.id == record_id,
        GroomingRecord.pet_id == pet_id,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
    record.deleted = True
    db.commit()

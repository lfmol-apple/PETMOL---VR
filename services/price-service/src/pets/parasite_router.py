"""CRUD router for parasite control records."""
import json
from uuid import uuid4
from datetime import date, datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from sqlalchemy import select

from ..db import get_db
from ..product_catalog_lookup import ProductCatalog, normalize_gtin
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .access import get_accessible_pet_or_404
from .models import Pet
from .parasite_models import ParasiteControlRecord
from .parasite_schemas import ParasiteControlCreate, ParasiteControlUpdate, ParasiteControlOut

router = APIRouter(prefix="/pets/{pet_id}/parasites", tags=["Parasite Controls"])


def _parse_optional_date(value):
    if not value:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    return date.fromisoformat(str(value))


def _resolve_product_id(db: Session, barcode) -> "int | None":
    """Resolve barcode -> products_catalog.id, se já catalogado.

    Nunca cria/consulta provedor externo aqui (esse trabalho é do fluxo de
    escaneamento, product_catalog_lookup.lookup_product_by_gtin) — só
    reaproveita o que já foi resolvido antes. Sem match, product_id fica
    None (não bloqueia o registro, o barcode cru continua salvo).
    """
    if not barcode:
        return None
    gtin_normalized = normalize_gtin(barcode)
    if not gtin_normalized:
        return None
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    return product.id if product else None


def _get_pet_owned(db: Session, pet_id: str, user: User) -> Pet:
    return get_accessible_pet_or_404(db, user.id, pet_id)


@router.get("", response_model=List[ParasiteControlOut])
def list_parasite_controls(
    pet_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lista controles parasitários ativos do pet."""
    _get_pet_owned(db, pet_id, user)
    return (
        db.query(ParasiteControlRecord)
        .filter(ParasiteControlRecord.pet_id == pet_id, ParasiteControlRecord.deleted == False)
        .order_by(ParasiteControlRecord.date_applied.desc())
        .all()
    )


@router.post("", response_model=ParasiteControlOut, status_code=status.HTTP_201_CREATED)
def create_parasite_control(
    pet_id: str,
    payload: ParasiteControlCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Cria novo registro de controle parasitário."""
    _get_pet_owned(db, pet_id, user)
    record_id = payload.id or str(uuid4())
    # Evita duplicata na migração (upsert)
    existing = db.query(ParasiteControlRecord).filter(ParasiteControlRecord.id == record_id).first()
    if existing:
        return existing
    data = payload.model_dump(exclude={"id"})
    data["reminder_date"] = _parse_optional_date(data.get("reminder_date"))
    record = ParasiteControlRecord(
        id=record_id,
        pet_id=pet_id,
        product_id=_resolve_product_id(db, data.get("barcode")),
        **data,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    # Push família desativado: notificações centralizadas no modelo oficial de 4 camadas.
    return record


@router.patch("/{record_id}", response_model=ParasiteControlOut)
def update_parasite_control(
    pet_id: str,
    record_id: str,
    payload: ParasiteControlUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Atualiza registro de controle parasitário."""
    _get_pet_owned(db, pet_id, user)
    record = db.query(ParasiteControlRecord).filter(
        ParasiteControlRecord.id == record_id,
        ParasiteControlRecord.pet_id == pet_id,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if field == "reminder_date":
            value = _parse_optional_date(value)
        if field == "reminder_time" and isinstance(value, str):
            value = value[:5] or None
        setattr(record, field, value)
    if "barcode" in updates:
        record.product_id = _resolve_product_id(db, updates["barcode"])
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_parasite_control(
    pet_id: str,
    record_id: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Soft-delete de registro de controle parasitário."""
    _get_pet_owned(db, pet_id, user)
    record = db.query(ParasiteControlRecord).filter(
        ParasiteControlRecord.id == record_id,
        ParasiteControlRecord.pet_id == pet_id,
    ).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registro não encontrado")
    record.deleted = True
    db.commit()

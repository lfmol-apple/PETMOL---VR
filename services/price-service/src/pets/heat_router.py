"""CRUD do registro de cio (/pets/{pet_id}/heat-cycles)."""
from datetime import date, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .access import get_accessible_pet_or_404
from .heat_care import applies, validate_settings
from .heat_models import HeatCycle, HeatSettings
from .models import Pet

router = APIRouter(prefix="/pets/{pet_id}/heat-cycles", tags=["Cio"])

MAX_NOTES = 500


class HeatCycleIn(BaseModel):
    started_on: date
    ended_on: Optional[date] = None
    mated_on: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=MAX_NOTES)

    @model_validator(mode="after")
    def _coerente(self):
        if self.ended_on and self.ended_on < self.started_on:
            raise ValueError("O fim do cio não pode ser antes do início.")
        if self.mated_on and self.mated_on < self.started_on:
            raise ValueError("O cruzamento não pode ser antes do início do cio.")
        return self


class HeatCycleUpdate(BaseModel):
    started_on: Optional[date] = None
    ended_on: Optional[date] = None
    mated_on: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=MAX_NOTES)
    clear_ended_on: bool = False   # reabre o cio (apaga o fim)


class HeatCycleOut(BaseModel):
    id: str
    pet_id: str
    started_on: date
    ended_on: Optional[date] = None
    mated_on: Optional[date] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


def _female_pet(db: Session, pet_id: str, user: User) -> Pet:
    pet = get_accessible_pet_or_404(db, user.id, pet_id)
    if pet.sex == "male":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O registro de cio é só para fêmeas.")
    return pet


def _check_dates(started_on: date) -> None:
    if started_on > date.today() + timedelta(days=1):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O início do cio não pode estar no futuro.")


@router.get("", response_model=List[HeatCycleOut])
def list_heat_cycles(pet_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    return db.query(HeatCycle).filter(HeatCycle.pet_id == pet_id).order_by(HeatCycle.started_on.desc()).all()


@router.post("", response_model=HeatCycleOut, status_code=status.HTTP_201_CREATED)
def create_heat_cycle(pet_id: str, payload: HeatCycleIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _female_pet(db, pet_id, user)
    _check_dates(payload.started_on)
    open_cycle = db.query(HeatCycle).filter(HeatCycle.pet_id == pet_id, HeatCycle.ended_on.is_(None)).first()
    if open_cycle and payload.ended_on is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Já existe um cio em andamento. Marque o fim dele antes de começar outro.")
    record = HeatCycle(pet_id=pet_id, **payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.patch("/{cycle_id}", response_model=HeatCycleOut)
def update_heat_cycle(pet_id: str, cycle_id: str, payload: HeatCycleUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    record = db.query(HeatCycle).filter(HeatCycle.id == cycle_id, HeatCycle.pet_id == pet_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cio não encontrado")
    data = payload.model_dump(exclude_unset=True, exclude={"clear_ended_on"})
    if payload.clear_ended_on:
        data["ended_on"] = None
    started = data.get("started_on", record.started_on)
    ended = data["ended_on"] if "ended_on" in data else record.ended_on
    mated = data.get("mated_on", record.mated_on)
    _check_dates(started)
    if ended and ended < started:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O fim do cio não pode ser antes do início.")
    if mated and mated < started:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O cruzamento não pode ser antes do início do cio.")
    for k, v in data.items():
        setattr(record, k, v)
    db.commit()
    db.refresh(record)
    return record


@router.delete("/{cycle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_heat_cycle(pet_id: str, cycle_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    record = db.query(HeatCycle).filter(HeatCycle.id == cycle_id, HeatCycle.pet_id == pet_id).first()
    if not record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cio não encontrado")
    db.delete(record)
    db.commit()


# ── Acompanhamento (ligar/desligar + ritmo) ─────────────────────────────────

class HeatSettingsIn(BaseModel):
    enabled: bool = True
    interval_days: int
    duration_days: int


class HeatSettingsOut(BaseModel):
    enabled: bool
    interval_days: int
    duration_days: int

    model_config = {"from_attributes": True}


@router.get("/settings", response_model=Optional[HeatSettingsOut])
def get_heat_settings(pet_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    return db.query(HeatSettings).filter(HeatSettings.pet_id == pet_id).first()


@router.put("/settings", response_model=HeatSettingsOut)
def put_heat_settings(pet_id: str, payload: HeatSettingsIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    pet = _female_pet(db, pet_id, user)
    if not applies(pet):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="O acompanhamento do cio é só para cadelas e gatas não castradas.")
    validate_settings(pet.species, payload.interval_days, payload.duration_days)
    row = db.query(HeatSettings).filter(HeatSettings.pet_id == pet_id).first()
    if row is None:
        row = HeatSettings(pet_id=pet_id)
        db.add(row)
    row.enabled = payload.enabled
    row.interval_days = payload.interval_days
    row.duration_days = payload.duration_days
    db.commit()
    db.refresh(row)
    return row

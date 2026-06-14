"""Pydantic schemas for parasite control records."""
from typing import Optional
from datetime import date
from pydantic import BaseModel, Field, field_validator

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant


class ParasiteControlBase(BaseModel):
    type: str = Field(..., description="dewormer | flea_tick | heartworm | collar | leishmaniasis")
    product_name: str = Field(..., min_length=1, max_length=200)
    active_ingredient: Optional[str] = Field(None, max_length=200)
    date_applied: UtcInstant
    next_due_date: OptionalUtcInstant = None
    frequency_days: int = Field(30, ge=1)
    pet_weight_kg: Optional[float] = None
    dosage: Optional[str] = Field(None, max_length=100)
    application_form: Optional[str] = Field(None, max_length=20)
    veterinarian: Optional[str] = Field(None, max_length=200)
    clinic_name: Optional[str] = Field(None, max_length=200)
    batch_number: Optional[str] = Field(None, max_length=100)
    cost: Optional[float] = None
    purchase_location: Optional[str] = Field(None, max_length=200)
    collar_expiry_date: OptionalUtcInstant = None
    reminder_enabled: bool = True
    reminder_date: Optional[str] = None
    reminder_days: int = Field(7, ge=0)
    alert_days_before: Optional[int] = None
    reminder_time: Optional[str] = Field(None, max_length=8)
    notes: Optional[str] = None


class ParasiteControlCreate(ParasiteControlBase):
    id: Optional[str] = None  # permite o frontend enviar seu próprio ID (migração)


class ParasiteControlUpdate(BaseModel):
    type: Optional[str] = None
    product_name: Optional[str] = Field(None, min_length=1, max_length=200)
    active_ingredient: Optional[str] = None
    date_applied: OptionalUtcInstant = None
    next_due_date: OptionalUtcInstant = None
    frequency_days: Optional[int] = Field(None, ge=1)
    pet_weight_kg: Optional[float] = None
    dosage: Optional[str] = None
    application_form: Optional[str] = None
    veterinarian: Optional[str] = None
    clinic_name: Optional[str] = None
    batch_number: Optional[str] = None
    cost: Optional[float] = None
    purchase_location: Optional[str] = None
    collar_expiry_date: OptionalUtcInstant = None
    reminder_enabled: Optional[bool] = None
    reminder_date: Optional[str] = None
    reminder_days: Optional[int] = None
    alert_days_before: Optional[int] = None
    reminder_time: Optional[str] = None
    notes: Optional[str] = None
    deleted: Optional[bool] = None


class ParasiteControlOut(ParasiteControlBase):
    id: str
    pet_id: str
    deleted: bool = False
    created_at: UtcInstant
    updated_at: UtcInstant

    @field_validator('reminder_date', mode='before')
    @classmethod
    def coerce_reminder_date(cls, v):
        if isinstance(v, date):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True

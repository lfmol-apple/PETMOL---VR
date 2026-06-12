"""
Events schemas for PETMOL
"""
from typing import Optional
from pydantic import BaseModel, Field

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant


class EventCreate(BaseModel):
    """Schema para criar evento"""
    pet_id: str
    type: str  # 'bath', 'grooming', 'vaccine', etc.
    scheduled_at: UtcInstant
    title: str
    status: Optional[str] = 'pending'
    description: Optional[str] = None
    notes: Optional[str] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_phone: Optional[str] = None
    location_place_id: Optional[str] = None
    professional_name: Optional[str] = None
    cost: Optional[float] = None
    frequency_days: Optional[int] = None
    next_due_date: OptionalUtcInstant = None
    reminder_days_before: int = 3
    extra_data: Optional[str] = None  # JSON string
    source: str = "manual"
    # Canonicalization
    provider_name_raw: Optional[str] = None
    provider_name_canonical: Optional[str] = None
    provider_confidence: Optional[float] = None
    item_name_raw: Optional[str] = None
    item_name_canonical: Optional[str] = None
    item_confidence: Optional[float] = None


class EventUpdate(BaseModel):
    """Schema para atualizar evento"""
    type: Optional[str] = None
    scheduled_at: OptionalUtcInstant = None
    status: Optional[str] = None
    completed_at: OptionalUtcInstant = None
    title: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    location_name: Optional[str] = None
    location_address: Optional[str] = None
    location_phone: Optional[str] = None
    location_place_id: Optional[str] = None
    professional_name: Optional[str] = None
    cost: Optional[float] = None
    frequency_days: Optional[int] = None
    next_due_date: OptionalUtcInstant = None
    reminder_days_before: Optional[int] = None
    extra_data: Optional[str] = None
    # Canonicalization
    provider_name_raw: Optional[str] = None
    provider_name_canonical: Optional[str] = None
    provider_confidence: Optional[float] = None
    item_name_raw: Optional[str] = None
    item_name_canonical: Optional[str] = None
    item_confidence: Optional[float] = None


class EventOut(BaseModel):
    """Schema de saída de evento"""
    id: str
    user_id: str
    pet_id: str
    type: str
    status: str
    scheduled_at: UtcInstant
    completed_at: OptionalUtcInstant
    title: str
    description: Optional[str]
    notes: Optional[str]
    location_name: Optional[str]
    location_address: Optional[str]
    location_phone: Optional[str]
    location_place_id: Optional[str]
    professional_name: Optional[str]
    cost: Optional[float]
    frequency_days: Optional[int]
    next_due_date: OptionalUtcInstant
    reminder_days_before: int
    reminder_sent: bool
    extra_data: Optional[str]
    source: str
    created_at: UtcInstant
    updated_at: UtcInstant
    deleted_at: OptionalUtcInstant = None
    # Canonicalization
    provider_name_raw: Optional[str] = None
    provider_name_canonical: Optional[str] = None
    provider_confidence: Optional[float] = None
    item_name_raw: Optional[str] = None
    item_name_canonical: Optional[str] = None
    item_confidence: Optional[float] = None
    
    model_config = {"from_attributes": True}

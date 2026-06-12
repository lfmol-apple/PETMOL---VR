"""Pydantic schemas for vaccine records."""
from typing import Optional
from datetime import date
from pydantic import BaseModel, Field, field_validator

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant


class VaccineRecordBase(BaseModel):
    """Base schema for vaccine record - Simplified Global Version.
    
    Sistema simplificado focado em lembretes e cuidado preventivo.
    Funciona 100% em qualquer país (Brasil, Islândia, EUA, etc).
    
    Campos obrigatórios (3):
    - vaccine_name: Nome genérico ou comercial (livre)
    - applied_date: Data de aplicação
    - next_dose_date: Data da próxima dose (OBRIGATÓRIO para lembretes!)
    
    Campos opcionais (2):
    - dose_number: Número da dose (1, 2, 3, reforço...)
    - notes: Qualquer informação adicional (lote, veterinário, clínica, custo...)
    """
    vaccine_name: str = Field(
        ..., 
        min_length=1, 
        max_length=200, 
        description="Nome da vacina (genérico, comercial ou livre)",
        examples=["Raiva / Rabies", "DHPP (Múltipla)", "Leptospirose", "Vacina da Islândia XYZ"]
    )
    applied_date: UtcInstant = Field(
        ..., 
        description="Data de aplicação da vacina"
    )
    next_dose_date: UtcInstant = Field(
        ...,  # OBRIGATÓRIO AGORA!
        description="Data da próxima dose/reforço (OBRIGATÓRIO para lembretes automáticos)"
    )
    dose_number: Optional[int] = Field(
        None, 
        ge=1, 
        description="Número da dose (1, 2, 3, reforço...)"
    )
    notes: Optional[str] = Field(
        None, 
        description="Observações adicionais (lote, veterinário, clínica, custo, etc)",
        examples=["Lote J217L | Dr. Silva | Clínica PetCenter | R$ 80,00"]
    )
    alert_days_before: Optional[int] = Field(None, ge=0, le=60)
    reminder_date: Optional[str] = None
    reminder_time: Optional[str] = Field(None, max_length=5)
    reminder_enabled: bool = False
    
    @field_validator('next_dose_date')
    @classmethod
    def validate_next_dose_date(cls, value, info):
        """Validar que next_dose_date é posterior a applied_date."""
        if 'applied_date' in info.data and value:
            applied = info.data['applied_date']
            if value <= applied:
                raise ValueError('Data da próxima dose deve ser posterior à data de aplicação')
        return value


class VaccineRecordCreate(VaccineRecordBase):
    """Schema for creating a vaccine record."""
    pass


class VaccineRecordUpdate(BaseModel):
    """Schema for updating a vaccine record - Simplified version."""
    vaccine_name: Optional[str] = Field(None, min_length=1, max_length=200)
    applied_date: OptionalUtcInstant = None
    next_dose_date: OptionalUtcInstant = None
    dose_number: Optional[int] = Field(None, ge=1)
    notes: Optional[str] = None
    deleted: Optional[bool] = None
    record_type: Optional[str] = None
    vaccine_type: Optional[str] = None
    clinic_name: Optional[str] = None
    veterinarian_name: Optional[str] = None
    alert_days_before: Optional[int] = Field(None, ge=0, le=60)
    reminder_date: Optional[str] = None
    reminder_time: Optional[str] = Field(None, max_length=5)
    reminder_enabled: Optional[bool] = None
    
    @field_validator('next_dose_date')
    @classmethod
    def validate_next_dose_date(cls, value, info):
        """Validar que next_dose_date é posterior a applied_date se ambos fornecidos."""
        if 'applied_date' in info.data and info.data['applied_date'] and value:
            if value <= info.data['applied_date']:
                raise ValueError('Data da próxima dose deve ser posterior à data de aplicação')
        return value


class VaccineRecordOut(VaccineRecordBase):
    """Schema for returning a vaccine record."""
    id: str
    pet_id: str
    created_at: UtcInstant
    updated_at: UtcInstant
    deleted: bool = False
    deleted_at: OptionalUtcInstant = None
    record_type: str = "confirmed_application"

    # Campos de catálogo (Fev 2026)
    vaccine_code: Optional[str] = None
    country_code: Optional[str] = None
    next_due_source: Optional[str] = None

    # Legacy fields (deprecated, mantidos para compatibilidade temporária)
    vaccine_type: Optional[str] = None
    clinic_name: Optional[str] = None
    veterinarian_name: Optional[str] = None
    batch_number: Optional[str] = None
    alert_days_before: Optional[int] = None
    reminder_date: Optional[str] = None
    reminder_time: Optional[str] = None
    reminder_enabled: bool = False

    @field_validator('reminder_date', mode='before')
    @classmethod
    def coerce_reminder_date(cls, v):
        if isinstance(v, date):
            return v.isoformat()
        return v

    class Config:
        from_attributes = True


class VaccineRecordSync(BaseModel):
    """Schema for syncing vaccine records (includes all fields for Last-Write-Wins)."""
    id: str
    pet_id: str
    vaccine_name: str
    applied_date: UtcInstant
    next_dose_date: UtcInstant  # Obrigatório no sync também
    dose_number: Optional[int] = None
    notes: Optional[str] = None
    created_at: UtcInstant
    updated_at: UtcInstant
    deleted: bool = False
    deleted_at: OptionalUtcInstant = None
    record_type: str = "confirmed_application"
    
    # Legacy fields (deprecated, mantidos para compatibilidade)
    vaccine_type: Optional[str] = None
    clinic_name: Optional[str] = None
    veterinarian_name: Optional[str] = None
    batch_number: Optional[str] = None
    alert_days_before: Optional[int] = None
    reminder_date: Optional[str] = None
    reminder_time: Optional[str] = None
    reminder_enabled: bool = False


class VaccineSyncRequest(BaseModel):
    """Request payload for syncing vaccines."""
    vaccines: list[VaccineRecordSync] = Field(default_factory=list, description="Lista de vacinas para sincronizar")


class VaccineSyncResponse(BaseModel):
    """Response for vaccine sync."""
    vaccines: list[VaccineRecordOut] = Field(default_factory=list, description="Lista de vacinas sincronizadas")
    synced_count: int = Field(..., description="Número de vacinas sincronizadas")
    message: str = Field(..., description="Mensagem de status")

"""SQLAlchemy models for vaccine records."""
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class VaccineRecord(Base):
    """Registros de vacinas administradas aos pets.
    
    SIMPLIFIED GLOBAL VERSION (Fev 2026):
    - Foco em lembretes e cuidado preventivo
    - next_dose_date é OBRIGATÓRIO (nullable=False)
    - Campos legacy mantidos no DB para migração gradual
    """
    __tablename__ = "vaccine_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True, nullable=False)
    
    # ✅ CAMPOS PRINCIPAIS (obrigatórios)
    vaccine_name: Mapped[str] = mapped_column(String(200), nullable=False)
    applied_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_dose_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)  # OBRIGATÓRIO!
    
    # ✅ CAMPOS OPCIONAIS (recomendados)
    dose_number: Mapped[Optional[int]] = mapped_column(nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Consolidado (lote, vet, clínica, custo...)
    
    # 🗑️ CAMPOS LEGACY (deprecated - serão consolidados em 'notes' via migration)
    vaccine_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # DEPRECATED: redundante
    clinic_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # DEPRECATED: consolida em notes
    veterinarian_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)  # DEPRECATED: consolida em notes
    batch_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # DEPRECATED: consolida em notes
    alert_days_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reminder_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    reminder_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # Sincronização (Last-Write-Wins)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    
    # Soft delete (para permitir recuperação)
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    record_type: Mapped[str] = mapped_column(String(32), nullable=False, default="confirmed_application")

    # ✅ CAMPOS DE CATÁLOGO (adicionados Fev 2026 – todos nullable para não quebrar registros existentes)
    vaccine_code: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True
    )  # ex.: DOG_RABIES, CAT_POLYVALENT – referencia catálogo interno
    country_code: Mapped[Optional[str]] = mapped_column(
        String(4), nullable=True
    )  # ex.: BR, US, EU
    next_due_source: Mapped[Optional[str]] = mapped_column(
        String(16), nullable=True
    )  # protocol | manual | unknown

    # ✅ CAMPOS DE CANONICALIZAÇÃO (Fev 2026)
    vaccine_name_raw: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    vaccine_name_canonical: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    vaccine_confidence: Mapped[Optional[float]] = mapped_column(nullable=True)
    # provider/clinic
    provider_name_raw: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    provider_name_canonical: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    provider_confidence: Mapped[Optional[float]] = mapped_column(nullable=True)

    # Relacionamento
    pet: Mapped["Pet"] = relationship("Pet", back_populates="vaccine_records")

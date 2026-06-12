"""
Events models for PETMOL
Tabela unificada de eventos (banho, tosa, vacinas, vermífugos, consultas, etc.)
"""
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class Event(Base):
    """
    Evento unificado: banho, tosa, vacina, vermífugo, consulta, etc.
    Substitui a necessidade de salvar em health_data JSON.
    """
    __tablename__ = "events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    
    # Relacionamento
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    pet_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    
    # Tipo e status
    type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Types: 'bath', 'grooming', 'bath_grooming', 'vaccine', 'dewormer', 'flea_tick', 
    #        'vet_appointment', 'medication', 'weight_check', 'other'
    
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending", index=True)
    # Status: 'pending', 'completed', 'cancelled', 'rescheduled'
    
    # Datas
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Detalhes
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Localização (opcional)
    location_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    location_address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    location_phone: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    location_place_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # Google Place ID
    
    # Profissional (opcional)
    professional_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Custo
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # Frequência/recorrência (em dias)
    frequency_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    
    # Próxima data sugerida (calculada automaticamente)
    next_due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    # Lembretes
    reminder_days_before: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Dados específicos por tipo (JSON)
    extra_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON com dados extras
    # Ex: para vaccine: {vaccine_name, batch_number, veterinarian}
    # Ex: para grooming: {groomer_name, service_type}
    
    # ✅ CAMPOS DE CANONICALIZAÇÃO (Fev 2026)
    # provider/location
    provider_name_raw: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_name_canonical: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    provider_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    # item (vacina, produto, etc.)
    item_name_raw: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    item_name_canonical: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    item_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # Origem/fonte
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="manual")
    # Sources: 'manual', 'vigia', 'import', 'recurring'
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

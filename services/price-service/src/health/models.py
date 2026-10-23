"""
PETMOL Health Module - ORM Models

Additional health-related models for feeding control.
Integrates with existing Pet and Vaccine models.
"""
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class FeedingPlan(Base):
    """
    Feeding/food stock control for a pet.
    
    Features:
    - Can be saved incomplete (all food-related fields nullable)
    - enabled=False: no calculations, no reminders
    - no_consumption_control=True: user managing manually, no calculations
    - safety_buffer_days=0 is respected (no forced minimum)
    """
    __tablename__ = "feeding_plans"
    
    id: Mapped[str] = mapped_column(
        String(36), 
        primary_key=True, 
        default=lambda: str(uuid4())
    )
    pet_id: Mapped[str] = mapped_column(
        String(36), 
        ForeignKey("pets.id"),
        unique=True,  # One plan per pet
        nullable=False,
        index=True
    )
    
    # Core fields
    species: Mapped[str] = mapped_column(String(24), nullable=False)  # dog, cat
    country_code: Mapped[str] = mapped_column(String(2), nullable=False)
    
    # Food details (all nullable - can save incomplete)
    food_brand: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    package_size_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    daily_amount_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_refill_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    
    # Configuration
    safety_buffer_days: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    meals_per_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    mode: Mapped[str] = mapped_column(String(50), nullable=False, default="kibble")
    # Modes: kibble, wet, mixed, homemade, prescribed
    
    # Control flags
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    no_consumption_control: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    
    # Manual mode fields (when no_consumption_control=true)
    next_purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    manual_reminder_days_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reminder_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)
    
    # Calculated fields (populated by service layer)
    estimated_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    next_reminder_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    reminder_source: Mapped[str] = mapped_column(String(32), nullable=False, default="calculated")
    # Persisted dedup: date of last successful food push — prevents double-sends on service restart
    last_food_push_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    
    # Additional info
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    items_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True, default="[]")
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        server_default=func.now(), 
        onupdate=func.now()
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    
    # Relationships
    pet: Mapped["Pet"] = relationship("Pet", back_populates="feeding_plan")


class FeedingHistory(Base):
    """Um ciclo de ração já encerrado de um pet (marca, pacote, duração real).

    Alimenta previsão de recompra, ofertas e segmentação de marketing.
    Gravado quando o tutor registra um novo pacote (restock) ou troca de ração.
    """
    __tablename__ = "feeding_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id"), nullable=False, index=True)
    food_brand: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    package_size_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    daily_amount_g: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    planned_duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    started_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ended_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    observed_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # restock = repôs o mesmo produto | switched = trocou de ração
    reason: Mapped[str] = mapped_column(String(16), nullable=False, default="restock")
    purchase_channel: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class FeedingRepurchaseIntent(Base):
    """Tutor tocou em "Comprar novamente" e saiu para a loja.

    Serve para um único lembrete no dia seguinte ("Chegou a ração? reinicie o
    controle em 1 toque") se ele não registrar o novo pacote.
    """
    __tablename__ = "feeding_repurchase_intents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id"), unique=True, nullable=False, index=True)
    food_brand: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    clicked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    reminded_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class FeedingAdjustment(Base):
    """Cada vez que a duração da ração foi ajustada (botões do aviso, "Ajustar
    duração" ou desfazer). Guarda de→para para sabermos o quanto a previsão
    original errava, sem perder o ciclo em andamento."""
    __tablename__ = "feeding_adjustments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(24), nullable=False)
    from_duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    to_duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    elapsed_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

"""SQLAlchemy models for parasite control records."""
from datetime import date, datetime
from typing import Optional, TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

if TYPE_CHECKING:
    from .models import Pet


class ParasiteControlRecord(Base):
    """Registros de controle parasitário dos pets.

    Substitui o blob health_data.parasite_controls.
    Suporta: antiparasitário oral, spot-on, coleira, injeção.
    """
    __tablename__ = "parasite_control_records"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True, nullable=False)

    # Campos principais
    type: Mapped[str] = mapped_column(String(40), nullable=False)            # dewormer | flea_tick | heartworm | collar | leishmaniasis
    product_name: Mapped[str] = mapped_column(String(200), nullable=False)
    active_ingredient: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    date_applied: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    next_due_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    frequency_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)

    # Dosagem e aplicação
    pet_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    dosage: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    application_form: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # oral | topical | collar | injection

    # Profissional
    veterinarian: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    clinic_name: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    batch_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    # Custo e compra
    cost: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    purchase_location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # GTIN/EAN escaneado do produto (Ago 2026) — permite resolver oferta
    # comercial por identidade exata (AwinFeedProvider), mesmo caminho já
    # usado por FeedingPlanItemEntry.barcode pra ração. Antes disso, um
    # código escaneado aqui só ia pro texto livre de `notes`.
    barcode: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # FK real pro catálogo canônico (Ago 2026) — resolvida automaticamente
    # no backend a partir de `barcode` (ver parasite_router.py), nunca
    # aceita direto do cliente. Sem isso, todo cruzamento com o catálogo
    # (comparação de preço, matching de afiliado) tinha que re-normalizar e
    # re-buscar o `barcode` cru de novo — o vínculo estrutural já existia
    # pro produto (products_catalog), só não chegava até aqui.
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products_catalog.id"), nullable=True, index=True)

    # Coleira (dados específicos)
    collar_expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Lembretes
    reminder_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    reminder_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    reminder_days: Mapped[int] = mapped_column(Integer, default=7, nullable=False)
    alert_days_before: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reminder_time: Mapped[Optional[str]] = mapped_column(String(5), nullable=True)

    # Notas
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Soft delete + sync
    deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    pet: Mapped["Pet"] = relationship("Pet", back_populates="parasite_control_records")

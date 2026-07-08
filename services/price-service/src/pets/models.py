"""SQLAlchemy models for pets."""
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Pet(Base):
    __tablename__ = "pets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), index=True, nullable=False)

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    species: Mapped[str] = mapped_column(String(24), nullable=False)
    breed: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    sex: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # 'male' or 'female'
    weight_value: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    weight_unit: Mapped[Optional[str]] = mapped_column(String(8), nullable=True)
    photo: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # Base64 image (compressed)
    neutered: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    health_data: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON com vacinas, parasitas, etc
    insurance_provider: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 'petlove' | 'doglife' | custom name
    invite_token: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, unique=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user: Mapped["User"] = relationship("User", back_populates="pets")
    vaccine_records: Mapped[list["VaccineRecord"]] = relationship("VaccineRecord", back_populates="pet", cascade="all, delete-orphan")
    parasite_control_records: Mapped[list["ParasiteControlRecord"]] = relationship("ParasiteControlRecord", back_populates="pet", cascade="all, delete-orphan")
    grooming_records: Mapped[list["GroomingRecord"]] = relationship("GroomingRecord", back_populates="pet", cascade="all, delete-orphan")
    feeding_plan: Mapped[Optional["FeedingPlan"]] = relationship("FeedingPlan", back_populates="pet", cascade="all, delete-orphan", uselist=False)
    documents: Mapped[list["PetDocument"]] = relationship("PetDocument", back_populates="pet", cascade="all, delete-orphan", order_by="PetDocument.created_at.desc()")
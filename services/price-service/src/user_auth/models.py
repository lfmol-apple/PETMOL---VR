"""SQLAlchemy models for local auth."""
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Dados pessoais (anteriormente em Tutor)
    name: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    whatsapp: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # Endereço
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    street: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    number: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    complement: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    
    # Monthly check-in preferred day (1–28; 0 = último dia) and hour (0–23)
    monthly_checkin_day: Mapped[int] = mapped_column(default=1, nullable=False)
    monthly_checkin_hour: Mapped[int] = mapped_column(default=20, nullable=False)
    monthly_checkin_minute: Mapped[int] = mapped_column(default=0, nullable=False)

    # Terms acceptance
    terms_accepted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    terms_version: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    terms_accepted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # Relacionamento com pets
    pets: Mapped[list["Pet"]] = relationship("Pet", back_populates="user", cascade="all, delete-orphan")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

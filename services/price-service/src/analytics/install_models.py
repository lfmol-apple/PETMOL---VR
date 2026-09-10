"""Registro de 1ª abertura do app (proxy de download)."""
from datetime import datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class AppInstall(Base):
    """Uma linha por 1ª abertura do PETMOL num dispositivo.

    O app avisa o backend uma vez (guard em localStorage). App Store / Play não
    dão download em tempo real nem localização, então isto é o mais perto:
    quando e mais ou menos ONDE (cidade por IP) o app foi aberto pela 1ª vez.
    """

    __tablename__ = "app_installs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    platform: Mapped[str] = mapped_column(String(20), nullable=False, index=True)  # ios | android | pwa | web
    ip_hash: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)      # sha256[-16:], dedup 24h
    city: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)

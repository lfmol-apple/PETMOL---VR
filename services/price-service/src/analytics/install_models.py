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


def install_count_cutoff():
    """Corte da campanha como datetime aware (UTC)."""
    from datetime import datetime, timezone

    from ..config import get_settings

    return datetime.fromisoformat(get_settings().install_count_since).astimezone(timezone.utc)


def campaign_installs_count(db) -> int:
    """Instalações registradas a partir do corte da campanha."""
    from sqlalchemy import func

    return int(db.query(func.count(AppInstall.id)).filter(AppInstall.created_at >= install_count_cutoff()).scalar() or 0)


def campaign_total(db) -> tuple:
    """(total, base, campanha): base configurada + instalações desde o corte."""
    from ..config import get_settings

    base = int(get_settings().install_count_baseline)
    camp = campaign_installs_count(db)
    return base + camp, base, camp

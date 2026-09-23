"""Gasto por campanha — lançado à mão pelo dono (não existe integração com
Meta/Google Ads). Sem isso não há custo por download/cadastro: o painel só
sabia "quantos", nunca "quanto custou cada um"."""
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Date, DateTime, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class CampaignSpend(Base):
    __tablename__ = "campaign_spend"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    # Mesmo texto do utm_campaign da URL — é assim que o gasto casa com o
    # tráfego (comparação sem diferenciar maiúscula/minúscula).
    utm_campaign: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    # Dia (civil, SP) em que o gasto foi feito — o gasto entra no período
    # selecionado quando esse dia cai dentro dele.
    spent_on: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount_cents: Mapped[int] = mapped_column(Integer, nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)  # id do admin
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

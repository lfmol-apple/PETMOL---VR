"""Relatório administrativo (só leitura) da demanda de busca. Ver search_demand.py para as regras de privacidade."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import search_demand
from ..db import get_db
from .deps import get_current_admin

router = APIRouter(prefix="/v1/admin/search-demand", tags=["Admin Demanda de busca"])


@router.get("/report")
def report(days: int = Query(30, ge=1, le=90), db: Session = Depends(get_db), _admin=Depends(get_current_admin)):
    """Termos com 3+ buscas no período (7 ou 30 dias), com loja comissionável calculada na hora. Não expõe tutor nem texto bruto."""
    data = search_demand.build_report(db, days)
    data["collecting"] = search_demand.enabled()
    data["retention"] = {"daily_days": search_demand.DAILY_RETENTION_DAYS, "monthly_months": search_demand.MONTHLY_RETENTION_MONTHS, "monthly_min_searches": search_demand.MONTHLY_MIN_SEARCHES}
    return data

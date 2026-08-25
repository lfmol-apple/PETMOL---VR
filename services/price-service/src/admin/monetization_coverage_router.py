"""Admin-only leitura de cobertura de monetização por merchant (ver
monetization_coverage.py) — seção 19 da auditoria de monetização.
Nunca uma superfície pública; só ajuda a priorizar backlog (ex: "faltam
360 produtos pra monetizar no Mercado Livre").
"""
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..db import get_db
from ..monetization_coverage import compute_monetization_coverage
from .deps import get_current_admin_or_readonly_key

router = APIRouter(prefix="/v1/admin/monetization-coverage", tags=["Admin Monetization Coverage"])


class MerchantCoverageOut(BaseModel):
    merchant: str
    known_products: int
    matched_products: int
    commercially_linked_products: int
    publicly_servable_products: int
    coverage_percent: Optional[float]
    pending_products: int


class MonetizationCoverageListOut(BaseModel):
    success: bool = True
    data: list[MerchantCoverageOut]


@router.get("", response_model=MonetizationCoverageListOut)
def monetization_coverage(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    coverage = compute_monetization_coverage(db)
    return MonetizationCoverageListOut(
        data=[MerchantCoverageOut(**c.__dict__) for c in coverage]
    )

"""Admin-only leitura de métricas de cobertura/saúde do catálogo Awin por
merchant (ver affiliate_feed_metrics.py) — nunca uma superfície pública;
usada pra decidir quando um merchant está tecnicamente pronto, não pra
gerar nenhum link/oferta ao tutor.
"""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..affiliate_feed_metrics import compute_affiliate_feed_metrics
from ..db import get_db
from .deps import get_current_admin_or_readonly_key

router = APIRouter(prefix="/v1/admin/affiliate-feed", tags=["Admin Affiliate Feed"])


class AffiliateFeedMerchantMetricsOut(BaseModel):
    merchant: str
    network: str
    rows_active: int
    rows_with_gtin: int
    rows_with_affiliate_url: int
    rows_in_stock: int
    coverage_gtin_rate: Optional[float]
    affiliate_url_present_rate: Optional[float]
    in_stock_rate: Optional[float]
    last_successful_sync_at: Optional[datetime]
    last_sync_status: Optional[str]
    is_stale: Optional[bool]
    publicly_servable: bool


class AffiliateFeedMetricsListOut(BaseModel):
    success: bool = True
    data: list[AffiliateFeedMerchantMetricsOut]


@router.get("/metrics", response_model=AffiliateFeedMetricsListOut)
def affiliate_feed_metrics(
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    metrics = compute_affiliate_feed_metrics(db)
    return AffiliateFeedMetricsListOut(
        data=[AffiliateFeedMerchantMetricsOut(**m.__dict__) for m in metrics]
    )

"""Backend endpoints for smart GTIN lookup."""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .db import get_db
from .product_catalog_lookup import LookupResponse, lookup_product_by_gtin, normalize_gtin


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/products/lookup/gtin", tags=["GTIN Lookup"])


@router.get("/{gtin}", response_model=LookupResponse)
async def lookup_gtin(gtin: str, db: Session = Depends(get_db)) -> LookupResponse:
    logger.info("[smart-gtin] lookup received gtin=%s normalized=%s", gtin, normalize_gtin(gtin))
    return await lookup_product_by_gtin(db, gtin, context="api_products_lookup_gtin")
logger = logging.getLogger(__name__)


"""Legacy scanner lookup endpoints backed by the shared product catalog lookup."""

from __future__ import annotations

import json
import logging
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from .db import get_db
from .product_catalog_lookup import (
    LookupResponse,
    get_product_from_cache,
    lookup_product_by_gtin,
    normalize_gtin,
    save_confirmed_product_to_catalog,
    search_catalog_by_text,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["ProductLookup"])

ProductCategory = Literal["food", "medication", "antiparasite", "dewormer", "collar", "hygiene", "other"]


class ProductLookupRequest(BaseModel):
    code: Optional[str] = Field(None, max_length=64)


class ProductLookupConfirmRequest(BaseModel):
    code: Optional[str] = Field(None, max_length=64)
    name: Optional[str] = Field(None, max_length=255)
    brand: Optional[str] = Field(None, max_length=255)
    category: ProductCategory = "other"
    manufacturer: Optional[str] = Field(None, max_length=255)
    presentation: Optional[str] = Field(None, max_length=255)
    source: str = Field("user_confirmed", max_length=64)
    confidence: float = 1.0
    notes: Optional[str] = None
    # learning fields
    ai_suggested_name: Optional[str] = Field(None, max_length=255)
    decision_source: Optional[str] = Field(None, max_length=32)
    species: Optional[str] = Field(None, max_length=16)
    life_stage: Optional[str] = Field(None, max_length=16)
    weight: Optional[str] = Field(None, max_length=32)
    probable_name: Optional[str] = Field(None, max_length=255)
    visible_text: Optional[str] = None
    ocr_raw_text: Optional[str] = None
    decision_score: Optional[float] = None
    decision_result: Optional[str] = Field(None, max_length=16)
    tutor_confirmed: bool = True
    pet_id: Optional[str] = Field(None, max_length=128)


class CatalogSearchResult(BaseModel):
    barcode: str
    name: str
    brand: Optional[str] = None
    category: str = "other"
    weight: Optional[str] = None
    species: Optional[str] = None
    life_stage: Optional[str] = None
    source: str = "petmol_db"
    confidence: float = 0.0


class ProductLookupResponse(BaseModel):
    code: str
    found: bool
    name: Optional[str] = None
    brand: Optional[str] = None
    image: Optional[str] = None
    category: ProductCategory = "other"
    manufacturer: Optional[str] = None
    presentation: Optional[str] = None
    source: str = "none"
    confidence: float = 0.0
    suggest_manual_registration: bool = True
    errors: list[dict[str, str]] = Field(default_factory=list)


def _not_found(code: str, provider: str, message: str) -> ProductLookupResponse:
    return ProductLookupResponse(
        code=code,
        found=False,
        name=None,
        brand=None,
        image=None,
        category="other",
        source="none",
        confidence=0.0,
        suggest_manual_registration=True,
        errors=[{"provider": provider, "message": message}],
    )


def _legacy_response_from_lookup(response: LookupResponse) -> ProductLookupResponse:
    if not response.found or not response.product:
        provider = response.source or ("queue" if response.queued else "none")
        return ProductLookupResponse(
            code=response.gtin,
            found=False,
            name=None,
            brand=None,
            image=None,
            category="other",
            manufacturer=None,
            presentation=None,
            source=provider,
            confidence=0.0,
            suggest_manual_registration=not response.queued,
            errors=[{"provider": provider, "message": response.error or "não encontrado"}],
        )

    return ProductLookupResponse(
        code=response.gtin,
        found=True,
        name=response.product.name,
        brand=response.product.brand,
        image=response.product.image_url,
        category=response.product.category if response.product.category in ProductCategory.__args__ else "other",
        manufacturer=response.product.brand,
        presentation=None,
        source=response.source,
        confidence=1.0 if response.from_cache else 0.95,
        suggest_manual_registration=False,
        errors=[],
    )


@router.post("/product-lookup", response_model=ProductLookupResponse)
async def product_lookup(payload: ProductLookupRequest, db: Session = Depends(get_db)) -> ProductLookupResponse:
    try:
        code = normalize_gtin(payload.code or "")
        logger.info("[product-lookup] request received code=%s", code)

        if not 8 <= len(code) <= 14:
            response = _not_found(code, "validation", "código inválido")
            logger.info("[product-lookup] response sent found=false code=%s", code)
            return response

        response = await lookup_product_by_gtin(db, code, context="legacy_product_lookup")
        legacy_response = _legacy_response_from_lookup(response)
        logger.info(
            "[product-lookup] response sent code=%s found=%s source=%s",
            code,
            legacy_response.found,
            legacy_response.source,
        )
        return legacy_response
    except Exception as exc:
        logger.exception("[product-lookup] handled error: %s", exc)
        return _not_found("", "product-lookup", "erro tratado")


@router.post("/product-lookup/confirm", response_model=ProductLookupResponse)
async def confirm_product_lookup(
    payload: ProductLookupConfirmRequest,
    db: Session = Depends(get_db),
) -> ProductLookupResponse:
    try:
        code = normalize_gtin(payload.code or "")
        logger.info("[product-lookup] confirm received code=%s name=%s", code, payload.name)

        if not 8 <= len(code) <= 14:
            return _not_found(code, "validation", "código inválido")
        if not payload.name or not payload.name.strip():
            return _not_found(code, "validation", "nome obrigatório")

        row = save_confirmed_product_to_catalog(
            db,
            gtin=code,
            name=payload.name.strip(),
            brand=payload.brand.strip() if payload.brand else None,
            category=payload.category,
            manufacturer=payload.manufacturer.strip() if payload.manufacturer else None,
            presentation=payload.presentation.strip() if payload.presentation else None,
            source=payload.source,
            notes=payload.notes,
            ai_suggested_name=payload.ai_suggested_name,
            decision_source=payload.decision_source,
            species=payload.species,
            life_stage=payload.life_stage,
            weight=payload.weight,
            ai_confidence=payload.confidence if payload.confidence < 1.0 else None,
            probable_name=payload.probable_name,
            visible_text=payload.visible_text,
            ocr_raw_text=payload.ocr_raw_text,
            decision_score=payload.decision_score,
            decision_result=payload.decision_result,
            tutor_confirmed=payload.tutor_confirmed,
            pet_id=payload.pet_id,
        )
        db.commit()
        db.refresh(row)
        response = get_product_from_cache(db, code)
        if not response:
            return _not_found(code, "petmol_db", "falha ao persistir confirmação")
        legacy_response = _legacy_response_from_lookup(response)
        logger.info(
            "[product-lookup] confirm response code=%s found=%s source=%s",
            legacy_response.code,
            legacy_response.found,
            legacy_response.source,
        )
        return legacy_response
    except Exception as exc:
        db.rollback()
        logger.exception("[product-lookup] confirm handled error: %s", exc)
        return _not_found("", "product-lookup", "erro tratado")


@router.get("/products/catalog/search", response_model=dict)
def catalog_search(
    q: str = Query(..., min_length=2, max_length=120),
    category: Optional[str] = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
    db: Session = Depends(get_db),
) -> dict:
    """Busca textual no catálogo próprio do PETMOL. Retorna produtos com maior confiança primeiro."""
    rows = search_catalog_by_text(db, q=q, category=category, limit=limit)
    results = []
    for row in rows:
        raw: dict = {}
        try:
            raw = json.loads(row.raw_payload or "{}") if row.raw_payload else {}
        except Exception:
            pass
        results.append({
            "barcode": row.barcode_normalized,
            "name": row.name,
            "brand": row.brand,
            "category": row.category or "other",
            "weight": raw.get("weight"),
            "species": raw.get("species"),
            "life_stage": raw.get("life_stage"),
            "source": row.source_primary,
            "confidence": row.source_confidence,
        })
    return {"results": results, "total": len(results)}

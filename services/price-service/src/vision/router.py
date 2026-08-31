"""
Vision AI Router - Vaccine Card OCR
Extracts vaccine data from pet vaccination card images using Gemini AI
"""

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timezone
import base64
import os
import logging
import asyncio
import time

from ..db import get_db
from ..rate_limit import rate_limiter
from ..user_auth.deps import get_current_user
from ..user_auth.models import User, UserConsent
from ..product_catalog_lookup import compute_image_phash, find_reliable_catalog_match_by_image
from .service import VisionService
from .monitor import list_product_photo_events, list_all_recent_events, record_product_photo_event

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/vision", tags=["vision"])

AI_PHOTO_PROVIDER = "google_gemini"
AI_PHOTO_CONSENT_TYPE = "ai_photo_processing"
AI_PHOTO_POLICY_VERSION = "2026-08-25"


# Schemas
class VaccineExtractedData(BaseModel):
    name: str = Field(..., description="Nome da vacina (ex: V10, Antirrábica)")
    date: Optional[str] = Field(None, description="Data de aplicação (YYYY-MM-DD)")
    next_date: Optional[str] = Field(None, description="Próxima dose (YYYY-MM-DD)")
    veterinarian: Optional[str] = Field(None, description="Veterinário ou clínica")
    notes: Optional[str] = Field(None, description="Observações adicionais")


class ExtractVaccineCardRequest(BaseModel):
    image: str = Field(..., description="Imagem em base64 (jpeg, png)")
    pet_id: str = Field(..., description="ID do pet")


class ExtractVaccineCardResponse(BaseModel):
    vaccines: List[VaccineExtractedData]
    confidence: float = Field(..., description="Confiança da extração (0-1)")
    raw_text: Optional[str] = Field(None, description="Texto bruto extraído (debug)")


class IdentifyProductPhotoRequest(BaseModel):
    image: str = Field(..., description="Imagem em base64 (jpeg, png, webp)")
    pet_id: str = Field(..., description="ID do pet")
    hint: Optional[str] = Field(None, description="Categoria esperada: food, medication, antiparasite, dewormer, collar, hygiene, other")


class IdentifyProductPhotoResponse(BaseModel):
    found: bool
    product_name: Optional[str] = None
    name: Optional[str] = None
    probable_name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    weight: Optional[str] = None
    weight_value: Optional[float] = None
    weight_unit: Optional[str] = None
    variant: Optional[str] = None
    size: Optional[str] = None
    manufacturer: Optional[str] = None
    presentation: Optional[str] = None
    confidence: float = Field(..., description="Confiança da identificação (0-1)")
    reason: Optional[str] = None
    species: Optional[str] = None
    life_stage: Optional[str] = None
    port: Optional[str] = None
    neutered: Optional[bool] = None
    line: Optional[str] = None
    flavor: Optional[str] = None
    visible_text: Optional[str] = None
    raw_text_blobs: List[str] = Field(default_factory=list)
    multiple_products_detected: bool = False
    image_phash: Optional[str] = Field(None, description="Hash perceptual da foto (pHash), pra enviar de volta na confirmação")


class ProductPhotoMonitorEntry(BaseModel):
    timestamp: str
    pet_id: str
    hint: Optional[str] = None
    request_size_mb: float
    duration_ms: int
    success: bool
    found: bool
    return_type: str
    confidence: float
    category: Optional[str] = None
    brand: Optional[str] = None
    product_name: Optional[str] = None
    probable_name: Optional[str] = None
    species: Optional[str] = None
    life_stage: Optional[str] = None
    weight: Optional[str] = None
    raw_text_blobs_count: int = 0
    raw_text_blobs_preview: List[str] = Field(default_factory=list)
    visible_text_preview: Optional[str] = None
    error_type: Optional[str] = None
    error_message: Optional[str] = None


class ProductPhotoMonitorResponse(BaseModel):
    total: int
    full_name_count: int
    partial_useful_count: int
    empty_count: int
    error_count: int
    items: List[ProductPhotoMonitorEntry]


class AIPhotoConsentResponse(BaseModel):
    granted: bool
    provider: str = AI_PHOTO_PROVIDER
    consent_type: str = AI_PHOTO_CONSENT_TYPE
    policy_version: str = AI_PHOTO_POLICY_VERSION
    granted_at: Optional[datetime] = None
    revoked_at: Optional[datetime] = None


def _current_ai_photo_consent(db: Session, user_id: str) -> Optional[UserConsent]:
    return db.scalar(
        select(UserConsent).where(
            UserConsent.user_id == user_id,
            UserConsent.provider == AI_PHOTO_PROVIDER,
            UserConsent.consent_type == AI_PHOTO_CONSENT_TYPE,
            UserConsent.policy_version == AI_PHOTO_POLICY_VERSION,
        )
    )


def _has_ai_photo_consent(db: Session, user_id: str) -> bool:
    consent = _current_ai_photo_consent(db, user_id)
    return bool(consent and consent.revoked_at is None)


def _require_ai_photo_consent(db: Session, user_id: str) -> None:
    if not _has_ai_photo_consent(db, user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "ai_photo_consent_required",
                "provider": AI_PHOTO_PROVIDER,
                "consent_type": AI_PHOTO_CONSENT_TYPE,
                "policy_version": AI_PHOTO_POLICY_VERSION,
            },
        )


def _consent_response(consent: Optional[UserConsent]) -> AIPhotoConsentResponse:
    return AIPhotoConsentResponse(
        granted=bool(consent and consent.revoked_at is None),
        granted_at=consent.granted_at if consent else None,
        revoked_at=consent.revoked_at if consent else None,
    )


# This wraps the WHOLE identify_product_from_image call (identification +
# independent OCR, run concurrently via asyncio.gather) — it must stay above
# the Gemini SDK's own per-call timeout (30s, service.py's
# request_options={"timeout": 30}), or this outer wrapper cuts the request
# off before Gemini's own timeout ever gets a chance to matter. It was left
# at 22s when the inner timeout was raised from 20s to 30s, silently
# reintroducing the same "às vezes falha" pattern this was supposed to fix
# (confirmed in production: a real request timed out here at ~22s).
PHOTO_AI_TIMEOUT_SECONDS = float(os.getenv("VISION_PRODUCT_TIMEOUT_SECONDS", "35"))


def _build_product_photo_monitor_event(*, pet_id: str, hint: Optional[str], image_size_mb: float, duration_ms: int, result: Optional[dict] = None, error_type: Optional[str] = None, error_message: Optional[str] = None) -> dict:
    payload = result or {}
    raw_text_blobs = [value.strip() for value in (payload.get("raw_text_blobs") or []) if isinstance(value, str) and value.strip()]
    visible_text = payload.get("visible_text") if isinstance(payload.get("visible_text"), str) else None
    has_name = bool((payload.get("name") or "").strip())
    has_partial = bool(
        (payload.get("product_name") or "").strip() or
        (payload.get("brand") or "").strip() or
        (payload.get("species") or "").strip() or
        (payload.get("life_stage") or "").strip() or
        (payload.get("weight") or "").strip() or
        payload.get("weight_value") is not None or
        (payload.get("weight_unit") or "").strip() or
        (payload.get("line") or "").strip() or
        (payload.get("variant") or "").strip() or
        (payload.get("flavor") or "").strip() or
        (payload.get("probable_name") or "").strip() or
        bool(raw_text_blobs) or
        bool((visible_text or "").strip())
    )
    return_type = "error" if error_type else "full_name" if has_name else "partial_useful" if has_partial else "empty"
    return {
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "pet_id": pet_id,
        "hint": hint,
        "request_size_mb": round(image_size_mb, 3),
        "duration_ms": max(0, duration_ms),
        "success": error_type is None,
        "found": bool(payload.get("found")),
        "return_type": return_type,
        "confidence": float(payload.get("confidence") or 0.0),
        "category": payload.get("category"),
        "brand": payload.get("brand"),
        "product_name": payload.get("product_name") or payload.get("name"),
        "probable_name": payload.get("probable_name"),
        "species": payload.get("species"),
        "life_stage": payload.get("life_stage"),
        "weight": payload.get("weight"),
        "raw_text_blobs_count": len(raw_text_blobs),
        "raw_text_blobs_preview": raw_text_blobs[:4],
        "visible_text_preview": visible_text[:180] if visible_text else None,
        "error_type": error_type,
        "error_message": error_message[:180] if error_message else None,
        # Temporary diagnostic fields for the brand-hallucination investigation —
        # only surfaced via the token-gated /vision/monitor/debug-dump endpoint.
        # TODO: remove once closed.
        "_debug_identification_raw": payload.get("_debug_identification_raw"),
        "_debug_ocr_raw": payload.get("_debug_ocr_raw"),
        "_debug_ocr_blobs": payload.get("_debug_ocr_blobs"),
    }


@router.get("/monitor/product-photo-recent", response_model=ProductPhotoMonitorResponse)
async def get_recent_product_photo_results(
    limit: int = Query(default=20, ge=1, le=50),
    current_user: User = Depends(get_current_user),
):
    items = list_product_photo_events(str(current_user.id), limit=limit)
    return ProductPhotoMonitorResponse(
        total=len(items),
        full_name_count=sum(1 for item in items if item.get("return_type") == "full_name"),
        partial_useful_count=sum(1 for item in items if item.get("return_type") == "partial_useful"),
        empty_count=sum(1 for item in items if item.get("return_type") == "empty"),
        error_count=sum(1 for item in items if item.get("return_type") == "error"),
        items=[ProductPhotoMonitorEntry(**item) for item in items],
    )


@router.get("/consent/ai-photo", response_model=AIPhotoConsentResponse)
def get_ai_photo_consent(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _consent_response(_current_ai_photo_consent(db, str(current_user.id)))


@router.post("/consent/ai-photo", response_model=AIPhotoConsentResponse)
def grant_ai_photo_consent(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    consent = _current_ai_photo_consent(db, str(current_user.id))
    if consent:
        consent.granted_at = now
        consent.revoked_at = None
    else:
        consent = UserConsent(
            user_id=str(current_user.id),
            provider=AI_PHOTO_PROVIDER,
            consent_type=AI_PHOTO_CONSENT_TYPE,
            policy_version=AI_PHOTO_POLICY_VERSION,
            granted_at=now,
        )
        db.add(consent)
    db.commit()
    db.refresh(consent)
    return _consent_response(consent)


@router.delete("/consent/ai-photo", response_model=AIPhotoConsentResponse)
def revoke_ai_photo_consent(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    consent = _current_ai_photo_consent(db, str(current_user.id))
    if consent and consent.revoked_at is None:
        consent.revoked_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(consent)
    return _consent_response(consent)


# Temporary, token-gated, cross-user diagnostic dump for the brand-hallucination
# investigation — bypasses per-user auth so it can be fetched directly while
# debugging without needing the tester's own session. Returns the full raw
# Gemini responses from both the identification call and the independent OCR
# call. TODO: remove this endpoint once the investigation is closed.
_DEBUG_DUMP_TOKEN = "86c72925dee5fbefc0a57c92153c34ea1ca53793fb5d1f9c"


@router.get("/monitor/debug-dump")
async def debug_dump_product_photo_events(
    token: str = Query(...),
    limit: int = Query(default=10, ge=1, le=50),
):
    if token != _DEBUG_DUMP_TOKEN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid token")
    return {"items": list_all_recent_events(limit=limit)}


@router.post("/extract-vaccine-card", response_model=ExtractVaccineCardResponse)
async def extract_vaccine_card(
    request: ExtractVaccineCardRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Extrai dados de vacinas de uma foto da carteirinha
    
    **Feature flag:** FEATURE_AI_VACCINE_SCAN (deve estar habilitada)
    
    **Fluxo:**
    1. Recebe imagem em base64
    2. Envia para Gemini AI com prompt especializado
    3. Retorna dados estruturados (NÃO salva automaticamente)
    4. Frontend mostra preview e usuário confirma antes de salvar
    
    **Limitações:**
    - Máximo 4MB por imagem
    - Formatos: JPEG, PNG
    - Requer chave GOOGLE_API_KEY ou GEMINI_API_KEY configurada
    """
    # Cada chamada custa dinheiro de verdade (API do Gemini) — sem isso, um
    # script batendo nesse endpoint em loop vira uma conta inesperada, não
    # só um problema de performance.
    allowed, _, _ = rate_limiter.check_rate_limit(http_request, max_requests=20, window_seconds=3600)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas leituras de imagem. Aguarde um momento.")

    _require_ai_photo_consent(db, str(current_user.id))

    # Verificar feature flag
    feature_enabled = os.getenv("FEATURE_AI_VACCINE_SCAN", "false").lower() == "true"
    if not feature_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Feature AI de leitura de carteirinha não está habilitada. Configure FEATURE_AI_VACCINE_SCAN=true"
        )
    
    # Verificar chave API
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GOOGLE_API_KEY ou GEMINI_API_KEY não configuradas")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Serviço de IA não configurado corretamente"
        )
    
    try:
        # Validar tamanho da imagem (máximo 4MB em base64)
        image_data = request.image
        if image_data.startswith("data:image"):
            # Remove o prefixo data:image/jpeg;base64,
            image_data = image_data.split(",")[1]
        
        image_bytes = base64.b64decode(image_data)
        image_size_mb = len(image_bytes) / (1024 * 1024)
        
        if image_size_mb > 4:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Imagem muito grande ({image_size_mb:.1f}MB). Máximo: 4MB"
            )
        
        logger.info(f"Processando imagem de vacina para pet_id={request.pet_id}, tamanho={image_size_mb:.2f}MB")
        
        # Processar com Gemini AI
        vision_service = VisionService(api_key)
        result = await vision_service.extract_vaccine_data(image_bytes, request.pet_id)
        
        logger.info(f"Extração concluída: {len(result['vaccines'])} vacinas encontradas, confiança={result['confidence']:.2f}")
        
        return ExtractVaccineCardResponse(
            vaccines=[VaccineExtractedData(**v) for v in result["vaccines"]],
            confidence=result["confidence"],
            raw_text=result.get("raw_text")
        )
        
    except base64.binascii.Error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem inválida. Esperado base64 válido"
        )
    except Exception as e:
        logger.error(f"Erro ao processar imagem: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao processar a imagem. Tente novamente."
        )


@router.post("/identify-product-photo", response_model=IdentifyProductPhotoResponse)
async def identify_product_photo(
    request: IdentifyProductPhotoRequest,
    http_request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Identifica um produto pet a partir da foto da embalagem."""
    allowed, _, _ = rate_limiter.check_rate_limit(http_request, max_requests=20, window_seconds=3600)
    if not allowed:
        raise HTTPException(status_code=429, detail="Muitas leituras de imagem. Aguarde um momento.")

    _require_ai_photo_consent(db, str(current_user.id))

    started_at = time.perf_counter()

    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GOOGLE_API_KEY ou GEMINI_API_KEY não configuradas")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Serviço de IA não configurado corretamente"
        )

    try:
        image_data = request.image
        if image_data.startswith("data:image"):
            image_data = image_data.split(",", 1)[1]

        image_bytes = base64.b64decode(image_data)
        image_size_mb = len(image_bytes) / (1024 * 1024)
        if image_size_mb > 4:
            raise HTTPException(
                status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                detail=f"Imagem muito grande ({image_size_mb:.1f}MB). Máximo: 4MB"
            )

        image_phash = compute_image_phash(image_bytes)

        # Atalho: se essa foto é visualmente quase idêntica à de um produto
        # já confirmado por algum tutor antes (mesmo que seja outro tutor,
        # outro pet), usamos direto os dados salvos e pulamos a chamada do
        # Gemini — mais rápido e sem custo de IA. A tela de confirmação
        # continua aparecendo normalmente depois: isso só evita a espera da
        # IA, nunca pula a checagem do tutor.
        result: Optional[dict] = None
        min_confirmations = int(os.environ.get("CATALOG_PROMOTION_MIN_CONFIRMATIONS", "1"))
        if image_phash:
            match = find_reliable_catalog_match_by_image(db, image_phash, min_confirmations=min_confirmations)
            if match:
                row, distance = match
                result = {
                    "found": True,
                    "name": row.canonical_name,
                    "product_name": row.canonical_name,
                    "probable_name": row.canonical_name,
                    "brand": row.brand,
                    "category": row.category or request.hint or "other",
                    "weight": row.weight,
                    "weight_value": None,
                    "weight_unit": None,
                    "variant": None,
                    "size": None,
                    "manufacturer": None,
                    "presentation": None,
                    "confidence": round(max(0.5, 1.0 - (distance / 64)), 2),
                    "reason": "image_hash_match",
                    "species": row.species,
                    "life_stage": row.life_stage,
                    "port": row.port,
                    "neutered": row.neutered,
                    "line": None,
                    "flavor": row.flavor,
                    "visible_text": None,
                    "raw_text_blobs": [],
                    "multiple_products_detected": False,
                }
                logger.info(
                    "identify-product-photo image_hash_match pet=%s hash_distance=%s canonical=%s",
                    request.pet_id, distance, row.canonical_name,
                )

        if result is None:
            vision_service = VisionService(api_key)
            try:
                result = await asyncio.wait_for(
                    vision_service.identify_product_from_image(
                        image_bytes=image_bytes,
                        pet_id=request.pet_id,
                        hint=request.hint,
                    ),
                    timeout=PHOTO_AI_TIMEOUT_SECONDS,
                )
            except asyncio.TimeoutError:
                duration_ms = round((time.perf_counter() - started_at) * 1000)
                record_product_photo_event(
                    str(current_user.id),
                    _build_product_photo_monitor_event(
                        pet_id=request.pet_id,
                        hint=request.hint,
                        image_size_mb=image_size_mb,
                        duration_ms=duration_ms,
                        error_type="timeout",
                        error_message="Tempo limite da IA esgotado",
                    ),
                )
                logger.warning(
                    "identify-product-photo return_type=timeout pet=%s hint=%s timeout_seconds=%.1f",
                    request.pet_id,
                    request.hint,
                    PHOTO_AI_TIMEOUT_SECONDS,
                )
                raise HTTPException(
                    status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                    detail="Tempo limite da IA esgotado. Tente novamente."
                )

        has_name = bool((result.get("name") or "").strip())
        has_partial = bool(
            (result.get("product_name") or "").strip() or
            (result.get("brand") or "").strip() or
            (result.get("species") or "").strip() or
            (result.get("life_stage") or "").strip() or
            (result.get("weight") or "").strip() or
            result.get("weight_value") is not None or
            (result.get("weight_unit") or "").strip() or
            (result.get("line") or "").strip() or
            (result.get("variant") or "").strip() or
            (result.get("flavor") or "").strip() or
            (result.get("probable_name") or "").strip() or
            bool(result.get("raw_text_blobs")) or
            (result.get("visible_text") or "").strip()
        )
        return_type = "full_name" if has_name else "partial_useful" if has_partial else "empty"
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        record_product_photo_event(
            str(current_user.id),
            _build_product_photo_monitor_event(
                pet_id=request.pet_id,
                hint=request.hint,
                image_size_mb=image_size_mb,
                duration_ms=duration_ms,
                result=result,
            ),
        )
        logger.info(
            "identify-product-photo return_type=%s pet=%s hint=%s found=%s name=%s partial=%s confidence=%.2f duration_ms=%s",
            return_type,
            request.pet_id,
            request.hint,
            result.get("found"),
            "yes" if has_name else "no",
            "yes" if has_partial else "no",
            result.get("confidence", 0.0),
            duration_ms,
        )

        return IdentifyProductPhotoResponse(**result, image_phash=image_phash)
    except base64.binascii.Error:
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        record_product_photo_event(
            str(current_user.id),
            _build_product_photo_monitor_event(
                pet_id=request.pet_id,
                hint=request.hint,
                image_size_mb=0.0,
                duration_ms=duration_ms,
                error_type="invalid_base64",
                error_message="Imagem inválida. Esperado base64 válido",
            ),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Imagem inválida. Esperado base64 válido"
        )
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        is_timeout = "timeout" in err_str.lower() or "deadline" in err_str.lower()
        duration_ms = round((time.perf_counter() - started_at) * 1000)
        if is_timeout:
            record_product_photo_event(
                str(current_user.id),
                _build_product_photo_monitor_event(
                    pet_id=request.pet_id,
                    hint=request.hint,
                    image_size_mb=0.0,
                    duration_ms=duration_ms,
                    error_type="timeout",
                    error_message=err_str,
                ),
            )
            logger.warning("identify-product-photo return_type=timeout pet=%s error=%s", request.pet_id, err_str)
            raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail="Tempo limite da IA esgotado. Tente novamente.")
        record_product_photo_event(
            str(current_user.id),
            _build_product_photo_monitor_event(
                pet_id=request.pet_id,
                hint=request.hint,
                image_size_mb=0.0,
                duration_ms=duration_ms,
                error_type="api_error",
                error_message=err_str,
            ),
        )
        logger.error("identify-product-photo return_type=api_error pet=%s error=%s", request.pet_id, err_str, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Falha ao processar a imagem. Tente novamente."
        )


@router.get("/health")
async def vision_health():
    """Healthcheck do serviço de visão AI"""
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    feature_enabled = os.getenv("FEATURE_AI_VACCINE_SCAN", "false").lower() == "true"
    
    return {
        "status": "ok",
        "feature_enabled": feature_enabled,
        "api_configured": bool(api_key),
        "service": "vision-ai"
    }


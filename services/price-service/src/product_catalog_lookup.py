from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String, Text, or_, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .config import get_settings
from .db import Base
from .gtin_client import GtinAuthError, GtinConfigError, GtinExternalError, get_product_by_gtin, get_product_image_url


logger = logging.getLogger(__name__)

COSMOS_TIMEOUT_SECONDS = 4.0
VALID_PRODUCT_CATEGORIES = {
    "food",
    "medication",
    "antiparasite",
    "dewormer",
    "collar",
    "hygiene",
    "other",
}
COSMOS_PROVIDER = "cosmos"
GTIN_RSC_PROVIDER = "gtin_rsc"
LOOKUP_QUEUE_STATUS_PENDING = "pending"
LOOKUP_QUEUE_STATUS_RESOLVED = "resolved"
LOOKUP_QUEUE_NOT_FOUND_REASON = "Produto não encontrado nos provedores; enviado para fila"


class ProductCatalog(Base):
    __tablename__ = "products_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barcode: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    barcode_normalized: Mapped[str] = mapped_column(String(32), nullable=False, unique=True, index=True)
    name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    ncm_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ncm_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gpc_code: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    gpc_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    thumbnail_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source_primary: Mapped[str] = mapped_column(String(64), nullable=False, default="petmol_db")
    source_confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    raw_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class ProductScanEvent(Base):
    __tablename__ = "product_scan_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barcode: Mapped[str] = mapped_column(String(32), nullable=False)
    barcode_normalized: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    found_in_cache: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    external_source_used: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products_catalog.id"), nullable=True)
    context: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class ProductLookupQueue(Base):
    __tablename__ = "product_lookup_queue"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barcode: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    barcode_normalized: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default=LOOKUP_QUEUE_STATUS_PENDING)
    attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_attempt_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_product_id: Mapped[Optional[int]] = mapped_column(ForeignKey("products_catalog.id"), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class ProductCorrectionEvent(Base):
    """Registra quando um tutor corrigiu o nome sugerido pela IA/scanner."""
    __tablename__ = "product_correction_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barcode_normalized: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    suggested_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    corrected_name: Mapped[str] = mapped_column(String(255), nullable=False)
    decision_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    ai_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    brand: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    species: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    life_stage: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    weight: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    probable_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    visible_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    pet_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class ProductLearningEvent(Base):
    """Evento estruturado de leitura/confirmação para memória incremental."""
    __tablename__ = "product_learning_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    barcode_normalized: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    ocr_raw_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    visible_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    probable_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    detected_brand: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    detected_species: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    detected_life_stage: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    detected_weight: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    resolved_name: Mapped[str] = mapped_column(String(255), nullable=False)
    resolved_category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    decision_source: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    decision_score: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    decision_result: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    tutor_confirmed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    tutor_corrected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    corrected_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ai_suggested_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pet_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), index=True)


class ProductReliableCatalog(Base):
    """Base confiável interna: canônico + aliases + GTINs + contadores de confiança."""
    __tablename__ = "product_reliable_catalog"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    canonical_key: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    canonical_name: Mapped[str] = mapped_column(String(255), nullable=False)
    aliases_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    gtins_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    brand: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    species: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    life_stage: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    weight: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    confirmation_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    correction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_confirmed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class LookupProductPayload(BaseModel):
    name: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    ncm_code: Optional[str] = None
    ncm_description: Optional[str] = None
    gpc_code: Optional[str] = None
    gpc_description: Optional[str] = None
    image_url: Optional[str] = None
    raw: dict[str, Any] = Field(default_factory=dict)


class LookupResponse(BaseModel):
    ok: bool
    gtin: str
    found: bool
    from_cache: bool = False
    queued: bool = False
    source: Optional[str] = None
    product: Optional[LookupProductPayload] = None
    error: Optional[str] = None


@dataclass
class CatalogCandidate:
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    ncm_code: Optional[str] = None
    ncm_description: Optional[str] = None
    gpc_code: Optional[str] = None
    gpc_description: Optional[str] = None
    thumbnail_url: Optional[str] = None
    source_primary: str = "petmol_db"
    source_confidence: float = 0.0
    raw_payload: dict[str, Any] = field(default_factory=dict)


def normalize_gtin(value: str) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


def is_valid_gtin(value: str) -> bool:
    return len(normalize_gtin(value)) in {8, 12, 13, 14}


def _safe_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    if isinstance(value, (int, float)):
        return str(value)
    return None


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None:
            return None
        return float(value)
    except Exception:
        return None


def _norm_key(value: Optional[str]) -> str:
    return "".join(ch.lower() for ch in (value or "").strip() if ch.isalnum() or ch.isspace()).strip()


def _safe_dict(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    return {}


def _extract_brand(value: Any) -> Optional[str]:
    if isinstance(value, dict):
        return _safe_text(value.get("name") or value.get("descricao") or value.get("description"))
    return _safe_text(value)


def _infer_category(*parts: Optional[str]) -> str:
    normalized = " ".join(part for part in parts if part).lower()
    if any(word in normalized for word in ("bravecto", "nexgard", "simparica", "frontline", "antipulgas", "carrapato")):
        return "antiparasite"
    if any(word in normalized for word in ("vermifugo", "vermífugo", "drontal", "milbemax", "panacur")):
        return "dewormer"
    if any(word in normalized for word in ("coleira", "seresto", "scalibor", "collar")):
        return "collar"
    if any(word in normalized for word in ("medicamento", "remedio", "remédio", "comprimido", "mg", "mcg", "sol oral")):
        return "medication"
    if any(word in normalized for word in ("racao", "ração", "alimento", "cafe", "snack", "petisco", "sache", "lata")):
        return "food"
    if any(word in normalized for word in ("shampoo", "higiene", "areia", "tapete")):
        return "hygiene"
    return "other"


def _normalize_category(value: Optional[str], *fallback_parts: Optional[str]) -> str:
    text = _safe_text(value)
    if text:
        lowered = text.strip().lower()
        if lowered in VALID_PRODUCT_CATEGORIES:
            return lowered
    return _infer_category(text, *fallback_parts)


def _deserialize_payload(value: Optional[str]) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _serialize_payload(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False)


def _safe_json_list(value: Optional[str]) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except Exception:
        return []
    return []


def _canonical_key(name: str, brand: Optional[str], category: Optional[str]) -> str:
    return "|".join([
        _norm_key(brand),
        _norm_key(category),
        _norm_key(name),
    ])


def _response_from_catalog_row(row: ProductCatalog, *, from_cache: bool) -> LookupResponse:
    payload = _deserialize_payload(row.raw_payload)
    source = "cache" if from_cache else row.source_primary
    return LookupResponse(
        ok=True,
        gtin=row.barcode_normalized,
        found=True,
        from_cache=from_cache,
        queued=False,
        source=source,
        product=LookupProductPayload(
            name=row.name,
            brand=row.brand,
            category=_normalize_category(row.category, row.name, row.brand),
            ncm_code=row.ncm_code,
            ncm_description=row.ncm_description,
            gpc_code=row.gpc_code,
            gpc_description=row.gpc_description,
            image_url=row.thumbnail_url,
            raw=payload,
        ),
        error=None,
    )

def is_cosmos_enabled() -> bool:
    settings = get_settings()
    return bool(_safe_text(getattr(settings, "cosmos_api_token", None)))


def get_product_from_cache(db: Session, gtin: str) -> Optional[LookupResponse]:
    normalized = normalize_gtin(gtin)
    row = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == normalized))
    if row and row.name:
        logger.info("[catalog-lookup] cache hit gtin=%s source=%s", normalized, row.source_primary)
        return _response_from_catalog_row(row, from_cache=True)
    return None


def enqueue_missing_product(db: Session, gtin: str, reason: str = LOOKUP_QUEUE_NOT_FOUND_REASON) -> ProductLookupQueue:
    normalized = normalize_gtin(gtin)
    now = datetime.now(timezone.utc)
    queue_item = db.scalar(
        select(ProductLookupQueue).where(
            ProductLookupQueue.barcode_normalized == normalized,
            ProductLookupQueue.status == LOOKUP_QUEUE_STATUS_PENDING,
        )
    )
    if not queue_item:
        queue_item = ProductLookupQueue(
            barcode=normalized,
            barcode_normalized=normalized,
            status=LOOKUP_QUEUE_STATUS_PENDING,
            attempts=0,
        )
        db.add(queue_item)

    queue_item.attempts += 1
    queue_item.last_attempt_at = now
    queue_item.notes = reason
    db.flush()
    return queue_item


def _resolve_pending_queue_items(db: Session, normalized_gtin: str, product_id: int) -> None:
    pending_items = db.scalars(
        select(ProductLookupQueue).where(
            ProductLookupQueue.barcode_normalized == normalized_gtin,
            ProductLookupQueue.status == LOOKUP_QUEUE_STATUS_PENDING,
        )
    ).all()
    now = datetime.now(timezone.utc)
    for item in pending_items:
        item.status = LOOKUP_QUEUE_STATUS_RESOLVED
        item.resolved_product_id = product_id
        item.last_attempt_at = now
        item.notes = "resolved_from_catalog"


async def fetch_product_from_cosmos(gtin: str) -> Optional[CatalogCandidate]:
    settings = get_settings()
    token = _safe_text(getattr(settings, "cosmos_api_token", None))
    if not token:
        logger.info("[catalog-lookup] cosmos skipped gtin=%s reason=not_configured", gtin)
        return None

    base_url = (_safe_text(getattr(settings, "cosmos_api_base_url", None)) or "https://api.cosmos.bluesoft.com.br").rstrip("/")
    url = f"{base_url}/gtins/{gtin}.json"
    try:
        async with httpx.AsyncClient(timeout=COSMOS_TIMEOUT_SECONDS) as client:
            response = await client.get(
                url,
                headers={
                    "X-Cosmos-Token": token,
                    "User-Agent": "Cosmos-API-Request",
                    "Accept": "application/json",
                },
            )
    except Exception as exc:
        logger.info("[catalog-lookup] cosmos failed gtin=%s error=%s", gtin, exc)
        return None

    logger.info("[catalog-lookup] cosmos response gtin=%s status=%s", gtin, response.status_code)
    if response.status_code == 404:
        return None
    if response.status_code < 200 or response.status_code >= 300:
        return None

    try:
        payload = response.json()
    except Exception:
        return None

    if not isinstance(payload, dict):
        return None

    name = _safe_text(payload.get("description") or payload.get("name"))
    if not name:
        return None

    brand = _extract_brand(payload.get("brand"))
    ncm_data = _safe_dict(payload.get("ncm"))
    gpc_data = _safe_dict(payload.get("gpc"))
    category_text = _safe_text(payload.get("category")) or _safe_text(payload.get("department"))

    return CatalogCandidate(
        name=name,
        brand=brand,
        category=_normalize_category(category_text, name, brand),
        ncm_code=_safe_text(ncm_data.get("code") or payload.get("ncm_code") or payload.get("ncm")),
        ncm_description=_safe_text(ncm_data.get("description") or payload.get("ncm_description")),
        gpc_code=_safe_text(gpc_data.get("code") or payload.get("gpc_code") or payload.get("gpc")),
        gpc_description=_safe_text(gpc_data.get("description") or payload.get("gpc_description")),
        thumbnail_url=_safe_text(payload.get("thumbnail") or _safe_dict(payload.get("avg_price")).get("image")),
        source_primary="cosmos",
        source_confidence=90.0,
        raw_payload=payload,
    )


async def fetch_product_from_gtin_provider(gtin: str) -> Optional[CatalogCandidate]:
    try:
        payload = await get_product_by_gtin(gtin)
    except (GtinConfigError, GtinAuthError, GtinExternalError) as exc:
        logger.info("[catalog-lookup] gtin_rsc skipped gtin=%s error=%s", gtin, exc)
        return None
    except Exception as exc:
        logger.info("[catalog-lookup] gtin_rsc failed gtin=%s error=%s", gtin, exc)
        return None

    if not isinstance(payload, dict) or not payload:
        return None

    name = _safe_text(payload.get("nome") or payload.get("nome_acento") or payload.get("description") or payload.get("name"))
    if not name:
        return None

    brand = _safe_text(payload.get("marca"))
    if brand and brand.strip().lower() in {"desconhecido", "desconhecido ", "unknown"}:
        brand = None

    image_url = None
    try:
        image_url = await get_product_image_url(gtin)
    except Exception as exc:
        logger.info("[catalog-lookup] gtin_rsc image unavailable gtin=%s error=%s", gtin, exc)

    image_url = image_url or _safe_text(payload.get("link_foto"))
    ncm_code = _safe_text(payload.get("ncm"))
    category_text = _safe_text(payload.get("categoria"))

    return CatalogCandidate(
        name=name,
        brand=brand,
        category=_normalize_category(category_text, name, brand, ncm_code),
        ncm_code=ncm_code,
        thumbnail_url=image_url,
        source_primary=GTIN_RSC_PROVIDER,
        source_confidence=85.0,
        raw_payload=payload,
    )


def save_product_to_catalog(db: Session, gtin: str, candidate: Optional[CatalogCandidate], *, negative: bool = False) -> ProductCatalog:
    normalized = normalize_gtin(gtin)
    now = datetime.now(timezone.utc)
    row = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == normalized))
    if not row:
        row = ProductCatalog(barcode=normalized, barcode_normalized=normalized)
        db.add(row)

    row.barcode = normalized
    row.barcode_normalized = normalized
    row.updated_at = now
    row.last_verified_at = now

    if negative or candidate is None:
        row.name = None
        row.brand = None
        row.category = None
        row.ncm_code = None
        row.ncm_description = None
        row.gpc_code = None
        row.gpc_description = None
        row.thumbnail_url = None
        row.source_primary = "pending"
        row.source_confidence = 0.0
        row.raw_payload = _serialize_payload({"barcode": normalized, "pending": True})
        db.flush()
        return row

    row.name = candidate.name
    row.brand = candidate.brand
    row.category = _normalize_category(candidate.category, candidate.name, candidate.brand)
    row.ncm_code = candidate.ncm_code
    row.ncm_description = candidate.ncm_description
    row.gpc_code = candidate.gpc_code
    row.gpc_description = candidate.gpc_description
    row.thumbnail_url = candidate.thumbnail_url
    row.source_primary = candidate.source_primary
    row.source_confidence = candidate.source_confidence
    row.raw_payload = _serialize_payload(candidate.raw_payload)
    db.flush()
    if row.id:
        _resolve_pending_queue_items(db, normalized, row.id)
    return row


def save_confirmed_product_to_catalog(
    db: Session,
    *,
    gtin: str,
    name: str,
    brand: Optional[str],
    category: Optional[str],
    manufacturer: Optional[str],
    presentation: Optional[str],
    source: str,
    notes: Optional[str] = None,
    # learning fields
    ai_suggested_name: Optional[str] = None,
    decision_source: Optional[str] = None,
    species: Optional[str] = None,
    life_stage: Optional[str] = None,
    weight: Optional[str] = None,
    ai_confidence: Optional[float] = None,
    pet_id: Optional[str] = None,
    probable_name: Optional[str] = None,
    visible_text: Optional[str] = None,
    ocr_raw_text: Optional[str] = None,
    decision_score: Optional[float] = None,
    decision_result: Optional[str] = None,
    tutor_confirmed: bool = True,
) -> ProductCatalog:
    raw_payload: dict[str, Any] = {
        "name": name,
        "brand": brand,
        "category": category,
        "manufacturer": manufacturer,
        "presentation": presentation,
        "notes": notes,
        "source": source,
        "confirmed_by": "user",
        "decision_source": decision_source,
        "species": species,
        "life_stage": life_stage,
        "weight": weight,
        "probable_name": probable_name,
        "visible_text": visible_text,
        "ocr_raw_text": ocr_raw_text,
        "decision_score": decision_score,
        "decision_result": decision_result,
        "tutor_confirmed": tutor_confirmed,
    }
    candidate = CatalogCandidate(
        name=name,
        brand=brand,
        category=category,
        source_primary="petmol_db",
        source_confidence=1.0,
        raw_payload=raw_payload,
    )
    row = save_product_to_catalog(db, gtin, candidate)

    # Registrar evento de correção quando tutor mudou o nome sugerido pela IA
    was_corrected = ai_suggested_name and ai_suggested_name.strip().lower() != name.strip().lower()
    if was_corrected:
        try:
            correction = ProductCorrectionEvent(
                barcode_normalized=normalize_gtin(gtin),
                suggested_name=ai_suggested_name,
                corrected_name=name,
                decision_source=decision_source,
                ai_confidence=ai_confidence,
                category=category,
                brand=brand,
                species=species,
                life_stage=life_stage,
                weight=weight,
                probable_name=probable_name,
                visible_text=visible_text,
                pet_id=pet_id,
            )
            db.add(correction)
        except Exception:
            pass

    try:
        learning_event = ProductLearningEvent(
            barcode_normalized=normalize_gtin(gtin),
            ocr_raw_text=_safe_text(ocr_raw_text),
            visible_text=_safe_text(visible_text),
            probable_name=_safe_text(probable_name),
            detected_brand=_safe_text(brand),
            detected_species=_safe_text(species),
            detected_life_stage=_safe_text(life_stage),
            detected_weight=_safe_text(weight),
            resolved_name=name,
            resolved_category=_normalize_category(category, name, brand),
            decision_source=_safe_text(decision_source),
            decision_score=_safe_float(decision_score) or _safe_float(ai_confidence),
            decision_result=_safe_text(decision_result),
            tutor_confirmed=bool(tutor_confirmed),
            tutor_corrected=bool(was_corrected),
            corrected_name=name if was_corrected else None,
            ai_suggested_name=_safe_text(ai_suggested_name),
            pet_id=_safe_text(pet_id),
        )
        db.add(learning_event)
    except Exception:
        pass

    try:
        key = _canonical_key(name, brand, category)
        now = datetime.now(timezone.utc)
        reliable = db.scalar(select(ProductReliableCatalog).where(ProductReliableCatalog.canonical_key == key))
        if not reliable:
            reliable = ProductReliableCatalog(
                canonical_key=key,
                canonical_name=name,
                aliases_json="[]",
                gtins_json="[]",
                brand=_safe_text(brand),
                category=_normalize_category(category, name, brand),
                species=_safe_text(species),
                life_stage=_safe_text(life_stage),
                weight=_safe_text(weight),
                confirmation_count=0,
                correction_count=0,
            )
            db.add(reliable)
            db.flush()

        aliases = set(_safe_json_list(reliable.aliases_json))
        gtins = set(_safe_json_list(reliable.gtins_json))
        if ai_suggested_name and ai_suggested_name.strip():
            aliases.add(ai_suggested_name.strip())
        if probable_name and probable_name.strip():
            aliases.add(probable_name.strip())
        aliases.add(name.strip())

        normalized_gtin = normalize_gtin(gtin)
        if normalized_gtin:
            gtins.add(normalized_gtin)

        reliable.aliases_json = json.dumps(sorted(aliases), ensure_ascii=False)
        reliable.gtins_json = json.dumps(sorted(gtins), ensure_ascii=False)
        reliable.brand = reliable.brand or _safe_text(brand)
        reliable.category = reliable.category or _normalize_category(category, name, brand)
        reliable.species = reliable.species or _safe_text(species)
        reliable.life_stage = reliable.life_stage or _safe_text(life_stage)
        reliable.weight = reliable.weight or _safe_text(weight)
        new_confirmation_count = int(reliable.confirmation_count or 0) + (1 if tutor_confirmed else 0)
        new_correction_count = int(reliable.correction_count or 0) + (1 if was_corrected else 0)
        reliable.confirmation_count = new_confirmation_count
        reliable.correction_count = new_correction_count
        reliable.last_confirmed_at = now
        reliable.updated_at = now

        # Aprendizado silencioso: elevar confiança no ProductCatalog quando
        # muitas confirmações acumuladas — produto é altamente confiável.
    except Exception:
        pass

    return row


def search_catalog_by_text(
    db: Session,
    *,
    q: str,
    category: Optional[str] = None,
    limit: int = 5,
) -> list[ProductCatalog]:
    """Busca textual no catálogo próprio. Prioriza produtos confirmados por usuário (confidence=1.0)."""
    if not q or not q.strip():
        return []
    terms = q.strip().split()[:4]  # máximo 4 termos para evitar LIKE lento
    stmt = select(ProductCatalog).where(ProductCatalog.name.isnot(None))
    for term in terms:
        pattern = f"%{term}%"
        stmt = stmt.where(
            or_(
                ProductCatalog.name.ilike(pattern),
                ProductCatalog.brand.ilike(pattern),
            )
        )
    if category and category in VALID_PRODUCT_CATEGORIES:
        stmt = stmt.where(ProductCatalog.category == category)
    stmt = stmt.order_by(ProductCatalog.source_confidence.desc()).limit(limit)
    return list(db.execute(stmt).scalars().all())


def _record_scan_event(
    db: Session,
    *,
    barcode: str,
    barcode_normalized: str,
    found_in_cache: bool,
    external_source_used: Optional[str],
    product_id: Optional[int],
    context: Optional[str],
) -> None:
    db.add(
        ProductScanEvent(
            barcode=barcode,
            barcode_normalized=barcode_normalized,
            found_in_cache=found_in_cache,
            external_source_used=external_source_used,
            product_id=product_id,
            context=context,
        )
    )


async def lookup_product_by_gtin(db: Session, gtin: str, *, context: str = "api_products_lookup_gtin") -> LookupResponse:
    normalized = normalize_gtin(gtin)
    if not is_valid_gtin(normalized):
        return LookupResponse(
            ok=False,
            gtin=normalized,
            found=False,
            from_cache=False,
            queued=False,
            source=None,
            product=None,
            error="GTIN inválido",
        )

    cached = get_product_from_cache(db, normalized)
    if cached:
        cached_row = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == normalized))
        _record_scan_event(
            db,
            barcode=gtin,
            barcode_normalized=normalized,
            found_in_cache=True,
            external_source_used="cache",
            product_id=cached_row.id if cached_row else None,
            context=context,
        )
        db.commit()
        return cached

    provider_used: Optional[str] = None
    candidate: Optional[CatalogCandidate] = None

    cosmos_candidate = await fetch_product_from_cosmos(normalized) if is_cosmos_enabled() else None
    if cosmos_candidate:
        candidate = cosmos_candidate
        provider_used = COSMOS_PROVIDER
    else:
        gtin_candidate = await fetch_product_from_gtin_provider(normalized)
        if gtin_candidate:
            candidate = gtin_candidate
            provider_used = GTIN_RSC_PROVIDER

    if candidate:
        row = save_product_to_catalog(db, normalized, candidate)
        _record_scan_event(
            db,
            barcode=gtin,
            barcode_normalized=normalized,
            found_in_cache=False,
            external_source_used=provider_used,
            product_id=row.id,
            context=context,
        )
        db.commit()
        db.refresh(row)
        return _response_from_catalog_row(row, from_cache=False)

    queue_item = enqueue_missing_product(db, normalized)
    _record_scan_event(
        db,
        barcode=gtin,
        barcode_normalized=normalized,
        found_in_cache=False,
        external_source_used=provider_used,
        product_id=queue_item.resolved_product_id,
        context=context,
    )
    db.commit()
    return LookupResponse(
        ok=True,
        gtin=normalized,
        found=False,
        from_cache=False,
        queued=True,
        source=None,
        product=None,
        error=LOOKUP_QUEUE_NOT_FOUND_REASON,
    )

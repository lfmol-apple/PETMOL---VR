"""Daily commerce quality optimizer for PETMOL.

This is the operational layer between "products pets actually use" and the
affiliate/marketplace catalogs. It is intentionally conservative:

- GTIN/barcode is treated as identity.
- Text/learning matches only produce suggestions, unless a caller explicitly
  decides to route them through a tutor/admin confirmation flow.
- Catalog enrichment uses already-synced local feeds first, so the daily job
  can improve images/names without spending external API calls.
"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any, Iterable, Optional

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import MarketplaceOffer
from .user_auth.models import User  # noqa: F401 - registers Pet.user relationship for standalone scripts
from .health.models import FeedingPlan
from .product_catalog_lookup import (
    ProductCatalog,
    ProductLearningEvent,
    ProductReliableCatalog,
    lookup_product_by_gtin,
    normalize_gtin,
)
from .pets.document_models import PetDocument, PetDocumentImport  # noqa: F401 - registers Pet.documents relationship
from .pets.grooming_models import GroomingRecord  # noqa: F401 - registers Pet.grooming_records relationship
from .pets.parasite_models import ParasiteControlRecord
from .pets.vaccine_models import VaccineRecord  # noqa: F401 - registers Pet.vaccine_records relationship
from .events.models import Event
from .shopee_offer_matcher import extract_weight_kg, score_candidate
from .shopee_offer_sync import ShopeeSyncResult, sync_shopee_offer_for_gtin


_BARCODE_RE = re.compile(r"C[oó]digo de barras:\s*([0-9]{8,14})", re.IGNORECASE)
_COMMERCE_EVENT_TYPES = {"medication", "medicacao"}
_BUYABLE_PARASITE_TYPES = {"dewormer", "flea_tick", "heartworm", "collar", "leishmaniasis"}
_MIN_LEARNING_CONFIRMATIONS = 2
_MIN_TEXT_SUGGESTION_SCORE = 0.86


@dataclass
class CommerceQualityItem:
    source: str
    record_id: str
    pet_id: str
    label: str
    category: str
    query: str
    gtin: Optional[str] = None
    package_size_kg: Optional[float] = None
    priority: int = 0


@dataclass
class CommerceQualityStatus:
    gtin: Optional[str]
    has_barcode: bool
    has_catalog_product: bool = False
    has_image: bool = False
    offer_count: int = 0
    merchants: list[str] = field(default_factory=list)
    min_price: Optional[float] = None
    shopee_offer_count: int = 0
    awin_offer_count: int = 0
    missing: list[str] = field(default_factory=list)


@dataclass
class CommerceQualitySuggestion:
    gtin: str
    source: str
    name: str
    brand: Optional[str]
    score: float
    merchant: Optional[str] = None
    price: Optional[float] = None
    image_url: Optional[str] = None


@dataclass
class CommerceQualityItemResult:
    item: CommerceQualityItem
    before: CommerceQualityStatus
    after: CommerceQualityStatus
    suggestions: list[CommerceQualitySuggestion] = field(default_factory=list)
    actions: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)


@dataclass
class CommerceQualityRunResult:
    started_at: str
    finished_at: str
    dry_run: bool
    processed: int
    with_barcode: int
    without_barcode: int
    missing_image: int
    missing_offer: int
    enriched_from_feed: int
    gtin_autofill_candidates: int
    gtin_autofilled: int
    shopee_synced: int
    shopee_refreshed: int
    suggestions: int
    items: list[CommerceQualityItemResult]

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["items"] = [
            {
                **asdict(item_result),
                "item": asdict(item_result.item),
                "before": asdict(item_result.before),
                "after": asdict(item_result.after),
                "suggestions": [asdict(s) for s in item_result.suggestions],
            }
            for item_result in self.items
        ]
        return data


def extract_barcode_from_notes(notes: Optional[str]) -> Optional[str]:
    match = _BARCODE_RE.search(notes or "")
    return normalize_gtin(match.group(1)) if match else None


def collect_pet_commerce_items(db: Session) -> list[CommerceQualityItem]:
    items: list[CommerceQualityItem] = []
    items.extend(_collect_feeding_items(db))
    items.extend(_collect_parasite_items(db))
    items.extend(_collect_medication_items(db))
    return sorted(items, key=lambda item: (-item.priority, item.source, item.label.lower()))


def _collect_feeding_items(db: Session) -> Iterable[CommerceQualityItem]:
    plans = db.scalars(
        select(FeedingPlan).where(
            FeedingPlan.deleted_at.is_(None),
            FeedingPlan.enabled.is_(True),
        )
    ).all()
    for plan in plans:
        for raw_item in _parse_feeding_items(plan):
            label = _safe_text(raw_item.get("label") or raw_item.get("food_brand") or plan.food_brand) or "Compra de ração"
            gtin = normalize_gtin(raw_item.get("barcode") or "")
            package_size_kg = _safe_float(raw_item.get("package_size_kg") or plan.package_size_kg)
            query = label if "ração" in label.lower() or "racao" in label.lower() else f"{label} ração"
            yield CommerceQualityItem(
                source="feeding",
                record_id=str(raw_item.get("id") or plan.id),
                pet_id=plan.pet_id,
                label=label,
                category="food",
                query=query,
                gtin=gtin or None,
                package_size_kg=package_size_kg,
                priority=100 if gtin else 70,
            )


def _parse_feeding_items(plan: FeedingPlan) -> list[dict[str, Any]]:
    if plan.items_json:
        try:
            parsed = json.loads(plan.items_json)
            if isinstance(parsed, list) and parsed:
                return [item for item in parsed if isinstance(item, dict)]
        except Exception:
            pass
    return [{
        "id": plan.id,
        "label": plan.food_brand or "Compra de ração",
        "food_brand": plan.food_brand,
        "package_size_kg": plan.package_size_kg,
        "barcode": None,
        "is_primary": True,
    }]


def _collect_parasite_items(db: Session) -> Iterable[CommerceQualityItem]:
    rows = db.scalars(
        select(ParasiteControlRecord).where(
            ParasiteControlRecord.deleted.is_(False),
            ParasiteControlRecord.type.in_(_BUYABLE_PARASITE_TYPES),
        )
    ).all()
    for row in rows:
        gtin = normalize_gtin(row.barcode or "")
        label = row.product_name.strip()
        category = "collar" if row.type == "collar" else "antiparasite"
        yield CommerceQualityItem(
            source="parasite",
            record_id=row.id,
            pet_id=row.pet_id,
            label=label,
            category=category,
            query=label,
            gtin=gtin or None,
            priority=90 if gtin else 55,
        )


def _collect_medication_items(db: Session) -> Iterable[CommerceQualityItem]:
    rows = db.scalars(
        select(Event).where(
            Event.deleted_at.is_(None),
            Event.type.in_(_COMMERCE_EVENT_TYPES),
        )
    ).all()
    for row in rows:
        extra = _json_object(row.extra_data)
        gtin = extract_barcode_from_notes(row.notes)
        if extra.get("commerce_excluded") is True and not gtin:
            continue
        label = (row.title or row.item_name_canonical or row.item_name_raw or "Medicação").strip()
        yield CommerceQualityItem(
            source="medication",
            record_id=row.id,
            pet_id=row.pet_id,
            label=label,
            category="medication",
            query=label,
            gtin=gtin,
            priority=80 if gtin else 40,
        )


def compute_status(db: Session, item: CommerceQualityItem) -> CommerceQualityStatus:
    gtin = normalize_gtin(item.gtin or "")
    status = CommerceQualityStatus(gtin=gtin or None, has_barcode=bool(gtin))
    if not gtin:
        status.missing.append("barcode")
        status.missing.append("exact_offer")
        status.missing.append("image")
        return status

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin))
    status.has_catalog_product = product is not None and bool(product.name)
    status.has_image = bool(product and product.thumbnail_url)

    awin_rows = db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.gtin == gtin,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.price.isnot(None),
            AffiliateFeedOffer.affiliate_url.isnot(None),
        )
    ).all()
    marketplace_rows: list[MarketplaceOffer] = []
    if product is not None:
        marketplace_rows = db.scalars(
            select(MarketplaceOffer).where(
                MarketplaceOffer.product_id == product.id,
                MarketplaceOffer.active.is_(True),
                MarketplaceOffer.is_available.is_(True),
                MarketplaceOffer.price.isnot(None),
                MarketplaceOffer.affiliate_url.isnot(None),
            )
        ).all()

    if not status.has_image:
        feed_image = next((row.image_url for row in awin_rows if row.image_url), None)
        status.has_image = bool(feed_image)

    merchants = {row.merchant for row in awin_rows}
    merchants.update(row.merchant for row in marketplace_rows)
    prices = [row.price for row in awin_rows if row.price is not None]
    prices.extend(row.price for row in marketplace_rows if row.price is not None)
    status.awin_offer_count = len(awin_rows)
    status.shopee_offer_count = sum(1 for row in marketplace_rows if row.merchant == "shopee")
    status.offer_count = len(awin_rows) + len(marketplace_rows)
    status.merchants = sorted(merchants)
    status.min_price = min(prices) if prices else None

    if not status.has_catalog_product:
        status.missing.append("catalog_product")
    if not status.has_image:
        status.missing.append("image")
    if status.offer_count == 0:
        status.missing.append("offer")
    return status


def enrich_catalog_from_affiliate_feed(db: Session, item: CommerceQualityItem, *, dry_run: bool) -> bool:
    """Enriquece a identidade canônica do SKU a partir dos feeds Awin, via
    o pipeline determinístico e auditável (catalog_enrichment). Funde todas
    as linhas de feed do GTIN, com política de proveniência — nunca rebaixa
    dado bom, nunca chuta discriminador que os feeds discordam."""
    gtin = normalize_gtin(item.gtin or "")
    if not gtin:
        return False
    from .catalog_enrichment import merge_product_catalog_identity

    result = merge_product_catalog_identity(db, gtin, dry_run=dry_run)
    if result.skipped_reason:
        return False
    if not dry_run:
        db.commit()
    return bool(result.created or result.updated_fields)


def suggest_gtins_for_item(db: Session, item: CommerceQualityItem, *, limit: int = 3) -> list[CommerceQualitySuggestion]:
    if item.gtin:
        return []
    suggestions: list[CommerceQualitySuggestion] = []
    suggestions.extend(_suggest_from_existing_sheet_items(db, item, limit=limit))
    suggestions.extend(_suggest_from_pet_learning_events(db, item, limit=limit))
    suggestions.extend(_suggest_from_reliable_catalog(db, item, limit=limit))
    suggestions.extend(_suggest_from_awin_feed(db, item, limit=limit))
    suggestions.sort(key=_suggestion_rank, reverse=True)
    deduped: list[CommerceQualitySuggestion] = []
    seen: set[str] = set()
    for suggestion in suggestions:
        if suggestion.gtin in seen:
            continue
        seen.add(suggestion.gtin)
        deduped.append(suggestion)
        if len(deduped) >= limit:
            break
    return deduped


def _suggest_from_existing_sheet_items(db: Session, item: CommerceQualityItem, *, limit: int) -> list[CommerceQualitySuggestion]:
    expected_weight = item.package_size_kg or extract_weight_kg(item.query)
    by_gtin: dict[str, CommerceQualitySuggestion] = {}
    for existing in collect_pet_commerce_items(db):
        gtin = normalize_gtin(existing.gtin or "")
        if not gtin:
            continue
        if existing.source == item.source and existing.record_id == item.record_id:
            continue
        score = _score_text_match(item.query, existing.label, None, expected_weight)
        if score < _MIN_TEXT_SUGGESTION_SCORE:
            continue
        same_pet = existing.pet_id == item.pet_id
        source = "pet_sheet" if same_pet else "sheet"
        # A code already saved for this same pet is stronger than a generic
        # cross-pet hint, but still competes by name similarity below.
        adjusted_score = min(1.0, score + (0.01 if same_pet else 0.0))
        suggestion = CommerceQualitySuggestion(
            gtin=gtin,
            source=source,
            name=existing.label,
            brand=None,
            score=round(adjusted_score, 3),
        )
        current = by_gtin.get(gtin)
        if current is None or _suggestion_rank(suggestion) > _suggestion_rank(current):
            by_gtin[gtin] = suggestion

    suggestions = list(by_gtin.values())
    suggestions.sort(key=_suggestion_rank, reverse=True)
    return suggestions[:limit]


def _suggest_from_pet_learning_events(db: Session, item: CommerceQualityItem, *, limit: int) -> list[CommerceQualitySuggestion]:
    if not item.pet_id:
        return []
    rows = db.scalars(
        select(ProductLearningEvent).where(
            ProductLearningEvent.pet_id == item.pet_id,
            ProductLearningEvent.barcode_normalized.isnot(None),
            ProductLearningEvent.tutor_confirmed.is_(True),
            ProductLearningEvent.tutor_corrected.is_(False),
        ).order_by(ProductLearningEvent.created_at.desc()).limit(80)
    ).all()
    if not rows:
        return []

    expected_weight = item.package_size_kg or extract_weight_kg(item.query)
    by_gtin: dict[str, CommerceQualitySuggestion] = {}
    for row in rows:
        gtin = normalize_gtin(row.barcode_normalized or "")
        if not gtin:
            continue
        names = [
            row.resolved_name,
            row.corrected_name,
            row.probable_name,
            row.ai_suggested_name,
            row.visible_text,
        ]
        score = max(
            (_score_text_match(item.query, name or "", row.detected_brand, expected_weight) for name in names if name),
            default=0.0,
        )
        if score < _MIN_TEXT_SUGGESTION_SCORE:
            continue
        suggestion = CommerceQualitySuggestion(
            gtin=gtin,
            source="pet_learning",
            name=row.resolved_name,
            brand=row.detected_brand,
            score=round(score, 3),
        )
        current = by_gtin.get(gtin)
        if current is None or suggestion.score > current.score:
            by_gtin[gtin] = suggestion

    suggestions = list(by_gtin.values())
    suggestions.sort(key=lambda suggestion: -suggestion.score)
    return suggestions[:limit]


def _suggestion_rank(suggestion: CommerceQualitySuggestion) -> tuple[float, int, float]:
    source_priority = {
        "pet_sheet": 4,
        "pet_learning": 3,
        "sheet": 2,
        "learning": 1,
        "awin_feed": 0,
    }.get(suggestion.source, 0)
    return suggestion.score, source_priority, -(suggestion.price or 0.0)


def _suggest_from_reliable_catalog(db: Session, item: CommerceQualityItem, *, limit: int) -> list[CommerceQualitySuggestion]:
    rows = db.scalars(
        select(ProductReliableCatalog).where(
            ProductReliableCatalog.confirmation_count >= _MIN_LEARNING_CONFIRMATIONS,
            ProductReliableCatalog.correction_count == 0,
        )
    ).all()
    suggestions: list[CommerceQualitySuggestion] = []
    expected_weight = item.package_size_kg or extract_weight_kg(item.query)
    for row in rows:
        gtins = _json_list(row.gtins_json)
        if not gtins:
            continue
        names = [row.canonical_name, *_json_list(row.aliases_json)]
        score = max((_score_text_match(item.query, name, row.brand, expected_weight) for name in names), default=0.0)
        if score < _MIN_TEXT_SUGGESTION_SCORE:
            continue
        suggestions.append(CommerceQualitySuggestion(
            gtin=gtins[0],
            source="learning",
            name=row.canonical_name,
            brand=row.brand,
            score=round(score, 3),
        ))
    suggestions.sort(key=lambda suggestion: -suggestion.score)
    return suggestions[:limit]


def _suggest_from_awin_feed(db: Session, item: CommerceQualityItem, *, limit: int) -> list[CommerceQualitySuggestion]:
    expected_weight = item.package_size_kg or extract_weight_kg(item.query)
    rows = _candidate_awin_rows_for_text(db, item.query)
    by_gtin: dict[str, CommerceQualitySuggestion] = {}
    for row in rows:
        gtin = normalize_gtin(row.gtin or "")
        if not gtin:
            continue
        score = _score_text_match(item.query, row.title or "", row.brand, expected_weight)
        if score < _MIN_TEXT_SUGGESTION_SCORE:
            continue
        current = by_gtin.get(gtin)
        suggestion = CommerceQualitySuggestion(
            gtin=gtin,
            source="awin_feed",
            name=row.title or "",
            brand=row.brand,
            score=round(score, 3),
            merchant=row.merchant,
            price=row.price,
            image_url=row.image_url,
        )
        if current is None or suggestion.score > current.score or (
            suggestion.score == current.score and (suggestion.price or float("inf")) < (current.price or float("inf"))
        ):
            by_gtin[gtin] = suggestion
    suggestions = list(by_gtin.values())
    suggestions.sort(key=lambda suggestion: (-suggestion.score, suggestion.price or float("inf")))
    return suggestions[:limit]


def _candidate_awin_rows_for_text(db: Session, query: str, *, limit: int = 300) -> list[AffiliateFeedOffer]:
    words = _significant_search_words(query)
    if not words:
        return []

    stmt = select(AffiliateFeedOffer).where(
        AffiliateFeedOffer.active.is_(True),
        AffiliateFeedOffer.in_stock.is_(True),
        AffiliateFeedOffer.gtin.isnot(None),
        AffiliateFeedOffer.title.isnot(None),
    )
    for word in words:
        like = f"%{word}%"
        stmt = stmt.where(
            or_(
                AffiliateFeedOffer.title.ilike(like),
                AffiliateFeedOffer.brand.ilike(like),
            )
        )
    stmt = stmt.order_by(AffiliateFeedOffer.price.is_(None), AffiliateFeedOffer.price.asc()).limit(limit)
    return list(db.scalars(stmt).all())


def _significant_search_words(query: str) -> list[str]:
    normalized = re.sub(r"[^A-Za-zÀ-ÿ0-9\s]", " ", query or "").lower()
    generic = {
        "de", "da", "do", "das", "dos", "para", "com", "pet", "produto",
        "racao", "ração", "alimento", "compra", "comprar", "cao", "cão",
        "caes", "cães", "gato", "gatos", "adulto", "adultos",
    }
    words: list[str] = []
    for word in normalized.split():
        if len(word) < 3 or word in generic:
            continue
        if word.isdigit():
            continue
        if word not in words:
            words.append(word)
        if len(words) >= 5:
            break
    return words


def optimize_commerce_quality(
    db: Session,
    *,
    limit: int = 200,
    dry_run: bool = True,
    enrich_from_feed: bool = True,
    sync_shopee: bool = False,
    refresh_existing_shopee: bool = False,
    resolve_gtin: bool = False,
    autofill_safe_gtin: bool = False,
) -> CommerceQualityRunResult:
    started = datetime.now(timezone.utc)
    results: list[CommerceQualityItemResult] = []
    enriched_count = 0
    autofill_candidate_count = 0
    autofilled_count = 0
    shopee_synced_count = 0
    shopee_refreshed_count = 0

    for item in collect_pet_commerce_items(db)[:limit]:
        before = compute_status(db, item)
        actions: list[str] = []
        errors: list[str] = []
        suggestions: list[CommerceQualitySuggestion] = []

        if before.has_barcode:
            if resolve_gtin and ("catalog_product" in before.missing or "image" in before.missing):
                try:
                    asyncio.run(lookup_product_by_gtin(db, before.gtin or "", context="commerce_quality_optimizer"))
                    actions.append("resolved_gtin")
                except Exception as exc:  # noqa: BLE001
                    db.rollback()
                    errors.append(f"resolve_gtin_failed:{exc}")

            if enrich_from_feed:
                try:
                    if enrich_catalog_from_affiliate_feed(db, item, dry_run=dry_run):
                        actions.append("enriched_catalog_from_awin_feed")
                        enriched_count += 1
                except Exception as exc:  # noqa: BLE001
                    db.rollback()
                    errors.append(f"feed_enrich_failed:{exc}")

            should_sync_shopee = sync_shopee and before.gtin and (
                before.shopee_offer_count == 0 or refresh_existing_shopee
            )
            if should_sync_shopee:
                try:
                    if dry_run:
                        actions.append("would_refresh_shopee" if before.shopee_offer_count else "would_sync_shopee")
                    else:
                        result = sync_shopee_offer_for_gtin(db, before.gtin)
                        if result.matched:
                            if before.shopee_offer_count:
                                shopee_refreshed_count += 1
                                actions.append("refreshed_shopee")
                            else:
                                shopee_synced_count += 1
                                actions.append("synced_shopee")
                        else:
                            actions.append(f"shopee_no_match:{result.reason or 'unknown'}")
                except Exception as exc:  # noqa: BLE001
                    db.rollback()
                    errors.append(f"shopee_sync_failed:{exc}")
        else:
            suggestions = suggest_gtins_for_item(db, item)
            if suggestions:
                actions.append("suggested_gtin_candidates")
                safe_gtin = choose_safe_autofill_gtin(item, suggestions)
                if safe_gtin:
                    autofill_candidate_count += 1
                    if dry_run or not autofill_safe_gtin:
                        actions.append("would_autofill_safe_gtin")
                    elif autofill_item_gtin(db, item, safe_gtin):
                        autofilled_count += 1
                        actions.append("autofilled_safe_gtin")

        after = compute_status(db, item)
        results.append(CommerceQualityItemResult(
            item=item,
            before=before,
            after=after,
            suggestions=suggestions,
            actions=actions,
            errors=errors,
        ))

    finished = datetime.now(timezone.utc)
    return CommerceQualityRunResult(
        started_at=started.isoformat(),
        finished_at=finished.isoformat(),
        dry_run=dry_run,
        processed=len(results),
        with_barcode=sum(1 for result in results if result.before.has_barcode),
        without_barcode=sum(1 for result in results if not result.before.has_barcode),
        missing_image=sum(1 for result in results if "image" in result.after.missing),
        missing_offer=sum(1 for result in results if "offer" in result.after.missing or "exact_offer" in result.after.missing),
        enriched_from_feed=enriched_count,
        gtin_autofill_candidates=autofill_candidate_count,
        gtin_autofilled=autofilled_count,
        shopee_synced=shopee_synced_count,
        shopee_refreshed=shopee_refreshed_count,
        suggestions=sum(len(result.suggestions) for result in results),
        items=results,
    )


def _feed_row_quality(row: AffiliateFeedOffer) -> tuple[int, int, int, int]:
    has_image = 1 if row.image_url else 0
    has_price = 1 if row.price is not None else 0
    merchant_priority = {"cobasi": 3, "zeenow": 2, "zeedog": 1}.get(row.merchant, 0)
    title_len = min(len(row.title or ""), 180)
    return has_image, has_price, merchant_priority, title_len


def _category_from_item(item: CommerceQualityItem) -> str:
    if item.category == "food":
        return "food"
    if item.category == "medication":
        return "medication"
    if item.category == "collar":
        return "collar"
    return "antiparasite"


def _score_text_match(query: str, candidate: str, brand: Optional[str], expected_weight_kg: Optional[float]) -> float:
    # Generic category words are useful for search, but should not punish a
    # strong learning/catalog match ("Royal Canin Mini Adult ração" vs
    # "Royal Canin Mini Adult"). Keep hard checks for brand/weight; only try
    # a cleaner label variant for token-overlap scoring.
    variants = [query]
    cleaned = re.sub(r"\b(ra[cç][aã]o|alimento|produto|pet)\b", " ", query, flags=re.IGNORECASE)
    if cleaned.strip() and cleaned.strip() != query.strip():
        variants.append(cleaned)

    scores: list[float] = []
    for variant in variants:
        score = score_candidate(
            variant,
            candidate,
            expected_brand=brand if brand and brand.lower() in variant.lower() else None,
            expected_weight_kg=expected_weight_kg,
        )
        scores.append(float(score or 0.0))
    return max(scores or [0.0])


def choose_safe_autofill_gtin(
    item: CommerceQualityItem,
    suggestions: list[CommerceQualitySuggestion],
) -> Optional[str]:
    """Choose a GTIN for automatic write only when ambiguity is low.

    Showing a suggestion and changing a pet's saved product are different
    risk levels. Auto-fill requires a useful label, near-perfect match and
    no close second candidate.
    """
    if item.gtin:
        return None
    if not suggestions:
        return None
    top = suggestions[0]
    if top.source == "pet_sheet" and top.score >= 0.98:
        same_pet_matches = [s for s in suggestions if s.source == "pet_sheet" and s.score >= 0.98]
        if len({s.gtin for s in same_pet_matches}) == 1:
            return top.gtin
    if len(_significant_search_words(item.query)) < 2:
        return None
    if top.score < 0.98:
        return None
    if len(suggestions) > 1 and suggestions[1].score >= 0.94:
        return None
    return top.gtin


def autofill_item_gtin(db: Session, item: CommerceQualityItem, gtin: str) -> bool:
    normalized = normalize_gtin(gtin)
    if not normalized:
        return False
    if item.source == "feeding":
        return _autofill_feeding_item_gtin(db, item, normalized)
    if item.source == "parasite":
        row = db.get(ParasiteControlRecord, item.record_id)
        if not row or row.barcode:
            return False
        row.barcode = normalized
        db.commit()
        return True
    if item.source == "medication":
        row = db.get(Event, item.record_id)
        if not row or extract_barcode_from_notes(row.notes):
            return False
        current_notes = (row.notes or "").strip()
        row.notes = "\n".join(part for part in [current_notes, f"Código de barras: {normalized}"] if part)
        db.commit()
        return True
    return False


def _autofill_feeding_item_gtin(db: Session, item: CommerceQualityItem, gtin: str) -> bool:
    plans = db.scalars(
        select(FeedingPlan).where(
            FeedingPlan.pet_id == item.pet_id,
            FeedingPlan.deleted_at.is_(None),
        )
    ).all()
    for plan in plans:
        raw_items = _parse_feeding_items(plan)
        changed = False
        for raw_item in raw_items:
            if str(raw_item.get("id") or "") != item.record_id:
                continue
            if str(raw_item.get("barcode") or "").strip():
                return False
            raw_item["barcode"] = gtin
            changed = True
        if changed:
            plan.items_json = json.dumps(raw_items, ensure_ascii=False)
            db.commit()
            return True
    return False


def _json_list(value: Optional[str]) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
        if isinstance(parsed, list):
            return [str(item).strip() for item in parsed if str(item).strip()]
    except Exception:
        return []
    return []


def _json_object(value: Optional[str]) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        return {}
    return {}


def _safe_text(value: Any) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _safe_float(value: Any) -> Optional[float]:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None

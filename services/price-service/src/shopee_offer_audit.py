"""Auditoria de identidade de ofertas Shopee já gravadas — TRI-STATE.

Reexecuta a busca oficial da Shopee para o produto e classifica cada
oferta ativa em:

  VALID       — evidência POSITIVA de que o listing salvo é este produto
                (Identity Engine: EXACT / HIGH_CONFIDENCE). Enriquece a
                linha (título, preço, links, decisão) e mantém servível.
  CONFLICT    — evidência POSITIVA de incompatibilidade de identidade
                (tamanho / linha veterinária / peso / volume / pack /
                life_stage / porte). Desativa e marca o GTIN pra reparo.
  UNRESOLVED  — não há evidência suficiente pra confirmar NEM rejeitar
                (listing não voltou na busca, título esperado incompleto,
                poucos candidatos, GTIN/título ausente...). NÃO desativa.
  ERROR       — falha operacional (API Shopee / timeout / rate limit).
                NÃO desativa. Retry futuro.

Regra de ouro: nunca provar conflito por AUSÊNCIA de evidência.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import logging
from typing import Callable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import MarketplaceOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .product_identity import (
    IdentityDecision,
    MerchantCandidate,
    ProductIdentity,
    evaluate_identity,
)
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import extract_volume_ml, extract_weight_kg
from .shopee_offer_sync import (
    _brand_for_matching,
    _build_keyword_variants,
    _parse_price,
    _best_feed_row,
)

logger = logging.getLogger(__name__)

DEFAULT_AUDIT_MERCHANTS = ("cobasi", "zeenow", "zeedog")

VALID = "valid"
CONFLICT = "conflict"
UNRESOLVED = "unresolved"
ERROR = "error"


@dataclass
class ShopeeOfferAuditItem:
    offer_id: int
    product_id: int
    gtin: str
    external_listing_id: Optional[str]
    expected_title: str
    expected_brand: Optional[str]
    expected_weight_kg: Optional[float]
    expected_volume_ml: Optional[float]
    decision: str
    reason: str
    candidate_count: int = 0
    matched_listing_id: Optional[str] = None
    matched_title: Optional[str] = None
    match_decision: Optional[str] = None
    match_confidence: Optional[float] = None
    conflict_reasons: list[str] = field(default_factory=list)
    would_deactivate: bool = False
    would_enrich: bool = False

    # Compat com callers antigos (CLI/telemetria) que liam listas.
    @property
    def matched_listing_ids(self) -> list[str]:
        return [self.matched_listing_id] if self.matched_listing_id else []

    @property
    def matched_titles(self) -> list[str]:
        return [self.matched_title] if self.matched_title else []


@dataclass
class ShopeeOfferAuditResult:
    total: int = 0
    valid: int = 0
    conflict: int = 0
    unresolved: int = 0
    errors: int = 0
    deactivated: int = 0
    enriched: int = 0
    resync_gtins: set[str] = field(default_factory=set)
    items: list[ShopeeOfferAuditItem] = field(default_factory=list)

    # Alias de compatibilidade: "invalid" era "não é o produto". Hoje isso é
    # exatamente CONFLICT (conflito comprovado). UNRESOLVED/ERROR NÃO contam.
    @property
    def invalid(self) -> int:
        return self.conflict


def audit_active_shopee_offers(
    db: Session,
    *,
    source_merchants: tuple[str, ...] = DEFAULT_AUDIT_MERCHANTS,
    deactivate_conflicts: bool = True,
    dry_run: bool = False,
    limit: int = 20,
    min_confidence: float = 0.5,
    max_rows: Optional[int] = None,
    only_gtins: Optional[set[str]] = None,
    progress_callback: Optional[Callable[[int, ShopeeOfferAuditResult], None]] = None,
    # compat: nome antigo do parâmetro
    deactivate_invalid: Optional[bool] = None,
) -> ShopeeOfferAuditResult:
    if deactivate_invalid is not None:
        deactivate_conflicts = deactivate_invalid

    query = (
        select(MarketplaceOffer, ProductCatalog)
        .join(ProductCatalog, ProductCatalog.id == MarketplaceOffer.product_id)
        .where(
            MarketplaceOffer.merchant == "shopee",
            MarketplaceOffer.active.is_(True),
        )
        .order_by(MarketplaceOffer.updated_at.asc(), MarketplaceOffer.id.asc())
    )
    if only_gtins:
        norm = {g for g in (normalize_gtin(x) for x in only_gtins) if g}
        query = query.where(ProductCatalog.barcode_normalized.in_(norm))
    rows = list(db.execute(query))
    if max_rows is not None:
        rows = rows[:max_rows]

    result = ShopeeOfferAuditResult(total=len(rows))
    now = datetime.now(timezone.utc)
    if progress_callback:
        progress_callback(0, result)

    for index, (offer, product) in enumerate(rows, start=1):
        item = _audit_one_offer(
            db, offer, product,
            source_merchants=source_merchants,
            limit=limit,
            min_confidence=min_confidence,
            now=now,
            dry_run=dry_run,
        )
        result.items.append(item)

        if item.decision == VALID:
            result.valid += 1
            if item.would_enrich:
                result.enriched += 1
        elif item.decision == CONFLICT:
            result.conflict += 1
            item.would_deactivate = deactivate_conflicts
            if item.gtin:
                result.resync_gtins.add(item.gtin)
            if deactivate_conflicts and not dry_run:
                offer.active = False
                offer.is_available = False
                offer.last_checked_at = now
                if not offer.match_decision or offer.match_decision.upper() != "CONFLICT":
                    offer.match_decision = "CONFLICT"
                    offer.match_reasons_json = json.dumps(item.conflict_reasons[:8])
                result.deactivated += 1
        elif item.decision == UNRESOLVED:
            result.unresolved += 1
        else:
            result.errors += 1

        if progress_callback:
            progress_callback(index, result)

    if dry_run:
        db.rollback()
    else:
        db.commit()
        # Conflito comprovado → o GTIN volta a ser elegível pra discovery
        # (limpa o cooldown de "miss" antigo). O sync é quem tenta achar a
        # oferta certa; a auditoria só abre a porta.
        if result.resync_gtins and deactivate_conflicts:
            _mark_for_resync(db, result.resync_gtins)

    logger.info(
        "[shopee_offer_audit] total=%s valid=%s conflict=%s unresolved=%s error=%s "
        "deactivated=%s enriched=%s resync=%s dry_run=%s",
        result.total, result.valid, result.conflict, result.unresolved, result.errors,
        result.deactivated, result.enriched, len(result.resync_gtins), dry_run,
    )
    for item in result.items[:25]:
        logger.info(
            "[shopee_offer_audit] %s reason=%s gtin=%s offer=%s listing=%s "
            "match=%s conf=%s conflict_reasons=%s expected=%r",
            item.decision, item.reason, item.gtin, item.offer_id, item.external_listing_id,
            item.match_decision, item.match_confidence, item.conflict_reasons, item.expected_title,
        )
    return result


def _mark_for_resync(db: Session, gtins: set[str]) -> None:
    try:
        from .shopee_discovery_attempt import ShopeeDiscoveryAttempt

        norm = {g for g in (normalize_gtin(x) for x in gtins) if g}
        if not norm:
            return
        db.query(ShopeeDiscoveryAttempt).filter(
            ShopeeDiscoveryAttempt.gtin.in_(norm)
        ).delete(synchronize_session=False)
        db.commit()
    except Exception as exc:  # noqa: BLE001 — best-effort
        db.rollback()
        logger.warning("[shopee_offer_audit] _mark_for_resync falhou: %s", exc)


def _audit_one_offer(
    db: Session,
    offer: MarketplaceOffer,
    product: ProductCatalog,
    *,
    source_merchants: tuple[str, ...],
    limit: int,
    min_confidence: float,
    now: datetime,
    dry_run: bool,
) -> ShopeeOfferAuditItem:
    gtin = normalize_gtin(product.barcode_normalized or product.barcode or "")
    expected_title, expected_brand = _expected_identity(db, product, gtin, source_merchants)
    expected_weight_kg = extract_weight_kg(expected_title)
    expected_volume_ml = extract_volume_ml(expected_title)

    base = ShopeeOfferAuditItem(
        offer_id=offer.id,
        product_id=product.id,
        gtin=gtin or "",
        external_listing_id=offer.external_listing_id,
        expected_title=expected_title,
        expected_brand=expected_brand,
        expected_weight_kg=expected_weight_kg,
        expected_volume_ml=expected_volume_ml,
        decision=UNRESOLVED,
        reason="not_evaluated",
    )

    # Falta de dado NÃO é conflito — é impossibilidade de avaliar.
    if not gtin or not expected_title or not offer.external_listing_id:
        base.decision = UNRESOLVED
        base.reason = "missing_gtin_expected_title_or_listing_id"
        return base

    nodes_by_id: dict[str, dict] = {}
    keyword_product = ProductCatalog(name=expected_title, brand=expected_brand)
    try:
        for keyword in _build_keyword_variants(keyword_product, expected_weight_kg):
            for node in search_product_offers(keyword, limit=limit):
                listing_id = str(node.get("itemId")) if node.get("itemId") is not None else ""
                if listing_id:
                    nodes_by_id.setdefault(listing_id, node)
    except ShopeeAffiliateError as exc:
        base.decision = ERROR
        base.reason = f"shopee_api_error:{str(exc)[:120]}"
        return base

    base.candidate_count = len(nodes_by_id)
    saved_node = nodes_by_id.get(str(offer.external_listing_id))
    if saved_node is None:
        # O anúncio salvo não voltou nesta busca. Pode ter saído de
        # estoque, mudado de nome, ou a busca simplesmente não o alcançou.
        # NÃO é prova de que o produto está errado.
        base.decision = UNRESOLVED
        base.reason = "saved_listing_not_returned_in_search"
        return base

    # Evidência POSITIVA: roda o Identity Engine no PRÓPRIO anúncio salvo.
    match_brand = _brand_for_matching(expected_title, expected_brand)
    expected_identity = ProductIdentity.build(
        gtin=gtin,
        canonical_name=expected_title,
        brand=match_brand,
    )
    candidate = MerchantCandidate.build(
        merchant="shopee",
        title=saved_node.get("productName") or "",
        price=_parse_price(saved_node.get("price")),
        external_id=str(offer.external_listing_id),
    )
    match = evaluate_identity(expected_identity, candidate, min_confidence=min_confidence)
    base.matched_listing_id = str(offer.external_listing_id)
    base.matched_title = (saved_node.get("productName") or "")[:180]
    base.match_decision = match.decision.value
    base.match_confidence = match.confidence

    if match.decision == IdentityDecision.CONFLICT:
        base.decision = CONFLICT
        base.conflict_reasons = list(match.reasons)
        base.reason = "identity_conflict:" + ",".join(list(match.reasons)[:3])
        return base

    if match.accepted:
        offer_link = saved_node.get("offerLink") or ""
        try:
            validate_shopee_affiliate_url(offer_link)
        except InvalidShopeeAffiliateUrlError:
            base.decision = UNRESOLVED
            base.reason = "identity_ok_but_invalid_affiliate_url"
            return base
        base.decision = VALID
        base.reason = "identity_confirmed"
        base.would_enrich = True
        if not dry_run:
            offer.affiliate_url = offer_link
            offer.direct_url = saved_node.get("productLink")
            offer.seller_name = saved_node.get("shopName")
            offer.merchant_title = saved_node.get("productName")
            offer.price = _parse_price(saved_node.get("price"))
            offer.is_available = True
            offer.match_decision = match.decision.value
            offer.match_confidence = match.confidence
            offer.match_reasons_json = json.dumps(list(match.reasons)[:12])
            offer.verified_at = now
            offer.last_checked_at = now
            offer.price_refresh_status = "refreshed"
        return base

    # Aceitou nem conflitou: NO_MATCH / confiança abaixo do corte, mas SEM
    # conflito estrutural. Não sabemos — não desativa, não valida.
    base.decision = UNRESOLVED
    base.reason = f"insufficient_identity_evidence:{match.decision.value}"
    return base


def _expected_identity(
    db: Session,
    product: ProductCatalog,
    gtin: str,
    source_merchants: tuple[str, ...],
) -> tuple[str, Optional[str]]:
    # Identidade enriquecida do catálogo mestre (#156) já traz o feed Awin
    # mesclado + discriminador de variante — é a referência mais forte.
    if getattr(product, "identity_enriched_at", None) is not None and product.canonical_name:
        return product.canonical_name, (product.canonical_brand or product.brand)
    feed_rows = list(db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.merchant.in_(source_merchants),
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.gtin == gtin,
            AffiliateFeedOffer.title.isnot(None),
        )
    ))
    if feed_rows:
        _gtin, title, brand = _best_feed_row(feed_rows)
        return title or product.canonical_name or product.name or "", brand or product.canonical_brand or product.brand
    return product.canonical_name or product.name or "", product.canonical_brand or product.brand

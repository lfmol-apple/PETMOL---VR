"""
Sincroniza MarketplaceOffer (merchant="shopee") a partir de busca por
palavra-chave na Shopee Affiliate API, produto a produto — nunca em massa
pro catálogo inteiro sozinho (busca por palavra-chave tem custo de rede E
risco de casamento errado por produto, diferente do feed em lote da
Awin/Cobasi, que casa por GTIN exato). Chamador decide a lista de GTINs
(ex: os produtos mais recomprados, ou uma lista passada manualmente).

Roda em lote (scripts/sync_shopee_offers.py), nunca no caminho de
requisição do tutor — MarketplaceOfferProvider (marketplace_offer_provider.py)
só lê o resultado já sincronizado.

Só grava (upsert) quando shopee_offer_matcher acha um candidato confiável
pro peso/marca esperados — nunca publica "o menos pior" resultado de
busca (ver shopee_offer_matcher.py pro porquê disso ser obrigatório).
Nunca desativa uma oferta existente só por não achar candidato confiável
nesta execução — uma falha transitória de busca não deve apagar uma oferta
boa; desativar continua sendo ação manual via admin
(admin/marketplace_offers_router.py).
"""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import _parse_price, extract_volume_ml, extract_weight_kg, score_candidate

logger = logging.getLogger(__name__)

_KEYWORD_STOPWORDS = frozenset({
    "a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "em", "com", "para",
    "racao", "ração", "alimento", "veterinary", "diet",
})


@dataclass
class ShopeeSyncResult:
    gtin: str
    matched: bool
    reason: str = ""
    offer_id: Optional[int] = None
    offer_ids: Optional[list[int]] = None


def _format_weight_kg(value: float) -> str:
    formatted = f"{value:g}".replace(".", ",")
    return f"{formatted}kg"


def _normalize_token(value: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "", text.lower())


def _build_keyword(product: ProductCatalog, expected_weight_kg: Optional[float] = None) -> str:
    """Monta uma busca curta para a Shopee.

    A API productOfferV2 é sensível a queries longas: o nome canônico da
    Cobasi para Royal Canin Urinary Small Dog, por exemplo, retornava zero
    candidatos apesar de haver anúncios corretos. Mantém marca + termos
    distintivos + peso conhecido, removendo descrição clínica/legal longa.
    """
    brand = (product.brand or "").strip()
    name = (product.name or "").strip()
    brand_tokens = {_normalize_token(t) for t in brand.split()}

    tokens: list[str] = []
    seen_tokens: set[str] = set()
    for raw in re.findall(r"[\wÀ-ÿ]+(?:[.,]\d+)?(?:kg|g|ml|l)?|s/o", name, flags=re.IGNORECASE):
        normalized = _normalize_token(raw)
        if not normalized or normalized in brand_tokens or normalized in _KEYWORD_STOPWORDS:
            continue
        if normalized in seen_tokens:
            continue
        seen_tokens.add(normalized)
        tokens.append(raw)
        if len(tokens) >= 7:
            break

    if expected_weight_kg is not None and extract_weight_kg(" ".join(tokens)) is None:
        tokens.append(_format_weight_kg(expected_weight_kg))

    parts = [brand] if brand else []
    parts.extend(tokens)
    return " ".join(part for part in parts if part).strip() or " ".join(p for p in (brand, name) if p).strip()


def _build_keyword_variants(product: ProductCatalog, expected_weight_kg: Optional[float] = None) -> list[str]:
    primary = _build_keyword(product, expected_weight_kg)
    brand = (product.brand or "").strip()
    name = (product.name or "").strip()
    weight = _format_weight_kg(expected_weight_kg) if expected_weight_kg is not None else None

    raw_variants = [
        primary,
        " ".join(part for part in (brand, "Urinary Small Dog", weight) if part),
        " ".join(part for part in (brand, "Veterinary Canine Urinary S/O Small", weight) if part),
        " ".join(part for part in (brand, name) if part),
    ]
    variants: list[str] = []
    seen: set[str] = set()
    for variant in raw_variants:
        normalized = " ".join(variant.split())
        key = _normalize_token(normalized)
        if not normalized or key in seen:
            continue
        seen.add(key)
        variants.append(normalized)
    return variants


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


def _confident_matches(
    nodes: list[dict],
    expected_name: str,
    *,
    expected_brand: Optional[str],
    expected_weight_kg: Optional[float],
    expected_volume_ml: Optional[float],
    min_confidence: float,
) -> list[dict]:
    scored: list[tuple[float, float, dict]] = []
    seen_listing_ids: set[str] = set()
    for node in nodes:
        listing_id = str(node.get("itemId")) if node.get("itemId") is not None else ""
        if listing_id and listing_id in seen_listing_ids:
            continue
        if listing_id:
            seen_listing_ids.add(listing_id)
        score = score_candidate(
            expected_name,
            node.get("productName") or "",
            expected_brand=expected_brand,
            expected_weight_kg=expected_weight_kg,
            expected_volume_ml=expected_volume_ml,
        )
        if score is None or score < min_confidence:
            continue
        price = _parse_price(node.get("price"))
        if price is None:
            continue
        scored.append((score, price, node))

    median_price = _median([price for _score, price, _node in scored])
    if median_price is not None:
        # Preço baixo demais em marketplace costuma ser variação errada,
        # anúncio inconsistente ou isca. Mantém somente se o título também
        # for muito forte; caso contrário não entra na disputa de menor preço.
        scored = [
            item for item in scored
            if item[1] >= median_price * 0.60 or item[0] >= 0.95
        ]

    scored.sort(key=lambda item: (item[1], -item[0]))
    return [node for _score, _price, node in scored]


def sync_shopee_offer_for_gtin(
    db: Session,
    gtin: str,
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
    expected_weight_kg: Optional[float] = None,
) -> ShopeeSyncResult:
    """Busca, casa e faz upsert de UMA oferta Shopee pro produto do GTIN
    dado. Idempotente: reexecutar atualiza a mesma linha (chave:
    product_id + merchant + external_listing_id), nunca duplica."""
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized:
        return ShopeeSyncResult(gtin=gtin, matched=False, reason="GTIN inválido")

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="produto não encontrado em products_catalog")
    if not product.name:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="produto sem nome cadastrado — não dá pra buscar/casar")

    expected_weight_kg = expected_weight_kg if expected_weight_kg is not None else extract_weight_kg(product.name)
    keywords = _build_keyword_variants(product, expected_weight_kg)
    nodes_by_id: dict[str, dict] = {}
    try:
        for keyword in keywords:
            for node in search_product_offers(keyword, limit=limit):
                key = str(node.get("itemId")) if node.get("itemId") is not None else f"{node.get('productName')}:{node.get('price')}"
                nodes_by_id.setdefault(key, node)
    except ShopeeAffiliateError as exc:
        logger.warning("shopee sync: erro na busca para gtin=%s: %s", gtin_normalized, exc)
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason=f"erro na API Shopee: {exc}")

    expected_volume_ml = extract_volume_ml(product.name)
    expected_name = product.name
    if expected_weight_kg is not None and extract_weight_kg(expected_name) is None:
        expected_name = f"{expected_name} {_format_weight_kg(expected_weight_kg)}"
    matches = _confident_matches(
        list(nodes_by_id.values()),
        expected_name,
        expected_brand=product.brand,
        expected_volume_ml=expected_volume_ml,
        expected_weight_kg=expected_weight_kg,
        min_confidence=min_confidence,
    )
    if not matches:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="nenhum candidato confiável na busca")

    now = datetime.now(timezone.utc)
    offer_ids: list[int] = []
    invalid_links = 0

    for match in matches:
        offer_link = match.get("offerLink") or ""
        try:
            validate_shopee_affiliate_url(offer_link)
        except InvalidShopeeAffiliateUrlError as exc:
            invalid_links += 1
            logger.warning("shopee sync: offerLink inválido para gtin=%s: %s", gtin_normalized, exc)
            continue

        price = _parse_price(match.get("price"))
        external_listing_id = str(match.get("itemId")) if match.get("itemId") is not None else None

        existing = db.scalar(
            select(MarketplaceOffer).where(
                MarketplaceOffer.product_id == product.id,
                MarketplaceOffer.merchant == "shopee",
                MarketplaceOffer.external_listing_id == external_listing_id,
            )
        )
        if existing:
            existing.affiliate_url = offer_link
            existing.direct_url = match.get("productLink")
            existing.seller_name = match.get("shopName")
            existing.price = price
            existing.is_available = True
            existing.active = True
            existing.verified_at = now
            existing.last_checked_at = now
            offer = existing
        else:
            offer = MarketplaceOffer(
                product_id=product.id,
                merchant="shopee",
                external_listing_id=external_listing_id,
                seller_name=match.get("shopName"),
                affiliate_url=offer_link,
                direct_url=match.get("productLink"),
                price=price,
                is_available=True,
                active=True,
                verified_at=now,
                last_checked_at=now,
            )
            db.add(offer)
        db.flush()
        offer_ids.append(offer.id)

    db.commit()
    if not offer_ids:
        reason = "offerLink inválido" if invalid_links else "nenhum candidato confiável na busca"
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason=reason)
    return ShopeeSyncResult(gtin=gtin_normalized, matched=True, offer_id=offer_ids[0], offer_ids=offer_ids)


def _ensure_catalog_entry(db: Session, gtin: str, name: str, brand: Optional[str]) -> Optional[ProductCatalog]:
    """Get-or-create um products_catalog a partir de um GTIN+nome+marca já
    conhecidos de uma fonte real (ex: feed Awin/Cobasi — nunca inventado
    aqui, só passado adiante). Nunca sobrescreve nome/marca de uma linha
    já existente, não importa a origem dela (scan de tutor, outro feed,
    etc.) — só cria quando realmente não existe nada pro GTIN."""
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized or not name:
        return None
    existing = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if existing:
        return existing
    product = ProductCatalog(
        barcode=gtin_normalized,
        barcode_normalized=gtin_normalized,
        name=name,
        brand=brand,
        source_primary="awin_feed",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def sync_shopee_offer_from_feed_row(
    db: Session,
    gtin: str,
    name: str,
    brand: Optional[str],
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
    expected_weight_kg: Optional[float] = None,
) -> ShopeeSyncResult:
    """Igual sync_shopee_offer_for_gtin, mas garante antes que existe uma
    linha em products_catalog pro GTIN — usado pro catálogo Awin/Cobasi
    (milhares de produtos reais, muitos nunca escaneados por nenhum
    tutor, então sem entrada prévia em products_catalog)."""
    product = _ensure_catalog_entry(db, gtin, name, brand)
    if product is None:
        return ShopeeSyncResult(gtin=gtin, matched=False, reason="GTIN ou nome inválido pra criar entrada de catálogo")
    return sync_shopee_offer_for_gtin(
        db,
        product.barcode_normalized,
        limit=limit,
        min_confidence=min_confidence,
        expected_weight_kg=expected_weight_kg,
    )


_DEFAULT_AWIN_SHOPEE_SOURCE_MERCHANTS = ("cobasi", "zeenow", "zeedog")


def _has_active_shopee_offer_for_gtin(db: Session, gtin: str) -> bool:
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized:
        return False
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        return False
    offer = db.scalar(
        select(MarketplaceOffer.id)
        .where(
            MarketplaceOffer.product_id == product.id,
            MarketplaceOffer.merchant == "shopee",
            MarketplaceOffer.active.is_(True),
            MarketplaceOffer.is_available.is_(True),
            MarketplaceOffer.affiliate_url.isnot(None),
        )
        .limit(1)
    )
    return offer is not None


def _feed_row_quality(title: str, brand: Optional[str], merchant: str) -> tuple[int, int, int, int]:
    merchant_priority = {"cobasi": 3, "zeenow": 2, "zeedog": 1}.get(merchant, 0)
    has_measure = 1 if extract_weight_kg(title) is not None or extract_volume_ml(title) is not None else 0
    has_brand = 1 if brand and _normalize_token(brand) in _normalize_token(title) else 0
    length_score = min(len(title.strip()), 160)
    return has_measure, has_brand, merchant_priority, length_score


def _best_feed_row(rows) -> tuple[str, str, Optional[str]]:
    best = max(rows, key=lambda row: _feed_row_quality(row.title or "", row.brand, row.merchant))
    return best.gtin, best.title, best.brand


def iter_awin_feed_products(
    db: Session,
    merchant: str = "cobasi",
    *,
    skip_existing_shopee: bool = False,
) -> list[tuple[str, str, Optional[str]]]:
    """(gtin, title, brand) de todo produto ativo e com GTIN do feed Awin
    pro merchant dado — fonte alternativa de GTINs pro sync em massa
    (ver admin/shopee_sync_router.py, source="awin_feed"), muito mais
    ampla e limpa que products_catalog sozinho (que só tem o que algum
    tutor já escaneou)."""
    from .affiliate_feed import AffiliateFeedOffer

    rows = db.query(AffiliateFeedOffer.gtin, AffiliateFeedOffer.title, AffiliateFeedOffer.brand).filter(
        AffiliateFeedOffer.merchant == merchant,
        AffiliateFeedOffer.active.is_(True),
        AffiliateFeedOffer.in_stock.is_(True),
        AffiliateFeedOffer.gtin.isnot(None),
        AffiliateFeedOffer.title.isnot(None),
    ).all()
    items = [(r[0], r[1], r[2]) for r in rows]
    if skip_existing_shopee:
        items = [item for item in items if not _has_active_shopee_offer_for_gtin(db, item[0])]
    return items


def iter_unified_awin_feed_products(
    db: Session,
    merchants: tuple[str, ...] = _DEFAULT_AWIN_SHOPEE_SOURCE_MERCHANTS,
    *,
    skip_existing_shopee: bool = True,
) -> list[tuple[str, str, Optional[str]]]:
    """Catálogo Awin unificado para ampliar o sync da Shopee.

    Agrupa Cobasi/Zee Now/Zee Dog por GTIN, escolhe uma referência textual
    mais forte para a busca e, por padrão, pula GTINs que já possuem oferta
    Shopee ativa. Isso torna o job incremental e aproveita o trabalho já
    feito em MarketplaceOffer.
    """
    from .affiliate_feed import AffiliateFeedOffer

    rows = db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.merchant.in_(merchants),
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.gtin.isnot(None),
            AffiliateFeedOffer.title.isnot(None),
        )
    ).all()

    grouped: dict[str, list[AffiliateFeedOffer]] = {}
    for row in rows:
        gtin = normalize_gtin(row.gtin)
        if not gtin:
            continue
        if skip_existing_shopee and _has_active_shopee_offer_for_gtin(db, gtin):
            continue
        grouped.setdefault(gtin, []).append(row)

    return [_best_feed_row(group) for _gtin, group in sorted(grouped.items())]


def sync_shopee_offers_for_gtins(
    db: Session,
    gtins: list[str],
    *,
    limit: int = 10,
    min_confidence: float = 0.5,
    delay_seconds: float = 0.4,
    expected_weight_kg: Optional[float] = None,
) -> list[ShopeeSyncResult]:
    """Roda sync_shopee_offer_for_gtin em sequência, com uma pausa entre
    chamadas (delay_seconds) — nunca validamos o comportamento da API sob
    alto volume, então isto é uma medida de prudência, não uma exigência
    documentada da Shopee. Sem pausa na última chamada (não faz sentido
    esperar depois do último GTIN)."""
    results = []
    for index, gtin in enumerate(gtins):
        results.append(
            sync_shopee_offer_for_gtin(
                db,
                gtin,
                limit=limit,
                min_confidence=min_confidence,
                expected_weight_kg=expected_weight_kg,
            )
        )
        if delay_seconds > 0 and index < len(gtins) - 1:
            time.sleep(delay_seconds)
    return results

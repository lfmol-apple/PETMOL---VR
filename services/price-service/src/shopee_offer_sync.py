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

Só grava (upsert) quando shopee_offer_matcher acha candidatos confiáveis
pro peso/marca esperados — nunca publica "o menos pior" resultado de
busca (ver shopee_offer_matcher.py pro porquê disso ser obrigatório).
Quando a execução encontra uma lista confiável, desativa ofertas Shopee
ativas do mesmo produto que não reapareceram nessa lista. Se a busca não
acha nenhum candidato confiável, não apaga nada: uma falha transitória de
busca não deve derrubar uma oferta boa.
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
from .product_identity import (
    AttributeStatus,
    IdentityDecision,
    IdentityMatchResult,
    MerchantCandidate,
    ProductIdentity,
    evaluate_identity,
)
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_affiliate_client import ShopeeAffiliateError, search_product_offers
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import (
    _parse_price,
    extract_length_cm,
    extract_volume_ml,
    extract_weight_kg,
)

logger = logging.getLogger(__name__)

_KEYWORD_STOPWORDS = frozenset({
    "a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "em", "com", "para",
    "racao", "ração", "alimento", "veterinary", "diet",
})

_COMMERCIAL_BRANDS = (
    "NexGard", "NexGard Spectra", "Frontline", "Seresto", "Scalibor",
    "Bravecto", "Simparic", "Drontal", "Advocate", "Revolution",
    "Royal Canin", "Premier", "Golden", "GranPlus", "Special Dog",
    "Pedigree", "Whiskas", "Soma", "Vermivet",
)


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


def _prepare_shopee_keyword(value: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", value or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    return " ".join(text.split())


def _build_keyword_variants(product: ProductCatalog, expected_weight_kg: Optional[float] = None) -> list[str]:
    primary = _build_keyword(product, expected_weight_kg)
    brand = (product.brand or "").strip()
    name = (product.name or "").strip()
    weight = _format_weight_kg(expected_weight_kg) if expected_weight_kg is not None else None
    name_tokens = [
        raw for raw in re.findall(r"[\wÀ-ÿ]+(?:[.,]\d+)?(?:kg|g|ml|l)?|s/o", name, flags=re.IGNORECASE)
        if _normalize_token(raw) and _normalize_token(raw) not in _KEYWORD_STOPWORDS
    ]
    short_name = " ".join(name_tokens[:4])

    raw_variants = [
        primary,
        " ".join(part for part in (brand, short_name, weight) if part),
        " ".join(part for part in (brand, weight) if part),
        brand,
        " ".join(part for part in (brand, name) if part),
    ]
    if "urinary" in _normalize_token(name):
        raw_variants.extend([
            " ".join(part for part in (brand, "Urinary Small Dog", weight) if part),
            " ".join(part for part in (brand, "Veterinary Canine Urinary S/O Small", weight) if part),
        ])

    # Escada orientada pela identidade enriquecida: cada discriminador real
    # (linha/sabor/porte/faixa de peso do animal/comprimento) vira uma
    # busca marca + discriminador [+ peso]. Só amplia discovery — o matcher
    # continua validando tudo. (sugestão do review)
    try:
        _ident = ProductIdentity.build(canonical_name=name, brand=brand or None, weight_kg=expected_weight_kg)
        _disc: list[str] = []
        if _ident.product_line:
            _disc.append(_ident.product_line)
        if _ident.flavor:
            _disc.append(_ident.flavor)
        if _ident.breed_size:
            _disc.append(_ident.breed_size.replace("_", " "))
        if _ident.animal_weight_range:
            lo, hi = _ident.animal_weight_range
            _disc.append(f"{lo:g} a {hi:g}kg")
        if _ident.length_cm:
            _disc.append(f"{_ident.length_cm:g}cm")
        for term in _disc:
            raw_variants.append(" ".join(part for part in (brand, term, weight) if part))
            raw_variants.append(" ".join(part for part in (brand, term) if part))
    except Exception:  # noqa: BLE001 — keyword é best-effort
        pass
    variants: list[str] = []
    seen: set[str] = set()
    for variant in raw_variants:
        normalized = _prepare_shopee_keyword(variant)
        key = _normalize_token(normalized)
        if not normalized or key in seen:
            continue
        seen.add(key)
        variants.append(normalized)
    # teto de buscas por GTIN — respeita o rate limit (~0,4s/chamada).
    return variants[:9]


def _brand_for_matching(title: str, brand: Optional[str]) -> Optional[str]:
    """Escolhe a marca que deve ser exigida no matcher da Shopee.

    Alguns feeds usam fabricante/distribuidor no campo brand (ex:
    "Boehringer Ingelheim"), enquanto o anúncio da Shopee usa a marca
    comercial ("NexGard"). Exigir o fabricante derruba match correto.
    Quando a marca do campo aparece no título, ela é confiável. Quando não
    aparece, tenta inferir uma marca comercial conhecida pelo título; se
    não conseguir, não aplica hard fail de marca e deixa nome+peso/volume
    protegerem o casamento.
    """
    title_key = _normalize_token(title or "")
    brand_key = _normalize_token(brand or "")
    if brand and brand_key and brand_key in title_key:
        return brand

    for commercial_brand in sorted(_COMMERCIAL_BRANDS, key=len, reverse=True):
        if _normalize_token(commercial_brand) in title_key:
            return commercial_brand
    return None


def _median(values: list[float]) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    mid = len(ordered) // 2
    if len(ordered) % 2 == 1:
        return ordered[mid]
    return (ordered[mid - 1] + ordered[mid]) / 2


_RESCUE_DISCRIMINATORS = (
    "weight_kg", "volume_ml", "length_cm", "pack_count",
    "animal_weight_range", "life_stage", "breed_size", "flavor", "species",
)
_HARD_DIMENSIONS = ("weight_kg", "volume_ml", "length_cm")


def _norm_txt(text: str) -> str:
    import unicodedata

    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode("ascii")
    return text.lower()


def _anchor_price_rescues(
    result: IdentityMatchResult,
    price: Optional[float],
    expected_identity: ProductIdentity,
    anchor_price: Optional[float],
    candidate_title: str,
) -> bool:
    """Preço NUNCA cria identidade. Ele só empurra pra dentro um candidato
    que JÁ está quase provado por texto+estrutura: marca certa, família
    certa, product_line compatível, pelo menos um discriminador real
    batendo, zero conflito, confiança já perto do corte, preço numa banda
    ESTREITA (±25-30%) em torno do preço Cobasi ao vivo do MESMO GTIN.
    Fora disso não resgata. (revisão pós-review do ChatGPT)"""
    if anchor_price is None or anchor_price <= 0 or price is None:
        return False
    if result.decision == IdentityDecision.CONFLICT:
        return False
    if any(a.status == AttributeStatus.CONFLICT for a in result.attributes):
        return False
    if not (anchor_price * 0.75 <= price <= anchor_price * 1.30):
        return False
    if result.confidence < 0.50:
        return False
    reasons = set(result.reasons)
    if "BRAND_MATCH" not in reasons or "FAMILY_MATCH" not in reasons:
        return False

    attrs = {a.attribute: a for a in result.attributes}
    has_real_discriminator = any(
        attrs.get(name) is not None and attrs[name].status == AttributeStatus.MATCH
        for name in _RESCUE_DISCRIMINATORS
    )
    if not has_real_discriminator:
        return False

    # Dimensão dura pinada no PETMOL → tem que ser MATCH, não pode ficar só
    # UNKNOWN (senão 2kg x 7,5kg passa).
    for name in _HARD_DIMENSIONS:
        if getattr(expected_identity, name, None) is not None:
            a = attrs.get(name)
            if a is None or a.status != AttributeStatus.MATCH:
                return False

    # product_line pinada (ex: "urinary small", "mini indoor") → todos os
    # tokens significativos têm que aparecer no título do anúncio, senão é
    # outra linha da mesma marca no mesmo peso/preço.
    line = getattr(expected_identity, "product_line", None)
    if line:
        title_norm = _norm_txt(candidate_title)
        tokens = [t for t in _norm_txt(line).split() if len(t) > 2]
        if tokens and not all(t in title_norm for t in tokens):
            return False

    return True


def _confident_matches(
    nodes: list[dict],
    expected_name: str,
    *,
    expected_brand: Optional[str],
    expected_weight_kg: Optional[float],
    expected_volume_ml: Optional[float],
    min_confidence: float,
    expected_length_cm: Optional[float] = None,
    anchor_price: Optional[float] = None,
) -> list[tuple[dict, IdentityMatchResult]]:
    expected_identity = ProductIdentity.build(
        canonical_name=expected_name,
        brand=expected_brand,
        weight_kg=expected_weight_kg,
        volume_ml=expected_volume_ml,
        length_cm=expected_length_cm,
    )
    scored: list[tuple[float, float, dict, IdentityMatchResult]] = []
    seen_listing_ids: set[str] = set()
    for node in nodes:
        listing_id = str(node.get("itemId")) if node.get("itemId") is not None else ""
        if listing_id and listing_id in seen_listing_ids:
            continue
        if listing_id:
            seen_listing_ids.add(listing_id)
        price = _parse_price(node.get("price"))
        result = evaluate_identity(
            expected_identity,
            MerchantCandidate.build(
                merchant="shopee",
                title=node.get("productName") or "",
                brand=node.get("brand"),
                price=price,
                external_id=listing_id,
            ),
            min_confidence=min_confidence,
        )
        if not result.accepted:
            if _anchor_price_rescues(result, price, expected_identity, anchor_price, node.get("productName") or ""):
                result = IdentityMatchResult(
                    IdentityDecision.HIGH_CONFIDENCE,
                    max(result.confidence, min_confidence),
                    (*result.reasons, "ANCHOR_PRICE_BAND"),
                    result.attributes,
                )
            else:
                continue
        if price is None:
            continue
        scored.append((result.confidence, price, node, result))

    if _has_ambiguous_sku_identity(scored, expected_identity):
        return []

    median_price = _median([price for _score, price, _node, _result in scored])
    if median_price is not None:
        # Preço baixo demais em marketplace costuma ser variação errada,
        # anúncio inconsistente ou isca. Mantém somente se o título também
        # for exato/forte. Isto não prova identidade; só filtra outlier
        # depois que o Identity Engine já aceitou o SKU.
        scored = [
            item for item in scored
            if item[1] >= median_price * 0.60 or item[0] >= 0.95
        ]

    scored.sort(key=lambda item: (item[1], -item[0]))
    return [(node, result) for _score, _price, node, result in scored]


_SKU_DISCRIMINATORS = ("weight_kg", "volume_ml", "length_cm", "pack_count", "animal_weight_range")


def _has_ambiguous_sku_identity(
    scored: list[tuple[float, float, dict, IdentityMatchResult]],
    expected_identity: Optional[ProductIdentity] = None,
) -> bool:
    if len(scored) < 2:
        return False
    # Só é ambíguo numa dimensão que a gente NÃO consegue fixar. Se o
    # produto esperado já tem peso/volume/comprimento/pack, o Identity
    # Engine só deixou passar candidato compatível com aquele valor —
    # variação explícita diferente já teria dado CONFLICT e caído fora do
    # `scored`. Antes, um esperado de 7,5kg com dois anúncios "7,5kg" +
    # um "7,5kg 2un" derrubava os três. Agora só as dimensões abertas
    # contam pra ambiguidade; preço nunca escolhe identidade.
    pinned = set()
    if expected_identity is not None:
        for name in _SKU_DISCRIMINATORS:
            if getattr(expected_identity, name, None) is not None:
                pinned.add(name)

    # Pergunta certa (pós-review): numa dimensão NÃO pinada, existem dois
    # valores explícitos incompatíveis entre os candidatos aceitos? Compara
    # dimensão a dimensão, não tupla heterogênea — assim "500ml + 1 pack"
    # vs "500ml" não conta como ambíguo (só um lado declarou o pack).
    def _hashable(value):
        return tuple(value) if isinstance(value, (list, tuple)) else value

    by_dimension: dict[str, set] = {}
    for _confidence, _price, _node, result in scored:
        for item in result.attributes:
            if item.attribute in _SKU_DISCRIMINATORS and item.attribute not in pinned and item.observed is not None:
                by_dimension.setdefault(item.attribute, set()).add(_hashable(item.observed))
    return any(len(values) > 1 for values in by_dimension.values())


def _best_awin_identity_for_gtin(db: Session, gtin: str) -> tuple[Optional[str], Optional[str]]:
    """Usa o feed Awin por GTIN como identidade forte para buscar Shopee.

    products_catalog pode ter sido criado por scanner, IA ou edição manual
    com nome curto/genérico ("Compra de ração"). Quando Cobasi/Zee Now/Zee
    Dog têm o mesmo GTIN no feed, esse título é uma referência melhor para
    proteger contra anúncio Shopee de outra variação da mesma marca.
    """
    from .affiliate_feed import AffiliateFeedOffer

    rows = db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.merchant.in_(_DEFAULT_AWIN_SHOPEE_SOURCE_MERCHANTS),
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.gtin == gtin,
            AffiliateFeedOffer.title.isnot(None),
        )
    ).all()
    if not rows:
        return None, None
    _gtin, title, brand = _best_feed_row(rows)
    return title, brand


def sync_shopee_offer_for_gtin(
    db: Session,
    gtin: str,
    *,
    limit: int = 20,
    min_confidence: float = 0.5,
    expected_weight_kg: Optional[float] = None,
    expected_name: Optional[str] = None,
    expected_brand: Optional[str] = None,
    anchor_price: Optional[float] = None,
) -> ShopeeSyncResult:
    """Busca, casa e faz upsert de UMA oferta Shopee pro produto do GTIN
    dado. Idempotente: reexecutar atualiza a mesma linha (chave:
    product_id + merchant + external_listing_id), nunca duplica.

    `anchor_price` (preço Cobasi ao vivo do MESMO GTIN, opcional) libera o
    resgate por banda de preço em _confident_matches — mesmo produto de
    marca/peso batendo e preço em torno do preço Cobasi, quando o texto
    ficou abaixo do corte."""
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized:
        return ShopeeSyncResult(gtin=gtin, matched=False, reason="GTIN inválido")

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="produto não encontrado em products_catalog")
    product_name = product.canonical_name or product.name
    product_brand = product.canonical_brand or product.brand
    if not product_name:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="produto sem nome cadastrado — não dá pra buscar/casar")

    feed_name, feed_brand = (None, None)
    if expected_name is None and expected_brand is None:
        feed_name, feed_brand = _best_awin_identity_for_gtin(db, gtin_normalized)
    # Pós-#156, quando o produto foi enriquecido, o canonical_name já traz o
    # feed Awin mesclado MAIS o discriminador de variante (tamanho/pack/porte)
    # — é a identidade mais forte. O título cru do feed só assume quando o
    # catálogo ainda não passou pelo enriquecimento (nome de scanner/IA).
    enriched_name = product.canonical_name if getattr(product, "identity_enriched_at", None) is not None else None
    match_name = expected_name or enriched_name or feed_name or product_name
    match_brand = expected_brand if expected_brand is not None else (feed_brand or product_brand)
    keyword_product = ProductCatalog(name=match_name, brand=match_brand)
    expected_weight_kg = expected_weight_kg if expected_weight_kg is not None else extract_weight_kg(match_name)
    # GTIN literal como 1ª busca: vendedor sério de pet (antiparasitário
    # sobretudo) põe o EAN no título → match exato, o mais perto que a
    # Shopee chega de um lookup por GTIN. Se não retornar nada, as
    # variantes por nome assumem. O matcher valida tudo de qualquer forma.
    keywords = [gtin_normalized, *_build_keyword_variants(keyword_product, expected_weight_kg)]
    nodes_by_id: dict[str, dict] = {}
    try:
        for keyword in keywords:
            for node in search_product_offers(keyword, limit=limit):
                key = str(node.get("itemId")) if node.get("itemId") is not None else f"{node.get('productName')}:{node.get('price')}"
                nodes_by_id.setdefault(key, node)
    except ShopeeAffiliateError as exc:
        logger.warning("shopee sync: erro na busca para gtin=%s: %s", gtin_normalized, exc)
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason=f"erro na API Shopee: {exc}")

    expected_volume_ml = extract_volume_ml(match_name)
    expected_length_cm = extract_length_cm(match_name)
    if expected_weight_kg is not None and extract_weight_kg(match_name) is None:
        match_name = f"{match_name} {_format_weight_kg(expected_weight_kg)}"
    matches = _confident_matches(
        list(nodes_by_id.values()),
        match_name,
        expected_brand=match_brand,
        expected_volume_ml=expected_volume_ml,
        expected_weight_kg=expected_weight_kg,
        expected_length_cm=expected_length_cm,
        min_confidence=min_confidence,
        anchor_price=anchor_price,
    )
    if not matches:
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason="nenhum candidato confiável na busca")

    now = datetime.now(timezone.utc)
    offer_ids: list[int] = []
    valid_listing_ids: set[str] = set()
    invalid_links = 0

    for match, match_result in matches:
        offer_link = match.get("offerLink") or ""
        try:
            validate_shopee_affiliate_url(offer_link)
        except InvalidShopeeAffiliateUrlError as exc:
            invalid_links += 1
            logger.warning("shopee sync: offerLink inválido para gtin=%s: %s", gtin_normalized, exc)
            continue

        price = _parse_price(match.get("price"))
        external_listing_id = str(match.get("itemId")) if match.get("itemId") is not None else None
        if external_listing_id:
            valid_listing_ids.add(external_listing_id)

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
            existing.merchant_title = match.get("productName")
            existing.merchant_gtin = gtin_normalized if gtin_normalized in str(match.get("productName") or "") else None
            existing.price = price
            existing.is_available = True
            existing.active = True
            existing.verified_at = now
            existing.last_checked_at = now
            existing.match_decision = match_result.decision.value
            existing.match_confidence = match_result.confidence
            existing.match_reasons_json = match_result.reasons_json()
            existing.match_attributes_json = match_result.attributes_json()
            existing.price_refresh_status = "refreshed"
            existing.price_refresh_error = None
            offer = existing
        else:
            offer = MarketplaceOffer(
                product_id=product.id,
                merchant="shopee",
                external_listing_id=external_listing_id,
                seller_name=match.get("shopName"),
                merchant_title=match.get("productName"),
                merchant_gtin=gtin_normalized if gtin_normalized in str(match.get("productName") or "") else None,
                affiliate_url=offer_link,
                direct_url=match.get("productLink"),
                price=price,
                is_available=True,
                active=True,
                verified_at=now,
                last_checked_at=now,
                match_decision=match_result.decision.value,
                match_confidence=match_result.confidence,
                match_reasons_json=match_result.reasons_json(),
                match_attributes_json=match_result.attributes_json(),
                price_refresh_status="refreshed",
            )
            db.add(offer)
        db.flush()
        offer_ids.append(offer.id)

    if not offer_ids:
        db.rollback()
        reason = "offerLink inválido" if invalid_links else "nenhum candidato confiável na busca"
        return ShopeeSyncResult(gtin=gtin_normalized, matched=False, reason=reason)

    # Mesma epistemologia do audit tri-state: ausência de um listing nesta
    # busca NÃO prova que ele morreu. Só aposenta (a) legado sem identidade
    # comprovada, agora que temos substituto positivo, ou (b) o que já era
    # CONFLICT. Um listing que já foi EXACT/HIGH_CONFIDENCE e só não voltou
    # nesta busca vira stale pra revalidar — não desativa. (pós-review)
    _VALIDATED = {"EXACT", "HIGH_CONFIDENCE"}
    for stale in db.scalars(
        select(MarketplaceOffer).where(
            MarketplaceOffer.product_id == product.id,
            MarketplaceOffer.merchant == "shopee",
            MarketplaceOffer.active.is_(True),
        )
    ):
        if stale.external_listing_id in valid_listing_ids:
            continue
        prev = (stale.match_decision or "").upper()
        if prev in _VALIDATED:
            stale.price_refresh_status = "stale_unconfirmed"
            stale.last_checked_at = now
            continue
        stale.active = False
        stale.is_available = False
        stale.verified_at = now
        stale.last_checked_at = now

    db.commit()
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
        canonical_name=name,
        canonical_brand=brand,
        source_primary="awin_feed",
    )
    db.add(product)
    db.commit()
    db.refresh(product)
    return product


def _find_alias_shopee_offers(
    db: Session, gtin_normalized: str, name: str, brand: Optional[str]
) -> list[MarketplaceOffer]:
    """Mesma loja às vezes lista o mesmo item comercial sob GTINs
    diferentes (código reemitido, retrabalho de embalagem, etc.) — nunca
    tamanho/variação diferente, que sempre muda o preço. Quando um GTIN
    "irmão" da mesma loja já tem oferta Shopee casada, reaproveita em vez
    de gastar outra busca de rede pro mesmo produto físico (mais barato e
    fecha a lacuna de "produto sem preço só porque foi escaneado sob o
    outro código de barras").

    Critério deliberadamente estrito pra nunca colar itens errados: mesma
    loja (merchant) + título normalizado idêntico + marca normalizada
    idêntica + preço idêntico até o centavo. Qualquer diferença de preço
    já é sinal de tamanho/versão realmente diferente — não reaproveita
    nesse caso, cai pro fluxo normal de busca+match na Shopee."""
    from .affiliate_feed import AffiliateFeedOffer

    own_row = db.scalar(
        select(AffiliateFeedOffer)
        .where(AffiliateFeedOffer.gtin == gtin_normalized, AffiliateFeedOffer.active.is_(True))
        .order_by(AffiliateFeedOffer.id)
        .limit(1)
    )
    if not own_row or own_row.price is None:
        return []

    title_key = _normalize_token(name)
    if not title_key:
        return []
    brand_key = _normalize_token(brand or "")

    siblings = db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.merchant == own_row.merchant,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.gtin.isnot(None),
            AffiliateFeedOffer.gtin != gtin_normalized,
            AffiliateFeedOffer.price == own_row.price,
        )
    ).all()

    for sibling in siblings:
        if _normalize_token(sibling.title or "") != title_key:
            continue
        if _normalize_token(sibling.brand or "") != brand_key:
            continue
        sibling_gtin = normalize_gtin(sibling.gtin)
        if not sibling_gtin or sibling_gtin == gtin_normalized:
            continue
        sibling_product = db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == sibling_gtin)
        )
        if not sibling_product:
            continue
        offers = db.scalars(
            select(MarketplaceOffer).where(
                MarketplaceOffer.product_id == sibling_product.id,
                MarketplaceOffer.merchant == "shopee",
                MarketplaceOffer.active.is_(True),
                MarketplaceOffer.is_available.is_(True),
            )
        ).all()
        if offers:
            return list(offers)
    return []


def _clone_offers_for_product(db: Session, product_id: int, source_offers: list[MarketplaceOffer]) -> list[int]:
    """Copia ofertas Shopee já verificadas (URL nunca reescrita, só
    reatribuída a outro product_id) pro GTIN irmão reconhecido por
    _find_alias_shopee_offers. Upsert por (product_id, merchant,
    external_listing_id), mesma chave de idempotência de
    sync_shopee_offer_for_gtin — reexecutar nunca duplica."""
    now = datetime.now(timezone.utc)
    cloned_ids: list[int] = []
    for src in source_offers:
        existing = db.scalar(
            select(MarketplaceOffer).where(
                MarketplaceOffer.product_id == product_id,
                MarketplaceOffer.merchant == "shopee",
                MarketplaceOffer.external_listing_id == src.external_listing_id,
            )
        )
        offer = existing or MarketplaceOffer(
            product_id=product_id, merchant="shopee", external_listing_id=src.external_listing_id
        )
        if not existing:
            db.add(offer)
        offer.seller_name = src.seller_name
        offer.affiliate_url = src.affiliate_url
        offer.direct_url = src.direct_url
        offer.price = src.price
        offer.is_available = True
        offer.active = True
        offer.verified_at = now
        offer.last_checked_at = now
        db.flush()
        cloned_ids.append(offer.id)
    db.commit()
    return cloned_ids


def sync_shopee_offer_from_feed_row(
    db: Session,
    gtin: str,
    name: str,
    brand: Optional[str],
    *,
    limit: int = 20,
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

    alias_offers = _find_alias_shopee_offers(db, product.barcode_normalized, name, brand)
    if alias_offers:
        cloned_ids = _clone_offers_for_product(db, product.id, alias_offers)
        return ShopeeSyncResult(
            gtin=product.barcode_normalized, matched=True,
            reason="mesmo item, GTIN irmão na mesma loja já tinha oferta Shopee casada",
            offer_id=cloned_ids[0], offer_ids=cloned_ids,
        )

    return sync_shopee_offer_for_gtin(
        db,
        product.barcode_normalized,
        limit=limit,
        min_confidence=min_confidence,
        expected_weight_kg=expected_weight_kg,
        expected_name=name,
        expected_brand=_brand_for_matching(name, brand),
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


# Alias público — usado pelo job noturno (admin/shopee_sync_router.py) pra
# distinguir "refresh de oferta ativa" de "descoberta nova".
has_active_shopee_offer_for_gtin = _has_active_shopee_offer_for_gtin


def _feed_row_quality(title: str, brand: Optional[str], merchant: str) -> tuple[int, int, int, int]:
    merchant_priority = {"cobasi": 3, "zeenow": 2, "zeedog": 1}.get(merchant, 0)
    has_measure = 1 if extract_weight_kg(title) is not None or extract_volume_ml(title) is not None else 0
    has_brand = 1 if brand and _normalize_token(brand) in _normalize_token(title) else 0
    length_score = min(len(title.strip()), 160)
    return has_measure, has_brand, merchant_priority, length_score


def _best_feed_row(rows) -> tuple[str, str, Optional[str]]:
    best = max(rows, key=lambda row: _feed_row_quality(row.title or "", row.brand, row.merchant))
    return best.gtin, best.title, best.brand


_SHOPEE_SYNC_PRIORITY_TERMS = (
    "racao", "ração", "alimento", "coleira", "scalibor", "seresto",
    "vermifugo", "vermífugo", "antipulgas", "carrapato", "nexgard",
    "bravecto", "simparic", "frontline", "drontal", "tapete higienico",
    "tapete higiênico", "areia", "petisco", "shampoo", "medicamento",
)


def _feed_item_sync_priority(item: tuple[str, str, Optional[str]]) -> tuple[int, int, int, str]:
    """Ordena a fila para buscar primeiro itens com maior chance comercial.

    A fila unificada é deduplicada por GTIN e pode começar por UPCs
    importados (aquarismo/brinquedos), que têm baixa chance na Shopee BR e
    já geraram `System Error` da API. A ordem não muda a segurança do
    casamento; só evita gastar as primeiras horas do job em itens pouco
    prováveis enquanto ração/saúde/higiene ficam no fim.
    """
    gtin, title, brand = item
    text = f"{title or ''} {brand or ''}".lower()
    commercial_score = sum(1 for term in _SHOPEE_SYNC_PRIORITY_TERMS if term in text)
    brazilian_gtin = 1 if (gtin or "").startswith("789") else 0
    has_measure = 1 if extract_weight_kg(title or "") is not None or extract_volume_ml(title or "") is not None else 0
    return -brazilian_gtin, -commercial_score, -has_measure, gtin or ""


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

    items = [_best_feed_row(group) for _gtin, group in grouped.items()]
    return sorted(items, key=_feed_item_sync_priority)


def iter_unified_awin_feed_products_by_gtin(
    db: Session,
    merchants: tuple[str, ...] = _DEFAULT_AWIN_SHOPEE_SOURCE_MERCHANTS,
    *,
    skip_existing_shopee: bool = True,
) -> list[tuple[str, str, Optional[str]]]:
    """Ordem antiga por GTIN, mantida só para auditoria/testes comparativos."""
    items = iter_unified_awin_feed_products(
        db,
        merchants=merchants,
        skip_existing_shopee=skip_existing_shopee,
    )
    return sorted(items, key=lambda item: item[0] or "")


def iter_active_shopee_offer_gtins(db: Session) -> list[str]:
    """PRIORIDADE A do job noturno — toda oferta Shopee ativa hoje, do
    preço confirmado mais antigo pro mais novo, pra revalidar/reprecificar
    primeiro o que está mais defasado."""
    rows = db.execute(
        select(ProductCatalog.barcode_normalized)
        .join(MarketplaceOffer, MarketplaceOffer.product_id == ProductCatalog.id)
        .where(
            MarketplaceOffer.merchant == "shopee",
            MarketplaceOffer.active.is_(True),
            ProductCatalog.barcode_normalized.isnot(None),
        )
        .order_by(MarketplaceOffer.last_checked_at.is_(None).desc(), MarketplaceOffer.last_checked_at.asc())
    ).all()
    seen: set[str] = set()
    out: list[str] = []
    for (gtin,) in rows:
        g = normalize_gtin(gtin)
        if g and g not in seen:
            seen.add(g)
            out.append(g)
    return out


def iter_active_product_gtins(db: Session) -> list[str]:
    """PRIORIDADE B do job noturno — GTINs de produtos que os tutores de
    fato usam: tudo que já foi escaneado (product_scan_events) e que
    resolveu num produto de catálogo com nome. Cobre ração,
    antiparasitário, vermífugo, higiene, medicação — sem parse de JSON."""
    from .product_catalog_lookup import ProductScanEvent

    rows = db.execute(
        select(ProductScanEvent.barcode_normalized)
        .join(ProductCatalog, ProductCatalog.barcode_normalized == ProductScanEvent.barcode_normalized)
        .where(
            ProductScanEvent.barcode_normalized.isnot(None),
            ProductCatalog.name.isnot(None),
        )
        .distinct()
    ).all()
    seen: set[str] = set()
    out: list[str] = []
    for (gtin,) in rows:
        g = normalize_gtin(gtin)
        if g and g not in seen:
            seen.add(g)
            out.append(g)
    return out


def iter_launch_coverage_queue(
    db: Session,
    *,
    max_products: int,
    feed_merchants: tuple[str, ...] = _DEFAULT_AWIN_SHOPEE_SOURCE_MERCHANTS,
) -> tuple[list[tuple[str, Optional[str], Optional[str]]], int]:
    """Fila noturna determinística em prioridades:
      A — GTINs realmente usados pelos tutores (scan events) — é o que
          aparece na tela; tem que estar sempre fresco. Conjunto pequeno.
      B — o resto das ofertas Shopee ativas (backlog, mais antigas
          primeiro) — produto que ninguém abriu ainda; esquenta sob
          demanda quando alguém escaneia (entra em A na noite seguinte).
      C — catálogo Awin fresco (Cobasi + Zee Now + Zee Dog), só o que
          ainda não tem oferta Shopee.
    Deduplicado por GTIN normalizado, preservando a ordem (A antes de B
    antes de C). Corta em `max_products`; retorna (fila, total_disponível)
    pra o STATE registrar `remaining`.

    Ordem trocada em 01/09/2026: A era "todas as ofertas ativas" (10k+),
    estourava o teto de 400 toda noite e B/C nunca rodavam — preço Shopee
    ficava permanentemente defasado (janela stale de 36h). Tutores primeiro
    resolve isso: o conjunto que os tutores de fato veem é pequeno e passa
    a ser revalidado toda noite.
    """
    seen: set[str] = set()
    queue: list[tuple[str, Optional[str], Optional[str]]] = []

    def _add(gtin: str, name: Optional[str] = None, brand: Optional[str] = None) -> None:
        g = normalize_gtin(gtin)
        if not g or g in seen:
            return
        seen.add(g)
        queue.append((g, name, brand))

    for g in iter_active_product_gtins(db):
        _add(g)
    for g in iter_active_shopee_offer_gtins(db):
        _add(g)
    for gtin, name, brand in iter_unified_awin_feed_products(db, merchants=feed_merchants, skip_existing_shopee=True):
        _add(gtin, name, brand)

    total_available = len(queue)
    return queue[:max_products], total_available


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

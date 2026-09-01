"""
Commerce Engine — abstração de providers de comércio (Cobasi hoje;
Shopee/Mercado Livre/Petz no futuro), separando DESCOBERTA de
produto/preço (dinâmica, sempre tenta) de MONETIZAÇÃO da oferta
(estratégia por provider, pode falhar/estar desligada).

Princípio (ver docs/AFFILIATES.md):
  IDENTIDADE DO PRODUTO (GTIN/nome/marca/peso) é persistente no PETMOL.
  OFERTA COMERCIAL (preço/estoque/URL/comissão) é dinâmica e resolvida
  somente no momento da compra — nunca pré-cadastrada em massa como
  pré-requisito para o produto aparecer.

Ordem de execução, por provider:
    DISCOVERY → MONETIZATION → FILTER (descarta sem monetização) → SORT
Nunca o inverso — nunca checar se existe link afiliado antes de buscar o
produto. find_offer() roda para QUALQUER produto, sempre; monetize() é
quem decide se a oferta pode ser exibida.

Exceção única e explícita: um provider pode implementar should_run(context,
offers_so_far) pra declarar que sua descoberta é dispensável quando a rota
preferida do merchant (merchant_routes.py) já resolveu uma oferta completa
pro mesmo merchant nesta mesma chamada — hoje só CobasiProvider usa isso,
pra não fazer uma busca ao vivo na VTEX quando o GTIN escaneado já resolveu
por identidade exata via Awin. should_run() é sempre "opt-in": providers
sem esse método sempre rodam (getattr(provider, "should_run", None) is
None → sempre True), preservando o "find_offer() sempre roda" pra todo o
resto.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Protocol

from .merchant_routes import preferred_route_for


@dataclass
class ProductContext:
    """Identidade do produto — o que já sabemos antes de perguntar a um provider."""

    gtin: Optional[str] = None
    name: Optional[str] = None
    brand: Optional[str] = None
    species: Optional[str] = None
    category: Optional[str] = None
    weight_kg: Optional[float] = None
    product_id: Optional[int] = None  # products_catalog.id, quando já resolvido
    canonical_name: Optional[str] = None
    canonical_brand: Optional[str] = None
    canonical_image_url: Optional[str] = None
    # Texto de busca já montado pelo chamador (ex: "Royal Canin ração"),
    # quando o provider usa busca textual (Cobasi hoje). Providers com API
    # estruturada por GTIN podem ignorar isto e usar
    # gtin/name/brand diretamente.
    query: Optional[str] = None


@dataclass
class DiscoveredOffer:
    """Resultado de find_offer() — produto/preço reais, ainda sem monetização."""

    merchant: str
    canonical_product_id: Optional[int] = None
    canonical_gtin: Optional[str] = None
    canonical_name: Optional[str] = None
    canonical_brand: Optional[str] = None
    canonical_image_url: Optional[str] = None
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    direct_url: Optional[str] = None
    ean: Optional[str] = None
    external_id: Optional[str] = None  # SKU/listing id, quando houver
    image_url: Optional[str] = None
    price_checked_at: Optional[datetime] = None
    price_is_stale: bool = False
    # Contrato explícito: normalmente uma oferta sem preço é descartada
    # (sem preço real = "sem monetização comprovável"). Providers de
    # marketplace (Shopee) podem ter uma oferta afiliada VÁLIDA cujo último
    # preço confirmado expirou — nesse caso o preço vira None de propósito
    # ("Conferir preço na loja") mas a oferta ainda é monetizável e deve
    # passar pelo engine. Só esses casos setam allow_without_price=True.
    # Cobasi/Awin nunca setam — continuam exigindo preço.
    allow_without_price: bool = False
    match_decision: Optional[str] = None
    match_confidence: Optional[float] = None
    match_reasons: Optional[list[str]] = None
    match_attributes: Optional[list[dict]] = None
    merchant_product_name: Optional[str] = None


@dataclass
class MonetizedOffer:
    """Oferta final, já com link monetizável — o que o frontend recebe."""

    merchant: str
    url: str
    link_type: str  # affiliate_product | affiliate_marketplace_offer | affiliate_store | direct
    # Identidade PETMOL, separada da oferta externa. O frontend deve
    # renderizar estes campos como fonte de verdade quando existirem.
    canonical_product_id: Optional[int] = None
    canonical_gtin: Optional[str] = None
    canonical_name: Optional[str] = None
    canonical_brand: Optional[str] = None
    canonical_image_url: Optional[str] = None
    # Mecanismo de monetização usado (ex: "mais" para Cobasi via MAIS/UTM,
    # "awin" para merchants via feed Awin) — usado só internamente pelo
    # CommerceEngine para dedupe por merchant_routes.py. Opcional porque
    # providers antigos/de teste podem não informar.
    route: Optional[str] = None
    # True só quando a oferta vem de um link cadastrado manualmente
    # (ex: ProductAffiliateLink da Baby) — nunca de UTM/geração automática,
    # mesmo que ambos tenham route="mais". Ofertas cacheadas manualmente
    # NUNCA são substituídas no dedupe por merchant, independente de
    # merchant_routes.PREFERRED_ROUTE_BY_MERCHANT (ver _dedupe_by_merchant)
    # — um link já comprovado nunca cede espaço pra uma rota "preferida"
    # ainda não validada.
    is_manually_cached: bool = False
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None
    price_checked_at: Optional[datetime] = None
    price_is_stale: bool = False
    # Oferta/match externo, para auditoria. Não substitui canonical_*.
    merchant_product_name: Optional[str] = None
    match_decision: Optional[str] = None
    match_confidence: Optional[float] = None
    match_reasons: Optional[list[str]] = None
    match_attributes: Optional[list[dict]] = None
    # Grupo de SKU cross-GTIN: quando a oferta foi resolvida contra um EAN
    # IRMÃO do produto do tutor (mesmo SKU físico, código diferente). A
    # identidade canônica exibida continua a do tutor; estes campos dizem
    # de onde o preço veio. origin_gtin == canonical_gtin nas ofertas
    # normais.
    origin_gtin: Optional[str] = None
    origin_product_name: Optional[str] = None
    sku_group_id: Optional[str] = None
    sku_group_basis: Optional[str] = None
    sku_group_confidence: Optional[float] = None


class CommerceProvider(Protocol):
    """Um varejista/marketplace capaz de descobrir e monetizar ofertas."""

    merchant: str

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        """Busca dinâmica: produto real, preço real, EAN real, sempre que
        possível. Nunca depende de cadastro manual prévio — é chamado para
        QUALQUER produto, existindo ou não link afiliado para ele."""
        ...

    def monetize(
        self, offer: DiscoveredOffer, context: ProductContext
    ) -> Optional[tuple[str, str] | tuple[str, str, str] | tuple[str, str, str, bool]]:
        """Tenta transformar a oferta descoberta em (url, link_type) — ou
        (url, link_type, route), quando o provider distingue mais de um
        mecanismo de monetização pro mesmo merchant (ver merchant_routes.py)
        — ou (url, link_type, route, is_manually_cached), quando o provider
        também distingue link cadastrado manualmente de geração automática
        (ver CobasiProvider — um link manual nunca cede lugar no dedupe).
        Retorna None se não for possível monetizar agora — a oferta é então
        descartada, nunca exibida sem comissão."""
        ...


class CommerceEngine:
    """Orquestra providers: discovery → monetize → filter → dedupe por
    merchant (merchant_routes.py) → sort (menor preço primeiro)."""

    def __init__(self, providers: list[CommerceProvider]):
        self._providers = providers

    async def get_offers(self, context: ProductContext) -> list[MonetizedOffer]:
        offers: list[MonetizedOffer] = []
        for provider in self._providers:
            should_run = getattr(provider, "should_run", None)
            if should_run is not None and not should_run(context, offers):
                continue

            discovered = await provider.find_offer(context)
            if discovered is None:
                continue
            # Sem preço só passa quando o provider declarou explicitamente
            # que suporta oferta monetizada sem preço atual (marketplace
            # stale). Sem esse contrato, a regra de sempre: sem preço, fora.
            if discovered.price is None and not discovered.allow_without_price:
                continue
            if discovered.is_available is False:
                continue

            monetized = provider.monetize(discovered, context)
            if monetized is None:
                continue

            is_manually_cached = False
            if len(monetized) == 4:
                url, link_type, route, is_manually_cached = monetized
            elif len(monetized) == 3:
                url, link_type, route = monetized
            else:
                url, link_type = monetized
                route = None

            offers.append(MonetizedOffer(
                merchant=discovered.merchant,
                url=url,
                link_type=link_type,
                route=route,
                is_manually_cached=is_manually_cached,
                canonical_product_id=discovered.canonical_product_id or context.product_id,
                canonical_gtin=discovered.canonical_gtin or context.gtin,
                canonical_name=discovered.canonical_name or context.canonical_name or context.name or discovered.product_name,
                canonical_brand=discovered.canonical_brand or context.canonical_brand or context.brand or discovered.brand,
                canonical_image_url=discovered.canonical_image_url or context.canonical_image_url or discovered.image_url,
                product_name=discovered.canonical_name or context.canonical_name or context.name or discovered.product_name,
                brand=discovered.canonical_brand or context.canonical_brand or context.brand or discovered.brand,
                price=discovered.price,
                list_price=discovered.list_price,
                is_available=discovered.is_available,
                image_url=discovered.canonical_image_url or context.canonical_image_url or discovered.image_url,
                price_checked_at=discovered.price_checked_at,
                price_is_stale=discovered.price_is_stale,
                merchant_product_name=discovered.merchant_product_name or discovered.product_name,
                match_decision=discovered.match_decision,
                match_confidence=discovered.match_confidence,
                match_reasons=discovered.match_reasons,
                match_attributes=discovered.match_attributes,
            ))

        offers = _dedupe_by_merchant(offers)
        offers.sort(key=lambda o: o.price if o.price is not None else float("inf"))
        return offers


def _dedupe_by_merchant(offers: list[MonetizedOffer]) -> list[MonetizedOffer]:
    """Nunca exibe o mesmo merchant duas vezes (ex: "Cobasi via MAIS" e
    "Cobasi via Awin" como se fossem duas lojas diferentes). Quando mais
    de um provider resolve oferta pro mesmo merchant:
      1. Uma oferta com link cadastrado manualmente (is_manually_cached)
         NUNCA é substituída por uma que não é — mesmo que a outra seja a
         rota "preferida" em merchant_routes.py. Link já comprovado nunca
         cede lugar pra rota ainda não validada (ver docs/AFFILIATES.md).
      2. Sem link manual dos dois lados, mantém a da rota preferida.
      3. Sem preferência configurada, mantém a primeira encontrada (ordem
         de registro em build_default_engine)."""
    kept: dict[str, MonetizedOffer] = {}
    for offer in offers:
        existing = kept.get(offer.merchant)
        if existing is None:
            kept[offer.merchant] = offer
            continue
        if existing.is_manually_cached and not offer.is_manually_cached:
            continue
        if offer.is_manually_cached and not existing.is_manually_cached:
            kept[offer.merchant] = offer
            continue
        preferred = preferred_route_for(offer.merchant)
        if preferred is not None and offer.route == preferred and existing.route != preferred:
            kept[offer.merchant] = offer
    return list(kept.values())

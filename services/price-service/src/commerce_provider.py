"""
Commerce Engine — abstração de providers de comércio (Cobasi hoje;
Amazon/Shopee/Mercado Livre/Petz no futuro), separando DESCOBERTA de
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
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Protocol

from .merchant_routes import preferred_route_for


@dataclass
class ProductContext:
    """Identidade do produto — o que já sabemos antes de perguntar a um provider."""

    gtin: Optional[str] = None
    name: Optional[str] = None
    brand: Optional[str] = None
    weight_kg: Optional[float] = None
    product_id: Optional[int] = None  # products_catalog.id, quando já resolvido
    # Texto de busca já montado pelo chamador (ex: "Royal Canin ração"),
    # quando o provider usa busca textual (Cobasi hoje). Providers com API
    # estruturada (ex: Amazon PA-API por GTIN) podem ignorar isto e usar
    # gtin/name/brand diretamente.
    query: Optional[str] = None


@dataclass
class DiscoveredOffer:
    """Resultado de find_offer() — produto/preço reais, ainda sem monetização."""

    merchant: str
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    direct_url: Optional[str] = None
    ean: Optional[str] = None
    external_id: Optional[str] = None  # SKU/listing id, quando houver


@dataclass
class MonetizedOffer:
    """Oferta final, já com link monetizável — o que o frontend recebe."""

    merchant: str
    url: str
    link_type: str  # affiliate_product | affiliate_marketplace_offer | affiliate_store | direct
    # Mecanismo de monetização usado (ex: "mais" para Cobasi via MAIS/UTM,
    # "awin" para merchants via feed Awin) — usado só internamente pelo
    # CommerceEngine para dedupe por merchant_routes.py. Opcional porque
    # providers antigos/de teste podem não informar.
    route: Optional[str] = None
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None


class CommerceProvider(Protocol):
    """Um varejista/marketplace capaz de descobrir e monetizar ofertas."""

    merchant: str

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        """Busca dinâmica: produto real, preço real, EAN real, sempre que
        possível. Nunca depende de cadastro manual prévio — é chamado para
        QUALQUER produto, existindo ou não link afiliado para ele."""
        ...

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str] | tuple[str, str, str]]:
        """Tenta transformar a oferta descoberta em (url, link_type) — ou
        (url, link_type, route), quando o provider distingue mais de um
        mecanismo de monetização pro mesmo merchant (ver merchant_routes.py).
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
            discovered = await provider.find_offer(context)
            if discovered is None or discovered.price is None:
                continue

            monetized = provider.monetize(discovered, context)
            if monetized is None:
                continue

            if len(monetized) == 3:
                url, link_type, route = monetized
            else:
                url, link_type = monetized
                route = None

            offers.append(MonetizedOffer(
                merchant=discovered.merchant,
                url=url,
                link_type=link_type,
                route=route,
                product_name=discovered.product_name,
                brand=discovered.brand,
                price=discovered.price,
                list_price=discovered.list_price,
                is_available=discovered.is_available,
            ))

        offers = _dedupe_by_merchant(offers)
        offers.sort(key=lambda o: o.price if o.price is not None else float("inf"))
        return offers


def _dedupe_by_merchant(offers: list[MonetizedOffer]) -> list[MonetizedOffer]:
    """Nunca exibe o mesmo merchant duas vezes (ex: "Cobasi via MAIS" e
    "Cobasi via Awin" como se fossem duas lojas diferentes). Quando mais
    de um provider resolve oferta pro mesmo merchant, mantém a da rota
    preferida (merchant_routes.py); sem preferência configurada, mantém a
    primeira encontrada (ordem de registro em build_default_engine)."""
    kept: dict[str, MonetizedOffer] = {}
    for offer in offers:
        existing = kept.get(offer.merchant)
        if existing is None:
            kept[offer.merchant] = offer
            continue
        preferred = preferred_route_for(offer.merchant)
        if preferred is not None and offer.route == preferred and existing.route != preferred:
            kept[offer.merchant] = offer
    return list(kept.values())

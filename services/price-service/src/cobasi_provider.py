"""
CobasiProvider — implementação de CommerceProvider para a Cobasi.

find_offer(): busca dinâmica via commerce_pricing.fetch_cobasi_price — a
API pública VTEX da Cobasi, ao vivo. Roda para QUALQUER produto, sem
depender de link afiliado cadastrado previamente (ver commerce_provider.py
para o princípio geral).

monetize(): um link cadastrado manualmente (ProductAffiliateLink) SEMPRE
tem prioridade, em qualquer modo != "disabled" — nunca abandona um link
já comprovado (ex: Baby/mais.app/IvUCAG) só porque o modo global mudou.
Sem link cadastrado, o modo decide o que fazer com o restante do catálogo:
  - "cached" (padrão) — sem link, não monetiza (em prod) ou cai pra URL
    crua só em dev (nunca em produção; affiliate_only_commerce_enforced).
  - "utm" — sem link, gera URL com UTM dinamicamente (cobasi_utm.py).
    NÃO ativado por padrão — precisa de confirmação formal da Cobasi/MAIS
    antes de virar o padrão de produção.
  - "api" — reservado para API oficial futura. Não implementado.
  - "disabled" — Cobasi nunca monetiza (nem link cadastrado é usado).

route retornado é sempre "mais" (link cadastrado ou UTM — ambos via
programa MAIS da Cobasi) — usado por commerce_provider.py pra nunca
mostrar Cobasi duas vezes quando um futuro AwinFeedProvider("cobasi")
também estiver registrado (ver merchant_routes.py).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import get_active_link
from .cobasi_utm import InvalidCobasiUrlError, build_cobasi_affiliate_url
from .commerce_pricing import fetch_cobasi_price
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import Settings, get_settings
from .product_catalog_lookup import ProductCatalog, normalize_gtin


def _build_query(context: ProductContext) -> str:
    if context.query:
        return context.query
    return " ".join(p for p in (context.brand, context.name) if p).strip()


class CobasiProvider:
    merchant = "cobasi"

    def __init__(self, db: Session):
        self._db = db

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        query = _build_query(context)
        if not query:
            return None

        price = await fetch_cobasi_price(query, target_weight_kg=context.weight_kg)
        if not price.found or price.price is None:
            return None

        return DiscoveredOffer(
            merchant=self.merchant,
            product_name=price.product_name,
            brand=price.brand,
            price=price.price,
            list_price=price.list_price,
            is_available=price.is_available,
            direct_url=price.url,
            ean=price.ean,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str]]:
        settings = get_settings()
        mode = settings.cobasi_affiliate_mode

        if mode == "disabled":
            return None

        # Link cadastrado manualmente sempre tem prioridade, em qualquer
        # modo != "disabled" — ver docstring do módulo.
        cached = self._lookup_cached_link(offer, context)
        if cached is not None:
            url, link_type = cached
            return url, link_type, "mais"

        if mode == "cached":
            fallback = self._dev_fallback(offer, settings)
            if fallback is None:
                return None
            url, link_type = fallback
            return url, link_type, "mais"
        if mode == "utm":
            utm = self._monetize_utm(offer)
            if utm is None:
                return None
            url, link_type = utm
            return url, link_type, "mais"

        # "api" reservado — sem implementação oficial ainda.
        return None

    def _resolve_product_id(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[int]:
        if context.product_id is not None:
            return context.product_id
        if not offer.ean:
            return None
        gtin_normalized = normalize_gtin(offer.ean)
        product = self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
        )
        return product.id if product else None

    def _lookup_cached_link(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str]]:
        product_id = self._resolve_product_id(offer, context)
        if product_id is None:
            return None
        link = get_active_link(self._db, product_id, self.merchant)
        if not link:
            return None
        return link.affiliate_product_url, "affiliate_product"

    def _dev_fallback(self, offer: DiscoveredOffer, settings: Settings) -> Optional[tuple[str, str]]:
        # Sem link cadastrado: em dev, cai pra URL crua da Cobasi só pra
        # não travar o teste local a cada query — nunca em produção (ver
        # affiliate_only_commerce_enforced / docs/AFFILIATES.md).
        if not settings.affiliate_only_commerce_enforced and offer.direct_url:
            return offer.direct_url, "direct"
        return None

    def _monetize_utm(self, offer: DiscoveredOffer) -> Optional[tuple[str, str]]:
        if not offer.direct_url:
            return None
        try:
            url = build_cobasi_affiliate_url(offer.direct_url)
        except InvalidCobasiUrlError:
            return None
        return url, "affiliate_product"

"""Commerce provider for Mercado Livre catalog offers.

Mercado Livre is exposed only behind explicit flags. In production, direct
non-affiliate URLs remain blocked by `affiliate_only_commerce_enforced`.
"""
from __future__ import annotations

from typing import Optional

from .commerce_provider import DiscoveredOffer, ProductContext
from .config import Settings, get_settings
from .providers.mercadolivre import MercadoLivreProvider, mercadolivre_provider


def is_mercadolivre_commerce_publicly_servable(settings: Optional[Settings] = None) -> bool:
    settings = settings or get_settings()
    if not settings.enable_ml_provider:
        return False
    if not settings.mercadolivre_public_offers_enabled:
        return False
    if settings.affiliate_only_commerce_enforced and not settings.mercadolivre_affiliate_enabled:
        return False
    return True


def _build_query(context: ProductContext) -> str:
    if context.query:
        return context.query
    return " ".join(p for p in (context.brand, context.name) if p).strip()


class MercadoLivreCommerceProvider:
    merchant = "mercadolivre"

    def __init__(self, provider: Optional[MercadoLivreProvider] = None):
        self._provider = provider or mercadolivre_provider

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not is_mercadolivre_commerce_publicly_servable():
            return None

        candidate = None
        if context.gtin:
            candidate = await self._provider.lookup_barcode(context.gtin, country="BR")
        else:
            query = _build_query(context)
            if not query:
                return None
            results = await self._provider.search(query=query, country="BR", limit=5)
            candidate = results[0] if results else None

        if candidate is None or candidate.price is None:
            return None

        return DiscoveredOffer(
            merchant=self.merchant,
            product_name=candidate.title,
            brand=candidate.brand,
            price=candidate.price,
            list_price=candidate.original_price,
            is_available=candidate.in_stock,
            direct_url=candidate.url,
            ean=candidate.gtin,
            external_id=candidate.source_item_id,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str]]:
        settings = get_settings()
        if not is_mercadolivre_commerce_publicly_servable(settings):
            return None
        if not offer.direct_url:
            return None

        # There is no official affiliate URL builder implemented yet. Direct
        # URL fallback is allowed only outside affiliate-only mode, which is
        # the same local-dev behavior Cobasi uses for non-monetized discovery.
        if not settings.affiliate_only_commerce_enforced:
            return offer.direct_url, "direct", "catalog"

        return None

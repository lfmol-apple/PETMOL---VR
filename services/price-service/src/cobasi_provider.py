"""
CobasiProvider — implementação de CommerceProvider para a Cobasi.

find_offer(): busca dinâmica via commerce_pricing.fetch_cobasi_price — a
API pública VTEX da Cobasi, ao vivo. Roda para QUALQUER produto, sem
depender de link afiliado cadastrado previamente (ver commerce_provider.py
para o princípio geral).

monetize(): hoje só implementa a estratégia "cached" — usa o
ProductAffiliateLink cadastrado manualmente (docs/AFFILIATES.md), o único
mecanismo confirmado de monetização Cobasi até agora. Sem link cadastrado
para o EAN encontrado → não monetiza (oferta é descartada pelo
CommerceEngine, nunca exibida sem comissão). Modo configurável (UTM
dinâmica, API oficial futura) chega no próximo commit.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import get_active_link
from .commerce_pricing import fetch_cobasi_price
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
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

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str]]:
        return self._monetize_cached(offer, context)

    def _monetize_cached(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str]]:
        product_id = context.product_id
        if product_id is None and offer.ean:
            gtin_normalized = normalize_gtin(offer.ean)
            product = self._db.scalar(
                select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
            )
            product_id = product.id if product else None

        if product_id is not None:
            link = get_active_link(self._db, product_id, self.merchant)
            if link:
                return link.affiliate_product_url, "affiliate_product"

        # Sem link cadastrado: em dev, cai pra URL crua da Cobasi só pra
        # não travar o teste local a cada query — nunca em produção (ver
        # affiliate_only_commerce_enforced / docs/AFFILIATES.md).
        settings = get_settings()
        if not settings.affiliate_only_commerce_enforced and offer.direct_url:
            return offer.direct_url, "direct"

        return None

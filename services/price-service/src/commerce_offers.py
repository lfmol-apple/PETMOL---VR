"""
Oferta comercial monetizável para "Comprar novamente" (Loja do/da Pet).

Construído sobre CommerceEngine (commerce_provider.py) + CobasiProvider
(cobasi_provider.py) — discovery dinâmico (preço real via API pública VTEX
da Cobasi) sempre roda primeiro; ProductAffiliateLink é uma estratégia de
MONETIZAÇÃO (hoje a única real), não uma pré-condição para buscar o
produto. Ver docs/AFFILIATES.md.

resolve_cobasi_product_offer segue existindo como wrapper de
compatibilidade em torno do engine (mesma assinatura/formato de sempre),
para não precisar mudar o endpoint /commerce/product-offer nem o
frontend neste commit — GET /commerce/offers (multi-provider, lista
ordenada) chega em commit separado.
"""
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from .cobasi_provider import CobasiProvider
from .commerce_provider import CommerceEngine, MonetizedOffer, ProductContext


class ProductOfferResult(BaseModel):
    found: bool
    merchant: str = "cobasi"
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    url: Optional[str] = None
    link_type: Optional[str] = None  # "affiliate_product" | "direct" (dev only)


_NOT_FOUND = ProductOfferResult(found=False)


def _to_result(offer: MonetizedOffer) -> ProductOfferResult:
    return ProductOfferResult(
        found=True,
        merchant=offer.merchant,
        product_name=offer.product_name,
        brand=offer.brand,
        price=offer.price,
        list_price=offer.list_price,
        is_available=offer.is_available,
        url=offer.url,
        link_type=offer.link_type,
    )


async def resolve_cobasi_product_offer(
    db: Session, query: str, target_weight_kg: Optional[float] = None
) -> ProductOfferResult:
    engine = CommerceEngine([CobasiProvider(db)])
    offers = await engine.get_offers(ProductContext(query=query, weight_kg=target_weight_kg))
    if not offers:
        return _NOT_FOUND
    return _to_result(offers[0])

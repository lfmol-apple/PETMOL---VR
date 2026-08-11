"""
Oferta comercial monetizável para "Comprar novamente" (Loja do/da Pet).

Combina o preço real da Cobasi (commerce_pricing.py, API pública VTEX) com
o link afiliado cadastrado por produto (affiliate_links.py) — o preço por
si só nunca é uma oferta de compra; só passa a ser quando existe link
monetizável para o MESMO produto (casado por EAN, não por nome/marca).

Em produção (affiliate_only_commerce_enforced=True): sem link afiliado
ativo para o EAN encontrado → found=False, nunca cai para a URL crua da
Cobasi. Em dev, cai para a URL crua (link_type="direct") só para permitir
testar o fluxo sem precisar cadastrar um link a cada query.
"""
from typing import Optional

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import get_active_link
from .commerce_pricing import fetch_cobasi_price
from .config import get_settings
from .product_catalog_lookup import ProductCatalog, normalize_gtin


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


async def resolve_cobasi_product_offer(
    db: Session, query: str, target_weight_kg: Optional[float] = None
) -> ProductOfferResult:
    price = await fetch_cobasi_price(query, target_weight_kg=target_weight_kg)
    if not price.found or not price.price:
        return _NOT_FOUND

    settings = get_settings()
    dev_fallback_allowed = not settings.affiliate_only_commerce_enforced

    affiliate_url: Optional[str] = None
    if price.ean:
        gtin_normalized = normalize_gtin(price.ean)
        product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
        if product:
            link = get_active_link(db, product.id, "cobasi")
            if link:
                affiliate_url = link.affiliate_product_url

    if affiliate_url:
        return ProductOfferResult(
            found=True,
            merchant="cobasi",
            product_name=price.product_name,
            brand=price.brand,
            price=price.price,
            list_price=price.list_price,
            is_available=price.is_available,
            url=affiliate_url,
            link_type="affiliate_product",
        )

    if dev_fallback_allowed and price.url:
        return ProductOfferResult(
            found=True,
            merchant="cobasi",
            product_name=price.product_name,
            brand=price.brand,
            price=price.price,
            list_price=price.list_price,
            is_available=price.is_available,
            url=price.url,
            link_type="direct",
        )

    return _NOT_FOUND

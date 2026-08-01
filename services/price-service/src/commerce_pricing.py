"""
Preço real de produto para a Loja do Baby.

Usa a API pública de catálogo VTEX da Cobasi (a mesma que o storefront deles
usa internamente — não é scraping de HTML, é uma API JSON pública e sem
autenticação). Petz e Petlove bloqueiam esse mesmo padrão de acesso
(confirmado manualmente); só a Cobasi está disponível hoje.

Cache longo de propósito (commerce_pricing_cache_ttl, default 6h): o preço
não precisa ser por segundo para este caso de uso, e um cache longo reduz
bastante o volume de chamadas à Cobasi — o principal jeito de evitar sermos
bloqueados como Petz/Petlove já estão.

Erros (timeout, 403, JSON malformado, produto não encontrado) nunca
propagam — o chamador sempre recebe None nesses casos e cai de volta para
o link de busca normal, sem quebrar a experiência.
"""
import logging
import urllib.parse
from typing import Optional

import httpx
from cachetools import TTLCache
from pydantic import BaseModel

from .config import get_settings

logger = logging.getLogger(__name__)

_COBASI_SEARCH_URL = "https://www.cobasi.com.br/api/catalog_system/pub/products/search/{query}"
_COBASI_TIMEOUT = 6.0

_cache: TTLCache = TTLCache(maxsize=500, ttl=get_settings().commerce_pricing_cache_ttl)


class ProductPriceResult(BaseModel):
    found: bool
    store: str = "cobasi"
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    url: Optional[str] = None


def _cache_key(query: str) -> str:
    return query.strip().lower()


async def fetch_cobasi_price(query: str) -> ProductPriceResult:
    query = (query or "").strip()
    if not query:
        return ProductPriceResult(found=False)

    key = _cache_key(query)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    result = await _fetch_cobasi_price_uncached(query)
    _cache[key] = result
    return result


async def _fetch_cobasi_price_uncached(query: str) -> ProductPriceResult:
    settings = get_settings()
    if not settings.commerce_pricing_enabled:
        return ProductPriceResult(found=False)

    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(query))
    try:
        async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
            response = await client.get(
                url,
                params={"_from": 0, "_to": 0, "sc": 1},
                headers={"Accept": "application/json"},
            )
        if response.status_code not in (200, 206):
            logger.info("[commerce_pricing] cobasi status=%s query=%r", response.status_code, query)
            return ProductPriceResult(found=False)

        products = response.json()
        if not isinstance(products, list) or not products:
            return ProductPriceResult(found=False)

        product = products[0]
        items = product.get("items") or []
        offer: dict = {}
        if items:
            sellers = items[0].get("sellers") or []
            if sellers:
                offer = sellers[0].get("commertialOffer") or {}

        link_text = product.get("linkText")
        product_url = f"https://www.cobasi.com.br/{link_text}/p" if link_text else None

        price = offer.get("Price")
        return ProductPriceResult(
            found=bool(price),
            store="cobasi",
            product_name=product.get("productName"),
            brand=product.get("brand"),
            price=float(price) if isinstance(price, (int, float)) else None,
            list_price=float(offer["ListPrice"]) if isinstance(offer.get("ListPrice"), (int, float)) else None,
            is_available=offer.get("IsAvailable"),
            url=product_url,
        )
    except Exception as exc:
        logger.info("[commerce_pricing] cobasi lookup failed query=%r error=%s", query, exc)
        return ProductPriceResult(found=False)

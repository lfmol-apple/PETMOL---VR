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
import re
import urllib.parse
from typing import Any, Optional

import httpx
from cachetools import TTLCache
from pydantic import BaseModel

from .config import get_settings

logger = logging.getLogger(__name__)

_COBASI_SEARCH_URL = "https://www.cobasi.com.br/api/catalog_system/pub/products/search/{query}"
_COBASI_TIMEOUT = 6.0

_cache: TTLCache = TTLCache(maxsize=500, ttl=get_settings().commerce_pricing_cache_ttl)
_candidates_cache: TTLCache = TTLCache(maxsize=500, ttl=get_settings().commerce_pricing_cache_ttl)


class ProductPriceResult(BaseModel):
    found: bool
    store: str = "cobasi"
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    url: Optional[str] = None
    # EAN do SKU retornado pela própria API VTEX da Cobasi (campo `ean` do
    # item) — usado para cruzar com products_catalog.barcode_normalized e
    # achar um link afiliado por produto, sem precisar de GTIN vindo do
    # frontend. Ver affiliate_links.py / commerce_offers.py.
    ean: Optional[str] = None


def _cache_key(query: str, target_weight_kg: Optional[float]) -> str:
    weight_part = f"{target_weight_kg:.2f}" if target_weight_kg is not None else "-"
    return f"{weight_part}:{query.strip().lower()}"


async def fetch_cobasi_price(query: str, target_weight_kg: Optional[float] = None) -> ProductPriceResult:
    query = (query or "").strip()
    if not query:
        return ProductPriceResult(found=False)

    key = _cache_key(query, target_weight_kg)
    cached = _cache.get(key)
    if cached is not None:
        return cached

    result = await _fetch_cobasi_price_uncached(query, target_weight_kg)
    _cache[key] = result
    return result


def _select_item_by_weight(items: list[dict], target_weight_kg: Optional[float]) -> dict:
    """Cobasi agrupa vários tamanhos de pacote (SKUs) sob o mesmo produto —
    `items[0]` é só a ordem padrão do catálogo deles, não necessariamente o
    pacote que o tutor tem. Quando sabemos o peso real (package_size_kg do
    plano de alimentação), escolhemos o item cujo peso extraído do nome bate
    exatamente; sem isso (ou sem bater nenhum), mantém o comportamento
    anterior (primeiro item) — nunca regride quando não há peso alvo.
    """
    if not items:
        return {}
    if target_weight_kg is None:
        return items[0]

    for item in items:
        text = item.get("nameComplete") or item.get("name") or ""
        sizes = _extract_pack_sizes(text)
        if not sizes:
            continue
        value_kg = sizes[0]["value"] / 1000 if sizes[0]["unit"] == "g" else sizes[0]["value"]
        if round(value_kg, 2) == round(target_weight_kg, 2):
            return item

    return items[0]


async def _fetch_cobasi_price_uncached(query: str, target_weight_kg: Optional[float] = None) -> ProductPriceResult:
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
        selected_item = _select_item_by_weight(items, target_weight_kg)
        offer: dict = {}
        ean: Optional[str] = None
        if selected_item:
            sellers = selected_item.get("sellers") or []
            if sellers:
                offer = sellers[0].get("commertialOffer") or {}
            raw_ean = selected_item.get("ean")
            if isinstance(raw_ean, str) and raw_ean.strip().isdigit():
                ean = raw_ean.strip()

        link_text = product.get("linkText")
        product_url = f"https://www.cobasi.com.br/{link_text}/p" if link_text else None

        price = offer.get("Price")
        return ProductPriceResult(
            found=bool(price),
            store="cobasi",
            product_name=selected_item.get("nameComplete") or product.get("productName"),
            brand=product.get("brand"),
            price=float(price) if isinstance(price, (int, float)) else None,
            list_price=float(offer["ListPrice"]) if isinstance(offer.get("ListPrice"), (int, float)) else None,
            is_available=offer.get("IsAvailable"),
            url=product_url,
            ean=ean,
        )
    except Exception as exc:
        logger.info("[commerce_pricing] cobasi lookup failed query=%r error=%s", query, exc)
        return ProductPriceResult(found=False)


# ── Múltiplos candidatos (reconhecimento por foto) ─────────────────────────
# A mesma API, mas devolvendo até N produtos em vez de só o primeiro, no
# formato que o resolver do frontend já sabe pontuar (CatalogSearchApiCandidate
# em resolver.ts) — isso alimenta o MESMO pipeline de scoring já validado
# (marca, porte, castrado, conflito terapêutico, tokens de identidade), só
# que com um catálogo de produtos que a Cobasi mantém atualizado sozinha, em
# vez de depender de cadastrarmos cada ração manualmente.

_WEIGHT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g)\b", re.IGNORECASE)


def _extract_pack_sizes(text: str) -> list[dict]:
    match = _WEIGHT_RE.search(text)
    if not match:
        return []
    try:
        value = float(match.group(1).replace(",", "."))
    except ValueError:
        return []
    return [{"value": value, "unit": match.group(2).lower()}]


def _infer_species(text: str) -> Optional[str]:
    lowered = text.lower()
    if "gato" in lowered or "felin" in lowered:
        return "cat"
    # "canin"/"canine" removed as dog markers: they matched the brand name
    # "Royal Canin" as a false positive, misclassifying real Royal Canin CAT
    # products (e.g. "Mother & Babycat") as dog — confirmed against 3 real
    # entries in the live Cobasi catalog. "cão"/"cães"/"caes" are unambiguous
    # Portuguese markers and don't have this collision.
    if "cão" in lowered or "caes" in lowered or "cães" in lowered:
        return "dog"
    return None


def _infer_life_stage(text: str) -> Optional[str]:
    lowered = text.lower()
    if "filhote" in lowered or "puppy" in lowered or "kitten" in lowered:
        return "puppy"
    if "sênior" in lowered or "senior" in lowered or "mature" in lowered or "idoso" in lowered:
        return "senior"
    if "adulto" in lowered or "adult" in lowered:
        return "adult"
    return None


def _infer_port(text: str) -> Optional[str]:
    lowered = text.lower()
    if "mini" in lowered:
        return "mini"
    if "pequeno" in lowered or "pequena" in lowered or "small" in lowered:
        return "pequeno"
    if "médio" in lowered or "medio" in lowered or "media" in lowered or "medium" in lowered:
        return "medio"
    if "gigante" in lowered or "giant" in lowered:
        return "gigante"
    if "grande" in lowered or "large" in lowered:
        return "grande"
    return None


def _cobasi_product_to_candidate(product: dict) -> Optional[dict]:
    name = product.get("productName")
    brand = product.get("brand")
    if not name or not brand:
        return None
    link_text = product.get("linkText")
    text = f"{name} {product.get('productTitle') or ''}"
    items = product.get("items") or []
    pack_sizes = _extract_pack_sizes(name)
    if not pack_sizes and items:
        pack_sizes = _extract_pack_sizes(items[0].get("nameComplete") or items[0].get("name") or "")
    return {
        "source": "cobasi",
        "title": name,
        "brand": brand,
        "variant": None,
        "species": _infer_species(text),
        "life_stage": _infer_life_stage(text),
        "port": _infer_port(text),
        "neutered": None,
        "pack_sizes": pack_sizes,
        "url": f"https://www.cobasi.com.br/{link_text}/p" if link_text else None,
    }


async def search_cobasi_candidates(query: str, limit: int = 6) -> list[dict]:
    query = (query or "").strip()
    if not query:
        return []

    key = f"{limit}:{_cache_key(query)}"
    cached = _candidates_cache.get(key)
    if cached is not None:
        return cached

    result = await _search_cobasi_candidates_uncached(query, limit)
    _candidates_cache[key] = result
    return result


async def _search_cobasi_candidates_uncached(query: str, limit: int) -> list[dict]:
    settings = get_settings()
    if not settings.commerce_pricing_enabled:
        return []

    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(query))
    try:
        async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
            response = await client.get(
                url,
                params={"_from": 0, "_to": max(0, limit - 1)},
                headers={"Accept": "application/json"},
            )
        if response.status_code not in (200, 206):
            logger.info("[commerce_pricing] cobasi candidates status=%s query=%r", response.status_code, query)
            return []

        products: Any = response.json()
        if not isinstance(products, list):
            return []

        candidates: list[dict] = []
        for product in products[:limit]:
            candidate = _cobasi_product_to_candidate(product)
            if candidate:
                candidates.append(candidate)
        return candidates
    except Exception as exc:
        logger.info("[commerce_pricing] cobasi candidates lookup failed query=%r error=%s", query, exc)
        return []

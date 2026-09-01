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
# Busca por EAN exato (código de barras) — o SKU certo, sem depender de
# desambiguação por texto. É o caminho principal quando o PETMOL sabe o GTIN.
_COBASI_EAN_SEARCH_URL = "https://www.cobasi.com.br/api/catalog_system/pub/products/search"
_COBASI_TIMEOUT = 6.0

_cache: TTLCache = TTLCache(maxsize=500, ttl=get_settings().commerce_pricing_cache_ttl)
_gtin_cache: TTLCache = TTLCache(maxsize=500, ttl=get_settings().commerce_pricing_cache_ttl)
_candidates_cache: TTLCache = TTLCache(maxsize=500, ttl=get_settings().commerce_pricing_cache_ttl)


def _digits(value: Optional[str]) -> str:
    return "".join(ch for ch in (value or "") if ch.isdigit())


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


def _cache_key(query: str, target_weight_kg: Optional[float] = None) -> str:
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


async def fetch_cobasi_price_by_gtin(gtin: str) -> ProductPriceResult:
    """Resolve o produto Cobasi pelo EAN exato (código de barras) via a API
    VTEX (`fq=alternateIds_Ean:`). Devolve o SKU cujo `ean` bate com o GTIN
    — nunca uma variante vizinha. `found=False` quando o GTIN não existe no
    catálogo da Cobasi (aí o chamador NÃO deve cair pra busca por texto —
    ver CobasiProvider.find_offer)."""
    gtin_n = _digits(gtin)
    if not gtin_n:
        return ProductPriceResult(found=False)

    cached = _gtin_cache.get(gtin_n)
    if cached is not None:
        return cached

    settings = get_settings()
    if not settings.commerce_pricing_enabled:
        return ProductPriceResult(found=False)

    try:
        result = await _fetch_cobasi_by_gtin_uncached(gtin_n)
    except Exception as exc:  # noqa: BLE001 — nunca propaga (ver docstring do módulo)
        logger.info("[commerce_pricing] cobasi EAN lookup failed gtin=%s error=%s", gtin_n, exc)
        result = ProductPriceResult(found=False)

    _gtin_cache[gtin_n] = result
    return result


async def _fetch_cobasi_by_gtin_uncached(gtin_n: str) -> ProductPriceResult:
    async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
        response = await client.get(
            _COBASI_EAN_SEARCH_URL,
            params={"fq": f"alternateIds_Ean:{gtin_n}", "_from": 0, "_to": 3, "sc": 1},
            headers={"Accept": "application/json"},
        )
    if response.status_code not in (200, 206):
        logger.info("[commerce_pricing] cobasi EAN status=%s gtin=%s", response.status_code, gtin_n)
        return ProductPriceResult(found=False)

    products = response.json()
    if not isinstance(products, list) or not products:
        return ProductPriceResult(found=False)

    product = products[0]
    items = product.get("items") or []
    # o SKU EXATO é o item cujo ean bate com o GTIN pedido
    exact = next((it for it in items if _digits(it.get("ean")) == gtin_n), None)
    if exact is None:
        # o fq casou o produto mas nenhum item expõe esse ean diretamente
        # (raro) — sem SKU exato, não arrisca; melhor não ofertar.
        return ProductPriceResult(found=False)

    sellers = exact.get("sellers") or []
    offer = (sellers[0].get("commertialOffer") or {}) if sellers else {}
    price = offer.get("Price")

    link = product.get("link") or (
        f"https://www.cobasi.com.br/{product['linkText']}/p" if product.get("linkText") else None
    )
    if link and exact.get("itemId"):
        sep = "&" if "?" in link else "?"
        link = f"{link}{sep}skuId={exact['itemId']}"

    return ProductPriceResult(
        found=bool(price),
        store="cobasi",
        product_name=product.get("productName"),
        brand=product.get("brand"),
        price=float(price) if isinstance(price, (int, float)) else None,
        list_price=float(offer["ListPrice"]) if isinstance(offer.get("ListPrice"), (int, float)) else None,
        is_available=offer.get("IsAvailable"),
        url=link,
        ean=gtin_n,
    )


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


def _shorten_query_variants(query: str) -> list[str]:
    """Consultas muito longas/descritivas (ex: texto integral do produto
    vindo do scanner) podem não bater em NADA na busca da Cobasi mesmo
    quando o produto existe lá — confirmado com um caso real (ração
    Premier Gastrointestinal: a string completa de 13 palavras não
    encontra nada, mas os primeiros termos + a última palavra encontram o
    produto certo). Gera prefixos mais curtos, preservando a última
    palavra (geralmente a categoria, ex: "ração"), pra tentar de novo
    antes de desistir. Poucas tentativas, mais curtas primeiro nunca —
    da mais específica pra menos específica, pra não perder precisão
    quando a busca completa já funcionaria.
    """
    words = query.split()
    if len(words) <= 6:
        return []

    last_word = words[-1]
    variants = []
    for word_count in (6, 3):
        if len(words) <= word_count:
            continue
        prefix_words = words[:word_count]
        if prefix_words[-1] != last_word:
            prefix_words.append(last_word)
        variants.append(" ".join(prefix_words))
    return variants


def _select_product_by_port(products: list[dict], query: str) -> dict:
    """A Cobasi pode devolver vários produtos distintos pra mesma busca
    (não só variantes de peso do MESMO produto) — ex: "Ração Premier ...
    Raças Pequenas" E "... Raças Médias e Grandes" pra uma busca sobre
    ração de porte médio/grande, com "Pequenas" rankeada primeiro pela
    própria Cobasi. Sem isso, o primeiro resultado pode ser o porte
    errado mesmo com a query "certa". Quando a query menciona um porte,
    prefere o produto cujo nome também infere esse porte; sem porte na
    query (ou sem produto batendo), mantém o primeiro resultado — nunca
    piora o caso comum (produto único, ex: Royal Canin Urinary)."""
    if not products:
        return {}
    query_port = _infer_port(query)
    if query_port:
        for product in products:
            if _infer_port(product.get("productName") or "") == query_port:
                return product
    return products[0]


async def _search_cobasi_once(
    query: str, target_weight_kg: Optional[float], port_reference_text: Optional[str] = None
) -> ProductPriceResult:
    """`port_reference_text`: texto usado só para desambiguar porte entre
    vários produtos retornados — sempre a query ORIGINAL completa, mesmo
    quando `query` (o que de fato vai pra busca) é um fallback encurtado
    que já perdeu a palavra de porte (ver _shorten_query_variants)."""
    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(query))
    async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
        response = await client.get(
            url,
            params={"_from": 0, "_to": 4, "sc": 1},
            headers={"Accept": "application/json"},
        )
    if response.status_code not in (200, 206):
        logger.info("[commerce_pricing] cobasi status=%s query=%r", response.status_code, query)
        return ProductPriceResult(found=False)

    products = response.json()
    if not isinstance(products, list) or not products:
        return ProductPriceResult(found=False)

    product = _select_product_by_port(products, port_reference_text or query)
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


async def _fetch_cobasi_price_uncached(query: str, target_weight_kg: Optional[float] = None) -> ProductPriceResult:
    settings = get_settings()
    if not settings.commerce_pricing_enabled:
        return ProductPriceResult(found=False)

    try:
        result = await _search_cobasi_once(query, target_weight_kg)
        if result.found:
            return result

        for fallback_query in _shorten_query_variants(query):
            result = await _search_cobasi_once(fallback_query, target_weight_kg, port_reference_text=query)
            if result.found:
                logger.info("[commerce_pricing] cobasi fallback query matched: %r -> %r", query, fallback_query)
                return result

        return result
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
    # "média"/"médias" (concordância de gênero com "raça") não batiam com
    # "médio"/"media" (sem acento) — confirmado com um caso real (Premier
    # Gastrointestinal "Cães Raças Médias e Grandes" caindo no check de
    # "grande" abaixo em vez de "medio", já que só "grandes" batia).
    if "médio" in lowered or "medio" in lowered or "média" in lowered or "médias" in lowered or "medium" in lowered:
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

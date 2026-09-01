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
from dataclasses import dataclass
from typing import Any, Optional

import httpx
from cachetools import TTLCache
from pydantic import BaseModel

from .config import get_settings
from .shopee_offer_matcher import (
    _normalize as _norm_text,
    _tokenize as _tokenize_text,
    extract_length_cm,
    extract_pack_count,
    extract_volume_ml,
    extract_weight_kg,
    score_candidate,
)

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
    # Motivo curto e não sensível do resultado — só para observabilidade
    # (CobasiProvider loga isto). Valores: "ok" | "empty_query" | "disabled"
    # | "http_error" | "no_results" | "no_price" | "timeout" | "error".
    reason: str = "ok"


def _cache_key(query: str, target_weight_kg: Optional[float] = None) -> str:
    weight_part = f"{target_weight_kg:.2f}" if target_weight_kg is not None else "-"
    return f"{weight_part}:{query.strip().lower()}"


async def fetch_cobasi_price(query: str, target_weight_kg: Optional[float] = None) -> ProductPriceResult:
    query = (query or "").strip()
    if not query:
        return ProductPriceResult(found=False, reason="empty_query")

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
    try:
        async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
            response = await client.get(
                url,
                params={"_from": 0, "_to": 4, "sc": 1},
                headers={"Accept": "application/json"},
            )
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        logger.info("[commerce_pricing] cobasi timeout/connect query=%r error=%s", query, type(exc).__name__)
        return ProductPriceResult(found=False, reason="timeout")
    if response.status_code not in (200, 206):
        logger.info("[commerce_pricing] cobasi status=%s query=%r", response.status_code, query)
        return ProductPriceResult(found=False, reason="http_error")

    products = response.json()
    if not isinstance(products, list) or not products:
        return ProductPriceResult(found=False, reason="no_results")

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
        reason="ok" if price else "no_price",
    )


# ── Identidade estrutural: aceitar uma oferta Cobasi só quando dá pra
#    PROVAR que é a mesma apresentação do produto do tutor ────────────────────
#
# Sem isto, `_search_cobasi_once` pegava products[0] / items[0] e devolvia o
# preço — mesmo quando era ração de gato 1 kg no lugar de ração de cão 15 kg
# (falso positivo confirmado em produção). Filosofia: melhor não mostrar
# preço do que mostrar preço de produto errado.
#
# Não usa PREÇO como prova de identidade — só atributos objetivos do produto.

def _digits(value: Optional[str]) -> str:
    return re.sub(r"\D", "", value or "")


@dataclass
class CobasiIdentitySpec:
    """O que sabemos do produto do tutor, para cruzar com cada candidato VTEX."""
    reference_name: Optional[str] = None
    brand: Optional[str] = None
    species: Optional[str] = None          # "dog" | "cat"
    gtin: Optional[str] = None
    weight_kg: Optional[float] = None
    volume_ml: Optional[float] = None
    length_cm: Optional[float] = None
    pack_count: Optional[int] = None

    @classmethod
    def build(
        cls,
        *,
        reference_name: Optional[str],
        brand: Optional[str] = None,
        species: Optional[str] = None,
        gtin: Optional[str] = None,
        weight_kg: Optional[float] = None,
    ) -> "CobasiIdentitySpec":
        ref = (reference_name or "").strip() or None
        return cls(
            reference_name=ref,
            brand=(brand or "").strip() or None,
            species=(species or _infer_species(ref or "")) or None,
            gtin=(gtin or "").strip() or None,
            weight_kg=weight_kg if weight_kg is not None else (extract_weight_kg(ref) if ref else None),
            volume_ml=extract_volume_ml(ref) if ref else None,
            length_cm=extract_length_cm(ref) if ref else None,
            pack_count=extract_pack_count(ref) if ref else None,
        )

    def fingerprint(self) -> str:
        return "|".join(
            str(x) for x in (
                (self.reference_name or "").lower(), (self.brand or "").lower(), self.species,
                self.gtin, self.weight_kg, self.volume_ml, self.length_cm, self.pack_count,
            )
        )


def _candidate_identity_verdict(
    spec: CobasiIdentitySpec, product_name: str, sku_name: str, sku_ean: Optional[str]
) -> tuple[bool, str]:
    """(aceita?, motivo). Hard reject em qualquer contradição objetiva de
    espécie / peso / volume / cm / contagem de unidades / linha-variante
    (via score_candidate). Aceita só com evidência positiva de identidade —
    caso contrário, fail closed ("insufficient_identity_evidence")."""
    cand = f"{product_name or ''} {sku_name or ''}".strip()

    exp_gtin, act_gtin = _digits(spec.gtin), _digits(sku_ean)
    if exp_gtin and act_gtin:
        return (act_gtin == exp_gtin, "ean_equal" if act_gtin == exp_gtin else "ean_mismatch")

    # ── contradições objetivas ────────────────────────────────────────────
    if spec.species:
        cand_species = _infer_species(cand)
        if cand_species and cand_species != spec.species:
            return (False, "species_mismatch")

    hard_checked = 0
    if spec.weight_kg is not None:
        cw = extract_weight_kg(cand)
        if cw is None:
            return (False, "weight_unverifiable")
        if abs(cw - spec.weight_kg) > max(0.05, spec.weight_kg * 0.06):
            return (False, "weight_mismatch")
        hard_checked += 1
    if spec.volume_ml is not None:
        cv = extract_volume_ml(cand)
        if cv is None:
            return (False, "volume_unverifiable")
        if abs(cv - spec.volume_ml) > max(20.0, spec.volume_ml * 0.06):
            return (False, "volume_mismatch")
        hard_checked += 1
    if spec.length_cm is not None:
        cl = extract_length_cm(cand)
        if cl is None:
            return (False, "length_unverifiable")
        if abs(cl - spec.length_cm) > 2.0:
            return (False, "length_mismatch")
        hard_checked += 1
    if spec.pack_count is not None:
        cp = extract_pack_count(cand)
        if cp is None or cp != spec.pack_count:
            return (False, "pack_count_mismatch")
        hard_checked += 1

    # ── camada marca + tokens + grupos distintivos (idade/porte/linha) ────
    score: Optional[float] = None
    if spec.reference_name:
        score = score_candidate(
            spec.reference_name, cand,
            expected_brand=spec.brand,
            expected_weight_kg=spec.weight_kg,
            expected_volume_ml=spec.volume_ml,
            expected_length_cm=spec.length_cm,
        )
        if score is None:
            return (False, "structural_mismatch")

    brand_in_text = bool(spec.brand) and _norm_text(spec.brand) in _norm_text(cand)
    ref_token_count = len(_tokenize_text(spec.reference_name)) if spec.reference_name else 0

    # ── evidência positiva exigida (fail closed) ─────────────────────────
    if score is not None and score >= 0.55 and hard_checked >= 1:
        return (True, "structural_match")          # marca + discriminador de tamanho/qtd
    if brand_in_text and hard_checked >= 1:
        return (True, "brand_plus_attr_match")     # sem nome de referência, mas marca + discriminador
    if score is not None and score >= 0.80 and ref_token_count >= 4:
        return (True, "strong_name_match")         # nome de produto rico e específico, marca confirmada
    return (False, "insufficient_identity_evidence")


def _summarize_reject_reasons(reasons: list[str]) -> str:
    for tag in ("ean_mismatch", "species_mismatch", "weight_mismatch", "length_mismatch",
                "volume_mismatch", "pack_count_mismatch", "structural_mismatch"):
        if tag in reasons:
            return tag if tag in ("ean_mismatch", "species_mismatch") else "variant_mismatch"
    if "insufficient_identity_evidence" in reasons:
        return "insufficient_identity_evidence"
    if "no_price" in reasons:
        return "no_price"
    return "no_results"


def _iter_vtex_sku_candidates(products: list) -> "list[tuple[dict, dict, dict, Optional[str]]]":
    """(product, item, commertialOffer, ean) para TODOS os SKUs de TODOS os
    produtos retornados — em vez de só products[0]/items[0]."""
    out: list[tuple[dict, dict, dict, Optional[str]]] = []
    for product in products:
        if not isinstance(product, dict):
            continue
        for item in product.get("items") or []:
            sellers = item.get("sellers") or []
            offer = (sellers[0].get("commertialOffer") if sellers else None) or {}
            raw_ean = item.get("ean")
            ean = raw_ean.strip() if isinstance(raw_ean, str) and raw_ean.strip().isdigit() else None
            out.append((product, item, offer, ean))
    return out


async def _search_cobasi_matched_once(query: str, spec: CobasiIdentitySpec) -> ProductPriceResult:
    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(query))
    try:
        async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
            response = await client.get(
                url, params={"_from": 0, "_to": 9, "sc": 1}, headers={"Accept": "application/json"}
            )
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        logger.info("[commerce_pricing] cobasi matched timeout query=%r err=%s", query, type(exc).__name__)
        return ProductPriceResult(found=False, reason="timeout")
    if response.status_code not in (200, 206):
        return ProductPriceResult(found=False, reason="http_error")
    products = response.json()
    if not isinstance(products, list) or not products:
        return ProductPriceResult(found=False, reason="no_results")

    reject_reasons: list[str] = []
    best: Optional[ProductPriceResult] = None
    for product, item, offer, ean in _iter_vtex_sku_candidates(products):
        p_name = product.get("productName") or ""
        sku_name = item.get("nameComplete") or item.get("name") or ""
        ok, reason = _candidate_identity_verdict(spec, p_name, sku_name, ean)
        if not ok:
            reject_reasons.append(reason)
            continue
        price = offer.get("Price")
        if not isinstance(price, (int, float)) or not price:
            reject_reasons.append("no_price")
            continue
        link_text = product.get("linkText")
        result = ProductPriceResult(
            found=True, store="cobasi",
            product_name=sku_name or p_name,
            brand=product.get("brand"),
            price=float(price),
            list_price=float(offer["ListPrice"]) if isinstance(offer.get("ListPrice"), (int, float)) else None,
            is_available=offer.get("IsAvailable"),
            url=f"https://www.cobasi.com.br/{link_text}/p" if link_text else None,
            ean=ean,
            reason=reason,
        )
        if reason == "ean_equal":          # prova mais forte — para aqui
            return result
        if best is None:
            best = result                   # 1º candidato estruturalmente válido (ordem VTEX = determinística)

    if best is not None:
        return best
    return ProductPriceResult(found=False, reason=_summarize_reject_reasons(reject_reasons))


async def fetch_cobasi_price_matched(
    query: str, spec: CobasiIdentitySpec, *, target_weight_kg: Optional[float] = None
) -> ProductPriceResult:
    """Como fetch_cobasi_price, mas só devolve uma oferta quando a
    identidade do produto pode ser PROVADA contra `spec`. Examina todos os
    SKUs de todos os resultados VTEX, não só o primeiro."""
    query = (query or "").strip()
    if not query:
        return ProductPriceResult(found=False, reason="empty_query")
    if not get_settings().commerce_pricing_enabled:
        return ProductPriceResult(found=False, reason="disabled")

    key = f"m:{spec.fingerprint()}::{_cache_key(query, target_weight_kg)}"
    cached = _cache.get(key)
    if cached is not None:
        return cached
    try:
        result = await _search_cobasi_matched_once(query, spec)
        if not result.found:
            for fq in _shorten_query_variants(query):
                fb = await _search_cobasi_matched_once(fq, spec)
                if fb.found:
                    result = fb
                    break
                if fb.reason in ("timeout", "http_error"):
                    result = fb
    except Exception as exc:
        logger.info("[commerce_pricing] cobasi matched failed query=%r err=%s", query, type(exc).__name__)
        result = ProductPriceResult(found=False, reason="error")
    _cache[key] = result
    return result


async def _fetch_cobasi_price_uncached(query: str, target_weight_kg: Optional[float] = None) -> ProductPriceResult:
    settings = get_settings()
    if not settings.commerce_pricing_enabled:
        return ProductPriceResult(found=False, reason="disabled")

    try:
        result = await _search_cobasi_once(query, target_weight_kg)
        if result.found:
            return result

        for fallback_query in _shorten_query_variants(query):
            fb = await _search_cobasi_once(fallback_query, target_weight_kg, port_reference_text=query)
            if fb.found:
                logger.info("[commerce_pricing] cobasi fallback query matched: %r -> %r", query, fallback_query)
                return fb
            # Um fallback que deu timeout/erro é mais informativo que o
            # "no_results" da busca principal — propaga esse motivo.
            if fb.reason in ("timeout", "http_error"):
                result = fb

        return result
    except Exception as exc:
        logger.info("[commerce_pricing] cobasi lookup failed query=%r error=%s", query, type(exc).__name__)
        return ProductPriceResult(found=False, reason="error")


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

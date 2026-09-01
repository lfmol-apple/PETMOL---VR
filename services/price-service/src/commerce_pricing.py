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

# O WAF da VTEX rejeita a busca ("Bad Request! Scripts are not allowed!") quando
# o termo tem aspas/apóstrofo ou caracteres de marcação — "Hill's", 'K/D', etc.
_QUERY_STRIP_RE = re.compile(r"[\"'`´^~<>|;{}\[\]\\]+")


def _sanitize_query(query: str) -> str:
    """Termo seguro para o path da busca VTEX: sem aspas/apóstrofo/marcação,
    barra vira espaço (senão o `/` corta o path), espaços colapsados."""
    cleaned = _QUERY_STRIP_RE.sub(" ", query or "")
    cleaned = cleaned.replace("/", " ")
    return re.sub(r"\s+", " ", cleaned).strip()


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
    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(_sanitize_query(query), safe=""))
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


# ── Identidade de produto: MATCH / MISMATCH / UNKNOWN ──────────────────────
#
# Três estados, regra fundamental AUSENTE != DIFERENTE:
#   MATCH    — evidência positiva suficiente de que é a mesma apresentação
#              (EAN exato; ou marca + discriminador objetivo + nome
#              compatível, sem especialização não corroborada).
#   MISMATCH — contradição objetiva: EAN conhecido divergente, espécie
#              oposta, peso/volume/cm/quantidade DECLARADOS e incompatíveis,
#              ou especialização (idade/linha/veterinária) explicitamente
#              diferente da esperada.
#   UNKNOWN  — falta informação para provar OU rejeitar. Antes de ficar
#              UNKNOWN, o atributo é procurado nos DEMAIS campos VTEX da
#              MESMA resposta (Peso da Ração, variations, customLabel0
#              Departamento, Idade, Linha, Raças...). Sem chamada extra.
#
# Preço NUNCA é evidência de identidade.
# Rota EAN-exato (fq=alternateIds_Ean) tem prioridade sobre busca textual —
# ver fetch_cobasi_price_by_ean / cobasi_provider.find_offer.

from enum import Enum

_COBASI_EAN_SEARCH_URL = "https://www.cobasi.com.br/api/catalog_system/pub/products/search"

# Palavras de categoria genérica — não contam como "token discriminante" de um
# nome de referência rico (ex: "Royal Canin ração" só tem marca + categoria).
_GENERIC_CATEGORY_TOKENS = frozenset({
    "racao", "raça", "alimento", "comida", "petisco", "snack",
    "coleira", "shampoo", "condicionador", "sabonete", "colonia", "perfume",
    "vermifugo", "antipulgas", "antiparasitario", "vermicida", "medicamento",
    "remedio", "suplemento", "pet", "caes", "cao", "cães", "gato", "gatos",
    "para", "kit", "un", "und", "unidade",
})
# Único grupo distintivo que pode aparecer no candidato sem estar no nome
# esperado: "adulto" é o padrão mainstream. Filhote/sênior, linha racial e
# linha veterinária mudam a identidade comercial e precisam ser corroborados.
_MAINSTREAM_GROUP_TOKENS = frozenset({"adulto", "adult", "adults"})
_RACIAL_LINE_MARKERS = ("racas especificas", "raca especifica")


class MatchState(str, Enum):
    MATCH = "match"
    MISMATCH = "mismatch"
    UNKNOWN = "unknown"


def _digits(value: Optional[str]) -> str:
    return re.sub(r"\D", "", value or "")


def _accepts(state: "MatchState") -> bool:
    return state == MatchState.MATCH


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

    def rich_reference_tokens(self) -> int:
        """Tokens do nome de referência que discriminam de fato (fora marca
        e categoria genérica) — ex: "urinary", "small", "dog", "frango"."""
        if not self.reference_name:
            return 0
        brand_tokens = _tokenize_text(self.brand or "")
        toks = _tokenize_text(self.reference_name) - brand_tokens - _GENERIC_CATEGORY_TOKENS
        return len(toks)


def _spec_values(product: Optional[dict], *keys: str) -> list[str]:
    """Valores (minúsculos, sem acento) de campos de specification VTEX já
    presentes na resposta — cada campo é uma lista. Nunca faz chamada de rede."""
    if not product:
        return []
    out: list[str] = []
    for k in keys:
        v = product.get(k)
        if isinstance(v, list):
            out.extend(_norm_text(str(x)).strip() for x in v if str(x).strip())
        elif isinstance(v, str) and v.strip():
            out.append(_norm_text(v).strip())
    return out


def _sku_variation_values(item: Optional[dict]) -> list[str]:
    if not item:
        return []
    out: list[str] = []
    for var in item.get("variations") or []:
        vals = item.get(var)
        if isinstance(vals, list):
            out.extend(str(x) for x in vals)
        elif isinstance(vals, str):
            out.append(vals)
    return out


def _candidate_weight_kg(text: str, product: Optional[dict], item: Optional[dict]) -> Optional[float]:
    """Peso do SKU — nome, depois item.name/variations do SKU, depois
    'Peso da Ração'/'Peso' do produto SÓ quando é valor único (não ambíguo
    entre SKUs). AUSENTE (None) nunca é tratado como DIFERENTE."""
    w = extract_weight_kg(text)
    if w is not None:
        return w
    if item is not None:
        w = extract_weight_kg(str(item.get("name") or ""))
        if w is not None:
            return w
        for val in _sku_variation_values(item):
            w = extract_weight_kg(val)
            if w is not None:
                return w
    parsed = [x for x in (extract_weight_kg(p) for p in _spec_values(product, "Peso da Ração", "Peso", "Peso do Produto", "Peso Aproximado")) if x is not None]
    if parsed and len({round(p, 3) for p in parsed}) == 1:
        return parsed[0]
    return None


def _candidate_volume_ml(text: str, product: Optional[dict], item: Optional[dict]) -> Optional[float]:
    v = extract_volume_ml(text)
    if v is not None:
        return v
    if item is not None:
        v = extract_volume_ml(str(item.get("name") or ""))
        if v is not None:
            return v
        for val in _sku_variation_values(item):
            v = extract_volume_ml(val)
            if v is not None:
                return v
    parsed = [x for x in (extract_volume_ml(p) for p in _spec_values(product, "Volume", "Conteudo", "Conteúdo")) if x is not None]
    if parsed and len({round(p, 1) for p in parsed}) == 1:
        return parsed[0]
    return None


_DOG_WORDS = frozenset({"cao", "caes", "cachorro", "cachorros", "canino", "caninos", "dog", "dogs", "cadela", "cadelas"})
_CAT_WORDS = frozenset({"gato", "gatos", "gata", "gatas", "felino", "felinos", "cat", "cats", "kitten"})


def _candidate_species(text: str, product: Optional[dict]) -> Optional[str]:
    words = set(re.findall(r"[a-z]+", _norm_text(text)))
    words |= {w for val in _spec_values(product, "customLabel0 Departamento", "Departamento",
                                        "Tipo de Pet", "Genero Pet") for w in re.findall(r"[a-z]+", val)}
    has_dog = bool(words & _DOG_WORDS)
    has_cat = bool(words & _CAT_WORDS)
    if has_dog and has_cat:      # produto para as duas espécies — sem contradição
        return None
    if has_cat:
        return "cat"
    if has_dog:
        return "dog"
    return None


_AGE_LIKE = frozenset({"filhote", "filhotes", "puppy", "junior", "senior", "sênior", "idoso", "idosos", "mature"})
_VET_LIKE = frozenset({"urinary", "urinario", "urinaria", "renal", "kidney", "hypoallergenic",
                       "hipoalergenico", "hipoalergenica", "gastrointestinal", "digestive",
                       "dermatologic", "dermatologica", "dermatologico", "obesity", "satiety",
                       "obesidade", "metabolic", "diabetic", "diabetico", "hepatic", "hepatico",
                       "recovery", "convalescence", "mobility", "cardiac", "neutered", "anallergenic"})
_VET_REFERENCE_PHRASES = ("prescription diet", "veterinary diet", "veterinary", "veterinario",
                          "veterinaria", "cuidado renal", "cuidado gastrointestinal",
                          "trato urinario", "s o small", "clinical")


def _candidate_specializations(cand_tokens: set, product: Optional[dict]) -> set:
    """Especializações NÃO-mainstream do candidato — precisam estar
    corroboradas no nome esperado. Idade filhote/sênior, linha racial e
    linha veterinária. Porte/tamanho fica de fora de propósito: descreve
    faixa de uso (ex: coleira "Cães Pequenos e Médios 48 cm"), não
    identidade, e o discriminador forte nesses casos é o cm/peso exato."""
    from .shopee_offer_matcher import _DISTINCTIVE_GROUPS

    out: set = set()
    for group in _DISTINCTIVE_GROUPS:
        if not (cand_tokens & group) or (group & _MAINSTREAM_GROUP_TOKENS):
            continue
        if group & _AGE_LIKE:
            out.add(("age", frozenset(group)))
        elif group & _VET_LIKE:
            out.add(("vet", frozenset(group)))
    if cand_tokens & _AGE_LIKE:
        out.add(("age", frozenset(cand_tokens & _AGE_LIKE)))
    if cand_tokens & _VET_LIKE:
        out.add(("vet", frozenset(cand_tokens & _VET_LIKE)))
    # idade também vem da specification VTEX 'Idade' quando não está no nome
    idades = {i for i in _spec_values(product, "Idade", "Fase") for i in re.findall(r"[a-z]+", i)}
    if idades and not (idades & {"adulto", "adultos", "adult"}):
        if idades & {"filhote", "filhotes", "junior"}:
            out.add(("age", frozenset({"filhote"})))
        if idades & {"senior", "idoso", "idosos"}:
            out.add(("age", frozenset({"senior"})))
    if any(any(m in val for m in _RACIAL_LINE_MARKERS) for val in _spec_values(product, "Linha")):
        out.add(("racial_line", frozenset({"__racas_especificas__"})))
    if _spec_values(product, "Tipo Ração Medicamentosa", "Tipo Ração Medicada", "Indicacao Terapeutica"):
        out.add(("vet", frozenset({"__medicamentosa__"})))
    return out


_BREED_WORDS = frozenset({
    "pitbull", "bulldog", "poodle", "yorkshire", "maltes", "shihtzu", "shih", "tzu",
    "labrador", "golden", "retriever", "pastor", "pinscher", "rottweiler", "beagle",
    "dachshund", "pomeranian", "pomerania", "lulu", "chihuahua", "pug", "boxer",
    "schnauzer", "border", "collie", "husky", "akita", "spitz", "persa", "siames",
    "maine", "coon", "ragdoll", "sphynx", "angora",
})


def _breed_tokens(text: str, brand: Optional[str] = None) -> frozenset:
    toks = set(re.findall(r"[a-z]+", _norm_text(text))) & _BREED_WORDS
    toks -= set(re.findall(r"[a-z]+", _norm_text(brand or "")))   # "Golden" a marca != raça
    return frozenset(toks)


def _expected_specializations(spec: "CobasiIdentitySpec") -> set:
    ref_norm = _norm_text(spec.reference_name or "")
    ref_tokens = set(re.findall(r"[a-z]+", ref_norm))
    out = _candidate_specializations(ref_tokens, None)
    if ref_tokens & {"adulto", "adultos", "adult"}:
        out.add(("age", frozenset({"adulto"})))
    if any(ph in ref_norm for ph in _VET_REFERENCE_PHRASES):
        out.add(("vet", frozenset({"__vet_ref__"})))
    breeds = _breed_tokens(spec.reference_name or "", spec.brand)
    if "racas especificas" in ref_norm or "raca especifica" in ref_norm or breeds:
        out.add(("racial_line", breeds or frozenset({"__racas_especificas__"})))
    return out


def _candidate_is_mainstream(cand_tokens: set, product: Optional[dict]) -> bool:
    """Candidato "genérico/mainstream" em TODOS os eixos de formulação:
    sem idade != adulto, sem castrado, sem linha racial, sem linha
    veterinária, sem raça específica. Usado quando o nome esperado é pobre
    demais (só marca + categoria) para provar sub-variante — nesse caso só
    o produto padrão da marca pode ser exibido; o resto vira UNKNOWN."""
    if _candidate_specializations(cand_tokens, product):
        return False
    if cand_tokens & {"castrado", "castrados", "castrada", "castradas", "sterilised", "sterilized", "neutered"}:
        return False
    # Idade só desqualifica quando EXCLUI adulto (ex: ['Filhote'], ['Sênior']).
    # ['Adulto', 'Sênior'] é faixa de uso, não especialização.
    idades = _spec_values(product, "Idade", "Fase")
    if idades and not any(i in ("adulto", "adult", "adultos") for i in idades):
        return False
    # Raça específica = lista CURTA de raças nomeadas (não "Todas as Raças",
    # não uma lista longa de compatibilidade).
    racas = [r for r in _spec_values(product, "Racas de Cachorro", "Racas de Gato", "Raca") if "todas" not in r]
    if racas and len(racas) <= 3:
        return False
    return True


def _candidate_identity_verdict(
    spec: "CobasiIdentitySpec",
    product_name: str,
    sku_name: str,
    sku_ean: Optional[str],
    *,
    product: Optional[dict] = None,
    item: Optional[dict] = None,
) -> tuple["MatchState", str]:
    """(MatchState, motivo). `product`/`item` (dicts VTEX) são opcionais — quando
    passados, atributos ausentes do nome são procurados nas specifications da
    mesma resposta antes de virar UNKNOWN."""
    cand = f"{product_name or ''} {sku_name or ''}".strip()

    # ── contradições objetivas de espécie (valem inclusive sobre o EAN:
    #    um GTIN de ração de gato + pet cão = dado inconsistente, não exibe)
    if spec.species:
        cs = _candidate_species(cand, product)
        if cs and cs != spec.species:
            return (MatchState.MISMATCH, "species_mismatch")

    exp_gtin, act_gtin = _digits(spec.gtin), _digits(sku_ean)
    if exp_gtin and act_gtin:
        if act_gtin == exp_gtin:
            return (MatchState.MATCH, "ean_equal")
        return (MatchState.MISMATCH, "ean_mismatch")

    # ── atributos "hard" — DECLARADO e diferente = MISMATCH; ausente = UNKNOWN
    unknown_axes: list[str] = []
    hard_checked = 0
    decisive_checked = 0   # cm / contagem de unidades — quase-únicos
    if spec.weight_kg is not None:
        cw = _candidate_weight_kg(cand, product, item)
        if cw is None:
            unknown_axes.append("weight")
        elif abs(cw - spec.weight_kg) > max(0.05, spec.weight_kg * 0.06):
            return (MatchState.MISMATCH, "weight_mismatch")
        else:
            hard_checked += 1
    if spec.volume_ml is not None:
        cv = _candidate_volume_ml(cand, product, item)
        if cv is None:
            unknown_axes.append("volume")
        elif abs(cv - spec.volume_ml) > max(20.0, spec.volume_ml * 0.06):
            return (MatchState.MISMATCH, "volume_mismatch")
        else:
            hard_checked += 1
    if spec.length_cm is not None:
        cl = extract_length_cm(cand)
        if cl is None:
            for val in _sku_variation_values(item) + _spec_values(product, "Comprimento", "Tamanho"):
                cl = extract_length_cm(val)
                if cl is not None:
                    break
        if cl is None:
            unknown_axes.append("length")
        elif abs(cl - spec.length_cm) > 2.0:
            return (MatchState.MISMATCH, "length_mismatch")
        else:
            hard_checked += 1
            decisive_checked += 1
    if spec.pack_count is not None:
        cp = extract_pack_count(cand)
        if cp is None:
            for val in _sku_variation_values(item):
                cp = extract_pack_count(val)
                if cp is not None:
                    break
        if cp is None:
            unknown_axes.append("pack_count")
        elif cp != spec.pack_count:
            return (MatchState.MISMATCH, "pack_count_mismatch")
        else:
            hard_checked += 1
            decisive_checked += 1

    # ── marca + tokens + grupos distintivos via score_candidate (não
    #    modificado). NÃO passa peso/volume/cm — esses eixos já foram
    #    checados acima com semântica de 3 estados (AUSENTE != DIFERENTE);
    #    score_candidate rejeitaria em atributo AUSENTE do nome do candidato.
    score: Optional[float] = None
    if spec.reference_name:
        score = score_candidate(spec.reference_name, cand, expected_brand=spec.brand)
        if score is None:
            return (MatchState.MISMATCH, "structural_mismatch")

    # ── especialização por EIXO (idade / veterinária / linha racial) ─────
    #   • esperado tem o eixo, candidato não → MISMATCH (falta a linha certa)
    #   • candidato tem o eixo, esperado não → UNKNOWN (não dá pra confirmar)
    #   • ambos têm mas grupos diferentes → MISMATCH
    cand_tokens = _tokenize_text(cand)
    cand_spec = _candidate_specializations(cand_tokens, product)
    exp_spec = _expected_specializations(spec)
    _NON_ADULT = {"filhote", "filhotes", "puppy", "junior", "senior", "idoso", "idosos", "mature"}
    _WILDCARD = {"__vet_ref__", "__medicamentosa__", "__racas_especificas__"}

    # raças nomeadas: duas raças diferentes = produtos diferentes
    exp_breeds = _breed_tokens(spec.reference_name or "", spec.brand)
    cand_breeds = _breed_tokens(cand, spec.brand)
    if exp_breeds and cand_breeds and not (exp_breeds & cand_breeds):
        return (MatchState.MISMATCH, "line_mismatch")

    for kind in ("age", "vet", "racial_line"):
        c_groups = {g for k, g in cand_spec if k == kind}
        e_groups = {g for k, g in exp_spec if k == kind}
        e_tokens = set().union(*e_groups) if e_groups else set()
        c_tokens = set().union(*c_groups) if c_groups else set()
        if kind == "age" and e_tokens == {"adulto"}:
            if c_tokens & _NON_ADULT:
                return (MatchState.MISMATCH, "line_mismatch")
            continue
        if kind == "racial_line" and exp_breeds and cand_breeds and (exp_breeds & cand_breeds):
            continue   # mesma raça nomeada nos dois — ok
        if e_groups and not c_groups:
            return (MatchState.MISMATCH, "line_mismatch")
        if e_groups and c_groups and not (e_tokens & _WILDCARD):
            if not any(cg & e_tokens for cg in c_groups):
                return (MatchState.MISMATCH, "line_mismatch")
        if c_groups and not e_groups:
            return (MatchState.UNKNOWN, "unconfirmed_" + kind)

    brand_in_text = bool(spec.brand) and _norm_text(spec.brand) in _norm_text(cand)
    rich_tokens = spec.rich_reference_tokens()

    # Nome esperado pobre (só marca + categoria, ex: "Golden ração"): não dá
    # pra provar sub-variante. Só aceita quando o candidato é o produto
    # PADRÃO da marca; castrado / sênior / linha específica / veterinária,
    # ou qualquer sub-variante de formulação → UNKNOWN.
    if rich_tokens < 2 and not _candidate_is_mainstream(cand_tokens, product):
        return (MatchState.UNKNOWN, "ambiguous_generic_reference")

    # ── evidência positiva exigida ───────────────────────────────────────
    #   • discriminador DECISIVO (cm exato, contagem exata) + nome compatível
    #   • OU peso/volume exato + ao menos 1 token de conteúdo no esperado
    #   • OU nome de referência rico e muito específico E sem eixo em aberto
    if score is not None and score >= 0.60 and decisive_checked >= 1:
        return (MatchState.MATCH, "structural_match")
    if score is not None and score >= 0.60 and hard_checked >= 1 and rich_tokens >= 1:
        return (MatchState.MATCH, "structural_match")
    if score is not None and score >= 0.78 and rich_tokens >= 3 and not unknown_axes:
        return (MatchState.MATCH, "strong_name_match")
    if unknown_axes:
        # atributo do tutor não confirmável no candidato — resolvível por
        # enriquecimento / specs VTEX, não é contradição.
        return (MatchState.UNKNOWN, "attr_unverifiable:" + unknown_axes[0])
    return (MatchState.UNKNOWN, "insufficient_identity_evidence")


def _summarize_reject_reasons(reasons: list[str]) -> str:
    # EAN divergente é o sinal mais forte de "produto errado".
    if "ean_mismatch" in reasons:
        return "ean_mismatch"
    # UNKNOWN nos candidatos on-target descreve melhor a falta de preço do que
    # um species_mismatch de um candidato de outra categoria no mesmo resultado.
    unknown_family = any(
        r.startswith(("unconfirmed_", "attr_unverifiable", "ambiguous_"))
        or r == "insufficient_identity_evidence"
        for r in reasons
    )
    if unknown_family:
        return "insufficient_identity_evidence"
    for tag in ("species_mismatch", "weight_mismatch", "length_mismatch",
                "volume_mismatch", "pack_count_mismatch", "structural_mismatch", "line_mismatch"):
        if tag in reasons:
            return tag if tag == "species_mismatch" else "variant_mismatch"
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


def _price_result_from_sku(product: dict, item: dict, offer: dict, ean: Optional[str], reason: str) -> ProductPriceResult:
    link_text = product.get("linkText")
    price = offer.get("Price")
    return ProductPriceResult(
        found=True, store="cobasi",
        product_name=(item.get("nameComplete") or item.get("name") or product.get("productName")),
        brand=product.get("brand"),
        price=float(price) if isinstance(price, (int, float)) else None,
        list_price=float(offer["ListPrice"]) if isinstance(offer.get("ListPrice"), (int, float)) else None,
        is_available=offer.get("IsAvailable"),
        url=f"https://www.cobasi.com.br/{link_text}/p" if link_text else None,
        ean=ean,
        reason=reason,
    )


def _resolve_from_products(products: list, spec: "CobasiIdentitySpec") -> ProductPriceResult:
    """Percorre todos os SKUs; MATCH exibe preço, MISMATCH/UNKNOWN só
    registram motivo. EAN exato encerra na hora."""
    reject_reasons: list[str] = []
    best: Optional[ProductPriceResult] = None
    for product, item, offer, ean in _iter_vtex_sku_candidates(products):
        state, reason = _candidate_identity_verdict(
            spec, product.get("productName") or "",
            item.get("nameComplete") or item.get("name") or "", ean,
            product=product, item=item,
        )
        if not _accepts(state):
            reject_reasons.append(reason)
            continue
        price = offer.get("Price")
        if not isinstance(price, (int, float)) or not price:
            reject_reasons.append("no_price")
            continue
        result = _price_result_from_sku(product, item, offer, ean, reason)
        if reason == "ean_equal":
            return result
        if best is None:
            best = result
    if best is not None:
        return best
    return ProductPriceResult(found=False, reason=_summarize_reject_reasons(reject_reasons))


async def _search_cobasi_matched_once(query: str, spec: "CobasiIdentitySpec") -> ProductPriceResult:
    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(_sanitize_query(query), safe=""))
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
    return _resolve_from_products(products, spec)


async def _search_cobasi_by_ean_once(gtin: str) -> ProductPriceResult | list:
    """Consulta VTEX pela rota que REALMENTE resolve EAN:
    `?fq=alternateIds_Ean:{gtin}` (o path `/search/{gtin}` sempre volta vazio).
    Devolve a lista bruta de products em sucesso, ou um ProductPriceResult de
    erro/no_results."""
    digits = _digits(gtin)
    if not digits:
        return ProductPriceResult(found=False, reason="empty_query")
    try:
        async with httpx.AsyncClient(timeout=_COBASI_TIMEOUT) as client:
            response = await client.get(
                _COBASI_EAN_SEARCH_URL,
                params={"fq": f"alternateIds_Ean:{digits}", "sc": 1},
                headers={"Accept": "application/json"},
            )
    except (httpx.TimeoutException, httpx.ConnectError) as exc:
        logger.info("[commerce_pricing] cobasi ean timeout gtin=%r err=%s", digits, type(exc).__name__)
        return ProductPriceResult(found=False, reason="timeout")
    if response.status_code not in (200, 206):
        return ProductPriceResult(found=False, reason="http_error")
    products = response.json()
    if not isinstance(products, list) or not products:
        return ProductPriceResult(found=False, reason="no_results")
    return products


async def fetch_cobasi_price_by_ean(gtin: str, spec: "CobasiIdentitySpec") -> ProductPriceResult:
    """Rota EAN-first (nível A). Resolve o produto por `fq=alternateIds_Ean` e
    só aceita o SKU cujo `item.ean` == GTIN do PETMOL. Nunca cai em busca
    textual aqui — isso é responsabilidade do chamador."""
    digits = _digits(gtin)
    if not digits:
        return ProductPriceResult(found=False, reason="empty_query")
    if not get_settings().commerce_pricing_enabled:
        return ProductPriceResult(found=False, reason="disabled")

    key = f"e:{digits}::{spec.fingerprint()}"
    cached = _cache.get(key)
    if cached is not None:
        return cached
    try:
        products = await _search_cobasi_by_ean_once(digits)
        if isinstance(products, ProductPriceResult):
            result = products
        else:
            ean_spec = spec if spec.gtin else CobasiIdentitySpec(
                reference_name=spec.reference_name, brand=spec.brand, species=spec.species,
                gtin=digits, weight_kg=spec.weight_kg, volume_ml=spec.volume_ml,
                length_cm=spec.length_cm, pack_count=spec.pack_count,
            )
            result = _resolve_from_products(products, ean_spec)
    except Exception as exc:
        logger.info("[commerce_pricing] cobasi ean failed gtin=%r err=%s", digits, type(exc).__name__)
        result = ProductPriceResult(found=False, reason="error")
    _cache[key] = result
    return result


async def fetch_cobasi_price_matched(
    query: str, spec: "CobasiIdentitySpec", *, target_weight_kg: Optional[float] = None
) -> ProductPriceResult:
    """Busca textual estrutural: só devolve oferta em MATCH (identidade
    provável). Examina todos os SKUs de todos os resultados VTEX."""
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

    url = _COBASI_SEARCH_URL.format(query=urllib.parse.quote(_sanitize_query(query), safe=""))
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

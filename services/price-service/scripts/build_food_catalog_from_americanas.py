#!/usr/bin/env python3
"""
Fase 3 do plano de base de produtos PETMOL: varre a categoria Ração da
Americanas (mesma API pública VTEX que a Cobasi, categoria
/Pet shop/Alimentos/Ração/, id 3727) e soma ao que já temos da Cobasi
(foods_br_phase2_cobasi.json) — sem tocar nesse arquivo.

Diferente da Cobasi (loja própria, catálogo curado), a Americanas é um
marketplace multi-vendedor: o campo "brand" da API vem "Não Disponível"
na maioria dos itens. Sem marca confiável não dá pra usar o item pra
match de foto (marca é o sinal mais forte que temos) — então:

  1. Se o campo "brand" da API vier preenchido de verdade, usa ele.
  2. Senão, tenta achar uma marca CONHECIDA (lista abaixo, vinda das 46
     marcas já confirmadas na Cobasi + um punhado novo confirmado à mão
     nesta varredura) em algum lugar do nome do produto.
  3. Se não achar nenhuma marca conhecida no texto, DESCARTA o item —
     "se não tiver marca não adianta nada" (instrução explícita: não
     adivinhar/fabricar marca).

Deduplicação: pula qualquer item cujo EAN já exista no arquivo da Cobasi
— o mesmo código de barras é o mesmo produto físico não importa a loja,
então isso evita duas entradas concorrentes (com texto ligeiramente
diferente) pro mesmo produto real, que poderia atrapalhar o matching.

Uso:
    python3 scripts/build_food_catalog_from_americanas.py
"""
import json
import os
import re
import time
import unicodedata
import urllib.error
import urllib.request
from typing import Any, Optional

CATEGORY_URL = (
    "https://www.americanas.com.br/api/catalog_system/pub/products/search"
    "?fq=C:/3714/3722/3727/&_from={f}&_to={t}"
)
FACETS_URL = "https://www.americanas.com.br/api/catalog_system/pub/facets/search/pet%20shop/alimentos/racao?map=c,c,c"
BRAND_SHARD_URL = (
    "https://www.americanas.com.br/api/catalog_system/pub/products/search/{link_path}"
    "?map=c,c,c,b&_from={f}&_to={t}"
)
PAGE_SIZE = 50
REQUEST_DELAY_SECONDS = 1.2
MAX_RETRIES = 6
# Teto da própria plataforma pra busca anônima (confirmado: _to=2549 funciona,
# _to=2550 já dá 400) — mesmo fazendo shard por marca, cada shard individual
# ainda respeita esse teto (nenhuma marca chega perto disso sozinha).
PLATFORM_PAGINATION_CAP = 2549

COBASI_FILE = os.path.join(
    os.path.dirname(__file__), "..", "src", "catalogs", "food_database", "foods_br_phase2_cobasi.json"
)
OUT_FILE = os.path.join(
    os.path.dirname(__file__), "..", "src", "catalogs", "food_database", "foods_br_phase3_americanas.json"
)

# Marcas já confirmadas reais no crawl da Cobasi, mais um punhado extra
# confirmado manualmente nesta varredura (Premiatta, Three Dogs, Nutrive
# Select, Farmina/Cibau) — qualquer produto sem NENHUMA dessas no texto é
# descartado, nunca vira uma marca "adivinhada".
EXTRA_KNOWN_BRANDS = ["Premiatta", "Three Dogs", "Nutrive Select", "Nutrive", "Farmina", "Cibau", "Unna"]

# Marcas da Cobasi curtas/genéricas demais pra bater com segurança num texto
# de marketplace livre — "Max" sozinho combina com qualquer "tamanho Max",
# "embalagem Max" etc. e gerou marca errada em produtos que na verdade eram
# de outra linha (confirmado manualmente: "Max Vita" ~= produto sem marca
# clara, não literalmente a marca "Max"). Preferimos descartar a perder por
# marcar errado.
UNSAFE_BRAND_TOKENS = {"max"}

ACCESSORY_EXCLUDE = re.compile(
    r"\b(comedouro|bebedouro|alimentador|dessecante|refil|balde|pote|potinho|tigela|"
    r"caixa\s+organizadora|porta[- ]ra[çc][ãa]o|cont[êe]iner|xiaomi|smart\s?feeder)\b",
    re.IGNORECASE,
)

# A categoria "Ração" da Americanas (marketplace multi-vendedor) vem com
# vendedor terceiro categorizando errado — confirmado manualmente: item de
# antipulgas, vermífugo, produto de limpeza e até estojo escolar apareceram
# aqui. Exige um sinal positivo real de comida E exclui categorias que não
# são "ração" propriamente (medicamento, suplemento, petisco, acessório),
# já que o pedido aqui é focar em ração — petisco/suplemento não contam.
FOOD_REQUIRE = re.compile(
    r"ra[çc][ãaõ]|\balimento\b|\bpat[êe]\b|\bsach[êe]\b|veterinary\s+diet|prescription\s+diet",
    re.IGNORECASE,
)
FOOD_EXCLUDE = re.compile(
    r"antipulga|carrapato|vermif|vermíf|probi[óo]tico|suplemento|ot[oó]l[óo]gico|limpador|"
    r"perfumado|estojo|biscrok|cookie|biscoito|petisco|temptations|\bsnack\b|nugget|"
    r"xampu|shampoo|coleira|comprimido|kardio",
    re.IGNORECASE,
)

_WEIGHT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g)\b", re.IGNORECASE)
_LIFE_STAGE_RE = {
    "puppy": re.compile(r"filhote|puppy|kitten", re.IGNORECASE),
    "senior": re.compile(r"s[êe]nior|idos[oa]|mature", re.IGNORECASE),
    "adult": re.compile(r"adult[oa]s?\b", re.IGNORECASE),
}
_PORT_RE = {
    "mini": re.compile(r"\bmini\b", re.IGNORECASE),
    "pequeno": re.compile(r"pequen[oa]s?\b|\bsmall\b", re.IGNORECASE),
    "medio": re.compile(r"m[ée]di[oa]s?\b|\bmedium\b", re.IGNORECASE),
    "gigante": re.compile(r"gigante|giant", re.IGNORECASE),
    "grande": re.compile(r"grande|large", re.IGNORECASE),
}
_NEUTERED_RE = re.compile(r"castrad[oa]s?", re.IGNORECASE)
_UNRELIABLE_BRAND = {"", "não disponível", "nao disponivel", "não informado", "nao informado", "n/a", "sem marca"}


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


def load_known_brands() -> list[tuple[str, str]]:
    with open(COBASI_FILE, "r", encoding="utf-8") as f:
        cobasi = json.load(f)
    brands = sorted({item["brand"] for item in cobasi["items"]} | set(EXTRA_KNOWN_BRANDS))
    brands = [b for b in brands if _norm(b) not in UNSAFE_BRAND_TOKENS]
    # mais especifico (mais longo) primeiro, pra "n&d" nao perder pra um "n" solto etc.
    pairs = [(_norm(b), b) for b in brands]
    pairs.sort(key=lambda kv: -len(kv[0]))
    return pairs


def load_cobasi_barcodes() -> set[str]:
    with open(COBASI_FILE, "r", encoding="utf-8") as f:
        cobasi = json.load(f)
    return {item["barcode"] for item in cobasi["items"] if item.get("barcode")}


def find_brand_in_text(name: str, known_pairs: list[tuple[str, str]]) -> Optional[str]:
    nn = _norm(name)
    for key, original in known_pairs:
        if re.search(r"\b" + re.escape(key) + r"\b", nn):
            return original
    # "nd" sem o "&" aparece em vendedores que digitaram sem o simbolo
    if re.search(r"\bnd\b", nn):
        return "N&D"
    return None


def resolve_brand(product: dict, known_pairs: list[tuple[str, str]]) -> Optional[str]:
    raw = (product.get("brand") or "").strip()
    if raw and raw.lower() not in _UNRELIABLE_BRAND:
        # ainda assim prefere a grafia já usada na Cobasi quando é a mesma marca
        found = find_brand_in_text(raw, known_pairs)
        return found or raw
    name = product.get("productName") or ""
    return find_brand_in_text(name, known_pairs)


def _extract_weight_kg(text: str) -> Optional[float]:
    match = _WEIGHT_RE.search(text)
    if not match:
        return None
    try:
        value = float(match.group(1).replace(",", "."))
    except ValueError:
        return None
    unit = match.group(2).lower()
    return value / 1000 if unit == "g" else value


def _infer_life_stage(text: str) -> Optional[str]:
    for stage, pattern in _LIFE_STAGE_RE.items():
        if pattern.search(text):
            return stage
    return None


def _infer_port(text: str) -> Optional[str]:
    for port, pattern in _PORT_RE.items():
        if pattern.search(text):
            return port
    return None


_CAT_BRANDS = {"special cat", "three cats", "cat chow", "whiskas", "fancy feast", "sheba", "kitekat", "kelcat", "allcats"}
_DOG_BRANDS = {"special dog", "three dogs", "dog chow", "pedigree", "keldog", "allcanis"}


def _infer_species(text: str, brand: Optional[str] = None) -> Optional[str]:
    # Bare substring checks matched "cao" *inside* "ração"/"racao" itself
    # (every single product name starts with that word) — silently forcing
    # every item without an explicit Portuguese species word (e.g. brands
    # named in English like "Special Cat") to "dog". Word-boundary regex
    # fixes the false match; brand-name fallback recovers species for those
    # English-named brands instead of leaving them as merely "unknown".
    t = _norm(text)  # accents already stripped: "cão"->"cao", "cães"->"caes"
    if re.search(r"\bgatos?\b", t) or re.search(r"\bfelin\w*\b", t):
        return "cat"
    if re.search(r"\b(cao|caes)\b", t) or re.search(r"\bcanin\w*\b", t):
        return "dog"
    if brand:
        bn = _norm(brand)
        if bn in _CAT_BRANDS:
            return "cat"
        if bn in _DOG_BRANDS:
            return "dog"
    return None


def _valid_ean(value: Any) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if text.isdigit() and 8 <= len(text) <= 14:
        return text
    return None


def _clean_variant(product_name: str, brand: str) -> str:
    if not brand:
        return product_name.strip()
    cleaned = re.sub(r"\b" + re.escape(brand) + r"\b", "", product_name, flags=re.IGNORECASE).strip()
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    cleaned = re.sub(r"^[-,\s]+|[-,\s]+$", "", cleaned)
    return cleaned or product_name.strip()


def _http_get_json(url: str) -> Any:
    req = urllib.request.Request(url, headers={"Accept": "application/json", "User-Agent": "Mozilla/5.0"})
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                content_range = resp.getheader("resources")
                body = resp.read()
            return content_range, json.loads(body)
        except Exception as exc:
            wait = 2.5 * (attempt + 1)
            print(f"    erro {exc} em {url[:90]}..., esperando {wait}s (tentativa {attempt + 1})")
            time.sleep(wait)
    return None, None


def fetch_brand_facets() -> list[dict]:
    """Marcas com produto na categoria Ração, cada uma com sua contagem —
    usado pra buscar marca por marca (cada uma bem abaixo do teto de 2549),
    em vez de uma varredura só da categoria inteira (que trunca em 2550 de
    7896). Busca ao vivo, não hardcoded — reexecutar este script no futuro
    pega a lista de marcas atualizada automaticamente."""
    _, data = _http_get_json(FACETS_URL)
    if not data or "Brands" not in data:
        print("  aviso: não consegui buscar facetas de marca, caindo pra varredura única")
        return []
    return data["Brands"]


def fetch_shard(url_template: str, label: str, cap: int = PLATFORM_PAGINATION_CAP) -> list[dict]:
    items: list[dict] = []
    offset = 0
    total = None
    while total is None or offset < total:
        if offset > cap:
            print(f"    [{label}] parando em {cap} (teto da plataforma) — {total} existem no total")
            break
        to = min(offset + PAGE_SIZE - 1, cap)
        url = url_template.format(f=offset, t=to)
        content_range, page = _http_get_json(url)
        if total is None and content_range and "/" in content_range:
            total = int(content_range.split("/")[-1])
        if not page:
            break
        items.extend(page)
        offset += PAGE_SIZE
        time.sleep(REQUEST_DELAY_SECONDS)
        if total and offset >= total:
            break
    return items


def fetch_all_products() -> list[dict]:
    all_items: list[dict] = []
    seen_ids: set[str] = set()

    def add_items(items: list[dict]):
        added = 0
        for p in items:
            pid = p.get("productId")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                all_items.append(p)
                added += 1
        return added

    print("Buscando lista de marcas da categoria...")
    brands = fetch_brand_facets()

    if not brands:
        # fallback: varredura única da categoria (sujeita ao teto de 2550)
        print("Varredura única da categoria (sem shard por marca)...")
        items = fetch_shard(CATEGORY_URL, "categoria inteira")
        add_items(items)
        return all_items

    real_brands = [b for b in brands if b.get("Name") and b["Name"] != "Não Disponível"]
    unbranded = next((b for b in brands if b.get("Name") == "Não Disponível"), None)

    def _link_path(link: str) -> str:
        # b["Link"] vem como "/pet-shop/alimentos/racao/Royal-Canin?map=c,c,c,b" —
        # só quero o caminho, sem a querystring (monto a minha própria com _from/_to).
        return link.split("?")[0].lstrip("/")

    print(f"{len(real_brands)} marcas reais na categoria (cobertura completa cada uma):")
    for b in sorted(real_brands, key=lambda x: -x["Quantity"]):
        link_path = _link_path(b["Link"])
        url_template = BRAND_SHARD_URL.format(link_path=link_path, f="{f}", t="{t}")
        items = fetch_shard(url_template, b["Name"])
        added = add_items(items)
        print(f"  {b['Name']}: {b['Quantity']} esperados, {len(items)} buscados, {added} novos")

    if unbranded:
        print(f"\nBuscando fatia de 'Não Disponível' ({unbranded['Quantity']} no total, teto {PLATFORM_PAGINATION_CAP + 1})...")
        link_path = _link_path(unbranded["Link"])
        url_template = BRAND_SHARD_URL.format(link_path=link_path, f="{f}", t="{t}")
        items = fetch_shard(url_template, "Não Disponível")
        added = add_items(items)
        print(f"  Não Disponível: {len(items)} buscados, {added} novos")

    return all_items


def build_entries(products: list[dict], known_pairs: list[tuple[str, str]], cobasi_barcodes: set[str]) -> tuple[list[dict], dict]:
    stats = {"total_raw": len(products), "no_brand": 0, "accessory": 0, "not_food": 0, "dup_ean": 0, "no_ean": 0, "kept": 0}
    entries: list[dict] = []
    seen_ids: set[str] = set()

    for product in products:
        product_name = (product.get("productName") or "").strip()
        if not product_name:
            continue
        if ACCESSORY_EXCLUDE.search(product_name):
            stats["accessory"] += 1
            continue
        if FOOD_EXCLUDE.search(product_name) or not FOOD_REQUIRE.search(product_name):
            stats["not_food"] += 1
            continue

        brand = resolve_brand(product, known_pairs)
        if not brand:
            stats["no_brand"] += 1
            continue

        variant = _clean_variant(product_name, brand)
        species = _infer_species(product_name, brand)

        for item in product.get("items") or []:
            name_complete = item.get("nameComplete") or item.get("name") or product_name
            ean = _valid_ean(item.get("ean"))
            if not ean:
                stats["no_ean"] += 1
                continue
            if ean in cobasi_barcodes:
                stats["dup_ean"] += 1
                continue

            entry_id = f"americanas-{item.get('itemId') or product.get('productId')}"
            if entry_id in seen_ids:
                continue
            seen_ids.add(entry_id)

            weight_kg = _extract_weight_kg(name_complete) or _extract_weight_kg(product_name)
            life_stage = _infer_life_stage(name_complete) or _infer_life_stage(product_name)
            port = _infer_port(name_complete) or _infer_port(product_name)
            neutered = True if _NEUTERED_RE.search(name_complete) else None
            images = item.get("images") or []
            image_url = images[0].get("imageUrl") if images else None
            link_text = product.get("linkText")
            official_url = f"https://www.americanas.com.br/{link_text}/p" if link_text else product.get("link")

            entries.append({
                "brand": brand,
                "manufacturer": None,
                "line": None,
                "variant": variant,
                "species": species or "all",
                "life_stage": life_stage,
                "port": port,
                "category": "food",
                "indication": None,
                "weight_kg": weight_kg,
                "barcode": ean,
                "image_url": image_url,
                "official_url": official_url,
                "source": "americanas_live_crawl",
                "confidence": "high",
                "verified": True,
                "id": entry_id,
            })
            stats["kept"] += 1

    return entries, stats


def main() -> None:
    print("Carregando marcas conhecidas e códigos de barras já cobertos pela Cobasi...")
    known_pairs = load_known_brands()
    cobasi_barcodes = load_cobasi_barcodes()
    print(f"  {len(known_pairs)} marcas conhecidas, {len(cobasi_barcodes)} EANs já cobertos")

    print("Varrendo categoria Ração da Americanas...")
    products = fetch_all_products()
    print(f"  {len(products)} produtos únicos coletados")

    entries, stats = build_entries(products, known_pairs, cobasi_barcodes)

    print()
    print("Resumo:")
    for k, v in stats.items():
        print(f"  {k}: {v}")

    output = {
        "schema_version": 1,
        "phase": 3,
        "note": (
            "Catálogo de ração (cães e gatos) varrido ao vivo da API pública da "
            "Americanas — soma ao Fase 2 (Cobasi), sem duplicar por EAN, e só "
            "inclui itens com marca reconhecida. Gerado por "
            "scripts/build_food_catalog_from_americanas.py."
        ),
        "total": len(entries),
        "items": entries,
    }
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nTotal: {len(entries)} SKUs novos salvos em {OUT_FILE}")


if __name__ == "__main__":
    main()

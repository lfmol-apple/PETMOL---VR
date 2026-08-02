#!/usr/bin/env python3
"""
Fase 2 do plano de base de produtos PETMOL: varre o catálogo real de ração
(cães e gatos) da API pública da Cobasi e gera um JSON no mesmo formato do
Fase 1 (foods_br_phase1.json) — mas com dados de um produto real de verdade
sendo vendido, em vez de "conhecimento geral" da IA sem verificação.

Diferenças em relação ao Fase 1:
  - source = "cobasi_live_crawl", verified = true (é uma listagem real, viva)
  - barcode preenchido quando a Cobasi tem o EAN do item (a maioria tem)
  - image_url e official_url vêm do produto real, não são None

Uso:
    python3 scripts/build_food_catalog_from_cobasi.py

Idempotente e re-executável — pode rodar de novo depois pra atualizar com o
catálogo mais recente da Cobasi. Só varre as categorias Cachorro/Ração e
Gatos/Ração (não pega Peixes/Aves/Roedores, que "ração" como termo livre
também traria misturado).
"""
import json
import os
import re
import time
import urllib.parse
import urllib.request
from typing import Any, Optional

SEARCH_URL = "https://www.cobasi.com.br/api/catalog_system/pub/products/search/{path}"
PAGE_SIZE = 50
REQUEST_DELAY_SECONDS = 0.4  # polidez — não bater rápido demais na Cobasi
CATEGORY_PATHS = {
    "dog": "cachorro/racao",
    "cat": "gatos/racao",
}

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


def _fetch_page(path: str, offset: int) -> tuple[list[dict], int]:
    url = SEARCH_URL.format(path=urllib.parse.quote(path)) + f"?_from={offset}&_to={offset + PAGE_SIZE - 1}"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        total = 0
        content_range = resp.getheader("resources")
        if content_range and "/" in content_range:
            try:
                total = int(content_range.split("/")[-1])
            except ValueError:
                total = 0
        body = resp.read()
    data = json.loads(body)
    if not isinstance(data, list):
        return [], total
    return data, total


def _fetch_category(path: str) -> list[dict]:
    products: list[dict] = []
    offset = 0
    total = None
    while total is None or offset < total:
        page, page_total = _fetch_page(path, offset)
        if total is None:
            total = page_total
        if not page:
            break
        products.extend(page)
        offset += PAGE_SIZE
        time.sleep(REQUEST_DELAY_SECONDS)
        if offset > 20000:  # trava de segurança, não deve chegar perto disso
            break
    return products


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


def _clean_variant(product_name: str, brand: str) -> str:
    """Remove a marca do nome do produto se ela aparecer solta ali, pra não
    duplicar quando catalog.py compõe nome = brand + line + variant."""
    if not brand:
        return product_name.strip()
    pattern = re.compile(r"\b" + re.escape(brand) + r"\b", re.IGNORECASE)
    cleaned = pattern.sub("", product_name).strip()
    cleaned = re.sub(r"\s{2,}", " ", cleaned)
    return cleaned or product_name.strip()


def _valid_ean(value: Any) -> Optional[str]:
    if not value:
        return None
    text = str(value).strip()
    if text.isdigit() and 8 <= len(text) <= 14:
        return text
    return None


def build_entries(species: str, products: list[dict]) -> list[dict]:
    entries: list[dict] = []
    seen_ids: set[str] = set()
    for product in products:
        brand = (product.get("brand") or "").strip()
        product_name = (product.get("productName") or "").strip()
        if not brand or not product_name:
            continue
        link_text = product.get("linkText")
        official_url = f"https://www.cobasi.com.br/{link_text}/p" if link_text else None
        variant = _clean_variant(product_name, brand)

        for item in product.get("items") or []:
            name_complete = item.get("nameComplete") or item.get("name") or product_name
            weight_kg = _extract_weight_kg(name_complete)
            life_stage = _infer_life_stage(name_complete) or _infer_life_stage(product_name)
            port = _infer_port(name_complete) or _infer_port(product_name)
            neutered = True if _NEUTERED_RE.search(name_complete) else None
            ean = _valid_ean(item.get("ean"))
            images = item.get("images") or []
            image_url = images[0].get("imageUrl") if images else None

            entry_id = f"cobasi-{item.get('itemId') or product.get('productId')}"
            if entry_id in seen_ids:
                continue
            seen_ids.add(entry_id)

            entries.append({
                "brand": brand,
                "manufacturer": None,
                "line": None,
                "variant": variant,
                "species": species,
                "life_stage": life_stage,
                "port": port,
                "category": "food",
                "indication": None,
                "weight_kg": weight_kg,
                "barcode": ean,
                "image_url": image_url,
                "official_url": official_url,
                "source": "cobasi_live_crawl",
                "confidence": "high",
                "verified": True,
                "id": entry_id,
            })
    return entries


def main() -> None:
    all_entries: list[dict] = []
    for species, path in CATEGORY_PATHS.items():
        print(f"Varrendo Cobasi: {path} (espécie={species})...")
        products = _fetch_category(path)
        print(f"  {len(products)} produtos encontrados")
        entries = build_entries(species, products)
        print(f"  {len(entries)} SKUs extraídos")
        all_entries.extend(entries)

    output = {
        "schema_version": 1,
        "phase": 2,
        "note": (
            "Catálogo de ração (cães e gatos) varrido ao vivo da API pública "
            "da Cobasi — dados reais de produtos à venda, não gerados por IA. "
            "Gerado por scripts/build_food_catalog_from_cobasi.py."
        ),
        "total": len(all_entries),
        "items": all_entries,
    }

    out_path = os.path.join(
        os.path.dirname(__file__), "..", "src", "catalogs", "food_database", "foods_br_phase2_cobasi.json"
    )
    out_path = os.path.abspath(out_path)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"\nTotal: {len(all_entries)} SKUs salvos em {out_path}")


if __name__ == "__main__":
    main()

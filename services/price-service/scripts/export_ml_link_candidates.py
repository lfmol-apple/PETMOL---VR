#!/usr/bin/env python3
"""
Exporta um CSV de produtos candidatos a receber um link de afiliado
Mercado Livre cadastrado manualmente — ver mercadolivre_link_validator.py
e admin/marketplace_offers_router.py.

Não existe API de geração de link do Mercado Livre (confirmado
24/08/2026, ver docs/AFFILIATES.md), então o cadastro é feito à mão via
o "Gerador de links" do Programa de Afiliados e Criadores. Este script
só prioriza QUAIS produtos vale a pena gerar link primeiro — ordenado
pela demanda real (quantas vezes tutores já escanearam/buscaram aquele
produto em product_scan_events), não o catálogo inteiro de uma vez.

Uso:
    python3 scripts/export_ml_link_candidates.py --out ml_candidates.csv
    python3 scripts/export_ml_link_candidates.py --limit 150 --min-scans 1 --out top_demanda.csv
    python3 scripts/export_ml_link_candidates.py --pet-categories-only --out so_categorizados.csv

Por padrão exporta TODO o catálogo (products_catalog inteiro — 76% dos
produtos reais de produção não têm categoria preenchida, então filtrar
por categoria descartaria a maioria de itens legítimos, não só lixo).
scan_count vira só o critério de ordenação (produtos já buscados por
tutores primeiro), não um filtro. Use --min-scans pra restringir só a
quem já tem demanda real comprovada, ou --pet-categories-only pra
restringir às categorias food/antiparasite/medication/hygiene/dewormer/
collar (produtos sem categoria ficam de fora).

Colunas do CSV:
    product_id       — cole de volta no CSV de import, nunca invente um novo
    gtin
    brand
    name
    category
    scan_count        — quantas vezes tutores já bateram nesse produto
    mercadolivre_search_url — clique direto pra achar o produto lá
    affiliate_url      — DEIXE EM BRANCO nos que você não for cadastrar agora;
                          preencha só quando gerar o link real no painel deles
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path
from urllib.parse import quote_plus

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import text  # noqa: E402

from src.db import SessionLocal  # noqa: E402

# Categorias conhecidas de products_catalog que fazem sentido pro Mercado
# Livre (alimento/saúde do pet) — deliberadamente NÃO inclui "other"/NULL
# (esse balde tem lixo de catálogo compartilhado, ex: vinho/chá escaneado
# por engano — visto ao investigar em 24/08/2026).
PET_CATEGORIES = ("food", "antiparasite", "medication", "hygiene", "dewormer", "collar")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=None, help="Máximo de produtos no CSV (padrão: sem limite, catálogo inteiro)")
    parser.add_argument("--out", type=str, default="ml_link_candidates.csv")
    parser.add_argument("--min-scans", type=int, default=0, help="Só inclui produtos com pelo menos N scans reais (padrão 0 — inclui todo o catálogo, scan vira só ordenação)")
    parser.add_argument("--pet-categories-only", action="store_true", help="Restringe a food/antiparasite/medication/hygiene/dewormer/collar — descarta os 76%% sem categoria preenchida")
    args = parser.parse_args()

    where_clause = "WHERE pc.category = ANY(:categories)" if args.pet_categories_only else ""

    db = SessionLocal()
    try:
        rows = db.execute(
            text(
                f"""
                SELECT pc.id, pc.barcode_normalized, pc.brand, pc.name, pc.category,
                       count(pse.id) AS scan_count
                FROM products_catalog pc
                LEFT JOIN product_scan_events pse ON pse.product_id = pc.id
                {where_clause}
                GROUP BY pc.id, pc.barcode_normalized, pc.brand, pc.name, pc.category
                HAVING count(pse.id) >= :min_scans
                ORDER BY scan_count DESC, pc.name ASC
                LIMIT :limit
                """
            ),
            {"categories": list(PET_CATEGORIES), "min_scans": args.min_scans, "limit": args.limit},
        ).all()
    finally:
        db.close()

    out_path = Path(args.out)
    with out_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "product_id", "gtin", "brand", "name", "category", "scan_count",
            "mercadolivre_search_url", "affiliate_url",
        ])
        for row in rows:
            query = " ".join(p for p in (row.brand, row.name) if p) or (row.name or "")
            search_url = f"https://lista.mercadolivre.com.br/{quote_plus(query)}"
            writer.writerow([
                row.id, row.barcode_normalized, row.brand or "", row.name or "",
                row.category or "", row.scan_count, search_url, "",
            ])

    print(f"OK: {len(rows)} produto(s) escrito(s) em {out_path}")
    if not rows:
        print("Nenhum produto encontrado com esses filtros — confira --min-scans ou as categorias.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

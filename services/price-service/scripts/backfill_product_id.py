#!/usr/bin/env python3
"""
backfill_product_id.py
=======================
Preenche `product_id` (FK real para products_catalog) em registros já
existentes de `parasite_control_records` e `feeding_plans.items_json` que
têm `barcode` mas ainda não têm o vínculo — dados criados antes da FK
existir (código escrito em 25/08/2026, ver docs/AFFILIATES.md).

Resolve por normalize_gtin(barcode) == products_catalog.barcode_normalized,
o mesmo lookup já usado pelos routers no caminho de escrita. Nunca chama
provedor externo, nunca inventa produto — sem match, o registro fica como
estava (product_id continua None, barcode cru é preservado).

Modo padrão (dry-run): mostra quantos registros seriam afetados, sem
escrever nada.

Uso:
  # Ver o que seria alterado (não escreve nada):
  python3 scripts/backfill_product_id.py

  # Aplicar de verdade:
  python3 scripts/backfill_product_id.py --apply
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_DIR = SCRIPT_DIR.parent
sys.path.insert(0, str(SERVICE_DIR))

from sqlalchemy import select  # noqa: E402

# Importa o app inteiro só pelo efeito colateral: registra TODOS os models
# no Base (inclui PetDocument, referenciado por nome em Pet.relationship())
# — sem isso, consultar ParasiteControlRecord/FeedingPlan aqui sozinho
# quebra a resolução tardia do mapper do SQLAlchemy.
import src.main  # noqa: F401,E402

from src.db import SessionLocal  # noqa: E402
from src.health.models import FeedingPlan  # noqa: E402
from src.pets.parasite_models import ParasiteControlRecord  # noqa: E402
from src.product_catalog_lookup import ProductCatalog, normalize_gtin  # noqa: E402


def _resolve_product_id(db, barcode: str | None) -> int | None:
    if not barcode:
        return None
    gtin_normalized = normalize_gtin(barcode)
    if not gtin_normalized:
        return None
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    return product.id if product else None


def backfill_parasite_records(db, apply: bool) -> tuple[int, int]:
    """Retorna (candidatos, resolvidos)."""
    records = db.scalars(
        select(ParasiteControlRecord).where(
            ParasiteControlRecord.barcode.isnot(None),
            ParasiteControlRecord.product_id.is_(None),
        )
    ).all()

    candidates = len(records)
    resolved = 0
    for record in records:
        product_id = _resolve_product_id(db, record.barcode)
        if product_id is None:
            continue
        resolved += 1
        print(f"  parasite_control_records id={record.id} barcode={record.barcode} -> product_id={product_id}")
        if apply:
            record.product_id = product_id

    return candidates, resolved


def backfill_feeding_plans(db, apply: bool) -> tuple[int, int]:
    """Retorna (candidatos, resolvidos) — candidato é por ITEM dentro do
    items_json, não por linha de feeding_plans."""
    plans = db.scalars(select(FeedingPlan).where(FeedingPlan.items_json.isnot(None))).all()

    candidates = 0
    resolved = 0
    for plan in plans:
        try:
            items = json.loads(plan.items_json)
        except (TypeError, ValueError, json.JSONDecodeError):
            continue
        if not isinstance(items, list):
            continue

        changed = False
        for item in items:
            if not isinstance(item, dict):
                continue
            barcode = item.get("barcode")
            if not barcode or item.get("product_id"):
                continue
            candidates += 1
            product_id = _resolve_product_id(db, barcode)
            if product_id is None:
                continue
            resolved += 1
            print(f"  feeding_plans id={plan.id} item={item.get('id')} barcode={barcode} -> product_id={product_id}")
            item["product_id"] = product_id
            changed = True

        if changed and apply:
            plan.items_json = json.dumps(items, ensure_ascii=False)

    return candidates, resolved


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Aplica de verdade (padrão: dry-run)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        print("=== parasite_control_records ===")
        pc_candidates, pc_resolved = backfill_parasite_records(db, args.apply)
        print(f"  {pc_resolved}/{pc_candidates} resolvidos")

        print("=== feeding_plans (itens em items_json) ===")
        fp_candidates, fp_resolved = backfill_feeding_plans(db, args.apply)
        print(f"  {fp_resolved}/{fp_candidates} resolvidos")

        if args.apply:
            db.commit()
            print("\nAplicado.")
        else:
            db.rollback()
            print("\nDry-run — nada foi escrito. Rode com --apply para aplicar de verdade.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

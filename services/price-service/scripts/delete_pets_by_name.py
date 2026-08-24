#!/usr/bin/env python3
"""Delete pets and pet-owned rows by exact pet name.

Usage:
  PYTHONPATH=src python3 scripts/delete_pets_by_name.py --name Marley --name "Baby 2" --name Mingau
  PYTHONPATH=src python3 scripts/delete_pets_by_name.py --apply --name Marley --name "Baby 2" --name Mingau
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
from typing import Any

from sqlalchemy import MetaData, delete, func, select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".secrets" / ".env")
    load_dotenv(ROOT / ".env")
except Exception:
    pass

from src.db import engine  # noqa: E402


SKIP_TABLES = {"pets", "missing_pets"}
PET_ID_COLUMN_NAMES = {"pet_id"}
MISSING_PET_ID_COLUMN_NAMES = {"missing_pet_id", "matched_missing_pet_id"}


def _table_sort_key(item: tuple[str, Any]) -> tuple[int, str]:
    name, table = item
    # Delete relationship/fact rows before owner rows that other rows can
    # point at. `pets` is handled explicitly at the end.
    owner_rank = {
        "missing_pets": 90,
    }.get(name, 10)
    return owner_rank, table.name


def main() -> int:
    parser = argparse.ArgumentParser(description="Delete pets by exact name.")
    parser.add_argument("--name", action="append", required=True, help="Exact pet name to remove. Can be repeated.")
    parser.add_argument("--apply", action="store_true", help="Persist deletion. Default is dry-run.")
    args = parser.parse_args()

    names = [name.strip() for name in args.name if name.strip()]
    if not names:
        raise SystemExit("At least one non-empty --name is required.")

    metadata = MetaData()
    metadata.reflect(bind=engine)
    pets = metadata.tables["pets"]

    with engine.begin() as conn:
        target_rows = conn.execute(
            select(pets.c.id, pets.c.name, pets.c.user_id).where(pets.c.name.in_(names))
        ).mappings().all()
        target_ids = [row["id"] for row in target_rows]
        missing_pet_ids: list[str] = []
        if target_ids and "missing_pets" in metadata.tables:
            missing_pets = metadata.tables["missing_pets"]
            if "pet_id" in missing_pets.c:
                missing_pet_ids = list(
                    conn.execute(select(missing_pets.c.id).where(missing_pets.c.pet_id.in_(target_ids))).scalars().all()
                )

        plan: list[dict[str, Any]] = []
        if target_ids:
            for table_name, table in sorted(metadata.tables.items(), key=_table_sort_key):
                if table_name in SKIP_TABLES:
                    continue
                for column_name in PET_ID_COLUMN_NAMES:
                    if column_name not in table.c:
                        continue
                    count = conn.execute(
                        select(func.count()).select_from(table).where(table.c[column_name].in_(target_ids))
                    ).scalar_one()
                    if count:
                        plan.append({
                            "action": "delete",
                            "table": table_name,
                            "column": column_name,
                            "rows": int(count),
                            "value_set": "pet_ids",
                        })
                for column_name in MISSING_PET_ID_COLUMN_NAMES:
                    if column_name not in table.c or not missing_pet_ids:
                        continue
                    count = conn.execute(
                        select(func.count()).select_from(table).where(table.c[column_name].in_(missing_pet_ids))
                    ).scalar_one()
                    if count:
                        plan.append({
                            "action": "delete",
                            "table": table_name,
                            "column": column_name,
                            "rows": int(count),
                            "value_set": "missing_pet_ids",
                        })

            if missing_pet_ids:
                missing_pets = metadata.tables["missing_pets"]
                count = conn.execute(
                    select(func.count()).select_from(missing_pets).where(missing_pets.c.id.in_(missing_pet_ids))
                ).scalar_one()
                if count:
                    plan.append({
                        "action": "delete",
                        "table": "missing_pets",
                        "column": "id",
                        "rows": int(count),
                        "value_set": "missing_pet_ids",
                    })

        result: dict[str, Any] = {
            "dry_run": not args.apply,
            "names": names,
            "pets": [dict(row) for row in target_rows],
            "missing_pet_ids": missing_pet_ids,
            "plan": plan,
            "affected": {},
        }

        if args.apply and target_ids:
            for step in plan:
                table = metadata.tables[step["table"]]
                values = missing_pet_ids if step["value_set"] == "missing_pet_ids" else target_ids
                deleted = conn.execute(delete(table).where(table.c[step["column"]].in_(values)))
                result["affected"][f"{step['table']}.{step['column']}"] = int(deleted.rowcount or 0)
            deleted_pets = conn.execute(delete(pets).where(pets.c.id.in_(target_ids)))
            result["affected"]["pets.id"] = int(deleted_pets.rowcount or 0)

    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

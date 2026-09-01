#!/usr/bin/env python3
"""
Backfill dos GRUPOS DE SKU cross-GTIN (ver src/sku_grouping.py).

Determinístico, só banco, idempotente. Nunca associa por nome parecido.
Não apaga confirmações/rejeições de admin.

Exemplos:
    python3 scripts/backfill_sku_groups.py --dry-run --limit 50
    python3 scripts/backfill_sku_groups.py --apply --limit 20000
    python3 scripts/backfill_sku_groups.py --apply --gtin 7896185907004
    python3 scripts/backfill_sku_groups.py --confirm 7896185907004 7896185957009 --by leonardo
    python3 scripts/backfill_sku_groups.py --reject  7896185907004 7896185907011 --by leonardo
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".secrets" / ".env")
    load_dotenv(ROOT / ".env")
except Exception:
    pass

import src.commerce_quality_optimizer  # noqa: F401,E402 — registra os modelos
from src.db import SessionLocal  # noqa: E402
from src import sku_grouping as sg  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtin", action="append", default=[])
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--json", action="store_true")
    ap.add_argument("--confirm", nargs=2, metavar=("GTIN_A", "GTIN_B"))
    ap.add_argument("--reject", nargs=2, metavar=("GTIN_A", "GTIN_B"))
    ap.add_argument("--by", default="cli")
    args = ap.parse_args()

    with SessionLocal() as db:
        if args.confirm:
            key = sg.confirm_membership(db, args.confirm[0], args.confirm[1], args.by)
            db.commit()
            print(f"confirmado: {key}")
            return 0
        if args.reject:
            key = sg.reject_pair(db, args.reject[0], args.reject[1], args.by)
            db.commit()
            print(f"rejeitado: {key}")
            return 0

        dry = not args.apply or args.dry_run
        if args.gtin:
            for g in args.gtin:
                r = sg.rebuild_groups_for_gtin(db, g, dry_run=dry)
                if not dry:
                    db.commit()
                print(json.dumps(vars(r), ensure_ascii=False, default=str))
            return 0

        if dry:
            print(json.dumps({"note": "dry-run — nada gravado; use --apply", "would_process": args.limit}))
            return 0

        summary = sg.rebuild_groups_batch(db, max_products=args.limit)

    payload = vars(summary)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    else:
        for k, v in payload.items():
            print(f"  {k:12s} {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

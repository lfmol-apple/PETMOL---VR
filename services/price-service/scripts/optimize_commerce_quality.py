#!/usr/bin/env python3
"""Run PETMOL commerce quality optimization.

Examples:
  PYTHONPATH=src python3 scripts/optimize_commerce_quality.py --dry-run
  PYTHONPATH=src python3 scripts/optimize_commerce_quality.py --apply --limit 300
  PYTHONPATH=src python3 scripts/optimize_commerce_quality.py --apply --sync-shopee --limit 50
  PYTHONPATH=src python3 scripts/optimize_commerce_quality.py --apply --sync-shopee --refresh-existing-shopee --limit 100
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

from src.commerce_quality_optimizer import optimize_commerce_quality  # noqa: E402
from src.db import SessionLocal  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Optimize PETMOL product image/price/offer coverage.")
    parser.add_argument("--limit", type=int, default=300, help="Maximum pet commerce items to inspect.")
    parser.add_argument("--apply", action="store_true", help="Persist safe local-feed enrichments.")
    parser.add_argument("--dry-run", action="store_true", help="Do not persist anything. Default when --apply is absent.")
    parser.add_argument("--sync-shopee", action="store_true", help="Also call Shopee API for prioritized GTINs with no Shopee offer.")
    parser.add_argument("--refresh-existing-shopee", action="store_true", help="When --sync-shopee is enabled, revalidate existing Shopee offers too.")
    parser.add_argument("--resolve-gtin", action="store_true", help="Call configured GTIN providers when catalog/image is missing.")
    parser.add_argument("--autofill-safe-gtin", action="store_true", help="Write GTIN into pet-linked records only for unambiguous high-confidence suggestions.")
    parser.add_argument("--no-feed-enrich", action="store_true", help="Disable enrichment from already-synced Awin feeds.")
    parser.add_argument("--catalog-enrich-limit", type=int, default=0,
                        help="Also run the deterministic catalog master enrichment (merge_product_catalog_identity) "
                             "for up to N feed GTINs (tutor-scanned first). 0 = skip.")
    parser.add_argument("--summary-only", action="store_true", help="Print only aggregate metrics.")
    args = parser.parse_args()

    dry_run = not args.apply or args.dry_run
    catalog_enrich_summary = None
    if args.catalog_enrich_limit > 0 and not dry_run:
        from src.catalog_enrichment import enrich_feed_catalog_batch  # noqa: E402

        with SessionLocal() as db:
            batch = enrich_feed_catalog_batch(db, max_products=args.catalog_enrich_limit)
        catalog_enrich_summary = vars(batch)

    with SessionLocal() as db:
        result = optimize_commerce_quality(
            db,
            limit=args.limit,
            dry_run=dry_run,
            enrich_from_feed=not args.no_feed_enrich,
            sync_shopee=args.sync_shopee,
            refresh_existing_shopee=args.refresh_existing_shopee,
            resolve_gtin=args.resolve_gtin,
            autofill_safe_gtin=args.autofill_safe_gtin,
        )

    payload = result.to_dict()
    if args.summary_only:
        payload = {key: value for key, value in payload.items() if key != "items"}
    if catalog_enrich_summary is not None:
        payload["catalog_master_enrichment"] = catalog_enrich_summary
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

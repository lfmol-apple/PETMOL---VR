#!/usr/bin/env python3
"""
Backfill do CATÁLOGO MESTRE — roda merge_product_catalog_identity para os
GTINs presentes nos feeds Awin já sincronizados.

Determinístico, só banco, sem rede. Seguro re-rodar (idempotente).
Nunca apaga ProductCatalog/MarketplaceOffer/ProductAffiliateLink; nunca
rebaixa dado canônico bom (ver catalog_enrichment.py).

Exemplos:
    python3 scripts/backfill_catalog_identity.py --dry-run --limit 50
    python3 scripts/backfill_catalog_identity.py --apply --limit 5000
    python3 scripts/backfill_catalog_identity.py --apply --gtin 7896181298090
    python3 scripts/backfill_catalog_identity.py --apply --all   # tudo, ignora "stale"
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
from src.catalog_enrichment import enrich_feed_catalog_batch, merge_product_catalog_identity  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtin", action="append", default=[], help="só estes GTINs")
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--all", action="store_true", help="processa todos, não só os stale/nunca-enriquecidos")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()
    dry = not args.apply or args.dry_run

    with SessionLocal() as db:
        if args.gtin:
            results = []
            for g in args.gtin:
                r = merge_product_catalog_identity(db, g, dry_run=dry)
                if not dry:
                    db.commit()
                results.append(vars(r))
            print(json.dumps(results, ensure_ascii=False, indent=2, default=str))
            return 0

        if dry:
            # dry-run: só conta o que MUDARIA (usa a mesma fila, sem commit)
            summary = {"note": "dry-run — nada gravado; use --apply", "would_process": args.limit}
            print(json.dumps(summary, ensure_ascii=False, indent=2))
            return 0

        batch = enrich_feed_catalog_batch(db, max_products=args.limit, only_stale=not args.all)

    payload = vars(batch)
    if args.json:
        print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    else:
        for k, v in payload.items():
            print(f"  {k:12s} {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

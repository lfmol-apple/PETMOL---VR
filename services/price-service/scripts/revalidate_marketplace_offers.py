#!/usr/bin/env python3
"""
Revalida ofertas de marketplace legadas (Fase 1-D / M2).

Para cada MarketplaceOffer ATIVA que tem merchant_title mas nunca passou
pelo Product Identity Engine (match_decision NULL), roda evaluate_identity
contra o catálogo e grava match_decision/confidence/reasons.

Só um CONFLICT explícito desativa a oferta. Linha sem merchant_title fica
INTACTA — servir-por-padrão é preservado (não repete d6cfd6b).

    python3 scripts/revalidate_marketplace_offers.py --dry-run --limit 500
    python3 scripts/revalidate_marketplace_offers.py --apply --limit 100000
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

import src.commerce_quality_optimizer  # noqa: F401,E402
from sqlalchemy import select  # noqa: E402

from src.affiliate_links import MarketplaceOffer  # noqa: E402
from src.db import SessionLocal  # noqa: E402
from src.product_catalog_lookup import ProductCatalog  # noqa: E402
from src.product_identity import (  # noqa: E402
    IdentityDecision,
    MerchantCandidate,
    ProductIdentity,
    evaluate_identity,
)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=1000)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--apply", action="store_true")
    args = ap.parse_args()
    dry = not args.apply or args.dry_run

    stats = {"scanned": 0, "decided": 0, "conflict_deactivated": 0, "errors": 0}
    with SessionLocal() as db:
        rows = db.scalars(
            select(MarketplaceOffer).where(
                MarketplaceOffer.active.is_(True),
                MarketplaceOffer.merchant_title.isnot(None),
                MarketplaceOffer.match_decision.is_(None),
            ).limit(args.limit)
        ).all()
        for offer in rows:
            stats["scanned"] += 1
            try:
                product = db.get(ProductCatalog, offer.product_id)
                if product is None:
                    continue
                identity = ProductIdentity.from_catalog(product)
                result = evaluate_identity(
                    identity,
                    MerchantCandidate.build(
                        merchant=offer.merchant, title=offer.merchant_title,
                        gtin=offer.merchant_gtin, price=offer.price,
                    ),
                )
                if not dry:
                    offer.match_decision = result.decision.value
                    offer.match_confidence = result.confidence
                    offer.match_reasons_json = json.dumps(list(result.reasons), ensure_ascii=False)
                    if result.decision == IdentityDecision.CONFLICT:
                        offer.active = False
                stats["decided"] += 1
                if result.decision == IdentityDecision.CONFLICT:
                    stats["conflict_deactivated"] += 1
            except Exception as exc:  # noqa: BLE001
                stats["errors"] += 1
                print(f"  offer={offer.id} erro: {exc}", file=sys.stderr)
        if not dry:
            db.commit()

    print(json.dumps({"dry_run": dry, **stats}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

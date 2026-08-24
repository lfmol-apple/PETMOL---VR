#!/usr/bin/env python3
"""Audit barcode/image/offer coverage for pet-linked commerce items."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys

from sqlalchemy import select

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".secrets" / ".env")
    load_dotenv(ROOT / ".env")
except Exception:
    pass

from src.affiliate_feed import AffiliateFeedOffer  # noqa: E402
from src.commerce_quality_optimizer import collect_pet_commerce_items, compute_status, suggest_gtins_for_item  # noqa: E402
from src.db import SessionLocal  # noqa: E402
from src.pets.models import Pet  # noqa: E402
from src.product_catalog_lookup import ProductCatalog, ProductLearningEvent  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description="Audit PETMOL commerce coverage by pet.")
    parser.add_argument("--pet-name", action="append", default=[], help="Exact pet name to include. Can be repeated.")
    parser.add_argument("--all", action="store_true", help="Include all pets.")
    args = parser.parse_args()

    with SessionLocal() as db:
        pets = {p.id: p.name for p in db.query(Pet).all()}
        selected_names = {name.strip() for name in args.pet_name if name.strip()}
        items = collect_pet_commerce_items(db)
        if not args.all and selected_names:
            items = [item for item in items if pets.get(item.pet_id) in selected_names]
        elif not args.all:
            items = [item for item in items if pets.get(item.pet_id) == "Baby"]

        payload = []
        for item in items:
            status = compute_status(db, item)
            product = None
            awin_rows = []
            if item.gtin:
                product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == item.gtin))
                awin_rows = db.scalars(
                    select(AffiliateFeedOffer).where(
                        AffiliateFeedOffer.gtin == item.gtin,
                        AffiliateFeedOffer.active.is_(True),
                        AffiliateFeedOffer.in_stock.is_(True),
                    ).order_by(AffiliateFeedOffer.merchant.asc(), AffiliateFeedOffer.price.asc())
                ).all()
            learning_rows = db.scalars(
                select(ProductLearningEvent).where(
                    ProductLearningEvent.pet_id == item.pet_id,
                    ProductLearningEvent.barcode_normalized.isnot(None),
                ).order_by(ProductLearningEvent.created_at.desc()).limit(20)
            ).all()
            payload.append({
                "pet": pets.get(item.pet_id, item.pet_id),
                "source": item.source,
                "record_id": item.record_id,
                "label": item.label,
                "gtin": item.gtin,
                "has_image": status.has_image,
                "offer_count": status.offer_count,
                "merchants": status.merchants,
                "min_price": status.min_price,
                "catalog_name": product.name if product else None,
                "catalog_image": product.thumbnail_url if product else None,
                "awin": [
                    {
                        "merchant": row.merchant,
                        "title": row.title,
                        "price": row.price,
                        "image": bool(row.image_url),
                    }
                    for row in awin_rows[:12]
                ],
                "pet_learning_gtins": [
                    {
                        "gtin": row.barcode_normalized,
                        "name": row.resolved_name,
                        "category": row.resolved_category,
                        "confirmed": row.tutor_confirmed,
                    }
                    for row in learning_rows[:8]
                ],
                "suggestions": [
                    {
                        "gtin": suggestion.gtin,
                        "score": suggestion.score,
                        "source": suggestion.source,
                        "merchant": suggestion.merchant,
                        "price": suggestion.price,
                        "name": suggestion.name,
                    }
                    for suggestion in (suggest_gtins_for_item(db, item, limit=5) if not item.gtin else [])
                ],
            })

        print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

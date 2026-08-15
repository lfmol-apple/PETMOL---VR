#!/usr/bin/env python3
"""Diagnóstico read-only: pra um pet, lista o GTIN do plano de ração e o
histórico de parasite_control_records (com barcode), e cruza cada GTIN
encontrado contra o catálogo Awin/Cobasi sincronizado (affiliate_feed_offers)
pra ver se ele realmente resolveria uma oferta hoje.

Uso: python diag_baby_commerce.py --pet-id <id>
     python diag_baby_commerce.py --pet-name Baby
"""
import argparse
import json
import sys
from pathlib import Path

PRICE_SERVICE_DIR = Path.cwd()
sys.path.insert(0, str(PRICE_SERVICE_DIR))

env_file = PRICE_SERVICE_DIR / ".env"
if env_file.exists():
    import os
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

import src.main  # noqa: F401 — força registro completo dos models SQLAlchemy
from src.db import SessionLocal
from src.pets.models import Pet
from src.pets.parasite_models import ParasiteControlRecord
from src.health.models import FeedingPlan
from src.affiliate_feed import AffiliateFeedOffer


def check_gtin(db, gtin: str) -> str:
    if not gtin:
        return "sem gtin"
    row = (
        db.query(AffiliateFeedOffer)
        .filter(
            AffiliateFeedOffer.network == "awin",
            AffiliateFeedOffer.merchant == "cobasi",
            AffiliateFeedOffer.gtin == gtin,
        )
        .first()
    )
    if row is None:
        return f"gtin={gtin} — NÃO está no catálogo Awin/Cobasi sincronizado"
    status = "active" if row.active else "INACTIVE"
    stock = "in_stock" if row.in_stock else "OUT_OF_STOCK"
    return f"gtin={gtin} — encontrado no catálogo: {status} {stock} | {row.title} | price={row.price}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pet-name", default=None)
    ap.add_argument("--pet-id", default=None)
    args = ap.parse_args()

    db = SessionLocal()
    try:
        if args.pet_id:
            pets = db.query(Pet).filter(Pet.id == args.pet_id).all()
        else:
            pets = db.query(Pet).filter(Pet.name.ilike(f"%{args.pet_name}%")).all()

        for pet in pets:
            print(f"\n########## PET: {pet.name} (id={pet.id}) ##########")

            plan = db.query(FeedingPlan).filter(FeedingPlan.pet_id == pet.id).first()
            if plan is None:
                print("Sem feeding_plan cadastrado.")
            else:
                try:
                    items = json.loads(plan.items_json or "[]")
                except (TypeError, ValueError):
                    items = []
                print(f"Feeding plan: enabled={plan.enabled} mode={plan.mode} top-level food_brand={plan.food_brand!r} items={len(items)}")
                if not items:
                    print(f"  (sem items_json — plano legado, campo único) barcode: N/A nesse formato")
                for item in items:
                    brand = item.get("food_brand")
                    barcode = item.get("barcode")
                    print(f"  item: brand={brand!r} is_primary={item.get('is_primary')} barcode={barcode!r}")
                    print(f"    -> {check_gtin(db, barcode)}")

            parasites = (
                db.query(ParasiteControlRecord)
                .filter(ParasiteControlRecord.pet_id == pet.id, ParasiteControlRecord.deleted.is_(False))
                .order_by(ParasiteControlRecord.date_applied.desc())
                .all()
            )
            print(f"\nParasite control records: {len(parasites)} (mais recente primeiro)")
            for rec in parasites:
                print(f"  [{rec.type}] {rec.product_name!r} date_applied={rec.date_applied} barcode={rec.barcode!r}")
                print(f"    -> {check_gtin(db, rec.barcode)}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

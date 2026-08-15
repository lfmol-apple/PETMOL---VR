#!/usr/bin/env python3
"""Cadastra um controle de coleira antiparasitária (parasite_control_records,
type=collar) usando um produto real do catálogo Awin/Cobasi já sincronizado
(affiliate_feed_offers) como fonte do GTIN — mesmo caminho de resolução
comercial que o app usa (AwinFeedProvider, ver commerce_provider.py).

Uso:
  Descoberta (sem --gtin nem --commit): lista pets e ofertas candidatas.
    python register_collar_from_awin.py --pet-name Baby --search scalibor

  Cadastro real (depois de escolher o GTIN certo na lista acima):
    python register_collar_from_awin.py --pet-name Baby --search scalibor \
      --gtin 7891234567890 --date-applied 2026-08-07 --commit
"""
import argparse
import sys
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "services" / "price-service" / "src"
sys.path.insert(0, str(SRC))

env_file = REPO_ROOT / "services" / "price-service" / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

from db import SessionLocal
from pets.models import Pet
from pets.parasite_models import ParasiteControlRecord
from affiliate_feed import AffiliateFeedOffer


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--pet-name", required=True)
    ap.add_argument("--search", required=True, help="Texto a buscar no título da oferta Awin/Cobasi")
    ap.add_argument("--gtin", help="GTIN escolhido dentre as ofertas listadas — cadastra usando esse produto")
    ap.add_argument("--date-applied", default=datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    ap.add_argument("--frequency-days", type=int, default=120, help="Padrão pra coleira, ver ParasiteItemSheet.tsx CONFIG.collar")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        pets = db.query(Pet).filter(Pet.name.ilike(f"%{args.pet_name}%")).all()
        print(f"=== PETS ('{args.pet_name}') ===")
        for p in pets:
            print(f"  id={p.id} name={p.name} user_id={p.user_id}")
        if not pets:
            print("Nenhum pet encontrado.")

        offers = (
            db.query(AffiliateFeedOffer)
            .filter(
                AffiliateFeedOffer.network == "awin",
                AffiliateFeedOffer.merchant == "cobasi",
                AffiliateFeedOffer.title.ilike(f"%{args.search}%"),
            )
            .all()
        )
        print(f"\n=== OFERTAS AWIN/COBASI ('{args.search}') ===")
        for o in offers:
            status = "active" if o.active else "INACTIVE"
            stock = "in_stock" if o.in_stock else "OUT_OF_STOCK"
            print(f"  gtin={o.gtin} price={o.price} {status} {stock} | {o.title}")
        if not offers:
            print("Nenhuma oferta encontrada — catálogo pode não ter sido sincronizado ainda, ou o termo de busca não bate.")

        if not args.gtin:
            print("\n(modo descoberta — passe --gtin <um dos acima> --commit para cadastrar de verdade)")
            return

        if not args.commit:
            print(f"\n(dry-run — gtin={args.gtin} seria usado; passe --commit para gravar de verdade)")
            return

        if len(pets) != 1:
            print(f"\nERRO: esperava exatamente 1 pet chamado '{args.pet_name}', encontrei {len(pets)}. Aborting.")
            sys.exit(1)
        pet = pets[0]

        offer = next((o for o in offers if o.gtin == args.gtin), None)
        if offer is None:
            print(f"\nERRO: gtin {args.gtin} não está entre as ofertas listadas acima. Aborting.")
            sys.exit(1)

        date_applied = datetime.strptime(args.date_applied, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        collar_expiry = date_applied + timedelta(days=args.frequency_days)

        record = ParasiteControlRecord(
            id=str(uuid.uuid4()),
            pet_id=pet.id,
            type="collar",
            product_name=offer.title,
            date_applied=date_applied,
            frequency_days=args.frequency_days,
            application_form="collar",
            collar_expiry_date=collar_expiry,
            barcode=offer.gtin,
            reminder_enabled=True,
            reminder_days=3,
            reminder_time="09:00",
        )
        db.add(record)
        db.commit()
        print(f"\n=== CADASTRADO ===")
        print(f"  id={record.id} pet_id={record.pet_id} product_name={record.product_name}")
        print(f"  barcode={record.barcode} date_applied={record.date_applied} collar_expiry_date={record.collar_expiry_date}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

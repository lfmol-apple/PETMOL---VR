#!/usr/bin/env python3
"""Clona um registro de controle parasitário (parasite_control_records) de
um pet para outro — mesmo produto, mesmos dados de dosagem/aplicação, com
data de aplicação e custo próprios para o pet de destino.

Uso:
  Descoberta (sem --commit): lista pets e registros candidatos de origem.
    python clone_parasite_record.py --from-pet-name Baby --to-pet-name Frida

  Clonagem real (depois de conferir o --record-id certo na lista acima):
    python clone_parasite_record.py --from-pet-name Baby --to-pet-name Frida \
      --record-id <uuid> --date-applied 2026-07-10 --cost 71.90 --commit
"""
import argparse
import sys
import os
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Mesmo padrão de deploy/scripts/register_collar_from_awin.py — roda
# standalone em /tmp no VPS, com cwd == services/price-service.
PRICE_SERVICE_DIR = Path.cwd()
sys.path.insert(0, str(PRICE_SERVICE_DIR))

env_file = PRICE_SERVICE_DIR / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

import src.main  # noqa: F401 — registra todos os models (relationship() por string)
from src.db import SessionLocal
from src.pets.models import Pet
from src.pets.parasite_models import ParasiteControlRecord


def find_pet(db, name: str, pet_id: str | None):
    pets = db.query(Pet).filter(Pet.name.ilike(f"%{name}%")).all()
    print(f"=== PETS ('{name}') ===")
    for p in pets:
        print(f"  id={p.id} name={p.name} user_id={p.user_id}")
    if not pets:
        print("  nenhum encontrado.")
        return None, pets
    if pet_id:
        pet = next((p for p in pets if p.id == pet_id), None)
        return pet, pets
    if len(pets) == 1:
        return pets[0], pets
    return None, pets


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--from-pet-name", required=True)
    ap.add_argument("--from-pet-id", help="Desambigua se --from-pet-name bater em mais de um pet")
    ap.add_argument("--to-pet-name", required=True)
    ap.add_argument("--to-pet-id", help="Desambigua se --to-pet-name bater em mais de um pet")
    ap.add_argument("--record-type", default="collar")
    ap.add_argument("--record-id", help="ID exato do registro de origem (obrigatório pra --commit se houver mais de um)")
    ap.add_argument("--date-applied", required=False, help="YYYY-MM-DD — data de aplicação no pet de destino")
    ap.add_argument("--cost", type=float, required=False, help="Custo no pet de destino (ex: 71.90)")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        from_pet, from_candidates = find_pet(db, args.from_pet_name, args.from_pet_id)
        to_pet, to_candidates = find_pet(db, args.to_pet_name, args.to_pet_id)

        if from_pet is None:
            if len(from_candidates) > 1:
                print(f"\nERRO: {len(from_candidates)} pets batem com '{args.from_pet_name}' — passe --from-pet-id. Aborting.")
            sys.exit(1)

        records = (
            db.query(ParasiteControlRecord)
            .filter(
                ParasiteControlRecord.pet_id == from_pet.id,
                ParasiteControlRecord.type == args.record_type,
                ParasiteControlRecord.deleted.is_(False),
            )
            .order_by(ParasiteControlRecord.date_applied.desc())
            .all()
        )
        print(f"\n=== REGISTROS tipo={args.record_type!r} de {from_pet.name} (id={from_pet.id}) ===")
        for r in records:
            print(
                f"  id={r.id} product_name={r.product_name!r} date_applied={r.date_applied} "
                f"cost={r.cost} dosage={r.dosage!r} application_form={r.application_form!r} "
                f"active_ingredient={r.active_ingredient!r} frequency_days={r.frequency_days} "
                f"barcode={r.barcode} product_id={r.product_id}"
            )
        if not records:
            print("  nenhum encontrado — nada para clonar.")

        if to_pet is None:
            if len(to_candidates) > 1:
                print(f"\nERRO: {len(to_candidates)} pets batem com '{args.to_pet_name}' — passe --to-pet-id. Aborting.")
            sys.exit(1)

        if not args.record_id:
            print("\n(modo descoberta — passe --record-id <um dos acima> --date-applied AAAA-MM-DD --cost N --commit para clonar de verdade)")
            return

        source = next((r for r in records if r.id == args.record_id), None)
        if source is None:
            print(f"\nERRO: record-id {args.record_id} não está entre os registros listados acima. Aborting.")
            sys.exit(1)

        if not args.date_applied or args.cost is None:
            print("\nERRO: --date-applied e --cost são obrigatórios para clonar. Aborting.")
            sys.exit(1)

        date_applied = datetime.strptime(args.date_applied, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        new_expiry = date_applied + timedelta(days=source.frequency_days or 120)
        new_reminder_date = (new_expiry - timedelta(days=source.alert_days_before or source.reminder_days or 7)).date()

        if not args.commit:
            print(
                f"\n(dry-run — clonaria '{source.product_name}' de {from_pet.name} para {to_pet.name}, "
                f"date_applied={date_applied.date()} cost={args.cost} "
                f"{'collar_expiry_date=' + str(new_expiry.date()) if source.type == 'collar' else ''}; "
                "passe --commit para gravar de verdade)"
            )
            return

        new_record = ParasiteControlRecord(
            id=str(uuid.uuid4()),
            pet_id=to_pet.id,
            type=source.type,
            product_name=source.product_name,
            active_ingredient=source.active_ingredient,
            date_applied=date_applied,
            frequency_days=source.frequency_days,
            application_form=source.application_form,
            veterinarian=source.veterinarian,
            clinic_name=source.clinic_name,
            batch_number=source.batch_number,
            cost=args.cost,
            purchase_location=source.purchase_location,
            barcode=source.barcode,
            product_id=source.product_id,
            collar_expiry_date=new_expiry if source.type == "collar" else None,
            reminder_enabled=source.reminder_enabled,
            reminder_date=new_reminder_date,
            reminder_days=source.reminder_days,
            alert_days_before=source.alert_days_before,
            reminder_time=source.reminder_time,
            notes=source.notes,
        )
        db.add(new_record)
        db.commit()
        print("\n=== CLONADO ===")
        print(f"  id={new_record.id} pet_id={new_record.pet_id} ({to_pet.name}) product_name={new_record.product_name}")
        print(f"  date_applied={new_record.date_applied} cost={new_record.cost} collar_expiry_date={new_record.collar_expiry_date}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

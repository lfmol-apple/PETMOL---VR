#!/usr/bin/env python3
"""Modificação manual pedida pelo tutor: a coleira antiparasitária da Frida
deve usar o MESMO produto e o MESMO código de barras (GTIN) da coleira do
Baby — mantendo as DATAS que já estão no registro da Frida.

Copia de Baby -> Frida, no registro parasite_control_records mais recente
type='collar' de cada pet:
  - product_name
  - barcode (GTIN)
  - active_ingredient
  - product_id (FK do catálogo)

NÃO toca em nada de data/lembrete da Frida: date_applied, next_due_date,
collar_expiry_date, reminder_*, frequency_days ficam exatamente como estão.

Uso (rodar no VPS, cwd == services/price-service):
  python copy_collar_baby_to_frida.py                 # dry-run: mostra os dois registros
  python copy_collar_baby_to_frida.py --commit        # grava
  python copy_collar_baby_to_frida.py --user-id <id>  # se precisar restringir o dono
"""
import argparse
import sys
from pathlib import Path

PRICE_SERVICE_DIR = Path.cwd()
sys.path.insert(0, str(PRICE_SERVICE_DIR))

import os

for _env in (PRICE_SERVICE_DIR / ".env", Path("/opt/petmol/shared/env/api.env")):
    if _env.exists():
        for line in _env.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())
        break

import src.main  # noqa: F401 — força registro completo dos models SQLAlchemy
from src.db import SessionLocal
from src.pets.models import Pet
from src.pets.parasite_models import ParasiteControlRecord


def latest_collar(db, pet_id: str):
    return (
        db.query(ParasiteControlRecord)
        .filter(
            ParasiteControlRecord.pet_id == pet_id,
            ParasiteControlRecord.type == "collar",
            ParasiteControlRecord.deleted.is_(False),
        )
        .order_by(ParasiteControlRecord.date_applied.desc())
        .first()
    )


def find_pet(db, name: str, user_id: str | None):
    q = db.query(Pet).filter(Pet.name.ilike(name))
    if user_id:
        q = q.filter(Pet.user_id == user_id)
    return q.all()


def show(label: str, rec) -> None:
    if rec is None:
        print(f"  {label}: (nenhum registro type='collar')")
        return
    print(f"  {label}: id={rec.id}")
    print(f"      product_name      = {rec.product_name!r}")
    print(f"      barcode           = {rec.barcode!r}")
    print(f"      active_ingredient = {rec.active_ingredient!r}")
    print(f"      product_id        = {rec.product_id!r}")
    print(f"      date_applied      = {rec.date_applied}   (Frida: preservado)")
    print(f"      next_due_date     = {rec.next_due_date}   (Frida: preservado)")
    print(f"      collar_expiry_date= {rec.collar_expiry_date}   (Frida: preservado)")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--user-id", default=None, help="restringe os dois pets a este dono")
    ap.add_argument("--baby-name", default="Baby")
    ap.add_argument("--frida-name", default="Frida")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        babies = find_pet(db, args.baby_name, args.user_id)
        fridas = find_pet(db, args.frida_name, args.user_id)
        print("=== PETS ===")
        for p in babies + fridas:
            print(f"  id={p.id} name={p.name!r} user_id={p.user_id}")

        if len(babies) != 1 or len(fridas) != 1:
            print(f"\nERRO: esperado 1 Baby e 1 Frida (achei {len(babies)} / {len(fridas)}). "
                  "Passe --user-id pra desambiguar. Abortando.")
            sys.exit(1)

        baby, frida = babies[0], fridas[0]
        if baby.user_id != frida.user_id:
            print(f"\nERRO: Baby (dono {baby.user_id}) e Frida (dono {frida.user_id}) "
                  "são de donos diferentes. Abortando.")
            sys.exit(1)

        baby_rec = latest_collar(db, baby.id)
        frida_rec = latest_collar(db, frida.id)

        print("\n=== ANTES ===")
        show("Baby ", baby_rec)
        show("Frida", frida_rec)

        if baby_rec is None:
            print("\nERRO: Baby não tem coleira cadastrada — nada pra copiar. Abortando.")
            sys.exit(1)
        if frida_rec is None:
            print("\nERRO: Frida não tem coleira cadastrada — o tutor pediu pra manter a "
                  "data dela, então precisa existir um registro. Abortando.")
            sys.exit(1)
        if not baby_rec.barcode:
            print("\nERRO: a coleira do Baby não tem barcode/GTIN — nada pra copiar. Abortando.")
            sys.exit(1)

        frida_rec.product_name = baby_rec.product_name
        frida_rec.barcode = baby_rec.barcode
        frida_rec.active_ingredient = baby_rec.active_ingredient
        frida_rec.product_id = baby_rec.product_id

        if not args.commit:
            print("\n(dry-run — nada gravado. Rode com --commit pra aplicar.)")
            db.rollback()
            return

        db.commit()
        db.refresh(frida_rec)
        print("\n=== DEPOIS (Frida, gravado) ===")
        show("Frida", frida_rec)
        print("\nOK — coleira da Frida agora usa o produto/GTIN da coleira do Baby; datas preservadas.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

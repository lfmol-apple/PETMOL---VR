#!/usr/bin/env python3
"""Diagnóstico de documentos no VPS — uso: python diag_pet_docs.py [nome_pet]"""
import sys
import os
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
from pets.document_models import PetDocument

pet_name = sys.argv[1] if len(sys.argv) > 1 else "Baby"

db = SessionLocal()
try:
    pet = db.query(Pet).filter(Pet.name.ilike("%" + pet_name + "%")).first()
    if not pet:
        print("Pet nao encontrado: " + pet_name)
        sys.exit(1)

    print("=== Pet: " + str(pet.name) + " (id=" + str(pet.id) + ") ===")

    docs = (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet.id, PetDocument.deleted_at.is_(None))
        .order_by(PetDocument.created_at)
        .all()
    )
    print("Documentos ativos: " + str(len(docs)))
    for d in docs:
        print("  [" + str(d.category) + "] " + str(d.title) + " | " + str(d.storage_key))

    soft = (
        db.query(PetDocument)
        .filter(PetDocument.pet_id == pet.id, PetDocument.deleted_at.isnot(None))
        .count()
    )
    print("Documentos soft-deleted: " + str(soft))
finally:
    db.close()

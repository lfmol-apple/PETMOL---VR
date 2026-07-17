#!/usr/bin/env python3
"""
Reclassifica todos os documentos de um pet usando o prompt Gemini atual.
Uso: python reclassify_pet_docs.py --pet "Baby"
     python reclassify_pet_docs.py --pet-id "uuid-do-pet"
"""
import argparse
import asyncio
import os
import sys
from pathlib import Path

# Adiciona o src ao path
REPO_ROOT = Path(__file__).resolve().parents[2]
SRC = REPO_ROOT / "services" / "price-service" / "src"
sys.path.insert(0, str(SRC))

# Carrega .env se existir
env_file = REPO_ROOT / "services" / "price-service" / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pet", help="Nome do pet (busca parcial, case-insensitive)")
    parser.add_argument("--pet-id", help="UUID do pet")
    parser.add_argument("--dry-run", action="store_true", help="Não salva, só mostra o que faria")
    args = parser.parse_args()

    if not args.pet and not args.pet_id:
        parser.error("Informe --pet ou --pet-id")

    from db import SessionLocal
    from pets.models import Pet
    from pets.document_models import PetDocument
    from pets.document_router import _classify_from_content, DOCS_UPLOAD_DIR

    db = SessionLocal()
    try:
        # Localiza o pet
        q = db.query(Pet)
        if args.pet_id:
            pet = q.filter(Pet.id == args.pet_id).first()
        else:
            pet = q.filter(Pet.name.ilike(f"%{args.pet}%")).first()

        if not pet:
            print(f"[ERRO] Pet não encontrado: {args.pet or args.pet_id}")
            return

        print(f"[OK] Pet: {pet.name} (id={pet.id})")

        docs = (
            db.query(PetDocument)
            .filter(PetDocument.pet_id == pet.id, PetDocument.deleted_at.is_(None))
            .order_by(PetDocument.created_at)
            .all()
        )
        print(f"[OK] {len(docs)} documentos encontrados\n")

        ok = 0
        fail = 0
        for i, doc in enumerate(docs, 1):
            if not doc.storage_key:
                print(f"  [{i:03d}] SKIP (sem storage_key): {doc.title}")
                continue

            candidate = Path(doc.storage_key)
            fpath = candidate if (candidate.is_absolute() and candidate.is_file()) else DOCS_UPLOAD_DIR / candidate.name
            if not fpath.is_file():
                print(f"  [{i:03d}] SKIP (arquivo não existe): {fpath.name}")
                continue

            mime = doc.mime_type or "application/octet-stream"
            content = fpath.read_bytes()
            filename = fpath.name

            try:
                cat, doc_date, establishment, titulo = await _classify_from_content(content, mime, filename)

                old = f"{doc.category} / {doc.title}"
                new = f"{cat} / {titulo or '(sem título)'}"
                changed = (cat != doc.category) or (titulo and titulo != doc.title)
                marker = "✏️ " if changed else "✓ "

                print(f"  [{i:03d}] {marker}{fpath.name}")
                print(f"        antes : {old}")
                print(f"        depois: {new}")
                if doc_date:
                    print(f"        data  : {doc_date}")
                if establishment:
                    print(f"        local : {establishment}")
                print()

                if not args.dry_run:
                    doc.category = cat
                    if titulo:
                        doc.title = titulo[:255]
                    if doc_date:
                        doc.document_date = doc_date
                    if establishment:
                        doc.establishment_name = establishment[:255]

                ok += 1

            except Exception as exc:
                print(f"  [{i:03d}] ERRO: {fpath.name} — {exc}")
                fail += 1

        if not args.dry_run:
            db.commit()
            print(f"\n✅ Commit realizado. {ok} docs reclassificados, {fail} erros.")
        else:
            print(f"\n🔍 Dry-run concluído. {ok} docs processados, {fail} erros.")

    finally:
        db.close()


if __name__ == "__main__":
    asyncio.run(main())

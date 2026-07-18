#!/usr/bin/env python3
"""
Restaura documentos do Baby a partir do ZIP exportado, via API de produção.

Uso:
    python3 restore_from_zip_local.py --zip ~/Downloads/documentos-baby.zip --token SEU_TOKEN

O token está em: Dev Tools → Application → localStorage → petmol_token
"""

import argparse
import mimetypes
import sys
import zipfile
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Instale o requests: pip3 install requests")

API_BASE = "https://petmol.com.br/api"

# Vacinas têm classificação óbvia; o resto vai para o Gemini decidir.
FOLDER_TO_CATEGORY: dict[str, str | None] = {
    "Vacinas": "vaccine",
    "Exames": None,       # AI decide (pode ter laudos misclassificados aqui)
    "Laudos": None,       # AI decide
    "Receitas": None,     # AI decide (ECO estava errado aqui)
    "Fotos": None,        # AI decide (radiografias estavam aqui)
    "Outros": None,       # AI decide (ultrassom estava aqui)
    "Comprovantes": "comprovante",
}


def get_pet_id(session: requests.Session, pet_name: str) -> str:
    r = session.get(f"{API_BASE}/pets")
    r.raise_for_status()
    pets = r.json()
    for pet in pets:
        if pet_name.lower() in (pet.get("pet_name") or "").lower():
            print(f"Pet encontrado: {pet['pet_name']} (id={pet['pet_id']})")
            return pet["pet_id"]
    names = [p.get("pet_name") for p in pets]
    sys.exit(f"Pet '{pet_name}' não encontrado. Pets disponíveis: {names}")


def get_existing_filenames(session: requests.Session, pet_id: str) -> set[str]:
    r = session.get(f"{API_BASE}/pets/{pet_id}/documents")
    r.raise_for_status()
    docs = r.json()
    keys = set()
    for d in docs:
        sk = d.get("storage_key") or ""
        if sk:
            keys.add(Path(sk).name)
        title = d.get("title") or ""
        if title:
            keys.add(title)
    return keys


def upload_file(
    session: requests.Session,
    pet_id: str,
    file_bytes: bytes,
    filename: str,
    mime: str,
    category: str | None,
) -> dict:
    data = {}
    if category:
        data["category"] = category

    files = [("files", (filename, file_bytes, mime))]
    r = session.post(
        f"{API_BASE}/pets/{pet_id}/documents/upload",
        files=files,
        data=data,
        timeout=60,
    )
    r.raise_for_status()
    return r.json()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--zip", required=True, help="Caminho para documentos-baby.zip")
    parser.add_argument("--token", required=True, help="Token JWT (localStorage petmol_token)")
    parser.add_argument("--pet", default="Baby", help="Nome do pet (padrão: Baby)")
    parser.add_argument("--dry-run", action="store_true", help="Mostra o que seria enviado sem enviar")
    args = parser.parse_args()

    zip_path = Path(args.zip).expanduser()
    if not zip_path.is_file():
        sys.exit(f"ZIP não encontrado: {zip_path}")

    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {args.token}"

    print(f"\n{'='*60}")
    print(f"API: {API_BASE}")
    print(f"ZIP: {zip_path}")
    print(f"Dry-run: {args.dry_run}")
    print(f"{'='*60}\n")

    pet_id = get_pet_id(session, args.pet)
    existing = get_existing_filenames(session, pet_id)
    print(f"Documentos já existentes no banco: {len(existing)}\n")

    ok = fail = skip = dup_skip = 0
    seen_orignames: set[str] = set()  # evita duplicatas dentro do próprio ZIP

    with zipfile.ZipFile(zip_path) as zf:
        entries = sorted(zf.namelist())
        for entry in entries:
            if entry.endswith("/") or "__MACOSX" in entry:
                continue

            parts = Path(entry).parts
            if len(parts) < 3:
                continue

            folder = parts[1]           # Exames / Vacinas / …
            raw_name = parts[2]         # "01 - imagem_65923419_baby.png"

            # Remove o prefixo "NN - " para recuperar o nome original
            if " - " in raw_name:
                orig_name = raw_name.split(" - ", 1)[1]
            else:
                orig_name = raw_name

            # Evita enviar a mesma imagem duas vezes (ex.: 0a8f6056… em Laudos e Exames)
            if orig_name in seen_orignames:
                print(f"  SKIP (duplicata no ZIP): {orig_name}")
                dup_skip += 1
                continue
            seen_orignames.add(orig_name)

            # Verifica se já existe no banco
            if orig_name in existing or Path(orig_name).stem in existing:
                print(f"  SKIP (já existe): {orig_name}")
                skip += 1
                continue

            category = FOLDER_TO_CATEGORY.get(folder)
            mime, _ = mimetypes.guess_type(orig_name)
            mime = mime or "application/octet-stream"

            status = f"[{folder}] {orig_name} → cat={category or 'AI'} ({mime})"

            if args.dry_run:
                print(f"  DRY  {status}")
                ok += 1
                continue

            try:
                file_bytes = zf.read(entry)
                result = upload_file(session, pet_id, file_bytes, orig_name, mime, category)
                ids = [d.get("id", "?") for d in (result if isinstance(result, list) else [result])]
                print(f"  OK   {status} → ids={ids}")
                ok += 1
            except requests.HTTPError as e:
                print(f"  ERRO {status} → {e.response.status_code}: {e.response.text[:200]}")
                fail += 1
            except Exception as e:
                print(f"  ERRO {status} → {e}")
                fail += 1

    print(f"\n{'='*60}")
    print(f"Enviados: {ok}  |  Erros: {fail}  |  Já existiam: {skip}  |  Duplicatas ZIP: {dup_skip}")
    print(f"{'='*60}")
    if fail:
        sys.exit(1)


if __name__ == "__main__":
    main()

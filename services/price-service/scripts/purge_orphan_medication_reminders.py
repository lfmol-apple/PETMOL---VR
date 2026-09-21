#!/usr/bin/env python3
"""Higienização única: pets já apagados ANTES da correção de DELETE /pets/{id}
deixaram eventos e lembretes órfãos (o pet sumiu, mas events/reminders com
o pet_id dele continuaram no banco, e o job de medicação seguia avisando).

Rodar uma vez em produção: python3 -m scripts.purge_orphan_medication_reminders
(ou --dry-run pra só listar, sem apagar nada)."""
import sys

from sqlalchemy import text

from src.db import SessionLocal
from src.user_auth.purge import _PET_CHILD_TABLES


def main(dry_run: bool) -> None:
    db = SessionLocal()
    try:
        orphan_ids = [r[0] for r in db.execute(text(
            "SELECT DISTINCT pet_id FROM events WHERE pet_id NOT IN (SELECT id FROM pets)"
        )).fetchall()]
        if not orphan_ids:
            print("Nenhum evento órfão de pet apagado. Nada a fazer.")
            return
        print(f"{len(orphan_ids)} pet(s) apagado(s) com dados órfãos: {orphan_ids}")
        for t in _PET_CHILD_TABLES:
            n = db.execute(text(f"SELECT count(*) FROM {t} WHERE pet_id = ANY(:ids)"), {"ids": orphan_ids}).scalar()
            if n:
                print(f"  {t}: {n} linha(s){' (removendo)' if not dry_run else ' (dry-run, não removido)'}")
                if not dry_run:
                    db.execute(text(f"DELETE FROM {t} WHERE pet_id = ANY(:ids)"), {"ids": orphan_ids})
        if not dry_run:
            db.commit()
            print("Concluído.")
    finally:
        db.close()


if __name__ == "__main__":
    main(dry_run="--dry-run" in sys.argv)

#!/usr/bin/env python3
"""
Roda a sincronização real do Product Feed Awin pra um merchant e grava em
AffiliateFeedOffer. Ver src/awin_feed_sync.py.

Uso:
    python3 scripts/sync_awin_feed.py cobasi
    python3 scripts/sync_awin_feed.py zeedog
    python3 scripts/sync_awin_feed.py zeenow

Requer AWIN_DATAFEED_KEY configurada (env var ou .env) — nunca commitar um
valor real. enabled=False em awin_advertisers.py não impede o sync rodar
(ele só controla se o AwinFeedProvider é consultado nas telas do tutor);
rodar este script é seguro mesmo antes de o merchant estar "ligado".
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT / ".secrets" / ".env")
    load_dotenv(ROOT / ".env")
except Exception:
    pass

from src.awin_feed_sync import AwinFeedSyncError, sync_awin_feed  # noqa: E402
from src.db import SessionLocal  # noqa: E402


def main() -> int:
    merchant = sys.argv[1] if len(sys.argv) > 1 else "cobasi"
    db = SessionLocal()
    try:
        result = sync_awin_feed(db, merchant)
    except AwinFeedSyncError as exc:
        print(f"Erro: {exc}", file=sys.stderr)
        return 1
    finally:
        db.close()

    print(
        f"[{result.merchant}] {result.rows_seen} linhas no feed, "
        f"{result.rows_upserted} upserted, {result.rows_deactivated} desativados, "
        f"{result.rows_gtin_valid} GTINs válidos, {result.rows_gtin_corrected} corrigidos, "
        f"{result.rows_gtin_invalid} inválidos, {result.duplicate_gtin_groups} grupos duplicados, "
        f"{result.ambiguous_gtin_groups} grupos ambíguos"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Busca e casa ofertas Shopee reais (API oficial) pra uma lista de GTINs
específicos, gravando em MarketplaceOffer. Ver src/shopee_offer_sync.py.

Uso:
    python3 scripts/sync_shopee_offers.py 7891000100103 7891000100240

Requer SHOPEE_AFFILIATE_APP_ID/SHOPEE_AFFILIATE_APP_SECRET configurados
(env var ou .env) — nunca commitar um valor real. Rodar este script é
seguro mesmo com shopee_affiliate_enabled=False (só grava Postgres local,
nunca liga nada pro tutor sozinho — quem decide se a oferta aparece é
is_marketplace_merchant_publicly_servable() em
marketplace_offer_provider.py, checado à parte a cada chamada real).
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db import SessionLocal  # noqa: E402
from src.shopee_offer_sync import sync_shopee_offers_for_gtins  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("gtins", nargs="+")
    parser.add_argument("--weight-kg", type=float, default=None, help="Peso esperado quando o catálogo não traz o peso no nome")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        results = sync_shopee_offers_for_gtins(db, args.gtins, expected_weight_kg=args.weight_kg)
    finally:
        db.close()

    exit_code = 0
    for result in results:
        if result.matched:
            count = len(result.offer_ids or ([result.offer_id] if result.offer_id is not None else []))
            print(f"[{result.gtin}] casado — {count} MarketplaceOffer(s), primeiro id={result.offer_id}")
        else:
            print(f"[{result.gtin}] sem match — {result.reason}", file=sys.stderr)
            exit_code = 1
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())

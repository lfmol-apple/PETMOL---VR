#!/usr/bin/env python3
"""Exporta o catálogo Awin/Cobasi sincronizado (affiliate_feed_offers) pra
um CSV simples (gtin, brand, title, price) — serve de lista de busca pra
gerar links de afiliado equivalentes na Shopee (Oferta de Produto), já que
os dois marketplaces não casam por GTIN automaticamente.

Uso: python export_cobasi_catalog_csv.py [--out /tmp/cobasi_catalog.csv]
"""
import argparse
import csv
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
from src.affiliate_feed import AffiliateFeedOffer


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="/tmp/cobasi_catalog.csv")
    ap.add_argument("--only-active", action="store_true", default=True)
    args = ap.parse_args()

    db = SessionLocal()
    try:
        query = db.query(AffiliateFeedOffer).filter(
            AffiliateFeedOffer.network == "awin",
            AffiliateFeedOffer.merchant == "cobasi",
        )
        if args.only_active:
            query = query.filter(
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
        rows = query.order_by(AffiliateFeedOffer.title.asc()).all()

        with open(args.out, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["gtin", "brand", "title", "price"])
            for row in rows:
                writer.writerow([row.gtin, row.brand or "", row.title or "", row.price])

        print(f"Exportado {len(rows)} produtos para {args.out}")
    finally:
        db.close()


if __name__ == "__main__":
    main()

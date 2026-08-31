#!/usr/bin/env python3
"""
Audita ofertas Shopee ativas já gravadas no PETMOL.

Por padrão roda em modo leitura: mostra a decisão e o motivo, mas não
desliga nada. Use --deactivate-invalid para aplicar a mesma política do
job diário: oferta ativa que não volta como match confiável sai da
exibição e o GTIN fica livre para recasar no próximo sync.

Exemplos:
    python3 scripts/audit_shopee_offers.py --max-rows 50
    python3 scripts/audit_shopee_offers.py --deactivate-invalid --jsonl
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.db import SessionLocal  # noqa: E402
from src.shopee_offer_audit import audit_active_shopee_offers  # noqa: E402


def _item_as_dict(item) -> dict:
    return {
        "decision": item.decision,
        "reason": item.reason,
        "gtin": item.gtin,
        "offer_id": item.offer_id,
        "product_id": item.product_id,
        "external_listing_id": item.external_listing_id,
        "expected_title": item.expected_title,
        "expected_brand": item.expected_brand,
        "expected_weight_kg": item.expected_weight_kg,
        "expected_volume_ml": item.expected_volume_ml,
        "expected_length_cm": item.expected_length_cm,
        "candidate_count": item.candidate_count,
        "matched_listing_ids": item.matched_listing_ids,
        "matched_titles": item.matched_titles,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-rows", type=int, default=None, help="Limita quantas ofertas ativas serão auditadas")
    parser.add_argument("--limit", type=int, default=20, help="Limite por busca na API oficial da Shopee")
    parser.add_argument("--deactivate-invalid", action="store_true", help="Desativa ofertas inválidas no banco")
    parser.add_argument("--jsonl", action="store_true", help="Emite uma linha JSON por oferta auditada")
    parser.add_argument(
        "--source-merchants",
        default="cobasi,zeenow,zeedog",
        help="Merchants Awin usados como referência de identidade, separados por vírgula",
    )
    args = parser.parse_args()

    source_merchants = tuple(part.strip() for part in args.source_merchants.split(",") if part.strip())
    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(
            db,
            source_merchants=source_merchants,
            deactivate_invalid=args.deactivate_invalid,
            limit=args.limit,
            max_rows=args.max_rows,
        )
    finally:
        db.close()

    summary = {
        "total": result.total,
        "valid": result.valid,
        "invalid": result.invalid,
        "deactivated": result.deactivated,
        "errors": result.errors,
        "deactivate_invalid": args.deactivate_invalid,
        "source_merchants": source_merchants,
    }
    if args.jsonl:
        print(json.dumps({"summary": summary}, ensure_ascii=False))
        for item in result.items:
            print(json.dumps(_item_as_dict(item), ensure_ascii=False))
    else:
        print(
            "total={total} valid={valid} invalid={invalid} deactivated={deactivated} errors={errors}".format(
                **summary
            )
        )
        for item in result.items:
            payload = _item_as_dict(item)
            print(
                "[{decision}] {reason} | gtin={gtin} offer_id={offer_id} listing={external_listing_id} "
                "brand={expected_brand!r} weight={expected_weight_kg} volume={expected_volume_ml} length_cm={expected_length_cm} "
                "candidates={candidate_count} matches={matched_listing_ids} title={expected_title!r}".format(
                    **payload
                )
            )

    return 1 if result.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

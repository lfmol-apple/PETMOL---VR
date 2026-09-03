#!/usr/bin/env python3
"""
Audita ofertas Shopee ativas já gravadas no PETMOL — TRI-STATE.

Cada oferta ativa é classificada em:
    valid       identidade confirmada (enriquece a linha)
    conflict    conflito de identidade COMPROVADO (tamanho/linha/peso/...)
                → única classe que desativa
    unresolved  sem evidência suficiente pra confirmar nem rejeitar
                → NÃO desativa, fica pra revalidar
    error       falha operacional da API Shopee → NÃO desativa

Por padrão roda em modo leitura (--dry-run implícito: sem --apply nada é
gravado). Com --apply, só ofertas `conflict` saem de exibição e o GTIN
fica livre pra recasar no próximo sync.

Exemplos:
    python3 scripts/audit_shopee_offers.py --max-rows 50
    python3 scripts/audit_shopee_offers.py --gtins 7896185957009,7896181298090
    python3 scripts/audit_shopee_offers.py --apply --jsonl
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
        "candidate_count": item.candidate_count,
        "matched_listing_id": item.matched_listing_id,
        "matched_title": item.matched_title,
        "match_decision": item.match_decision,
        "match_confidence": item.match_confidence,
        "conflict_reasons": item.conflict_reasons,
        "would_deactivate": item.would_deactivate,
        "would_enrich": item.would_enrich,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--max-rows", type=int, default=None, help="Limita quantas ofertas ativas serão auditadas")
    parser.add_argument("--limit", type=int, default=20, help="Limite por busca na API oficial da Shopee")
    parser.add_argument("--apply", action="store_true", help="Grava no banco (desativa conflitos, enriquece válidas). Sem isso, dry-run.")
    parser.add_argument("--no-deactivate", action="store_true", help="Mesmo com --apply, não desativa conflitos (só enriquece válidas)")
    parser.add_argument("--gtins", default=None, help="Restringe a estes GTINs (separados por vírgula)")
    parser.add_argument("--jsonl", action="store_true", help="Emite uma linha JSON por oferta auditada")
    parser.add_argument(
        "--source-merchants",
        default="cobasi,zeenow,zeedog",
        help="Merchants Awin usados como referência de identidade, separados por vírgula",
    )
    args = parser.parse_args()

    source_merchants = tuple(part.strip() for part in args.source_merchants.split(",") if part.strip())
    only_gtins = None
    if args.gtins:
        only_gtins = {part.strip() for part in args.gtins.split(",") if part.strip()}
    dry_run = not args.apply

    db = SessionLocal()
    try:
        result = audit_active_shopee_offers(
            db,
            source_merchants=source_merchants,
            deactivate_conflicts=not args.no_deactivate,
            dry_run=dry_run,
            limit=args.limit,
            max_rows=args.max_rows,
            only_gtins=only_gtins,
        )
    finally:
        db.close()

    summary = {
        "dry_run": dry_run,
        "total": result.total,
        "valid": result.valid,
        "conflict": result.conflict,
        "unresolved": result.unresolved,
        "errors": result.errors,
        "deactivated": result.deactivated,
        "enriched": result.enriched,
        "resync_gtins": sorted(result.resync_gtins),
        "source_merchants": list(source_merchants),
    }
    if args.jsonl:
        print(json.dumps({"summary": summary}, ensure_ascii=False))
        for item in result.items:
            print(json.dumps(_item_as_dict(item), ensure_ascii=False))
    else:
        print(
            "dry_run={dry_run} total={total} valid={valid} conflict={conflict} "
            "unresolved={unresolved} errors={errors} deactivated={deactivated} "
            "enriched={enriched} resync={resync_gtins}".format(**summary)
        )
        for item in result.items:
            payload = _item_as_dict(item)
            print(
                "[{decision}] {reason} | gtin={gtin} offer_id={offer_id} listing={external_listing_id} "
                "match={match_decision}/{match_confidence} conflicts={conflict_reasons} "
                "candidates={candidate_count} title={expected_title!r}".format(**payload)
            )

    return 1 if result.errors else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""
Auditoria de identidade comercial — as 2 lojas (Cobasi + Shopee) têm que
apontar pro MESMO produto que o PETMOL exibe.

Monta a fila (links Cobasi cadastrados + ofertas Shopee ativas + GTINs
usados pelos tutores), resolve o destino real de cada link Cobasi e
compara com a identidade de verdade (feed Awin por GTIN). Persiste o
veredito em commerce_identity_checks.

Por padrão DESATIVA link Cobasi com mismatch_hard (produto claramente
diferente). Use --report-only pra só relatar.

Exemplos:
    python3 scripts/audit_commerce_identity.py --report-only
    python3 scripts/audit_commerce_identity.py --limit 200
    python3 scripts/audit_commerce_identity.py --gtin 7896181298090
"""
from __future__ import annotations

import argparse
import asyncio
import json
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

import src.commerce_quality_optimizer  # noqa: F401,E402 — registra todos os modelos (Pet↔FeedingPlan etc.)
from src.db import SessionLocal  # noqa: E402
from src.commerce_identity_audit import audit_commerce_identity  # noqa: E402
from src.admin.commerce_identity_router import _build_queue  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--gtin", action="append", default=[], help="audita só estes GTINs")
    ap.add_argument("--limit", type=int, default=800)
    ap.add_argument("--report-only", action="store_true", help="não desativa link nenhum")
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    db = SessionLocal()
    try:
        gtins = list(args.gtin) or _build_queue(db)[: args.limit]
        if not gtins:
            print("fila vazia — nada pra auditar")
            return 0
        report = asyncio.run(audit_commerce_identity(
            db, gtins, deactivate_hard_links=not args.report_only,
        ))
    finally:
        db.close()

    if args.json:
        print(json.dumps({
            "total": report.total,
            "counts": report.counts,
            "deactivated_links": report.deactivated_links,
            "mismatches": [
                {"gtin": r.gtin, "merchant": mv.merchant, "verdict": mv.verdict,
                 "score": round(mv.score, 3), "detail": mv.detail}
                for r in report.results for mv in r.merchants
                if mv.verdict in ("mismatch_hard", "mismatch_soft")
            ],
        }, ensure_ascii=False, indent=2))
        return 0

    print(f"auditados: {report.total}  |  links desativados: {report.deactivated_links}")
    for verdict, n in sorted(report.counts.items()):
        print(f"  {verdict:18s} {n}")
    print()
    for r in report.results:
        for mv in r.merchants:
            if mv.verdict in ("mismatch_hard", "mismatch_soft"):
                print(f"  [{mv.verdict}] {r.gtin} {mv.merchant} score={mv.score:.2f}")
                print(f"      verdade: {r.truth_title!r} ({r.truth_brand})")
                print(f"      {mv.detail}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

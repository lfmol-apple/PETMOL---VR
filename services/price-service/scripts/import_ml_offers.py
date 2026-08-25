#!/usr/bin/env python3
"""
Importa um CSV preenchido (ver export_ml_link_candidates.py) de volta pro
banco, cadastrando cada affiliate_url em MarketplaceOffer(merchant=
"mercadolivre") — mesmo papel que admin/marketplace_offers_router.py faz
um registro por vez, só que em lote. Nunca gera/reescreve a URL: só
aceita exatamente o que veio no CSV, validado pelo mesmo
mercadolivre_link_validator.py do endpoint admin (allowlist de domínio +
parâmetros de rastreamento do afiliado obrigatórios).

Linhas com affiliate_url vazio são ignoradas (você não preencheu todas,
e não tem problema nenhum nisso). Preço é opcional — se você souber,
preencha uma coluna "price" no CSV (formato "199.90"); sem preço, a
oferta fica cadastrada mas CommerceEngine não mostra pro tutor até
alguém confirmar o preço (mesma regra "sem preço real, não aparece" do
resto do sistema — ver marketplace_offer_provider.py).

Uso (dry-run é o padrão — nada é escrito, só mostra o que aconteceria):
    python3 scripts/import_ml_offers.py --csv ml_link_candidates_preenchido.csv --dry-run
    python3 scripts/import_ml_offers.py --csv ml_link_candidates_preenchido.csv --apply

O Gerador de Links do Mercado Livre aceita no máximo 30 URLs por vez
(mesmo limite documentado em export_ml_link_candidates.py), então este
importador também limita a 30 linhas com affiliate_url preenchido por
execução. No --apply, mais de 30 links preenchidos aborta a execução
inteira, sem writes parciais. Rode em lotes de 30 até zerar a fila.

Roda seguro mesmo com mercadolivre_affiliate_enabled=False — só grava
Postgres local, nunca liga nada pro tutor sozinho (quem decide se a
oferta aparece é is_marketplace_merchant_publicly_servable(), checado à
parte a cada chamada real).
"""
from __future__ import annotations

import argparse
import csv
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select  # noqa: E402

from src.affiliate_links import MarketplaceOffer  # noqa: E402
from src.db import SessionLocal  # noqa: E402
from src.mercadolivre_link_validator import InvalidMercadoLivreAffiliateUrlError, validate_mercadolivre_affiliate_url  # noqa: E402
from src.product_catalog_lookup import ProductCatalog  # noqa: E402

MERCHANT = "mercadolivre"
DEFAULT_MAX_BATCH = 30


def _normalize_gtin(value: str | None) -> str:
    return re.sub(r"\D+", "", value or "")


def _filled_affiliate_rows(csv_path: Path) -> int:
    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        return sum(1 for row in reader if (row.get("affiliate_url") or "").strip())


def run_import(csv_path: Path, db, apply: bool, max_batch: int) -> tuple[dict[str, int], list[str]]:
    """Faz uma passada pelo CSV. Sem `apply`, valida e reporta tudo mas
    nunca chama db.add/db.commit — dry-run real, não só "imprime o que
    faria" sem checar o banco de verdade."""
    stats = {"created": 0, "updated": 0, "skipped_empty": 0, "skipped_over_batch": 0}
    errors: list[str] = []
    rows_in_batch = 0
    filled_rows = _filled_affiliate_rows(csv_path)

    effective_max_batch = min(max_batch, DEFAULT_MAX_BATCH) if apply else max_batch

    if apply and filled_rows > effective_max_batch:
        db.rollback()
        return stats, [
            f"CSV tem {filled_rows} linha(s) com affiliate_url preenchida(s); "
            f"--apply aceita no máximo {effective_max_batch}. Nenhuma linha foi gravada."
        ]

    with csv_path.open("r", newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for line_num, row in enumerate(reader, start=2):  # linha 1 é o header
            affiliate_url = (row.get("affiliate_url") or "").strip()
            if not affiliate_url:
                stats["skipped_empty"] += 1
                continue

            if rows_in_batch >= effective_max_batch:
                stats["skipped_over_batch"] += 1
                continue

            product_id_raw = (row.get("product_id") or "").strip()
            if not product_id_raw.isdigit():
                errors.append(f"linha {line_num}: product_id inválido {product_id_raw!r}")
                continue
            product_id = int(product_id_raw)

            product = db.get(ProductCatalog, product_id)
            if not product:
                errors.append(f"linha {line_num}: product_id={product_id} não existe em products_catalog")
                continue

            csv_gtin = _normalize_gtin(row.get("gtin"))
            catalog_gtin = _normalize_gtin(product.barcode_normalized or product.barcode)
            if apply and not csv_gtin:
                errors.append(f"linha {line_num} (product_id={product_id}): gtin obrigatório no --apply")
                continue
            if csv_gtin and csv_gtin != catalog_gtin:
                errors.append(
                    f"linha {line_num} (product_id={product_id}): gtin divergente "
                    f"(csv={csv_gtin!r}, catalog={catalog_gtin!r})"
                )
                continue

            try:
                validate_mercadolivre_affiliate_url(affiliate_url)
            except InvalidMercadoLivreAffiliateUrlError as exc:
                errors.append(f"linha {line_num} (product_id={product_id}): {exc}")
                continue

            price_raw = (row.get("price") or "").strip()
            price = None
            if price_raw:
                try:
                    price = float(price_raw.replace(",", "."))
                except ValueError:
                    errors.append(f"linha {line_num} (product_id={product_id}): price inválido {price_raw!r}, ignorando só o preço")

            rows_in_batch += 1

            existing = db.scalar(
                select(MarketplaceOffer).where(
                    MarketplaceOffer.product_id == product_id,
                    MarketplaceOffer.merchant == MERCHANT,
                )
            )
            now = datetime.now(timezone.utc)
            if existing:
                stats["updated"] += 1
                if apply:
                    existing.affiliate_url = affiliate_url
                    existing.price = price
                    existing.active = True
                    existing.verified_at = now
                    existing.updated_at = now
            else:
                stats["created"] += 1
                if apply:
                    db.add(
                        MarketplaceOffer(
                            product_id=product_id,
                            merchant=MERCHANT,
                            affiliate_url=affiliate_url,
                            price=price,
                            is_available=True,
                            active=True,
                            verified_at=now,
                        )
                    )

    if apply:
        db.commit()
    else:
        db.rollback()

    return stats, errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", type=str, required=True, help="Caminho do CSV preenchido")
    parser.add_argument("--apply", action="store_true", help="Aplica de verdade (padrão: dry-run, nada é escrito)")
    parser.add_argument("--max-batch", type=int, default=DEFAULT_MAX_BATCH, help=f"Máximo de linhas analisadas no dry-run (padrão {DEFAULT_MAX_BATCH}); --apply nunca passa de {DEFAULT_MAX_BATCH}")
    args = parser.parse_args()

    csv_path = Path(args.csv)
    if not csv_path.exists():
        print(f"ERRO: arquivo não encontrado: {csv_path}", file=sys.stderr)
        return 1

    db = SessionLocal()
    try:
        stats, errors = run_import(csv_path, db, apply=args.apply, max_batch=args.max_batch)
    finally:
        db.close()

    mode = "APLICADO" if args.apply else "DRY-RUN (nada foi escrito)"
    print(
        f"{mode}: {stats['created']} criado(s), {stats['updated']} atualizado(s), "
        f"{stats['skipped_empty']} linha(s) sem affiliate_url ignorada(s), "
        f"{stats['skipped_over_batch']} linha(s) além do lote de {args.max_batch} ignorada(s) no dry-run"
    )
    if not args.apply and (stats["created"] or stats["updated"]) and not errors:
        print(f"Rode com --apply pra gravar de verdade: python3 {sys.argv[0]} --csv {args.csv} --apply")
    if errors:
        print(f"{len(errors)} erro(s):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

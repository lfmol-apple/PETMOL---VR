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

Uso:
    python3 scripts/import_ml_offers.py ml_link_candidates_preenchido.csv

Roda seguro mesmo com mercadolivre_affiliate_enabled=False — só grava
Postgres local, nunca liga nada pro tutor sozinho (quem decide se a
oferta aparece é is_marketplace_merchant_publicly_servable(), checado à
parte a cada chamada real).
"""
from __future__ import annotations

import csv
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


def main() -> int:
    if len(sys.argv) != 2:
        print(f"uso: {sys.argv[0]} <caminho_do_csv>", file=sys.stderr)
        return 2

    csv_path = Path(sys.argv[1])
    if not csv_path.exists():
        print(f"ERRO: arquivo não encontrado: {csv_path}", file=sys.stderr)
        return 1

    db = SessionLocal()
    created = 0
    updated = 0
    skipped_empty = 0
    errors: list[str] = []

    try:
        with csv_path.open("r", newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for line_num, row in enumerate(reader, start=2):  # linha 1 é o header
                affiliate_url = (row.get("affiliate_url") or "").strip()
                if not affiliate_url:
                    skipped_empty += 1
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

                existing = db.scalar(
                    select(MarketplaceOffer).where(
                        MarketplaceOffer.product_id == product_id,
                        MarketplaceOffer.merchant == MERCHANT,
                    )
                )
                now = datetime.now(timezone.utc)
                if existing:
                    existing.affiliate_url = affiliate_url
                    existing.price = price
                    existing.active = True
                    existing.verified_at = now
                    existing.updated_at = now
                    updated += 1
                else:
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
                    created += 1

        db.commit()
    finally:
        db.close()

    print(f"OK: {created} criado(s), {updated} atualizado(s), {skipped_empty} linha(s) sem affiliate_url ignorada(s)")
    if errors:
        print(f"{len(errors)} erro(s):", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

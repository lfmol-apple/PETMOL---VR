"""
scripts/import_ml_offers.py — §14/§22 da auditoria de monetização
(25/08/2026): importador de CSV do Mercado Livre precisa ser dry-run por
padrão, respeitar o lote de 30 do Gerador de Links oficial, e nunca
aceitar uma URL sem os parâmetros de rastreamento do gerador (nunca
reescreve/inventa nada — ver mercadolivre_link_validator.py).
"""
from __future__ import annotations

import csv
import importlib.util
import sys
from pathlib import Path

from sqlalchemy import select

from src.affiliate_links import MarketplaceOffer
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog

SCRIPT_PATH = Path(__file__).resolve().parent.parent / "scripts" / "import_ml_offers.py"

_spec = importlib.util.spec_from_file_location("import_ml_offers", SCRIPT_PATH)
import_ml_offers = importlib.util.module_from_spec(_spec)
sys.modules["import_ml_offers"] = import_ml_offers
_spec.loader.exec_module(import_ml_offers)

OFFICIAL_URL = "https://www.mercadolivre.com.br/social/petmol?matt_word=petmol&matt_tool=1&ref=x"
PLAIN_URL = "https://www.mercadolivre.com.br/produto/p/MLB999"


def _register_product(gtin: str) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Produto Teste ML", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _write_csv(tmp_path: Path, rows: list[dict]) -> Path:
    csv_path = tmp_path / "ml.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=["product_id", "affiliate_url", "price"])
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return csv_path


def _offer_count() -> int:
    db = SessionLocal()
    try:
        return len(db.scalars(select(MarketplaceOffer).where(MarketplaceOffer.merchant == "mercadolivre")).all())
    finally:
        db.close()


def test_ml_csv_dry_run(tmp_path):
    """Padrão é dry-run: reporta o que faria mas não grava nada no banco."""
    product_id = _register_product("7896000000101")
    csv_path = _write_csv(tmp_path, [{"product_id": product_id, "affiliate_url": OFFICIAL_URL, "price": "99.90"}])

    before = _offer_count()
    db = SessionLocal()
    try:
        stats, errors = import_ml_offers.run_import(csv_path, db, apply=False, max_batch=30)
    finally:
        db.close()

    assert errors == []
    assert stats["created"] == 1
    assert _offer_count() == before  # nada foi escrito


def test_ml_csv_apply_actually_writes(tmp_path):
    product_id = _register_product("7896000000102")
    csv_path = _write_csv(tmp_path, [{"product_id": product_id, "affiliate_url": OFFICIAL_URL, "price": "99.90"}])

    db = SessionLocal()
    try:
        stats, errors = import_ml_offers.run_import(csv_path, db, apply=True, max_batch=30)
    finally:
        db.close()

    assert errors == []
    assert stats["created"] == 1

    db = SessionLocal()
    try:
        offer = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.product_id == product_id, MarketplaceOffer.merchant == "mercadolivre"))
        assert offer is not None
        assert offer.affiliate_url == OFFICIAL_URL
    finally:
        db.close()


def test_ml_csv_rejects_invalid_tracking(tmp_path):
    """URL de produto comum (sem matt_word/matt_tool) — rejeitada, nunca
    cadastrada, mesmo em dry-run (o erro tem que aparecer no relatório)."""
    product_id = _register_product("7896000000103")
    csv_path = _write_csv(tmp_path, [{"product_id": product_id, "affiliate_url": PLAIN_URL, "price": ""}])

    db = SessionLocal()
    try:
        stats, errors = import_ml_offers.run_import(csv_path, db, apply=False, max_batch=30)
    finally:
        db.close()

    assert stats["created"] == 0
    assert len(errors) == 1
    assert str(product_id) in errors[0]


def test_ml_csv_batch_30(tmp_path):
    """O Gerador de Links do ML aceita no máximo 30 por vez — o
    importador tem que respeitar o mesmo limite por execução, não
    processar o CSV inteiro de uma vez só porque tem mais de 30 linhas
    preenchidas."""
    rows = []
    for i in range(35):
        product_id = _register_product(f"78960001{i:05d}")
        rows.append({"product_id": product_id, "affiliate_url": OFFICIAL_URL, "price": ""})
    csv_path = _write_csv(tmp_path, rows)

    db = SessionLocal()
    try:
        stats, errors = import_ml_offers.run_import(csv_path, db, apply=False, max_batch=30)
    finally:
        db.close()

    assert errors == []
    assert stats["created"] == 30
    assert stats["skipped_over_batch"] == 5


def test_ml_csv_skips_empty_affiliate_url(tmp_path):
    product_id = _register_product("7896000000199")
    csv_path = _write_csv(tmp_path, [{"product_id": product_id, "affiliate_url": "", "price": ""}])

    db = SessionLocal()
    try:
        stats, errors = import_ml_offers.run_import(csv_path, db, apply=False, max_batch=30)
    finally:
        db.close()

    assert errors == []
    assert stats["skipped_empty"] == 1
    assert stats["created"] == 0

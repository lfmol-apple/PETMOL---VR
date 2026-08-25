"""
GET /v1/admin/monetization-coverage — seção 19 da auditoria de
monetização (25/08/2026): "temos N produtos conhecidos, M já monetizam
no merchant X, faltam N-M" por merchant.
"""
from __future__ import annotations

import pytest

from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import MarketplaceOffer, ProductAffiliateLink
from src.db import SessionLocal
from src.main import app
from src.petz_mapping import confirm_petz_mapping
from src.product_catalog_lookup import ProductCatalog


@pytest.fixture(autouse=True)
def _admin_auth_override():
    app.dependency_overrides[get_current_admin] = lambda: ("fake-user", "fake-admin")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("fake-user", "fake-admin")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def _register_product(gtin: str) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Produto Teste", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def test_coverage_reports_known_and_monetized_per_merchant(client):
    ml_id = _register_product("7896000010001")
    shopee_id = _register_product("7896000010002")
    petz_id = _register_product("7896000010003")
    unmonetized_id = _register_product("7896000010004")

    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=ml_id, merchant="mercadolivre",
            affiliate_url="https://www.mercadolivre.com.br/social/petmol?matt_word=x&matt_tool=1",
            price=50.0, active=True,
        ))
        db.add(MarketplaceOffer(
            product_id=shopee_id, merchant="shopee",
            affiliate_url="https://s.shopee.com.br/abc", price=30.0, active=True,
        ))
        db.commit()
        confirm_petz_mapping(db, petz_id, petz_product_id="999", product_url="https://www.petz.com.br/produto/999")
    finally:
        db.close()

    resp = client.get("/v1/admin/monetization-coverage")
    assert resp.status_code == 200
    data = {row["merchant"]: row for row in resp.json()["data"]}

    assert data["mercadolivre"]["known_products"] == 4
    assert data["mercadolivre"]["monetized_products"] == 1
    assert data["mercadolivre"]["unmonetized_products"] == 3
    assert data["mercadolivre"]["coverage_percent"] == 25.0

    assert data["shopee"]["monetized_products"] == 1
    assert data["petz"]["monetized_products"] == 1  # confirmed = elegível a link direto
    assert unmonetized_id  # produto sem nenhum registro conta como não-monetizado em todo merchant


def test_coverage_counts_cobasi_via_cached_link_or_awin_feed(client):
    cached_id = _register_product("7896000020001")
    awin_id = _register_product("7896000020002")

    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=cached_id, merchant="cobasi",
            affiliate_product_url="https://minhaloja.cobasi.com.br/produto", active=True,
        ))
        db.add(AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870",
            external_product_id="ext-1", gtin="7896000020002",
            affiliate_url="https://www.awin1.com/pclick.php?p=1&a=1&m=17870",
            active=True,
        ))
        db.commit()
    finally:
        db.close()

    resp = client.get("/v1/admin/monetization-coverage")
    data = {row["merchant"]: row for row in resp.json()["data"]}
    assert data["cobasi"]["monetized_products"] == 2


def test_coverage_zero_known_products_reports_none_percent(client):
    resp = client.get("/v1/admin/monetization-coverage")
    data = {row["merchant"]: row for row in resp.json()["data"]}
    assert data["petz"]["known_products"] == 0
    assert data["petz"]["coverage_percent"] is None

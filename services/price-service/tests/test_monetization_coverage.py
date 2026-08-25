"""
GET /v1/admin/monetization-coverage — seção 19 da auditoria original,
seções 10-15/60 da revisão (25/08/2026): matched_products (identidade
confirmada) nunca pode ser confundido com commercially_linked_products
(registro comercial real) nem com publicly_servable_products (o que o
tutor pode ver agora, respeitando todos os gates) — o bug real
encontrado em revisão do PR #69 foi exatamente chamar match Petz de
"monetized".
"""
from __future__ import annotations

import pytest

from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import MarketplaceOffer, ProductAffiliateLink
from src.config import get_settings
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


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    # setenv (não delenv) pros defaults documentados em config.py — um
    # .env local pode ter AWIN_ENABLED=true de sessões manuais de teste,
    # e pydantic-settings lê o .env por fora do processo, então delenv
    # sozinho não é suficiente pra garantir o baseline (mesma causa dos
    # 5 testes pré-existentes que falham só localmente, nunca no CI).
    monkeypatch.delenv("PETZ_AFFILIATE_ENABLED", raising=False)
    monkeypatch.delenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", raising=False)
    monkeypatch.delenv("SHOPEE_AFFILIATE_ENABLED", raising=False)
    monkeypatch.delenv("MERCADOLIVRE_AFFILIATE_ENABLED", raising=False)
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    monkeypatch.setenv("AWIN_ENABLED", "false")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


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


def _coverage_by_merchant(client) -> dict:
    resp = client.get("/v1/admin/monetization-coverage")
    assert resp.status_code == 200
    return {row["merchant"]: row for row in resp.json()["data"]}


def test_coverage_does_not_call_mapping_monetized(client):
    """Regressão do bug real: o schema de resposta não pode ter nenhum
    campo chamado 'monetized_products' que na verdade representa só
    match/identidade confirmada."""
    data = _coverage_by_merchant(client)
    for row in data.values():
        assert "monetized_products" not in row
        assert "unmonetized_products" not in row
        assert {"matched_products", "commercially_linked_products", "publicly_servable_products"} <= row.keys()


def test_petz_confirmed_mapping_is_not_monetized_without_commercial_proof(client, monkeypatch):
    """Produto confirmado no catálogo Petz conta como matched, mas
    commercially_linked/publicly_servable ficam em zero enquanto
    petz_coupon_attribution_verified for false — o estado padrão."""
    petz_id = _register_product("7896000030001")
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, petz_id, petz_product_id="999", product_url="https://www.petz.com.br/produto/999")
    finally:
        db.close()

    data = _coverage_by_merchant(client)
    assert data["petz"]["matched_products"] == 1
    assert data["petz"]["commercially_linked_products"] == 0
    assert data["petz"]["publicly_servable_products"] == 0
    assert data["petz"]["coverage_percent"] == 0.0


def test_petz_matched_and_commercially_verified_are_distinct(client, monkeypatch):
    """Quando a prova comercial existe (as duas flags do gate único
    ligadas), matched e publicly_servable convergem — mas são conceitos
    calculados separadamente, não o mesmo campo reaproveitado."""
    petz_id = _register_product("7896000030002")
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, petz_id, petz_product_id="998", product_url="https://www.petz.com.br/produto/998")
    finally:
        db.close()

    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", "true")
    get_settings.cache_clear()

    data = _coverage_by_merchant(client)
    assert data["petz"]["matched_products"] == 1
    assert data["petz"]["commercially_linked_products"] == 1
    assert data["petz"]["publicly_servable_products"] == 1
    assert data["petz"]["coverage_percent"] == 100.0


def test_coverage_reports_known_and_servable_per_merchant(client):
    ml_id = _register_product("7896000010001")
    shopee_id = _register_product("7896000010002")
    _register_product("7896000010004")  # sem nenhum registro em nenhum merchant

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
    finally:
        db.close()

    data = _coverage_by_merchant(client)

    # mercadolivre_affiliate_enabled é False por padrão — link cadastrado
    # (commercially_linked) não é o mesmo que visível agora (publicly_servable).
    assert data["mercadolivre"]["known_products"] == 3
    assert data["mercadolivre"]["commercially_linked_products"] == 1
    assert data["mercadolivre"]["publicly_servable_products"] == 0
    assert data["mercadolivre"]["pending_products"] == 3

    # shopee_affiliate_enabled é True por padrão — commercially_linked
    # já é publicly_servable aqui.
    assert data["shopee"]["commercially_linked_products"] == 1
    assert data["shopee"]["publicly_servable_products"] == 1
    assert data["shopee"]["coverage_percent"] == round(100 / 3, 1)


def test_coverage_marketplace_becomes_servable_once_gate_opens(client, monkeypatch):
    ml_id = _register_product("7896000010005")
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=ml_id, merchant="mercadolivre",
            affiliate_url="https://www.mercadolivre.com.br/social/petmol?matt_word=x&matt_tool=1",
            price=50.0, active=True,
        ))
        db.commit()
    finally:
        db.close()

    monkeypatch.setenv("MERCADOLIVRE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()

    data = _coverage_by_merchant(client)
    assert data["mercadolivre"]["publicly_servable_products"] == 1


def test_coverage_counts_cobasi_linked_via_cached_link_or_awin_feed_but_not_servable_by_default(client):
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

    data = _coverage_by_merchant(client)
    assert data["cobasi"]["commercially_linked_products"] == 2
    # cobasi_affiliate_mode=disabled (padrão) e awin_enabled=False (padrão)
    # — nenhuma das duas fontes está com o gate aberto.
    assert data["cobasi"]["publicly_servable_products"] == 0


def test_coverage_cobasi_awin_gate_alone_makes_only_awin_ids_servable(client, monkeypatch):
    cached_id = _register_product("7896000020003")
    awin_id = _register_product("7896000020004")

    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=cached_id, merchant="cobasi",
            affiliate_product_url="https://minhaloja.cobasi.com.br/produto", active=True,
        ))
        db.add(AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870",
            external_product_id="ext-2", gtin="7896000020004",
            affiliate_url="https://www.awin1.com/pclick.php?p=2&a=1&m=17870",
            active=True,
        ))
        db.commit()
    finally:
        db.close()

    monkeypatch.setenv("AWIN_ENABLED", "true")
    get_settings.cache_clear()

    data = _coverage_by_merchant(client)
    assert data["cobasi"]["commercially_linked_products"] == 2
    assert data["cobasi"]["publicly_servable_products"] == 1  # só o via-Awin


def test_coverage_zero_known_products_reports_none_percent(client):
    data = _coverage_by_merchant(client)
    assert data["petz"]["known_products"] == 0
    assert data["petz"]["coverage_percent"] is None

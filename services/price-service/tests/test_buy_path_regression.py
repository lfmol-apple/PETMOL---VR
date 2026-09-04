"""
Contrato global anti-regressão pra toda a superfície de buy-path pública.
"""
from __future__ import annotations

import pytest

from src.affiliate_links import (
    MarketplaceOffer,
    PETZ_AFFILIATE_PROGRAM,
    PETZ_COUPON_CODE,
    PETZ_PARTNER_STORE_URL,
)
from src.config import get_settings
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog

GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    for var in (
        "PETZ_AFFILIATE_ENABLED",
        "PETZ_COUPON_ATTRIBUTION_VERIFIED",
        "MERCADOLIVRE_AFFILIATE_ENABLED",
        "PETZ_AFFILIATE_URL",
        "COBASI_AFFILIATE_URL",
        "PETLOVE_AFFILIATE_ENABLED",
        "PETLOVE_DOG_LIFE_URL",
    ):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "true")
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "false")
    monkeypatch.setenv("AWIN_ENABLED", "false")
    # Petz vem LIGADA por padrão desde 04/09/2026 (petz_publicly_disabled
    # default False — ver config.py/docs/PETZ_COMMISSION_VALIDATION.md).
    # Este teste é o contrato "tudo desligado nunca vaza buy-path" — os
    # delenv acima já bastavam pros outros dois gates da Petz caírem no
    # default, mas o kill-switch específico precisa ser forçado aqui
    # também pra manter o cenário "absolutamente tudo off" que o teste se
    # propõe a cobrir.
    monkeypatch.setenv("PETZ_PUBLICLY_DISABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _register_product(gtin: str = GTIN) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Produto Teste", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def test_no_unmonetized_public_buy_paths(client):
    r = client.get("/commerce/offers", params={"q": "racao para cachorro"})
    assert r.status_code == 200
    assert r.json()["offers"] == []

    r = client.get("/commerce/petz-direct-link", params={"gtin": GTIN})
    assert r.json() == {
        "available": False,
        "partner_program_active": False,
        "url": None,
        "direct_product_url": None,
        "search_url": None,
        "partner_store_url": PETZ_PARTNER_STORE_URL,
        "coupon_code": PETZ_COUPON_CODE,
        "affiliate_program": PETZ_AFFILIATE_PROGRAM,
    }

    for merchant in ("petz", "cobasi", "petlove"):
        r = client.get("/commerce/monetized-offer", params={"merchant": merchant, "context": "store"})
        assert r.json()["offer"] is None

    for partner in ("cobasi", "petz", "petlove", "amazon"):
        r = client.get("/handoff/shop", params={"partner": partner}, follow_redirects=False)
        assert r.status_code == 503

    r = client.get("/handoff/doglife", follow_redirects=False)
    assert r.status_code == 503

    r = client.get("/handoff/shopping", params={"query": "racao para cachorro"}, follow_redirects=False)
    assert r.status_code == 302
    assert "not_monetized" in r.headers["location"]


def test_affiliate_only_never_returns_direct_link(client, monkeypatch):
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("MERCADOLIVRE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()

    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=product_id,
            merchant="shopee",
            merchant_title="Produto Teste",
            merchant_gtin=GTIN,
            affiliate_url="https://s.shopee.com.br/real-affiliate-link",
            direct_url="https://shopee.com.br/produto/sem-comissao",
            price=59.9,
            active=True,
        ))
        db.add(MarketplaceOffer(
            product_id=product_id,
            merchant="mercadolivre",
            merchant_title="Produto Teste",
            merchant_gtin=GTIN,
            affiliate_url="https://www.mercadolivre.com.br/social/petmol?matt_word=x&matt_tool=1",
            direct_url="https://www.mercadolivre.com.br/produto/sem-comissao",
            price=79.9,
            active=True,
        ))
        db.commit()
    finally:
        db.close()

    r = client.get("/commerce/offers", params={"gtin": GTIN})
    body = r.json()
    assert len(body["offers"]) >= 1
    for offer in body["offers"]:
        assert "direct_url" not in offer
        assert "sem-comissao" not in offer["url"]
        assert offer["link_type"] != "direct"

    r = client.get("/commerce/monetized-offer", params={"merchant": "mercadolivre", "context": "marketplace", "gtin": GTIN})
    offer = r.json()["offer"]
    assert offer is not None
    assert "direct_url" not in offer
    assert "sem-comissao" not in offer["url"]
    assert offer["link_type"] != "direct"

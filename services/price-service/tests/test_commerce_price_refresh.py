from datetime import datetime, timedelta, timezone

import httpx
from sqlalchemy import select

import src.commerce_price_refresh as refresh_module
from src.affiliate_links import MarketplaceOffer
from src.commerce_price_refresh import refresh_marketplace_prices
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog


GTIN = "7891234500000"


def _register_product(name="Racao Soma Nutricao Carne Adulto Cao 15kg", brand="Soma") -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(
            barcode=GTIN,
            barcode_normalized=GTIN,
            name=name,
            brand=brand,
            canonical_name=name,
            canonical_brand=brand,
        )
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _register_offer(product_id: int, **overrides) -> int:
    defaults = dict(
        product_id=product_id,
        merchant="shopee",
        external_listing_id="111",
        affiliate_url="https://s.shopee.com.br/current",
        direct_url="https://shopee.com.br/product/1/111",
        price=75.9,
        is_available=True,
        active=True,
        verified_at=datetime.now(timezone.utc) - timedelta(days=2),
        last_checked_at=datetime.now(timezone.utc) - timedelta(days=2),
    )
    defaults.update(overrides)
    db = SessionLocal()
    try:
        row = MarketplaceOffer(**defaults)
        db.add(row)
        db.commit()
        db.refresh(row)
        return row.id
    finally:
        db.close()


def test_refresh_updates_only_existing_listing_price(monkeypatch):
    product_id = _register_product()
    offer_id = _register_offer(product_id)
    monkeypatch.setattr(
        refresh_module,
        "search_product_offers",
        lambda keyword, limit=20: [
            {
                "itemId": 111,
                "productName": "Racao Soma Nutricao 15kg Carne Adulto Cao",
                "shopName": "Pet Oficial",
                "price": "79.9",
                "offerLink": "https://s.shopee.com.br/refreshed",
                "productLink": "https://shopee.com.br/product/1/111",
            }
        ],
    )

    db = SessionLocal()
    try:
        summary = refresh_marketplace_prices(db, max_offers=10, delay_seconds=0)
        row = db.get(MarketplaceOffer, offer_id)
        assert summary.processed == 1
        assert summary.refreshed == 1
        assert row.price == 79.9
        assert row.external_listing_id == "111"
        assert row.affiliate_url == "https://s.shopee.com.br/current"
        assert row.price_refresh_status == "refreshed"
        assert row.match_decision in {"EXACT", "HIGH_CONFIDENCE"}
        assert row.merchant_title == "Racao Soma Nutricao 15kg Carne Adulto Cao"
    finally:
        db.close()


def test_refresh_api_error_preserves_old_price_and_returns_success_summary(monkeypatch):
    product_id = _register_product()
    offer_id = _register_offer(product_id, price=75.9)

    def _raise(keyword, limit=20):
        raise refresh_module.ShopeeAffiliateError("temporary failure")

    monkeypatch.setattr(refresh_module, "search_product_offers", _raise)

    db = SessionLocal()
    try:
        summary = refresh_marketplace_prices(db, max_offers=10, delay_seconds=0)
        row = db.get(MarketplaceOffer, offer_id)
        assert summary.api_error == 1
        assert row.price == 75.9
        assert row.is_available is True
        assert row.price_refresh_status == "api_error"
    finally:
        db.close()


def test_refresh_timeout_preserves_old_price(monkeypatch):
    product_id = _register_product()
    offer_id = _register_offer(product_id, price=75.9)

    def _raise(keyword, limit=20):
        raise httpx.TimeoutException("timeout")

    monkeypatch.setattr(refresh_module, "search_product_offers", _raise)

    db = SessionLocal()
    try:
        summary = refresh_marketplace_prices(db, max_offers=10, delay_seconds=0)
        row = db.get(MarketplaceOffer, offer_id)
        assert summary.timeout == 1
        assert row.price == 75.9
        assert row.is_available is True
        assert row.price_refresh_status == "timeout"
    finally:
        db.close()


def test_refresh_does_not_swap_to_other_accepted_listing(monkeypatch):
    product_id = _register_product()
    offer_id = _register_offer(product_id, external_listing_id="111", price=75.9)
    monkeypatch.setattr(
        refresh_module,
        "search_product_offers",
        lambda keyword, limit=20: [
            {
                "itemId": 222,
                "productName": "Racao Soma Nutricao 15kg Carne Adulto Cao",
                "shopName": "Pet Oficial",
                "price": "70.0",
                "offerLink": "https://s.shopee.com.br/other",
                "productLink": "https://shopee.com.br/product/1/222",
            }
        ],
    )

    db = SessionLocal()
    try:
        summary = refresh_marketplace_prices(db, max_offers=10, delay_seconds=0)
        rows = db.scalars(select(MarketplaceOffer)).all()
        row = db.get(MarketplaceOffer, offer_id)
        assert summary.identity_conflict == 1
        assert len(rows) == 1
        assert row.external_listing_id == "111"
        assert row.price == 75.9
        assert row.is_available is False
        assert row.price_refresh_status == "identity_conflict"
    finally:
        db.close()


def test_refresh_stops_gracefully_when_time_limit_is_reached(monkeypatch):
    product_id = _register_product()
    _register_offer(product_id)
    monkeypatch.setattr(refresh_module, "search_product_offers", lambda keyword, limit=20: [])

    db = SessionLocal()
    try:
        summary = refresh_marketplace_prices(
            db,
            max_offers=10,
            delay_seconds=0,
            max_duration_seconds=0,
        )
        assert summary.processed == 0
        assert summary.time_limited is True
        assert summary.remaining >= 1
    finally:
        db.close()

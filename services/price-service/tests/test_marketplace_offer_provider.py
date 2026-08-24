"""
MarketplaceOfferProvider — lê só MarketplaceOffer (nunca chama a rede do
marketplace, nunca scraping). Ver docstring do módulo.
"""
from datetime import datetime, timedelta, timezone

import pytest

from src.affiliate_links import MarketplaceOffer
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.marketplace_offer_provider import MarketplaceOfferProvider, is_marketplace_merchant_publicly_servable
from src.product_catalog_lookup import ProductCatalog

GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    monkeypatch.delenv("SHOPEE_AFFILIATE_ENABLED", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _enable_shopee(monkeypatch) -> None:
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()


def _disable_shopee(monkeypatch) -> None:
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "false")
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


def _register_offer(product_id: int, **overrides) -> None:
    defaults = dict(
        product_id=product_id, merchant="shopee",
        affiliate_url="https://s.shopee.com.br/3AbCdEfGh",
        price=59.9, is_available=True, active=True,
    )
    defaults.update(overrides)
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(**defaults))
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_disabled_finds_nothing(monkeypatch):
    _disable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_finds_offer_by_gtin_when_enabled(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 59.9
        assert offer.merchant == "shopee"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_stale_offer_is_served_with_stale_marker(monkeypatch):
    _enable_shopee(monkeypatch)
    monkeypatch.setenv("MARKETPLACE_OFFER_STALE_AFTER_HOURS", "36")
    monkeypatch.setenv("MARKETPLACE_OFFER_REFRESH_AFTER_MINUTES", "0")
    get_settings.cache_clear()
    product_id = _register_product()
    old = datetime.now(timezone.utc) - timedelta(hours=37)
    _register_offer(product_id, last_checked_at=old, verified_at=old)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 59.9
        assert offer.price_is_stale is True
    finally:
        db.close()


@pytest.mark.asyncio
async def test_old_shopee_offer_is_served_without_inline_refresh_by_default(monkeypatch):
    _enable_shopee(monkeypatch)
    monkeypatch.setenv("MARKETPLACE_OFFER_REFRESH_AFTER_MINUTES", "30")
    get_settings.cache_clear()
    product_id = _register_product()
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    _register_offer(product_id, price=382.32, last_checked_at=old, verified_at=old)

    def fake_refresh(merchant: str, gtin: str) -> None:
        raise AssertionError("public offer lookup must not block on inline marketplace refresh by default")

    monkeypatch.setattr("src.marketplace_offer_provider._refresh_marketplace_offer", fake_refresh)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 382.32
        assert offer.price_is_stale is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_old_shopee_offer_can_be_refreshed_before_display_when_enabled(monkeypatch):
    _enable_shopee(monkeypatch)
    monkeypatch.setenv("MARKETPLACE_OFFER_INLINE_REFRESH_ENABLED", "true")
    monkeypatch.setenv("MARKETPLACE_OFFER_REFRESH_AFTER_MINUTES", "30")
    get_settings.cache_clear()
    product_id = _register_product()
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    _register_offer(product_id, price=382.32, last_checked_at=old, verified_at=old)

    def fake_refresh(merchant: str, gtin: str) -> None:
        assert merchant == "shopee"
        assert gtin == GTIN
        refresh_db = SessionLocal()
        try:
            row = refresh_db.query(MarketplaceOffer).filter(MarketplaceOffer.product_id == product_id).one()
            row.price = 345.04
            row.last_checked_at = datetime.now(timezone.utc)
            row.verified_at = row.last_checked_at
            refresh_db.commit()
        finally:
            refresh_db.close()

    monkeypatch.setattr("src.marketplace_offer_provider._refresh_marketplace_offer", fake_refresh)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 345.04
        assert offer.price_is_stale is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_fresh_offer_exposes_price_checked_at(monkeypatch):
    _enable_shopee(monkeypatch)
    checked_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    product_id = _register_product()
    _register_offer(product_id, last_checked_at=checked_at)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price_checked_at == checked_at
        assert offer.price_is_stale is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_finds_offer_by_product_id_directly(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(product_id=product_id))
        assert offer is not None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_finds_offer_by_text_when_context_has_no_gtin(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product(
        gtin="7896181298083",
    )
    db = SessionLocal()
    try:
        product = db.get(ProductCatalog, product_id)
        product.name = "Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães de Porte Pequeno com Cálculos Urinários"
        product.brand = "Royal Canin"
        product.category = "food"
        db.commit()
    finally:
        db.close()
    _register_offer(product_id, price=399.9)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(
            query="ROYAL CANIN URINARY S/O Veterinary Diet Small Dog Cão 7,5 kg",
            weight_kg=7.5,
        ))
        assert offer is not None
        assert offer.price == 399.9
        assert offer.merchant == "shopee"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_offer_without_price_never_invents_one(monkeypatch):
    """find_offer() retorna a oferta com price=None tal como está — quem
    descarta oferta sem preço é o CommerceEngine (commerce_provider.py).
    Como nunca fazemos scraping de preço, esse é o caminho real de "sem
    preço confirmado pelo admin, produto fica invisível" — o provider em
    si nunca inventa/estima um valor."""
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id, price=None)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        # find_offer em si retorna a oferta (price=None) — quem descarta é
        # o CommerceEngine (commerce_provider.py). Confirma aqui só que o
        # provider não inventa preço nenhum.
        assert offer is not None
        assert offer.price is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_inactive_offer_never_found(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id, active=False)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_unknown_gtin_finds_nothing(monkeypatch):
    _enable_shopee(monkeypatch)
    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin="0000000000000"))
        assert offer is None
    finally:
        db.close()


def test_monetize_returns_official_url_unchanged(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="shopee",
            affiliate_url="https://s.shopee.com.br/3AbCdEfGh?utm=x",
            price=59.9, is_available=True, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "shopee")
        discovered = DiscoveredOffer(merchant="shopee", price=59.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result == ("https://s.shopee.com.br/3AbCdEfGh?utm=x", "affiliate_marketplace_offer", "shopee", True)
    finally:
        db.close()


def test_monetize_rejects_offer_with_now_invalid_domain(monkeypatch):
    """Defesa em profundidade: se por algum motivo uma linha tiver um
    domínio inválido (ex: dado antigo, bug de outro código), monetize()
    nunca a exibe — revalida no momento do clique, não confia só no
    cadastro admin."""
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="shopee",
            affiliate_url="https://golpeshopee.com.br/produto",
            price=59.9, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "shopee")
        discovered = DiscoveredOffer(merchant="shopee", price=59.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


def test_monetize_disabled_returns_none(monkeypatch):
    _disable_shopee(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="shopee",
            affiliate_url="https://s.shopee.com.br/abc",
            price=59.9, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "shopee")
        discovered = DiscoveredOffer(merchant="shopee", price=59.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


def test_is_marketplace_merchant_publicly_servable_unknown_merchant_always_false(monkeypatch):
    _enable_shopee(monkeypatch)
    assert is_marketplace_merchant_publicly_servable("mercadolivre") is False

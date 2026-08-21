"""
MarketplaceOfferProvider — lê só MarketplaceOffer (nunca chama a rede do
marketplace, nunca scraping). Ver docstring do módulo.
"""
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

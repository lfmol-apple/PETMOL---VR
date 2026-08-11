"""
CobasiProvider.monetize() por modo (cobasi_affiliate_mode). O padrão é
"cached" — UTM NÃO é ativada em produção sem confirmação formal (ver
docs/AFFILIATES.md e cobasi_utm.py). fetch_cobasi_price é sempre
monkeypatchado; nunca chama a API real da Cobasi.
"""
import pytest

from src.affiliate_links import ProductAffiliateLink
from src.cobasi_provider import CobasiProvider
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog


GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _force_env(monkeypatch):
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.delenv("AFFILIATE_ONLY_COMMERCE", raising=False)
    monkeypatch.delenv("COBASI_AFFILIATE_MODE", raising=False)
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


def _offer(direct_url="https://www.cobasi.com.br/produto/p") -> DiscoveredOffer:
    return DiscoveredOffer(merchant="cobasi", price=100.0, direct_url=direct_url, ean=GTIN)


def test_default_mode_is_cached_not_utm(monkeypatch):
    """§ 'UTM Cobasi ainda não foi ativada em produção sem confirmação
    formal' — o padrão nunca deve ser 'utm' sem configuração explícita."""
    assert get_settings().cobasi_affiliate_mode == "cached"


def test_cached_mode_uses_registered_link():
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://mais.app/ABC", "affiliate_product")
    finally:
        db.close()


def test_cached_mode_without_link_and_prod_returns_none(monkeypatch):
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "true")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result is None
    finally:
        db.close()


def test_cached_mode_without_link_and_dev_falls_back_to_direct():
    product_id = _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://www.cobasi.com.br/produto/p", "direct")
    finally:
        db.close()


def test_utm_mode_generates_url_when_explicitly_enabled(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert result is not None
        url, link_type = result
        assert "utm_source=mais" in url
        assert link_type == "affiliate_product"
    finally:
        db.close()


def test_disabled_mode_never_monetizes(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result is None
    finally:
        db.close()


def test_api_mode_not_implemented_returns_none(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "api")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert result is None
    finally:
        db.close()


def test_invalid_mode_rejected_by_settings(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "not-a-real-mode")
    get_settings.cache_clear()
    with pytest.raises(Exception):
        get_settings()

from dataclasses import dataclass
from typing import Optional

import pytest

from src.commerce_provider import ProductContext
from src.mercadolivre_commerce_provider import (
    MercadoLivreCommerceProvider,
    is_mercadolivre_commerce_publicly_servable,
)
from src.providers.base import CatalogCandidate


@dataclass
class _Settings:
    enable_ml_provider: bool = True
    mercadolivre_public_offers_enabled: bool = True
    mercadolivre_affiliate_enabled: bool = False
    affiliate_only_commerce_enforced: bool = False


class _FakeMLCatalogProvider:
    def __init__(self):
        self.search_calls = []
        self.lookup_calls = []

    async def search(self, query: str, country: str = "BR", product_type: str = "food", limit: int = 10):
        self.search_calls.append((query, country, limit))
        return [
            CatalogCandidate(
                source="ml",
                source_item_id="MLB123",
                title="Scalibor Coleira Antiparasitaria",
                brand="Scalibor",
                price=69.9,
                original_price=89.9,
                currency="BRL",
                url="https://produto.mercadolivre.com.br/MLB123",
                in_stock=True,
                gtin="7891234567895",
            )
        ]

    async def lookup_barcode(self, barcode: str, country: str = "BR") -> Optional[CatalogCandidate]:
        self.lookup_calls.append((barcode, country))
        if barcode != "7891234567895":
            return None
        return CatalogCandidate(
            source="ml",
            source_item_id="MLB123",
            title="Scalibor Coleira Antiparasitaria",
            brand="Scalibor",
            price=69.9,
            original_price=89.9,
            currency="BRL",
            url="https://produto.mercadolivre.com.br/MLB123",
            in_stock=True,
            gtin=barcode,
        )


def test_mercadolivre_gate_requires_all_public_flags():
    assert is_mercadolivre_commerce_publicly_servable(_Settings()) is True
    assert is_mercadolivre_commerce_publicly_servable(_Settings(enable_ml_provider=False)) is False
    assert is_mercadolivre_commerce_publicly_servable(_Settings(mercadolivre_public_offers_enabled=False)) is False
    assert is_mercadolivre_commerce_publicly_servable(_Settings(affiliate_only_commerce_enforced=True)) is False
    assert is_mercadolivre_commerce_publicly_servable(_Settings(
        affiliate_only_commerce_enforced=True,
        mercadolivre_affiliate_enabled=True,
    )) is True


@pytest.mark.asyncio
async def test_mercadolivre_commerce_resolves_text_and_direct_dev_link(monkeypatch):
    monkeypatch.setattr("src.mercadolivre_commerce_provider.get_settings", lambda: _Settings())
    catalog = _FakeMLCatalogProvider()
    provider = MercadoLivreCommerceProvider(catalog)

    offer = await provider.find_offer(ProductContext(query="Scalibor Coleira"))
    assert offer is not None
    assert offer.merchant == "mercadolivre"
    assert offer.price == 69.9
    assert offer.list_price == 89.9
    assert offer.direct_url == "https://produto.mercadolivre.com.br/MLB123"

    monetized = provider.monetize(offer, ProductContext(query="Scalibor Coleira"))
    assert monetized == ("https://produto.mercadolivre.com.br/MLB123", "direct", "catalog")


@pytest.mark.asyncio
async def test_mercadolivre_commerce_uses_exact_gtin_lookup(monkeypatch):
    monkeypatch.setattr("src.mercadolivre_commerce_provider.get_settings", lambda: _Settings())
    catalog = _FakeMLCatalogProvider()
    provider = MercadoLivreCommerceProvider(catalog)

    offer = await provider.find_offer(ProductContext(gtin="7891234567895"))
    assert offer is not None
    assert offer.ean == "7891234567895"
    assert catalog.lookup_calls == [("7891234567895", "BR")]
    assert catalog.search_calls == []


@pytest.mark.asyncio
async def test_mercadolivre_commerce_blocks_direct_link_in_affiliate_only(monkeypatch):
    monkeypatch.setattr(
        "src.mercadolivre_commerce_provider.get_settings",
        lambda: _Settings(affiliate_only_commerce_enforced=True, mercadolivre_affiliate_enabled=True),
    )
    provider = MercadoLivreCommerceProvider(_FakeMLCatalogProvider())
    offer = await provider.find_offer(ProductContext(query="Scalibor Coleira"))
    assert offer is not None
    assert provider.monetize(offer, ProductContext(query="Scalibor Coleira")) is None

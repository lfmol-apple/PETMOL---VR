"""
CommerceEngine — discovery → monetize → filter → sort, com providers fake
(sem rede). Ver docs internas de arquitetura: identidade do produto é
persistente, oferta comercial é sempre resolvida dinamicamente.
"""
from typing import Optional

import pytest

from src.commerce_provider import CommerceEngine, DiscoveredOffer, ProductContext


class _FakeProvider:
    def __init__(self, merchant: str, price: Optional[float], monetizable: bool = True, route: Optional[str] = None):
        self.merchant = merchant
        self._price = price
        self._monetizable = monetizable
        self._route = route

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if self._price is None:
            return None
        return DiscoveredOffer(merchant=self.merchant, price=self._price, product_name="Produto Teste")

    def monetize(self, offer: DiscoveredOffer, context: ProductContext):
        if not self._monetizable:
            return None
        if self._route is not None:
            return (f"https://{self.merchant}.example/produto", "affiliate_product", self._route)
        return (f"https://{self.merchant}.example/produto", "affiliate_product")


@pytest.mark.asyncio
async def test_sorts_by_price_ascending():
    engine = CommerceEngine([
        _FakeProvider("amazon", 200.0),
        _FakeProvider("cobasi", 190.0),
        _FakeProvider("shopee", 180.0),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123", name="Ração X"))
    assert [o.price for o in offers] == [180.0, 190.0, 200.0]
    assert [o.merchant for o in offers] == ["shopee", "cobasi", "amazon"]


@pytest.mark.asyncio
async def test_discards_offer_without_monetization():
    engine = CommerceEngine([
        _FakeProvider("cobasi", 100.0, monetizable=False),
        _FakeProvider("shopee", 150.0, monetizable=True),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    assert len(offers) == 1
    assert offers[0].merchant == "shopee"


@pytest.mark.asyncio
async def test_provider_with_no_discovery_is_skipped():
    engine = CommerceEngine([
        _FakeProvider("cobasi", None),
        _FakeProvider("shopee", 150.0),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    assert len(offers) == 1
    assert offers[0].merchant == "shopee"


@pytest.mark.asyncio
async def test_no_providers_monetizable_returns_empty_list():
    engine = CommerceEngine([
        _FakeProvider("cobasi", 100.0, monetizable=False),
        _FakeProvider("amazon", 200.0, monetizable=False),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    assert offers == []


@pytest.mark.asyncio
async def test_engine_does_not_require_prior_manual_registration():
    """Discovery roda para QUALQUER produto — não existe checagem de link
    afiliado cadastrado antes de buscar a oferta (ver §11 do documento de
    arquitetura: nunca 'affiliate link existe? então buscar produto')."""
    engine = CommerceEngine([_FakeProvider("cobasi", 99.9)])
    offers = await engine.get_offers(ProductContext(gtin="nunca-visto-antes"))
    assert len(offers) == 1
    assert offers[0].price == 99.9


@pytest.mark.asyncio
async def test_dedupes_same_merchant_keeping_preferred_route():
    """merchant_routes.py: PREFERRED_ROUTE_BY_MERCHANT['cobasi'] == 'mais'
    — se um provider 'awin' e um provider 'mais' resolverem oferta pra
    Cobasi ao mesmo tempo, nunca mostra as duas, só a preferida."""
    engine = CommerceEngine([
        _FakeProvider("cobasi", 100.0, route="awin"),
        _FakeProvider("cobasi", 105.0, route="mais"),
        _FakeProvider("shopee", 90.0),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert len(offers) == 2


@pytest.mark.asyncio
async def test_dedupes_same_merchant_keeping_first_when_no_preference_configured():
    """Merchant sem preferência configurada em merchant_routes.py: mantém
    a primeira oferta encontrada (ordem de registro de providers)."""
    engine = CommerceEngine([
        _FakeProvider("shopee", 100.0, route="marketplace_a"),
        _FakeProvider("shopee", 90.0, route="marketplace_b"),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    assert len(offers) == 1
    assert offers[0].route == "marketplace_a"

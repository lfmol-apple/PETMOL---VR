"""
CommerceEngine — discovery → monetize → filter → sort, com providers fake
(sem rede). Ver docs internas de arquitetura: identidade do produto é
persistente, oferta comercial é sempre resolvida dinamicamente.
"""
from typing import Optional

import pytest

from src.commerce_provider import CommerceEngine, DiscoveredOffer, ProductContext


class _FakeProvider:
    def __init__(
        self, merchant: str, price: Optional[float], monetizable: bool = True,
        route: Optional[str] = None, manually_cached: bool = False,
        is_available: Optional[bool] = True,
    ):
        self.merchant = merchant
        self._price = price
        self._monetizable = monetizable
        self._route = route
        self._manually_cached = manually_cached
        self._is_available = is_available

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if self._price is None:
            return None
        return DiscoveredOffer(
            merchant=self.merchant,
            price=self._price,
            product_name="Produto Teste",
            is_available=self._is_available,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext):
        if not self._monetizable:
            return None
        if self._manually_cached:
            return (f"https://{self.merchant}.example/produto", "affiliate_product", self._route, True)
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
async def test_discards_offer_marked_unavailable_even_when_monetizable():
    engine = CommerceEngine([
        _FakeProvider("cobasi", 100.0, monetizable=True, is_available=False),
        _FakeProvider("shopee", 150.0, monetizable=True, is_available=True),
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


class _NoPriceProvider:
    """Provider que resolve uma oferta afiliada VÁLIDA mas sem preço
    fresco (Shopee defasada): price=None + allow_without_price=True."""

    merchant = "shopee"

    def __init__(self, *, allow_without_price: bool, is_available=True, monetizable=True):
        self._allow = allow_without_price
        self._is_available = is_available
        self._monetizable = monetizable

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        return DiscoveredOffer(
            merchant=self.merchant,
            price=None,
            is_available=self._is_available,
            price_is_stale=True,
            allow_without_price=self._allow,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext):
        if not self._monetizable:
            return None
        return ("https://s.shopee.com.br/abc", "affiliate_marketplace_offer", "shopee", True)


@pytest.mark.asyncio
async def test_offer_without_price_passes_only_with_allow_without_price():
    """Contrato explícito: oferta sem preço só sobrevive ao engine quando
    o provider marca allow_without_price=True (Shopee defasada). Sem a
    flag, a regra 'sem preço, não aparece' continua valendo."""
    kept = CommerceEngine([_NoPriceProvider(allow_without_price=True)])
    offers = await kept.get_offers(ProductContext(gtin="123"))
    assert len(offers) == 1
    assert offers[0].merchant == "shopee"
    assert offers[0].price is None
    assert offers[0].price_is_stale is True

    dropped = CommerceEngine([_NoPriceProvider(allow_without_price=False)])
    assert await dropped.get_offers(ProductContext(gtin="123")) == []


@pytest.mark.asyncio
async def test_no_price_offer_still_needs_monetization():
    engine = CommerceEngine([_NoPriceProvider(allow_without_price=True, monetizable=False)])
    assert await engine.get_offers(ProductContext(gtin="123")) == []


@pytest.mark.asyncio
async def test_no_price_offer_discarded_when_unavailable():
    engine = CommerceEngine([_NoPriceProvider(allow_without_price=True, is_available=False)])
    assert await engine.get_offers(ProductContext(gtin="123")) == []


@pytest.mark.asyncio
async def test_no_price_offer_sorts_after_priced_offers():
    engine = CommerceEngine([
        _NoPriceProvider(allow_without_price=True),
        _FakeProvider("cobasi", 120.0),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    assert [o.merchant for o in offers] == ["cobasi", "shopee"]
    assert offers[-1].price is None


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
async def test_dedupes_same_merchant_keeping_preferred_route(monkeypatch):
    """Se um provider 'awin' e um provider 'mais' resolverem oferta pra
    Cobasi ao mesmo tempo, nunca mostra as duas, só a preferida — fixado
    explicitamente aqui (não depende do valor real de
    merchant_routes.PREFERRED_ROUTE_BY_MERCHANT, que pode estar em
    'awin' temporariamente durante um teste de validação de comissão)."""
    monkeypatch.setattr("src.merchant_routes.PREFERRED_ROUTE_BY_MERCHANT", {"cobasi": "mais"})
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


@pytest.mark.asyncio
async def test_manually_cached_offer_survives_even_when_other_route_is_preferred():
    """O caso que importa (13/08/2026 — teste de compra real Awin/Cobasi):
    se PREFERRED_ROUTE_BY_MERCHANT['cobasi'] virar 'awin' mas ESTE produto
    tem link cadastrado manualmente (ex: Baby/mais.app), o dedupe nunca
    troca — link comprovado nunca cede lugar pra rota preferida."""
    engine = CommerceEngine([
        _FakeProvider("cobasi", 105.0, route="mais", manually_cached=True),
        _FakeProvider("cobasi", 90.0, route="awin", manually_cached=False),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].is_manually_cached is True


@pytest.mark.asyncio
async def test_manually_cached_offer_survives_regardless_of_registration_order():
    """Mesmo teste acima, mas com a oferta cacheada chegando DEPOIS —
    a blindagem não pode depender de qual provider roda primeiro."""
    engine = CommerceEngine([
        _FakeProvider("cobasi", 90.0, route="awin", manually_cached=False),
        _FakeProvider("cobasi", 105.0, route="mais", manually_cached=True),
    ])
    offers = await engine.get_offers(ProductContext(gtin="123"))
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"

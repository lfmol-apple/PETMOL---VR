"""
AwinFeedProvider — lê só AffiliateFeedOffer (Postgres local), nunca chama
a Awin. Como nenhum merchant está enabled em awin_advertisers.py hoje,
estes testes monkeypatcham is_awin_merchant_enabled pra exercitar a
lógica — nenhuma chamada de rede em nenhum caso.
"""
import pytest

from src.affiliate_feed import AffiliateFeedOffer
from src.awin_feed_provider import AwinFeedProvider
from src.commerce_provider import ProductContext
from src.db import SessionLocal

GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _enable_cobasi_for_test(monkeypatch):
    monkeypatch.setattr("src.awin_feed_provider.is_awin_merchant_enabled", lambda merchant: merchant == "cobasi")
    yield


def _row(**overrides) -> AffiliateFeedOffer:
    defaults = dict(
        network="awin", merchant="cobasi", advertiser_id="17870",
        external_product_id="1", gtin=GTIN, title="Produto Teste",
        price=100.0, in_stock=True, active=True,
        affiliate_url="https://track.awin.com/deep-link-teste",
        merchant_url="https://www.cobasi.com.br/produto-teste/p",
    )
    defaults.update(overrides)
    return AffiliateFeedOffer(**defaults)


@pytest.mark.asyncio
async def test_finds_offer_by_exact_gtin():
    db = SessionLocal()
    try:
        db.add(_row())
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 100.0
        assert offer.ean == GTIN
    finally:
        db.close()


@pytest.mark.asyncio
async def test_out_of_stock_offer_is_ignored():
    db = SessionLocal()
    try:
        db.add(_row(in_stock=False))
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_inactive_offer_is_ignored():
    db = SessionLocal()
    try:
        db.add(_row(active=False))
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_disabled_merchant_never_finds_anything():
    db = SessionLocal()
    try:
        db.add(_row(merchant="zeenow", advertiser_id="127557"))
        db.commit()

        provider = AwinFeedProvider(db, "zeenow")  # not enabled per fixture
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_no_gtin_in_context_finds_nothing():
    db = SessionLocal()
    try:
        db.add(_row())
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(query="produto sem gtin"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_picks_row_matching_weight_among_multiple():
    db = SessionLocal()
    try:
        db.add(_row(external_product_id="2kg", weight_kg=2.0, price=50.0))
        db.add(_row(external_product_id="75kg", weight_kg=7.5, price=200.0))
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN, weight_kg=7.5))
        assert offer.price == 200.0
    finally:
        db.close()


def test_monetize_returns_feed_affiliate_url():
    db = SessionLocal()
    try:
        row = _row()
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = AwinFeedProvider(db, "cobasi")
        from src.commerce_provider import DiscoveredOffer
        offer = DiscoveredOffer(merchant="cobasi", price=100.0, direct_url=row.merchant_url, ean=GTIN, external_id=row.external_product_id)
        result = provider.monetize(offer, ProductContext(gtin=GTIN))
        assert result == ("https://track.awin.com/deep-link-teste", "affiliate_product")
    finally:
        db.close()


def test_monetize_returns_none_when_affiliate_url_empty():
    """§17: NUNCA usar merchant_url limpa como fallback em produção."""
    db = SessionLocal()
    try:
        row = _row(affiliate_url=None)
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = AwinFeedProvider(db, "cobasi")
        from src.commerce_provider import DiscoveredOffer
        offer = DiscoveredOffer(merchant="cobasi", price=100.0, direct_url=row.merchant_url, ean=GTIN, external_id=row.external_product_id)
        result = provider.monetize(offer, ProductContext(gtin=GTIN))
        assert result is None


    finally:
        db.close()


def test_monetize_disabled_merchant_returns_none():
    db = SessionLocal()
    try:
        row = _row(merchant="zeenow", advertiser_id="127557")
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = AwinFeedProvider(db, "zeenow")
        from src.commerce_provider import DiscoveredOffer
        offer = DiscoveredOffer(merchant="zeenow", price=100.0, external_id=row.external_product_id)
        result = provider.monetize(offer, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()

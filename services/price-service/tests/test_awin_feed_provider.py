"""
AwinFeedProvider — lê só AffiliateFeedOffer (Postgres local), nunca chama
a Awin. Estes testes monkeypatcham is_awin_merchant_publicly_servable
(master gate + status por merchant, ver awin_advertisers.py) pra
exercitar a lógica de discovery/monetize isoladamente — a cobertura do
master gate em si (awin_enabled/awin_shadow_mode reais) fica em
test_awin_flags.py. Nenhuma chamada de rede em nenhum caso.
"""
from datetime import datetime, timedelta, timezone

import pytest

from src.affiliate_feed import AffiliateFeedOffer, AffiliateFeedSyncRun
from src.awin_feed_provider import AwinFeedProvider
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal

GTIN = "7891234567890"
OTHER_GTIN = "7899999999999"


@pytest.fixture(autouse=True)
def _enable_cobasi_for_test(monkeypatch):
    monkeypatch.setattr("src.awin_feed_provider.is_awin_merchant_publicly_servable", lambda merchant: merchant == "cobasi")
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
        assert result == ("https://track.awin.com/deep-link-teste", "affiliate_product", "awin")
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


@pytest.fixture
def _not_publicly_servable(monkeypatch):
    """Simula o estado real de produção hoje: merchant NÃO publicamente
    liberado (awin_enabled=False), pra exercitar só a exceção estreita do
    GTIN de teste (§7), não a permissão ampla usada pela fixture autouse
    do módulo (que assume cobasi sempre liberada)."""
    monkeypatch.setattr("src.awin_feed_provider.is_awin_merchant_publicly_servable", lambda merchant: False)


@pytest.mark.asyncio
async def test_awin_test_gtin_allows_single_product_even_when_not_publicly_servable(monkeypatch, _not_publicly_servable):
    """§7: mecanismo de teste único, server-side, reversível, sem endpoint
    público — permite resolver JUSTO o GTIN configurado mesmo com o
    merchant fechado pro resto do catálogo (awin_enabled=False real)."""
    monkeypatch.setenv("AWIN_TEST_GTIN", GTIN)
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        db.add(_row())
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 100.0
    finally:
        db.close()
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_awin_test_gtin_does_not_open_rest_of_catalog(monkeypatch, _not_publicly_servable):
    """A exceção é estreita: um GTIN diferente do configurado continua
    bloqueado, mesmo do mesmo merchant — não é um flip geral disfarçado."""
    monkeypatch.setenv("AWIN_TEST_GTIN", GTIN)
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        db.add(_row(external_product_id="outro", gtin=OTHER_GTIN))
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=OTHER_GTIN))
        assert offer is None
    finally:
        db.close()
        get_settings.cache_clear()


def test_awin_test_gtin_authorizes_monetize_too(monkeypatch, _not_publicly_servable):
    """A exceção precisa valer nos dois métodos — monetize() sozinho não
    pode ficar bloqueado enquanto find_offer() libera (senão o mecanismo
    nunca chega a gerar um link clicável pro teste de compra real)."""
    monkeypatch.setenv("AWIN_TEST_GTIN", GTIN)
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        row = _row()
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = AwinFeedProvider(db, "cobasi")
        offer = DiscoveredOffer(merchant="cobasi", price=100.0, direct_url=row.merchant_url, ean=GTIN, external_id=row.external_product_id)
        result = provider.monetize(offer, ProductContext(gtin=GTIN))
        assert result == ("https://track.awin.com/deep-link-teste", "affiliate_product", "awin")
    finally:
        db.close()
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_no_test_gtin_configured_means_no_exception_ever(_not_publicly_servable):
    """Padrão real (AWIN_TEST_GTIN não configurado): não existe exceção
    nenhuma — merchant não publicamente liberado nunca resolve, nem por
    GTIN exato."""
    assert get_settings().awin_test_gtin is None
    db = SessionLocal()
    try:
        db.add(_row())
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


def _add_sync_run(finished_at) -> None:
    db = SessionLocal()
    try:
        db.add(AffiliateFeedSyncRun(
            network="awin", merchant="cobasi", advertiser_id="17870",
            started_at=finished_at, finished_at=finished_at,
            status="success", rows_seen=1, rows_upserted=1,
        ))
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_stale_catalog_blocks_resolution_even_when_authorized():
    """Merchant publicamente liberado (via fixture autouse) + dado
    presente, mas o último sync de sucesso passou de
    config.awin_stale_after_hours — catálogo desatualizado nunca vira
    link clicável (ver docstring do módulo, camada 2 de proteção). Cobre
    o gap real de teste: nenhum outro teste populava AffiliateFeedSyncRun
    com um finished_at de verdade pra exercitar essa comparação."""
    _add_sync_run(datetime.now(timezone.utc) - timedelta(hours=100))  # > 36h padrão
    db = SessionLocal()
    try:
        db.add(_row())
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_fresh_catalog_allows_resolution():
    """Contraprova do teste acima: sync de sucesso recente (dentro da
    janela) não bloqueia nada — exercita a comparação de datas real (não
    só o caminho 'nunca sincronizou' que os outros testes cobrem)."""
    _add_sync_run(datetime.now(timezone.utc) - timedelta(hours=1))
    db = SessionLocal()
    try:
        db.add(_row())
        db.commit()

        provider = AwinFeedProvider(db, "cobasi")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
    finally:
        db.close()

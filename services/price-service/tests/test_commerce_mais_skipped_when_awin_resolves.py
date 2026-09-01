"""CobasiProvider.should_run() (cobasi_provider.py) — desde 29/08/2026,
Awin nunca monetiza nenhum merchant (AWIN_SELLABLE_MERCHANTS sempre
vazio, ver awin_advertisers.py), então AwinFeedProvider nunca é
registrado em build_default_engine() e nunca produz uma oferta
"cobasi" concorrente, mesmo com o GTIN presente no catálogo Awin. A
rota preferida da Cobasi é "mais" (merchant_routes.py), o que faz
should_run() curto-circuitar pra True incondicionalmente — MAIS
(fetch_cobasi_price, busca ao vivo na VTEX) SEMPRE roda agora,
catálogo Awin tendo ou não uma linha pra esse GTIN.

Estes testes provam isso contando chamadas reais a fetch_cobasi_price
(não só o resultado final da lista de ofertas, que os testes de
test_commerce_offers_awin_dedupe.py já cobrem). Até 14/08/2026 existia
um cenário onde Awin resolvia primeiro e MAIS era pulado — revertido em
29/08/2026 junto com a decisão de nunca monetizar via Awin (ver
merchant_routes.py e cobasi_provider.py).
"""
import pytest

from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import ProductAffiliateLink
from src.commerce_offers import get_commerce_offers
from src.commerce_pricing import ProductPriceResult
from src.config import get_settings
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog

GTIN = "7891234567895"


@pytest.fixture(autouse=True)
def _force_env(monkeypatch):
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.delenv("AFFILIATE_ONLY_COMMERCE", raising=False)
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _register_awin_offer(gtin: str = GTIN) -> None:
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870",
            external_product_id="9999", gtin=gtin, title="Produto Teste",
            price=90.0, in_stock=True, active=True,
            affiliate_url="https://www.awin1.com/pclick.php?p=9999&a=3032803&m=17870",
            merchant_url="https://www.cobasi.com.br/produto-teste/p",
        ))
        db.commit()
    finally:
        db.close()


def _register_cobasi_link(gtin: str = GTIN) -> None:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Produto Teste", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        db.add(ProductAffiliateLink(
            product_id=product.id, merchant="cobasi",
            affiliate_product_url="https://mais.app/link-comprovado", active=True,
        ))
        db.commit()
    finally:
        db.close()


def _counting_fetch(monkeypatch):
    """Monkeypatcha a resolução Cobasi por EAN e conta as chamadas."""
    calls = {"count": 0}

    async def _fake(gtin):
        calls["count"] += 1
        return ProductPriceResult(
            found=True, price=100.0, is_available=True, ean=GTIN,
            product_name="Produto Teste", brand="Marca Teste",
            url="https://www.cobasi.com.br/produto-teste/p",
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_by_gtin", _fake)
    return calls


@pytest.mark.asyncio
async def test_mais_resolves_by_ean_even_when_awin_catalog_has_matching_gtin(monkeypatch):
    """Mesmo com uma linha de catálogo Awin sincronizada pra esse GTIN,
    MAIS resolve a Cobasi pelo EAN exato: AwinFeedProvider nunca é
    registrado como vendável (AWIN_SELLABLE_MERCHANTS vazio)."""
    calls = _counting_fetch(monkeypatch)
    _register_awin_offer()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    assert calls["count"] == 1
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"


@pytest.mark.asyncio
async def test_mais_resolves_by_ean_when_awin_does_not_resolve(monkeypatch):
    """Sem oferta Awin pra esse GTIN — MAIS resolve pelo EAN exato."""
    calls = _counting_fetch(monkeypatch)

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    assert calls["count"] == 1
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"


@pytest.mark.asyncio
async def test_no_cobasi_offer_without_gtin(monkeypatch):
    """SEM código de barras não há oferta Cobasi — nunca busca por texto."""
    calls = _counting_fetch(monkeypatch)

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração")
    finally:
        db.close()

    assert calls["count"] == 0
    assert [o for o in offers if o.merchant == "cobasi"] == []


@pytest.mark.asyncio
async def test_manual_link_wins_with_ean_price_even_with_awin_resolving(monkeypatch):
    """Awin resolve o GTIN, mas este produto tem link cadastrado — a
    oferta is_manually_cached vence o dedupe. URL = link comprovado;
    preço vem do EAN EXATO (não de busca por texto). Ver
    CobasiProvider.find_offer."""
    calls = _counting_fetch(monkeypatch)
    _register_awin_offer()
    _register_cobasi_link()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    assert calls["count"] == 1  # EAN exato (não texto)
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].url == "https://mais.app/link-comprovado"
    assert cobasi_offers[0].price == 100.0

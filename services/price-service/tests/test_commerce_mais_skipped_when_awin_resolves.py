"""CobasiProvider.should_run() / find_offer() (cobasi_provider.py) — desde
29/08/2026, Awin nunca monetiza nenhum merchant (AWIN_SELLABLE_MERCHANTS
sempre vazio, ver awin_advertisers.py), então AwinFeedProvider nunca é
registrado em build_default_engine() e nunca produz uma oferta "cobasi"
concorrente, mesmo com o GTIN presente no catálogo Awin. A rota preferida
da Cobasi é "mais" (merchant_routes.py) e MAIS SEMPRE resolve a Cobasi —
por link MAIS pré-cadastrado (GTIN) ou pela busca da vitrine "Minha Loja"
daquele produto. Nunca há busca ao vivo na VTEX no caminho do clique
(removida em 31/08/2026 — era lenta e instável).

Estes testes provam que a oferta "cobasi" via "mais" aparece em cada
cenário — catálogo Awin tendo ou não uma linha pra esse GTIN.
"""
import pytest

from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import ProductAffiliateLink
from src.commerce_offers import get_commerce_offers
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


@pytest.mark.asyncio
async def test_mais_resolves_even_when_awin_catalog_has_matching_gtin(monkeypatch):
    """Mesmo com uma linha de catálogo Awin sincronizada pra esse GTIN
    exato, MAIS sempre resolve a Cobasi: AwinFeedProvider nunca é
    registrado como vendável, então nunca vira uma oferta concorrente."""
    _register_awin_offer()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].url.startswith("https://minhaloja.cobasi.com.br/busca?")


@pytest.mark.asyncio
async def test_mais_resolves_when_awin_does_not_resolve(monkeypatch):
    """Sem oferta Awin sincronizada pra esse GTIN — MAIS continua
    resolvendo pela busca da vitrine "Minha Loja"."""
    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"


@pytest.mark.asyncio
async def test_mais_serves_manual_link_despite_awin_resolving(monkeypatch):
    """Awin resolve o GTIN, mas este produto tem link MAIS pré-cadastrado —
    a oferta is_manually_cached sempre vence o dedupe (ver
    commerce_provider.py::_dedupe_by_merchant)."""
    _register_awin_offer()
    _register_cobasi_link()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].url == "https://mais.app/link-comprovado"

"""
build_default_engine() registra CobasiProvider + AwinFeedProvider("cobasi")
desde 13/08/2026 (ver commerce_offers.py). Este teste prova, com os
providers REAIS (não fakes), que isso sozinho não muda o link que o tutor
vê: quando os dois resolvem oferta pro mesmo GTIN, o dedupe por merchant
mantém a rota "mais" (merchant_routes.PREFERRED_ROUTE_BY_MERCHANT) — a
Awin só entraria se essa preferência for trocada explicitamente, o que
não faz parte desta tarefa.

fetch_cobasi_price é sempre monkeypatchado (nunca chama a API real da
Cobasi); a linha AffiliateFeedOffer é inserida diretamente (nunca chama a
Awin) — mesma convenção do resto da suíte.
"""
import pytest

from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import ProductAffiliateLink
from src.commerce_offers import get_commerce_offers
from src.commerce_pricing import ProductPriceResult
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


@pytest.mark.asyncio
async def test_registering_awin_provider_does_not_change_link_shown_to_tutor(monkeypatch):
    """O teste que importa: mesmo com os dois providers reais resolvendo
    oferta pro mesmo GTIN, o link exibido continua sendo o da MAIS."""
    _register_cobasi_link()
    _register_awin_offer()

    async def _fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(
            found=True, price=100.0, is_available=True, ean=GTIN,
            product_name="Produto Teste", brand="Marca Teste",
            url="https://www.cobasi.com.br/produto-teste/p",
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", _fake_fetch)

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, name="Produto Teste", brand="Marca Teste", gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1, "dedupe deveria manter só uma oferta pro merchant cobasi"
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].url == "https://mais.app/link-comprovado"

"""CobasiProvider.should_run() (cobasi_provider.py) — quando o GTIN
escaneado já resolve por identidade exata via Awin (rota preferida da
Cobasi desde 14/08/2026, ver merchant_routes.py), a busca ao vivo na VTEX
(fetch_cobasi_price) é redundante e não deve rodar. Só continua rodando
quando existe link cadastrado manualmente pra esse GTIN, porque esse link
precisa ter a chance de vencer o dedupe mesmo com Awin preferida.

Estes testes provam isso contando chamadas reais a fetch_cobasi_price
(não só o resultado final da lista de ofertas, que os testes de
test_commerce_offers_awin_dedupe.py já cobrem) — a motivação concreta é
evitar uma chamada de rede desnecessária no fluxo "escaneei a ração →
cliquei em comprar", que antes disparava Awin E MAIS sempre, mesmo com o
GTIN já resolvendo por completo via Awin.
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
    calls = {"count": 0}

    async def _fake_fetch(query, target_weight_kg=None):
        calls["count"] += 1
        return ProductPriceResult(
            found=True, price=100.0, is_available=True, ean=GTIN,
            product_name="Produto Teste", brand="Marca Teste",
            url="https://www.cobasi.com.br/produto-teste/p",
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", _fake_fetch)
    return calls


@pytest.mark.asyncio
async def test_mais_not_called_when_scanned_gtin_resolves_via_awin(monkeypatch):
    """O cenário concreto do usuário: escaneou a ração (GTIN real), Awin
    resolve por identidade exata, sem link manual cadastrado pra esse
    produto — MAIS não deve fazer NENHUMA chamada de rede."""
    calls = _counting_fetch(monkeypatch)
    _register_awin_offer()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    assert calls["count"] == 0, "fetch_cobasi_price não deveria ser chamado quando Awin já resolveu o GTIN"
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "awin"


@pytest.mark.asyncio
async def test_mais_still_called_when_awin_does_not_resolve(monkeypatch):
    """Sem oferta Awin sincronizada pra esse GTIN (produto fora do
    catálogo Awin) — MAIS continua sendo o fallback real, chamada de rede
    incluída."""
    calls = _counting_fetch(monkeypatch)
    # Nenhuma _register_awin_offer() — Awin não tem nada pra este GTIN.

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    assert calls["count"] == 1, "MAIS precisa continuar sendo o fallback quando Awin não resolve"
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"


@pytest.mark.asyncio
async def test_mais_still_called_when_manual_link_exists_despite_awin_resolving(monkeypatch):
    """Awin resolve o GTIN, mas este produto específico tem link
    cadastrado manualmente — MAIS precisa rodar mesmo assim, porque só
    ele consegue produzir a oferta is_manually_cached que sempre vence o
    dedupe (ver commerce_provider.py::_dedupe_by_merchant)."""
    calls = _counting_fetch(monkeypatch)
    _register_awin_offer()
    _register_cobasi_link()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, query="Marca Teste ração", gtin=GTIN)
    finally:
        db.close()

    assert calls["count"] == 1, "link cadastrado manualmente precisa da chance de rodar mesmo com Awin resolvendo"
    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].url == "https://mais.app/link-comprovado"

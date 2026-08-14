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


def _enable_awin_globally(monkeypatch) -> None:
    """Estes testes precisam do AwinFeedProvider genuinamente registrado
    em build_default_engine() pra provar o dedupe de verdade (não só "não
    tem Awin nenhum pra disputar") — ver awin_advertisers.py
    is_awin_merchant_publicly_servable. Master gate desligado é o padrão
    de produção; ligar aqui é só pra exercitar o cenário com os dois
    providers realmente presentes."""
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
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
    _enable_awin_globally(monkeypatch)
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


@pytest.mark.asyncio
async def test_manually_cached_link_survives_even_with_awin_preferred(monkeypatch):
    """O cenário exato do teste de compra real: PREFERRED_ROUTE_BY_MERCHANT
    trocado pra 'awin' (pra validar comissão), mas o produto testado (aqui
    simulando o GTIN da Royal Canin da Baby) tem link cadastrado manualmente
    — precisa continuar mostrando o link comprovado, nunca o da Awin, ou
    quem comprar esse produto específico durante o teste perderia a
    comissão já validada. Ver commerce_provider.py::_dedupe_by_merchant."""
    _enable_awin_globally(monkeypatch)
    _register_cobasi_link()
    _register_awin_offer()
    monkeypatch.setattr("src.merchant_routes.PREFERRED_ROUTE_BY_MERCHANT", {"cobasi": "awin"})

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
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais", "link cadastrado nunca cede lugar, mesmo com awin preferida"
    assert cobasi_offers[0].url == "https://mais.app/link-comprovado"


@pytest.mark.asyncio
async def test_awin_wins_when_no_manual_link_and_awin_preferred(monkeypatch):
    """Controle do teste acima: SEM link cadastrado (o caso comum — o
    resto do catálogo, hoje via UTM), trocar a rota preferida pra 'awin'
    deve sim mudar o link exibido. Prova que a blindagem é específica de
    link manual, não um bloqueio geral que inutilizaria o teste real."""
    _enable_awin_globally(monkeypatch)
    _register_awin_offer()
    monkeypatch.setattr("src.merchant_routes.PREFERRED_ROUTE_BY_MERCHANT", {"cobasi": "awin"})
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()

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
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "awin"
    assert cobasi_offers[0].url.startswith("https://www.awin1.com/")


@pytest.mark.asyncio
async def test_awin_never_leaks_when_master_gate_off_even_as_sole_resolver(monkeypatch):
    """O BUG CRÍTICO que motivou esta correção: quando CobasiProvider não
    resolve nada (contexto sem query/name/brand — exatamente o que a busca
    do catálogo manda hoje, só gtin) e o AwinFeedProvider é o ÚNICO
    provider capaz de responder, o dedupe por preferência de rota nunca
    entra em ação (não há duas ofertas do merchant pra escolher entre
    elas) — o link Awin vazava mesmo com AWIN_ENABLED=false, porque
    build_default_engine() registrava o provider sem checar o master gate.
    Este teste reproduz exatamente esse cenário (contexto só com gtin,
    sem query) e prova que agora nenhuma oferta cobasi aparece."""
    _register_awin_offer()
    # awin_enabled NÃO foi ligado — este é o padrão real de produção hoje.
    assert get_settings().awin_enabled is False

    db = SessionLocal()
    try:
        # Contexto só com gtin — exatamente o que AffiliateCatalogSearch
        # manda pro back-end na hora de comprar (sem query/name/brand),
        # então CobasiProvider.find_offer() nem tenta (query vazia).
        offers = await get_commerce_offers(db, gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert cobasi_offers == [], "Awin nunca pode ser a única oferta visível com o master gate desligado"


@pytest.mark.asyncio
async def test_awin_fills_in_as_fallback_when_mais_does_not_resolve(monkeypatch):
    """Direção que faltava provar: MAIS não resolve nada (modo disabled,
    sem link cadastrado) mas a Awin resolve (habilitada) — a Cobasi ainda
    aparece, via fallback (merchant_routes.fallback_routes_for), em vez de
    sumir só porque a rota preferida não teve oferta (ver docstring de
    merchant_routes.py, critério 3)."""
    _enable_awin_globally(monkeypatch)
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()
    _register_awin_offer()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "awin"


@pytest.mark.asyncio
async def test_awin_shadow_mode_blocks_even_with_master_gate_on(monkeypatch):
    """awin_shadow_mode=True é sempre mais restritivo — nunca uma
    liberação parcial. Mesmo com awin_enabled=True, shadow mode ligado
    bloqueia a mesma forma que o master gate desligado."""
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "true")
    get_settings.cache_clear()
    _register_awin_offer()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert cobasi_offers == []

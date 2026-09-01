"""
build_default_engine() registra CobasiProvider + AwinFeedProvider("cobasi")
desde 13/08/2026 (ver commerce_offers.py). Este teste prova, com os
providers REAIS (não fakes), que isso sozinho não muda o link que o tutor
vê: quando os dois resolvem oferta pro mesmo GTIN, o dedupe por merchant
mantém a rota "mais" (merchant_routes.PREFERRED_ROUTE_BY_MERCHANT) — a
Awin só entraria se essa preferência for trocada explicitamente, o que
não faz parte desta tarefa.

A Cobasi resolve por GTIN pré-cadastrado ou pela busca da vitrine "Minha
Loja" (nunca busca ao vivo na VTEX no clique); a linha AffiliateFeedOffer
é inserida diretamente (nunca chama a Awin) — mesma convenção do resto da
suíte.
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
    monkeypatch.setenv("AWIN_ENABLED", "false")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
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
    oferta pro mesmo GTIN, o link exibido continua sendo o da MAIS — não
    porque "mais" seja a rota preferida (não é mais, desde a decisão de
    14/08/2026 em merchant_routes.py), mas porque este produto tem link
    cadastrado manualmente (is_manually_cached), que sempre vence
    independente de preferência de rota. Ver
    test_awin_catalog_uses_mais_utm_when_no_manual_link para o caso sem
    link cadastrado, onde o feed Awin identifica o produto e a URL MAIS-UTM
    monetiza o clique."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    _enable_awin_globally(monkeypatch)
    _register_cobasi_link()
    _register_awin_offer()

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
    """O cenário real desde a decisão de 14/08/2026 (Awin virou a rota
    preferida da Cobasi, 8,5% nominal vs. 7% confirmado da MAIS): o
    produto testado (aqui simulando o GTIN da Royal Canin da Baby) tem
    link cadastrado manualmente — precisa continuar mostrando o link
    comprovado, nunca o da Awin (ainda não validada por venda real), ou
    quem comprar esse produto específico perderia a comissão já
    confirmada. O monkeypatch abaixo é redundante com o default real de
    merchant_routes.py hoje, mantido explícito pra o teste não depender
    silenciosamente de qual é o default atual. Ver
    commerce_provider.py::_dedupe_by_merchant."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    _enable_awin_globally(monkeypatch)
    _register_cobasi_link()
    _register_awin_offer()
    monkeypatch.setattr("src.merchant_routes.PREFERRED_ROUTE_BY_MERCHANT", {"cobasi": "awin"})

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
async def test_awin_catalog_uses_mais_utm_when_no_manual_link(monkeypatch):
    """Controle do teste acima: SEM link cadastrado (o caso comum — o
    resto do catálogo, hoje via UTM), a Cobasi resolve pela busca da
    vitrine "Minha Loja" daquele produto, com UTM MAIS."""
    _enable_awin_globally(monkeypatch)
    _register_awin_offer()
    monkeypatch.setattr("src.merchant_routes.PREFERRED_ROUTE_BY_MERCHANT", {"cobasi": "awin"})
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, name="Produto Teste", brand="Marca Teste", gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    url = cobasi_offers[0].url
    assert url.startswith("https://minhaloja.cobasi.com.br/busca?")
    assert "utm_source=mais" in url and "utm_medium=maisplataforma" in url and "utm_campaign=lojapetmol" in url


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
    sem query) e prova que agora nenhuma oferta Awin aparece."""
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
async def test_awin_catalog_never_fills_in_when_cobasi_provider_is_disabled(monkeypatch):
    """Desde 29/08/2026, Awin não é mais um resolvedor de reserva pra
    Cobasi: com CobasiProvider desligado (modo disabled) e uma linha de
    catálogo Awin sincronizada pro mesmo GTIN, a Cobasi some da lista —
    AwinFeedProvider nunca é registrado como vendável
    (AWIN_SELLABLE_MERCHANTS vazio, ver awin_advertisers.py), então não
    existe mais um segundo provider capaz de "preencher" a oferta. Ver
    docstring de cobasi_provider.py: modo "disabled" agora significa
    Cobasi sem NENHUMA oferta de compra, ponto final."""
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
    assert cobasi_offers == [], "Awin nunca preenche a Cobasi — catálogo Awin não é mais uma rota de venda"


@pytest.mark.asyncio
async def test_mais_fills_in_as_fallback_when_awin_does_not_resolve(monkeypatch):
    """Direção real de fallback hoje (Awin é a rota preferida desde
    14/08/2026): sem nenhuma AffiliateFeedOffer pra este GTIN (ex: produto
    fora do catálogo sincronizado, ou Awin indisponível), mas com link
    MAIS cadastrado, a Cobasi continua aparecendo via MAIS — nunca some
    só porque a rota preferida não teve oferta."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    _enable_awin_globally(monkeypatch)
    _register_cobasi_link()
    # Nenhuma _register_awin_offer() — Awin não tem nada pra este GTIN.

    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, name="Produto Teste", brand="Marca Teste", gtin=GTIN)
    finally:
        db.close()

    cobasi_offers = [o for o in offers if o.merchant == "cobasi"]
    assert len(cobasi_offers) == 1
    assert cobasi_offers[0].route == "mais"
    assert cobasi_offers[0].url == "https://mais.app/link-comprovado"


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

"""
CobasiProvider.monetize() por modo (cobasi_affiliate_mode). O padrão
desde 15/08/2026 é "disabled" (MAIS totalmente desativado, decisão de
produto — só Awin resolve a Cobasi enquanto isso não é revisitado); UTM
NÃO é ativada em produção sem confirmação formal (ver docs/AFFILIATES.md
e cobasi_utm.py). Os testes abaixo que exercitam "cached"/"utm" ligam o
modo explicitamente via COBASI_AFFILIATE_MODE — não dependem do padrão
atual, só provam que a lógica de cada modo continua correta quando
alguém o reativar. fetch_cobasi_price é sempre monkeypatchado; nunca
chama a API real da Cobasi.
"""
import pytest

from src.affiliate_links import ProductAffiliateLink
from src.cobasi_provider import CobasiProvider
from src.commerce_pricing import ProductPriceResult
from src.commerce_provider import DiscoveredOffer, ProductContext
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


def _register_product(gtin: str = GTIN) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Produto Teste", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _offer(direct_url="https://www.cobasi.com.br/produto/p") -> DiscoveredOffer:
    return DiscoveredOffer(merchant="cobasi", price=100.0, direct_url=direct_url, ean=GTIN)


def test_default_mode_is_utm(monkeypatch):
    """Desde 29/08/2026, o padrão é 'utm' — confirmado manualmente via
    painel MAIS (URL de produto real gerou link que resolve pra página
    real, não 404) e decisão de produto de nunca monetizar via Awin (ver
    AWIN_SELLABLE_MERCHANTS em awin_advertisers.py, sempre vazio) — o
    programa MAIS/UTM é a única rota real de venda da Cobasi agora."""
    assert get_settings().cobasi_affiliate_mode == "utm"


def test_cached_mode_uses_registered_link(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://mais.app/ABC", "affiliate_product", "mais", True)
    finally:
        db.close()


def test_cached_mode_without_link_and_prod_returns_none(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "true")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result is None
    finally:
        db.close()


def test_cached_mode_without_link_and_dev_falls_back_to_direct(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://www.cobasi.com.br/produto/p", "direct", "mais")
    finally:
        db.close()


def test_utm_mode_generates_url_when_explicitly_enabled(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert result is not None
        url, link_type, route = result
        assert "utm_source=mais" in url
        assert link_type == "affiliate_product"
        assert route == "mais"
    finally:
        db.close()


def test_utm_mode_still_prefers_cached_link_when_one_exists(monkeypatch):
    """§19-20: mudar cobasi_affiliate_mode pra 'utm' nunca deve abandonar
    um link já cadastrado e comprovado (ex: Baby/mais.app/IvUCAG) — o link
    manual sempre tem prioridade, mesmo em modo 'utm'."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="cobasi",
            affiliate_product_url="https://mais.app/IvUCAG", active=True,
        ))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://mais.app/IvUCAG", "affiliate_product", "mais", True)
    finally:
        db.close()


def test_utm_mode_offer_is_not_flagged_as_manually_cached(monkeypatch):
    """Distingue UTM (gerado) de link cadastrado — só o segundo blinda a
    oferta no dedupe do CommerceEngine (ver commerce_provider.py). UTM
    continua retornando 3-tupla (sem is_manually_cached explícito),
    consumido pelo CommerceEngine como is_manually_cached=False."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert len(result) == 3
    finally:
        db.close()


def test_disabled_mode_never_monetizes(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result is None
    finally:
        db.close()


def test_should_run_false_when_mode_disabled_regardless_of_manual_link(monkeypatch):
    """Desativação total (padrão desde 15/08/2026): should_run() nem
    verifica se existe link cadastrado ou oferta Awin — o provider inteiro
    fica fora do ar, sem sequer a chamada de rede em find_offer()."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        assert provider.should_run(ProductContext(gtin=GTIN, product_id=product_id), []) is False
    finally:
        db.close()


def test_api_mode_not_implemented_returns_none(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "api")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert result is None
    finally:
        db.close()


def test_invalid_mode_rejected_by_settings(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "not-a-real-mode")
    get_settings.cache_clear()
    with pytest.raises(Exception):
        get_settings()


# ── find_offer() — descoberta dinâmica, sem qualquer cadastro prévio ──────

@pytest.mark.asyncio
async def test_find_offer_works_with_no_product_catalog_row_at_all(monkeypatch):
    """§13: ProductAffiliateLink não é mais condição de discovery — nem
    products_catalog precisa ter o produto pra find_offer() funcionar.
    Nenhum ProductCatalog, nenhum ProductAffiliateLink, banco vazio."""
    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(
            found=True, store="cobasi", product_name="Produto Nunca Visto",
            brand="Marca X", price=59.9, list_price=None, is_available=True,
            url="https://www.cobasi.com.br/produto-x/p", ean="9999999999999",
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="produto nunca visto"))
        assert offer is not None
        assert offer.price == 59.9
        assert offer.ean == "9999999999999"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_returns_none_when_not_found(monkeypatch):
    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(found=False)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="produto qualquer"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_passes_through_weight_for_sku_selection(monkeypatch):
    captured = {}

    async def fake_fetch(query, target_weight_kg=None):
        captured["weight"] = target_weight_kg
        return ProductPriceResult(found=True, price=10.0, url="https://www.cobasi.com.br/p")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        await provider.find_offer(ProductContext(query="ração", weight_kg=7.5))
        assert captured["weight"] == 7.5
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_rejects_cobasi_result_with_different_ean_when_gtin_known(monkeypatch):
    """Se o tutor escaneou um GTIN, preço textual da Cobasi só entra se o
    EAN do SKU retornado for o mesmo. Isso evita comparar uma coleira da
    Cobasi com uma oferta Shopee de outra variação."""
    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(
            found=True,
            store="cobasi",
            product_name="Coleira Antiparasitária Scalibor Cães Grandes 65 cm",
            brand="Scalibor",
            price=129.9,
            url="https://www.cobasi.com.br/scalibor-g/p",
            ean="7896185957016",
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="Coleira Scalibor 48cm", gtin="7896185957009"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_accepts_cobasi_result_with_same_ean_when_gtin_known(monkeypatch):
    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(
            found=True,
            store="cobasi",
            product_name="Coleira Antiparasitária Scalibor Cães Pequenos e Médios 48 cm",
            brand="Scalibor",
            price=99.9,
            url="https://www.cobasi.com.br/scalibor-m/p",
            ean="7896185957009",
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="Coleira Scalibor 48cm", gtin="7896185957009"))
        assert offer is not None
        assert offer.price == 99.9
    finally:
        db.close()


def test_prod_env_default_mode_is_still_utm(monkeypatch):
    """Mesmo com ENV=prod, sem COBASI_AFFILIATE_MODE explícito o padrão
    continua 'utm' (desde 29/08/2026) — não depende do ENV pra decidir,
    é uma decisão de produto fixa (ver test_default_mode_is_utm)."""
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.delenv("COBASI_AFFILIATE_MODE", raising=False)
    get_settings.cache_clear()
    try:
        assert get_settings().cobasi_affiliate_mode == "utm"
    finally:
        monkeypatch.setenv("ENV", "dev")
        get_settings.cache_clear()


# ── find_offer() — EAN ausente na VTEX + estratégia de busca por nome/marca ──

def _price(**kw) -> ProductPriceResult:
    base = dict(found=True, store="cobasi", price=79.9, url="https://www.cobasi.com.br/x/p", is_available=True)
    base.update(kw)
    return ProductPriceResult(**base)


@pytest.mark.asyncio
async def test_ean_absent_accepts_clearly_correct_product(monkeypatch):
    """VTEX não devolveu EAN, mas o produto é claramente o mesmo (marca +
    peso + tokens batem) → aceita via matcher textual estrito."""
    async def fake_fetch(query, target_weight_kg=None):
        return _price(
            product_name="Ração Golden Fórmula Cães Adultos Frango e Arroz 15kg",
            brand="Golden", ean=None,
        )

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        ctx = ProductContext(
            gtin="7896181208112",
            name="Golden Fórmula Cães Adultos Frango e Arroz 15kg",
            brand="Golden",
        )
        offer = await provider.find_offer(ctx)
        assert offer is not None
        assert offer.price == 79.9
    finally:
        db.close()


@pytest.mark.asyncio
async def test_ean_absent_rejects_ambiguous_or_different_product(monkeypatch):
    """VTEX sem EAN e o produto devolvido é de OUTRA marca → matcher
    estrito (marca é hard fail em score_candidate) rejeita, não vira
    oferta só pra aumentar cobertura."""
    async def fake_fetch(query, target_weight_kg=None):
        return _price(product_name="Ração Premier Golden Retriever Adulto 12kg", brand="Premier", ean=None)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        ctx = ProductContext(gtin="7896181208112", name="Golden Fórmula Frango e Arroz 15kg", brand="Golden")
        offer = await provider.find_offer(ctx)
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_ean_absent_without_reference_name_rejects(monkeypatch):
    """GTIN conhecido, VTEX sem EAN, e sem nome/q de referência pro
    matcher → rejeita (não há como confirmar identidade)."""
    async def fake_fetch(query, target_weight_kg=None):
        return _price(product_name="Algum Produto", brand=None, ean=None)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        # só gtin, nenhum texto — _query_candidates gera só a busca por gtin
        offer = await provider.find_offer(ProductContext(gtin="7896181208112"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_rejects_when_found_but_no_price(monkeypatch):
    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(found=True, price=None, is_available=True, product_name="X", reason="no_price")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="ração golden"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_returns_offer_out_of_stock_engine_filters_it(monkeypatch):
    """Regra de estoque inalterada: o provider devolve a oferta com
    is_available=False (não troca de candidato); quem descarta é o
    CommerceEngine."""
    from src.commerce_provider import CommerceEngine

    async def fake_fetch(query, target_weight_kg=None):
        return _price(product_name="Ração Golden Frango 15kg", brand="Golden", ean=None, is_available=False)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        ctx = ProductContext(name="Golden Frango 15kg", brand="Golden", gtin="7896181208112")
        discovered = await provider.find_offer(ctx)
        assert discovered is not None and discovered.is_available is False
        engine = CommerceEngine([provider])
        assert await engine.get_offers(ctx) == []
    finally:
        db.close()
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_find_offer_uses_name_and_brand_when_query_is_poor(monkeypatch):
    """`q` genérico ("ração pet") não resolve, mas a tentativa marca+nome
    resolve — produto conhecido não fica sem Cobasi."""
    calls: list[str] = []

    async def fake_fetch(query, target_weight_kg=None):
        calls.append(query)
        if query == "ração pet":
            return ProductPriceResult(found=False, reason="no_results")
        if query == "Golden Ração Golden Fórmula Frango 15kg" or "Golden" in query:
            return _price(product_name="Ração Golden Fórmula Frango 15kg", brand="Golden", ean=None)
        return ProductPriceResult(found=False, reason="no_results")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        ctx = ProductContext(
            query="ração pet",
            name="Ração Golden Fórmula Frango 15kg",
            brand="Golden",
        )
        offer = await provider.find_offer(ctx)
        assert offer is not None, f"tentativas: {calls}"
        assert "ração pet" in calls  # tentou o q pobre primeiro
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_gtin_query_candidate_is_tried_first(monkeypatch):
    calls: list[str] = []

    async def fake_fetch(query, target_weight_kg=None):
        calls.append(query)
        if query == "7896181208112":
            return _price(product_name="Ração Golden Fórmula Frango 15kg", brand="Golden", ean="7896181208112")
        return ProductPriceResult(found=False)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        ctx = ProductContext(query="ração pet", gtin="7896181208112", brand="Golden", name="Golden Frango 15kg")
        offer = await provider.find_offer(ctx)
        assert offer is not None
        assert calls[0] == "7896181208112"
    finally:
        db.close()

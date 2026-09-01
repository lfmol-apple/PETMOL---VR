"""
CobasiProvider.monetize()/find_offer() por modo (cobasi_affiliate_mode).
O padrão de produção desde 29/08/2026 é "utm". Os testes abaixo que
exercitam "cached"/"utm"/"disabled" ligam o modo explicitamente via
COBASI_AFFILIATE_MODE. find_offer() nunca faz busca ao vivo na VTEX no
clique (removida em 31/08/2026): resolve por GTIN pré-cadastrado ou pela
busca da vitrine "Minha Loja" daquele produto.
"""
import pytest

from src.affiliate_links import ProductAffiliateLink
from src.cobasi_provider import CobasiProvider
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


# ── find_offer() — caminho rápido, sem VTEX ao vivo no clique ────────────

@pytest.mark.asyncio
async def test_find_offer_without_pre_registration_builds_minha_loja_search(monkeypatch):
    """Sem GTIN pré-cadastrado: monta a busca daquele produto na vitrine
    afiliada "Minha Loja" — instantâneo, sem chamada de rede, sem preço."""
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="Royal Canin ração"))
        assert offer is not None
        assert offer.price is None
        assert offer.allow_without_price is True
        assert offer.is_available is True
        assert offer.direct_url == "https://minhaloja.cobasi.com.br/busca?q=Royal%20Canin%20ra%C3%A7%C3%A3o"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_returns_none_without_query_or_gtin():
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext())
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_gtin_with_registered_link_serves_that_exact_product():
    """GTIN pré-cadastrado com link MAIS (o caminho da ração do Baby):
    serve o produto exato, sem preço, e monetize() resolve o link pelo GTIN."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="cobasi",
            affiliate_product_url="https://mais.app/IvUCAG", active=True,
        ))
        db.commit()

        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price is None
        assert offer.allow_without_price is True
        assert offer.direct_url is None
        assert offer.ean == GTIN
        assert offer.product_name == "Produto Teste"

        result = provider.monetize(offer, ProductContext(gtin=GTIN))
        assert result == ("https://mais.app/IvUCAG", "affiliate_product", "mais", True)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_gtin_without_link_falls_back_to_minha_loja_search():
    """GTIN conhecido no catálogo mas sem link cadastrado: cai na busca da
    "Minha Loja", já com marca/nome do catálogo pra exibição."""
    _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(gtin=GTIN, query="produto teste"))
        assert offer is not None
        assert offer.price is None
        assert offer.brand == "Marca Teste"
        assert offer.direct_url.startswith("https://minhaloja.cobasi.com.br/busca?q=")
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_utm_monetization_keeps_minha_loja_host():
    """A oferta de busca (caso 2) monetizada em modo utm continua no host
    minhaloja e ganha a UTM MAIS."""
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="ração gato"))
        result = provider.monetize(offer, ProductContext(query="ração gato"))
        assert result is not None
        url = result[0]
        assert url.startswith("https://minhaloja.cobasi.com.br/busca?")
        assert "utm_source=mais" in url
        assert "utm_medium=maisplataforma" in url
        assert "utm_campaign=lojapetmol" in url
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

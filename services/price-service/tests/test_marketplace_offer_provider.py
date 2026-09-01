"""
MarketplaceOfferProvider — lê só MarketplaceOffer (nunca chama a rede do
marketplace, nunca scraping). Ver docstring do módulo.
"""
from datetime import datetime, timedelta, timezone

import pytest

from src.affiliate_links import MarketplaceOffer
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.marketplace_offer_provider import MarketplaceOfferProvider, is_marketplace_merchant_publicly_servable
from src.product_catalog_lookup import ProductCatalog

GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    monkeypatch.delenv("SHOPEE_AFFILIATE_ENABLED", raising=False)
    monkeypatch.delenv("MERCADOLIVRE_AFFILIATE_ENABLED", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _enable_shopee(monkeypatch) -> None:
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()


def _enable_mercadolivre(monkeypatch) -> None:
    monkeypatch.setenv("MERCADOLIVRE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()


def _disable_shopee(monkeypatch) -> None:
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "false")
    get_settings.cache_clear()


def _register_product(
    gtin: str = GTIN,
    *,
    name: str = "Produto Teste",
    brand: str = "Marca Teste",
) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name=name, brand=brand)
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _set_product_thumbnail(product_id: int, thumbnail_url: str) -> None:
    db = SessionLocal()
    try:
        product = db.get(ProductCatalog, product_id)
        product.thumbnail_url = thumbnail_url
        db.commit()
    finally:
        db.close()


def _register_offer(product_id: int, **overrides) -> None:
    defaults = dict(
        product_id=product_id, merchant="shopee",
        affiliate_url="https://s.shopee.com.br/3AbCdEfGh",
        price=59.9, is_available=True, active=True,
    )
    defaults.update(overrides)
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(**defaults))
        db.commit()
    finally:
        db.close()


@pytest.mark.asyncio
async def test_disabled_finds_nothing(monkeypatch):
    _disable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_finds_offer_by_gtin_when_enabled(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 59.9
        assert offer.merchant == "shopee"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_shopee_offer_uses_catalog_thumbnail_when_marketplace_has_no_image(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _set_product_thumbnail(product_id, "https://img.example/racao-nine.jpg")
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.image_url == "https://img.example/racao-nine.jpg"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_prevalidated_marketplace_offer_with_wrong_variant_is_not_displayed(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product(
        name="Biscoito Pedigree Biscrok Carne 500g",
        brand="Pedigree",
    )
    _register_offer(
        product_id,
        price=20.20,
        merchant_title="Biscoito Pedigree Biscrok Multisabor 150g",
        match_decision="HIGH_CONFIDENCE",
    )

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_prevalidated_marketplace_offer_skips_wrong_variant_and_uses_valid_one(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product(
        name="Biscoito Pedigree Biscrok Carne 500g",
        brand="Pedigree",
    )
    _register_offer(
        product_id,
        price=20.20,
        merchant_title="Biscoito Pedigree Biscrok Multisabor 150g",
        match_decision="HIGH_CONFIDENCE",
    )
    _register_offer(
        product_id,
        price=27.99,
        merchant_title="Biscoito Pedigree Biscrok Carne 500g",
        match_decision="HIGH_CONFIDENCE",
    )

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 27.99
        assert offer.merchant_product_name == "Biscoito Pedigree Biscrok Carne 500g"
        assert "WEIGHT_KG_MATCH" in (offer.match_reasons or [])
        assert "FLAVOR_MATCH" in (offer.match_reasons or [])
    finally:
        db.close()


@pytest.mark.asyncio
async def test_stale_offer_two_tier_price_window(monkeypatch):
    """Fase 1-D: entre a janela fresca e _show_stale_after_hours, a oferta
    aparece com o último preço marcado stale ("confirme na loja"). Além
    disso, sem número."""
    _enable_shopee(monkeypatch)
    monkeypatch.setenv("MARKETPLACE_OFFER_STALE_AFTER_HOURS", "36")
    monkeypatch.setenv("MARKETPLACE_OFFER_SHOW_STALE_AFTER_HOURS", "240")
    monkeypatch.setenv("MARKETPLACE_OFFER_INLINE_REFRESH_ENABLED", "false")
    monkeypatch.setenv("MARKETPLACE_OFFER_REFRESH_AFTER_MINUTES", "0")
    get_settings.cache_clear()
    product_id = _register_product()

    within = datetime.now(timezone.utc) - timedelta(hours=100)
    _register_offer(product_id, price=88.9, last_checked_at=within, verified_at=within)
    db = SessionLocal()
    try:
        offer = await MarketplaceOfferProvider(db, "shopee").find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 88.9
        assert offer.price_is_stale is True
    finally:
        db.close()

    beyond = datetime.now(timezone.utc) - timedelta(hours=300)
    db = SessionLocal()
    try:
        row = db.query(MarketplaceOffer).filter(MarketplaceOffer.product_id == product_id).one()
        row.last_checked_at = beyond
        row.verified_at = beyond
        db.commit()
    finally:
        db.close()
    db = SessionLocal()
    try:
        offer = await MarketplaceOfferProvider(db, "shopee").find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price is None
        assert offer.price_is_stale is True
    finally:
        db.close()


@pytest.mark.asyncio
async def test_inline_refresh_is_on_by_default_for_old_shopee_offer(monkeypatch):
    # Fase 1-D / decisão P3: refresh inline ligado por padrão.
    _enable_shopee(monkeypatch)
    monkeypatch.setenv("MARKETPLACE_OFFER_REFRESH_AFTER_MINUTES", "30")
    get_settings.cache_clear()
    product_id = _register_product()
    old = datetime.now(timezone.utc) - timedelta(hours=8)
    _register_offer(product_id, price=382.32, last_checked_at=old, verified_at=old)

    called = {"n": 0}

    def fake_refresh(merchant: str, gtin: str) -> None:
        called["n"] += 1
        rdb = SessionLocal()
        try:
            row = rdb.query(MarketplaceOffer).filter(MarketplaceOffer.product_id == product_id).one()
            row.price = 345.04
            row.last_checked_at = datetime.now(timezone.utc)
            row.verified_at = row.last_checked_at
            rdb.commit()
        finally:
            rdb.close()

    monkeypatch.setattr("src.marketplace_offer_provider._refresh_marketplace_offer", fake_refresh)

    db = SessionLocal()
    try:
        offer = await MarketplaceOfferProvider(db, "shopee").find_offer(ProductContext(gtin=GTIN))
        assert called["n"] == 1
        assert offer is not None
        assert offer.price == 345.04
        assert offer.price_is_stale is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_old_shopee_offer_can_be_refreshed_before_display_when_enabled(monkeypatch):
    _enable_shopee(monkeypatch)
    monkeypatch.setenv("MARKETPLACE_OFFER_INLINE_REFRESH_ENABLED", "true")
    monkeypatch.setenv("MARKETPLACE_OFFER_REFRESH_AFTER_MINUTES", "30")
    get_settings.cache_clear()
    product_id = _register_product()
    old = datetime.now(timezone.utc) - timedelta(hours=2)
    _register_offer(product_id, price=382.32, last_checked_at=old, verified_at=old)

    def fake_refresh(merchant: str, gtin: str) -> None:
        assert merchant == "shopee"
        assert gtin == GTIN
        refresh_db = SessionLocal()
        try:
            row = refresh_db.query(MarketplaceOffer).filter(MarketplaceOffer.product_id == product_id).one()
            row.price = 345.04
            row.last_checked_at = datetime.now(timezone.utc)
            row.verified_at = row.last_checked_at
            refresh_db.commit()
        finally:
            refresh_db.close()

    monkeypatch.setattr("src.marketplace_offer_provider._refresh_marketplace_offer", fake_refresh)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price == 345.04
        assert offer.price_is_stale is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_fresh_offer_exposes_price_checked_at(monkeypatch):
    _enable_shopee(monkeypatch)
    checked_at = datetime.now(timezone.utc) - timedelta(minutes=10)
    product_id = _register_product()
    _register_offer(product_id, last_checked_at=checked_at)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price_checked_at == checked_at
        assert offer.price_is_stale is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_finds_offer_by_product_id_directly(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(product_id=product_id))
        assert offer is not None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_finds_offer_by_text_when_context_has_no_gtin(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product(
        gtin="7896181298083",
    )
    db = SessionLocal()
    try:
        product = db.get(ProductCatalog, product_id)
        product.name = "Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães de Porte Pequeno com Cálculos Urinários"
        product.brand = "Royal Canin"
        product.category = "food"
        db.commit()
    finally:
        db.close()
    _register_offer(product_id, price=399.9)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(
            query="ROYAL CANIN URINARY S/O Veterinary Diet Small Dog Cão 7,5 kg",
            weight_kg=7.5,
        ))
        assert offer is not None
        assert offer.price == 399.9
        assert offer.merchant == "shopee"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_offer_without_price_never_invents_one(monkeypatch):
    """find_offer() retorna a oferta com price=None tal como está — quem
    descarta oferta sem preço é o CommerceEngine (commerce_provider.py).
    Como nunca fazemos scraping de preço, esse é o caminho real de "sem
    preço confirmado pelo admin, produto fica invisível" — o provider em
    si nunca inventa/estima um valor."""
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id, price=None)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        # find_offer em si retorna a oferta (price=None) — quem descarta é
        # o CommerceEngine (commerce_provider.py). Confirma aqui só que o
        # provider não inventa preço nenhum.
        assert offer is not None
        assert offer.price is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_inactive_offer_never_found(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    _register_offer(product_id, active=False)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_unknown_gtin_finds_nothing(monkeypatch):
    _enable_shopee(monkeypatch)
    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin="0000000000000"))
        assert offer is None
    finally:
        db.close()


def test_monetize_returns_official_url_unchanged(monkeypatch):
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="shopee",
            affiliate_url="https://s.shopee.com.br/3AbCdEfGh?utm=x",
            price=59.9, is_available=True, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "shopee")
        discovered = DiscoveredOffer(merchant="shopee", price=59.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result == ("https://s.shopee.com.br/3AbCdEfGh?utm=x", "affiliate_marketplace_offer", "shopee", True)
    finally:
        db.close()


def test_monetize_rejects_offer_with_now_invalid_domain(monkeypatch):
    """Defesa em profundidade: se por algum motivo uma linha tiver um
    domínio inválido (ex: dado antigo, bug de outro código), monetize()
    nunca a exibe — revalida no momento do clique, não confia só no
    cadastro admin."""
    _enable_shopee(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="shopee",
            affiliate_url="https://golpeshopee.com.br/produto",
            price=59.9, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "shopee")
        discovered = DiscoveredOffer(merchant="shopee", price=59.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


def test_monetize_disabled_returns_none(monkeypatch):
    _disable_shopee(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="shopee",
            affiliate_url="https://s.shopee.com.br/abc",
            price=59.9, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "shopee")
        discovered = DiscoveredOffer(merchant="shopee", price=59.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


def test_is_marketplace_merchant_publicly_servable_unknown_merchant_always_false(monkeypatch):
    _enable_shopee(monkeypatch)
    assert is_marketplace_merchant_publicly_servable("mercadolivre") is False


# ── Mercado Livre — §12/§14/§15 da auditoria de monetização (25/08/2026) ──
# ML nunca tem API de geração de link (confirmado, ver
# mercadolivre_link_validator.py) — todo link vem do Gerador de Links
# oficial, colado manualmente via import_ml_offers.py. Estes testes
# provam a separação: descoberta (ProductCatalog/scan) nunca é
# monetização (MarketplaceOffer); sem oferta cadastrada, ML é invisível.

def test_ml_plain_product_url_rejected(monkeypatch):
    """Uma URL comum de produto ML (sem os parâmetros de rastreamento do
    Gerador de Links) nunca pode ser aceita como affiliate_url — mesma
    regra do validador, testada aqui pela borda que importa: monetize()
    nunca devolve isso pro tutor."""
    _enable_mercadolivre(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        row = MarketplaceOffer(
            product_id=product_id, merchant="mercadolivre",
            affiliate_url="https://www.mercadolivre.com.br/produto-generico/p/MLB123",
            price=89.9, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "mercadolivre")
        discovered = DiscoveredOffer(merchant="mercadolivre", price=89.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


def test_ml_official_affiliate_url_accepted(monkeypatch):
    """Link real gerado pelo Gerador de Links oficial (matt_word/matt_tool
    presentes) — aceito e devolvido sem reescrever nada."""
    _enable_mercadolivre(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        official_url = "https://www.mercadolivre.com.br/social/petmol?matt_word=petmol&matt_tool=12345&ref=x"
        row = MarketplaceOffer(
            product_id=product_id, merchant="mercadolivre",
            affiliate_url=official_url,
            price=89.9, active=True,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        provider = MarketplaceOfferProvider(db, "mercadolivre")
        discovered = DiscoveredOffer(merchant="mercadolivre", price=89.9, external_id=str(row.id))
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result == (official_url, "affiliate_marketplace_offer", "mercadolivre", True)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_ml_product_without_affiliate_offer_invisible(monkeypatch):
    """Núcleo do §15: produto conhecido pelo PETMOL (existe em
    ProductCatalog, foi escaneado) mas SEM MarketplaceOffer(merchant=
    mercadolivre) cadastrada — precisa ficar invisível, mesmo com o
    master gate ligado. Nunca: 'sem link, então busca URL direta na API
    do ML' — essa ponte não existe por design (ver commerce_provider.py:
    a API do ML é só descoberta/catálogo, nunca monetização)."""
    _enable_mercadolivre(monkeypatch)
    _register_product()  # produto existe, mas nenhuma MarketplaceOffer é criada

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "mercadolivre")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()

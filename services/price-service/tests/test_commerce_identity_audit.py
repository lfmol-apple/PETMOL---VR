"""
commerce_identity_audit — as 2 lojas têm que apontar pro mesmo produto.
fetch_cobasi_price e a resolução de shortlink mais.app são sempre
monkeypatchadas; nunca chama rede real.
"""
import pytest

from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import ProductAffiliateLink
from src.commerce_identity_audit import (
    CommerceIdentityCheck,
    VERDICT_HARD,
    VERDICT_OK,
    VERDICT_SOFT,
    audit_commerce_identity,
    cobasi_identity_blocks,
    resolve_cobasi_link_destination,
    score_identity,
    _slug_words_from_cobasi_url,
)
from src.config import get_settings
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog


GTIN = "7896181298090"
ROYAL_TITLE = "Ração Royal Canin Veterinary Urinary Small Dog 7,5kg"


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("ENV", "dev")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _mk_product(gtin=GTIN, name="Ração do Baby", brand="Royal Canin") -> int:
    db = SessionLocal()
    try:
        p = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name=name, brand=brand, category="food")
        db.add(p)
        db.commit()
        db.refresh(p)
        return p.id
    finally:
        db.close()


def _mk_awin_identity(gtin=GTIN, title=ROYAL_TITLE, brand="Royal Canin"):
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870",
            external_product_id="1", gtin=gtin, title=title, brand=brand,
            price=200.0, in_stock=True, active=True,
            affiliate_url="https://www.awin1.com/x", merchant_url="https://www.cobasi.com.br/x/p",
        ))
        db.commit()
    finally:
        db.close()


def _mk_link(product_id, url, merchant="cobasi"):
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant=merchant, affiliate_product_url=url, active=True))
        db.commit()
    finally:
        db.close()


# ── score_identity ─────────────────────────────────────────────────────

def test_score_identity_ok_when_words_overlap():
    v, score, _ = score_identity(ROYAL_TITLE, "Royal Canin", {"royal", "canin", "urinary", "small", "dog"})
    assert v == VERDICT_OK


def test_score_identity_hard_on_brand_conflict():
    v, _s, detail = score_identity(ROYAL_TITLE, "Royal Canin", {"golden", "formula", "frango"})
    assert v == VERDICT_HARD
    assert "marca" in detail.lower()


def test_score_identity_soft_without_brand_conflict_even_on_near_zero_overlap():
    # conservador: sem marca conhecida conflitante, sobreposição baixa é
    # só mismatch_soft (relatório) — nunca desativa link por slug pobre.
    v, _s, _d = score_identity(ROYAL_TITLE, "Royal Canin", {"coleira", "antipulgas"})
    assert v == VERDICT_SOFT


def test_score_identity_hard_when_other_known_brand_present():
    v, _s, detail = score_identity(ROYAL_TITLE, "Royal Canin", {"seresto", "coleira", "8", "meses"})
    assert v == VERDICT_HARD
    assert "marca" in detail.lower()


# ── URL helpers ────────────────────────────────────────────────────────

def test_slug_words_strips_trailing_id():
    words = _slug_words_from_cobasi_url(
        "https://www.cobasi.com.br/racao-royal-canin-caes-urinary-small-dog-3827380/p"
    )
    assert "royal" in words and "canin" in words and "urinary" in words
    assert "3827380" not in words


def test_slug_words_from_search_url():
    words = _slug_words_from_cobasi_url("https://www.cobasi.com.br/pesquisa?terms=royal+canin+urinary")
    assert {"royal", "canin", "urinary"} <= words


def test_resolve_destination_passthrough_and_reject():
    assert resolve_cobasi_link_destination("https://www.cobasi.com.br/x/p") == "https://www.cobasi.com.br/x/p"
    assert resolve_cobasi_link_destination("https://minhaloja.cobasi.com.br/y/p") == "https://minhaloja.cobasi.com.br/y/p"
    assert resolve_cobasi_link_destination("https://www.petz.com.br/z") is None
    assert resolve_cobasi_link_destination("") is None


def test_resolve_destination_mais_shortlink(monkeypatch):
    class _Resp:
        def raise_for_status(self): pass
        def json(self): return {"success": True, "url": "https://www.cobasi.com.br/racao-royal-canin-3827380/p?utm_source=mais"}

    class _Client:
        def get(self, url): assert url.endswith("/IvUCAG"); return _Resp()
        def close(self): pass

    monkeypatch.setattr("src.commerce_identity_audit.httpx.Client", lambda *a, **k: _Client())
    dest = resolve_cobasi_link_destination("https://mais.app/IvUCAG")
    assert dest.startswith("https://www.cobasi.com.br/racao-royal-canin")


# ── audit_gtin / audit_commerce_identity ───────────────────────────────

@pytest.mark.asyncio
async def test_registered_link_matching_product_is_ok():
    pid = _mk_product()
    _mk_awin_identity()
    _mk_link(pid, "https://www.cobasi.com.br/racao-royal-canin-caes-urinary-small-dog-3827380/p")

    db = SessionLocal()
    try:
        report = await audit_commerce_identity(db, [GTIN], deactivate_hard_links=True)
    finally:
        db.close()
    assert report.deactivated_links == 0
    assert report.counts.get(VERDICT_OK, 0) >= 1


@pytest.mark.asyncio
async def test_registered_link_wrong_product_is_hard_and_deactivated():
    pid = _mk_product()
    _mk_awin_identity()
    # link aponta pra uma ração Golden — marca conflitante
    _mk_link(pid, "https://www.cobasi.com.br/racao-golden-formula-caes-adultos-frango-12345/p")

    db = SessionLocal()
    try:
        report = await audit_commerce_identity(db, [GTIN], deactivate_hard_links=True)
        assert report.deactivated_links == 1
        row = db.scalar(
            __import__("sqlalchemy").select(CommerceIdentityCheck).where(
                CommerceIdentityCheck.gtin == GTIN, CommerceIdentityCheck.merchant == "cobasi"
            )
        )
        assert row.verdict == VERDICT_HARD
        link = db.scalar(
            __import__("sqlalchemy").select(ProductAffiliateLink).where(ProductAffiliateLink.product_id == pid)
        )
        assert link.active is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_live_search_wrong_ean_is_hard(monkeypatch):
    _mk_product()
    _mk_awin_identity()

    from src.commerce_pricing import ProductPriceResult

    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(found=True, price=32.9, is_available=True,
                                  product_name="Ração Gato Filhote 1kg", brand="Golden",
                                  url="https://www.cobasi.com.br/racao-gato-1kg-999/p", ean="7890000000001")

    monkeypatch.setattr("src.commerce_pricing.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        report = await audit_commerce_identity(db, [GTIN], deactivate_hard_links=True)
        row = db.scalar(
            __import__("sqlalchemy").select(CommerceIdentityCheck).where(
                CommerceIdentityCheck.gtin == GTIN, CommerceIdentityCheck.merchant == "cobasi"
            )
        )
        assert row.verdict == VERDICT_HARD
        assert "EAN" in (row.detail or "")
    finally:
        db.close()


# ── enforcement ────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_cobasi_identity_blocks_only_fresh_hard():
    _mk_product()
    _mk_awin_identity()
    _mk_link(_mk_product(gtin="9999999999999"), "https://x")  # ruído

    db = SessionLocal()
    try:
        db.add(CommerceIdentityCheck(gtin=GTIN, merchant="cobasi", verdict=VERDICT_HARD, score=0.0))
        db.commit()
        assert cobasi_identity_blocks(db, GTIN) is True
        assert cobasi_identity_blocks(db, "0000000000000") is False

        row = db.scalar(
            __import__("sqlalchemy").select(CommerceIdentityCheck).where(CommerceIdentityCheck.gtin == GTIN)
        )
        row.verdict = VERDICT_SOFT
        db.commit()
        assert cobasi_identity_blocks(db, GTIN) is False
    finally:
        db.close()


@pytest.mark.asyncio
async def test_cobasi_provider_suppresses_live_offer_on_hard_mismatch(monkeypatch):
    """CobasiProvider.find_offer devolve None quando há mismatch_hard fresco
    e nenhum link cadastrado — as 2 lojas não podem divergir."""
    from src.cobasi_provider import CobasiProvider
    from src.commerce_provider import ProductContext
    from src.commerce_pricing import ProductPriceResult

    _mk_product()

    async def fake_fetch(query, target_weight_kg=None):
        return ProductPriceResult(found=True, price=10.0, is_available=True,
                                  url="https://www.cobasi.com.br/x/p", product_name="X")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    db = SessionLocal()
    try:
        db.add(CommerceIdentityCheck(gtin=GTIN, merchant="cobasi", verdict=VERDICT_HARD, score=0.0))
        db.commit()
        provider = CobasiProvider(db)
        offer = await provider.find_offer(ProductContext(query="royal canin", gtin=GTIN))
        assert offer is None
    finally:
        db.close()

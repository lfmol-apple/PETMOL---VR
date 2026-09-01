"""
Corpus obrigatório da SHOPEE — IDENTIDADE PRIMEIRO, PREÇO DEPOIS.

O vencedor público é MIN(price) SÓ entre ofertas comprovadamente do mesmo
SKU do produto PETMOL. Preço nunca participa da prova de identidade.

Dois níveis:
 1. evaluate_identity — veredito por candidato (ACCEPT/REJECT).
 2. MarketplaceOfferProvider.find_offer — escolha do menor preço válido
    entre linhas MarketplaceOffer (o caminho real de produção).
"""
import pytest

from src.affiliate_links import MarketplaceOffer
from src.commerce_provider import ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.marketplace_offer_provider import MarketplaceOfferProvider
from src.product_catalog_lookup import ProductCatalog
from src.product_identity import IdentityDecision, MerchantCandidate, ProductIdentity, evaluate_identity


@pytest.fixture(autouse=True)
def _enable_shopee(monkeypatch):
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _mk_product(gtin, name, brand, **cols) -> int:
    db = SessionLocal()
    try:
        p = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name=name, brand=brand, **cols)
        db.add(p)
        db.commit()
        db.refresh(p)
        return p.id
    finally:
        db.close()


def _mk_offer(product_id, *, title, price, listing_id, decision="HIGH_CONFIDENCE", **cols):
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=product_id, merchant="shopee", external_listing_id=listing_id,
            merchant_title=title, match_decision=decision, match_confidence=0.8,
            affiliate_url=f"https://s.shopee.com.br/{listing_id}",
            price=price, is_available=True, active=True,
            **cols,
        ))
        db.commit()
    finally:
        db.close()


async def _winning_price(gtin, *, weight_kg=None):
    db = SessionLocal()
    try:
        offer = await MarketplaceOfferProvider(db, "shopee").find_offer(
            ProductContext(gtin=gtin, weight_kg=weight_kg)
        )
        return offer.price if offer else None
    finally:
        db.close()


# ── evaluate_identity: veredito por candidato ──────────────────────────

ROYAL = ProductIdentity.build(
    gtin="7896181298090",
    canonical_name="Ração Royal Canin Veterinary Urinary Small Dog para Cães 7,5kg",
    brand="Royal Canin", species="dog", weight_kg=7.5,
)


def _verdict(expected, title):
    return evaluate_identity(expected, MerchantCandidate.build(merchant="shopee", title=title)).decision


def test_identity_accepts_same_sku():
    assert _verdict(ROYAL, "Royal Canin Urinary Small Dog Cães 7,5kg Ração Veterinária") in (
        IdentityDecision.HIGH_CONFIDENCE, IdentityDecision.EXACT,
    )


def test_identity_rejects_wrong_weight():
    assert _verdict(ROYAL, "Royal Canin Urinary Small Dog Cães 1,5kg") == IdentityDecision.CONFLICT


def test_identity_rejects_wrong_species():
    assert _verdict(ROYAL, "Royal Canin Urinary GATOS 7,5kg Feline") == IdentityDecision.CONFLICT


def test_identity_rejects_insufficient_title():
    # sem marca, sem peso, sem família reconhecível
    assert _verdict(ROYAL, "Ração pet promoção barata") in (
        IdentityDecision.NO_MATCH, IdentityDecision.CONFLICT,
    )


def test_identity_unknown_weight_is_not_conflict():
    # título não menciona peso → UNKNOWN, nunca CONFLICT
    res = evaluate_identity(ROYAL, MerchantCandidate.build(
        merchant="shopee", title="Royal Canin Urinary Small Dog Cães Ração Veterinária"))
    weight_attr = next(a for a in res.attributes if a.attribute == "weight_kg")
    assert weight_attr.status.value == "UNKNOWN"
    assert res.decision != IdentityDecision.CONFLICT


# ── MIN price entre ofertas do MESMO SKU ───────────────────────────────

@pytest.mark.asyncio
async def test_corpus_royal_canin_urinary():
    pid = _mk_product("7896181298090",
                      "Ração Royal Canin Veterinary Urinary Small Dog Cães 7,5kg", "Royal Canin",
                      species="dog")
    _mk_offer(pid, title="Royal Canin Urinary Small Dog Cães 7,5kg Ração", price=450.0, listing_id="rc-a")
    _mk_offer(pid, title="Royal Canin Urinary Small Dog 7,5kg Veterinary Cães", price=399.0, listing_id="rc-b")
    _mk_offer(pid, title="Royal Canin Urinary Small Dog Cães 1,5kg", price=150.0, listing_id="rc-c")
    _mk_offer(pid, title="Royal Canin Urinary GATOS 1,5kg Feline", price=120.0, listing_id="rc-d")
    assert await _winning_price("7896181298090", weight_kg=7.5) == 399.0


@pytest.mark.asyncio
async def test_corpus_scalibor():
    pid = _mk_product("7891111100001", "Coleira Antipulgas Scalibor Cães 48cm", "Scalibor", species="dog")
    _mk_offer(pid, title="Coleira Scalibor Antipulgas Cães 48cm Grande", price=90.0, listing_id="sc-a")
    _mk_offer(pid, title="Coleira Scalibor Antipulgas 48cm Cães", price=85.0, listing_id="sc-b")
    _mk_offer(pid, title="Coleira Scalibor Antipulgas Cães 65cm", price=80.0, listing_id="sc-c")
    assert await _winning_price("7891111100001") == 85.0


@pytest.mark.asyncio
async def test_corpus_revolution():
    pid = _mk_product("7898049717989", "Antipulgas Revolution Cães 5,1 a 10kg", "Revolution", species="dog")
    _mk_offer(pid, title="Revolution Antipulgas Cães 5,1kg a 10kg Pipeta", price=100.0, listing_id="rv-a")
    _mk_offer(pid, title="Revolution Cães de 5,1 a 10 kg Antipulgas", price=92.0, listing_id="rv-b")
    _mk_offer(pid, title="Revolution Antipulgas Cães 10,1kg a 20kg", price=89.0, listing_id="rv-c")
    assert await _winning_price("7898049717989") == 92.0


@pytest.mark.asyncio
async def test_corpus_glicopan():
    pid = _mk_product("7898053580142", "Glicopan Pet Suplemento 250ml", "Vetnil")
    _mk_offer(pid, title="Glicopan Pet 250ml Suplemento Vitamínico", price=95.0, listing_id="gp-a")
    _mk_offer(pid, title="Glicopan Pet Suplemento 250 ml", price=90.0, listing_id="gp-b")
    _mk_offer(pid, title="Glicopan Pet 30ml Suplemento", price=35.0, listing_id="gp-c")
    assert await _winning_price("7898053580142") == 90.0


# ── rejeição estruturada — ZERO falso positivo ─────────────────────────

@pytest.mark.asyncio
async def test_cheap_wrong_species_never_wins():
    pid = _mk_product("7891111100010", "Ração Golden Fórmula Cães Adultos Frango 15kg", "Golden", species="dog")
    _mk_offer(pid, title="Ração Golden Fórmula GATOS Adultos 15kg", price=1.0, listing_id="g-cat")
    _mk_offer(pid, title="Ração Golden Fórmula Cães Adultos Frango 15kg", price=200.0, listing_id="g-dog")
    assert await _winning_price("7891111100010") == 200.0


@pytest.mark.asyncio
async def test_cheap_wrong_volume_never_wins():
    pid = _mk_product("7891111100011", "Shampoo Sanol Dog 500ml", "Sanol")
    _mk_offer(pid, title="Shampoo Sanol Dog 50ml Mini", price=3.0, listing_id="s-mini")
    _mk_offer(pid, title="Shampoo Sanol Dog 500ml", price=25.0, listing_id="s-full")
    assert await _winning_price("7891111100011") == 25.0


@pytest.mark.asyncio
async def test_cheap_wrong_pack_count_never_wins():
    pid = _mk_product("7891111100012", "NexGard Cães 4,1 a 10kg 3 comprimidos", "NexGard", species="dog")
    _mk_offer(pid, title="NexGard Cães 4,1 a 10kg 1 comprimido", price=40.0, listing_id="nx-1")
    _mk_offer(pid, title="NexGard Cães 4,1 a 10kg 3 comprimidos", price=120.0, listing_id="nx-3")
    assert await _winning_price("7891111100012") == 120.0


@pytest.mark.asyncio
async def test_all_candidates_conflict_returns_nothing():
    pid = _mk_product("7891111100013", "Ração X Cães Adultos 15kg", "MarcaX", species="dog", weight_kg=15.0)
    _mk_offer(pid, title="Ração X Cães Adultos 1kg", price=10.0, listing_id="x-1")
    _mk_offer(pid, title="Ração X GATOS Adultos 15kg", price=12.0, listing_id="x-cat")
    assert await _winning_price("7891111100013", weight_kg=15.0) is None


# ── linha legada (sem evidência) ──────────────────────────────────────

@pytest.mark.asyncio
async def test_legacy_offer_without_evidence_held_when_product_is_structured():
    pid = _mk_product("7891111100020", "Ração Premier Golden Cães 15kg", "Premier", species="dog", weight_kg=15.0)
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=pid, merchant="shopee", external_listing_id="legacy-1",
            affiliate_url="https://s.shopee.com.br/legacy1", price=99.0, is_available=True, active=True,
        ))
        db.commit()
    finally:
        db.close()
    # produto tem peso conhecido → não dá pra provar → não publica
    assert await _winning_price("7891111100020", weight_kg=15.0) is None


@pytest.mark.asyncio
async def test_legacy_offer_without_evidence_shown_when_product_has_no_sku_discriminator():
    pid = _mk_product("7891111100021", "Brinquedo Corda Pet", "GenericPet")
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=pid, merchant="shopee", external_listing_id="legacy-2",
            affiliate_url="https://s.shopee.com.br/legacy2", price=19.0, is_available=True, active=True,
        ))
        db.commit()
    finally:
        db.close()
    assert await _winning_price("7891111100021") == 19.0


@pytest.mark.asyncio
async def test_stale_valid_offer_is_served_without_price_number():
    from datetime import datetime, timedelta, timezone
    pid = _mk_product("7891111100030", "Ração Golden Cães 15kg", "Golden", species="dog")
    old = datetime.now(timezone.utc) - timedelta(days=30)
    _mk_offer(pid, title="Ração Golden Cães Adultos 15kg", price=210.0, listing_id="st-1",
              last_checked_at=old, verified_at=old)
    db = SessionLocal()
    try:
        offer = await MarketplaceOfferProvider(db, "shopee").find_offer(ProductContext(gtin="7891111100030"))
        assert offer is not None
        assert offer.price is None          # preço velho nunca vira número
        assert offer.price_is_stale is True
        assert offer.allow_without_price is True
    finally:
        db.close()


@pytest.mark.asyncio
async def test_two_ambiguous_accepted_candidates_still_pick_cheapest_same_sku():
    # ambos são o MESMO SKU (7,5kg, cão) só que de sellers diferentes —
    # não é ambiguidade de identidade, é concorrência de preço → menor vence
    pid = _mk_product("7891111100031",
                      "Ração Royal Canin Urinary Small Dog Cães 7,5kg", "Royal Canin", species="dog")
    _mk_offer(pid, title="Royal Canin Urinary Small Dog Cães 7,5kg", price=445.0, listing_id="am-a")
    _mk_offer(pid, title="Royal Canin Urinary Small Dog 7,5kg Cães Veterinary", price=420.0, listing_id="am-b")
    _mk_offer(pid, title="Royal Canin Urinary Small Dog Cães 7,5 kg Ração", price=399.0, listing_id="am-c")
    assert await _winning_price("7891111100031", weight_kg=7.5) == 399.0


@pytest.mark.asyncio
async def test_legacy_offer_with_stored_decision_is_trusted():
    pid = _mk_product("7891111100022", "Ração Golden Cães 15kg", "Golden", species="dog", weight_kg=15.0)
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=pid, merchant="shopee", external_listing_id="stored-1",
            match_decision="EXACT", match_confidence=1.0,
            affiliate_url="https://s.shopee.com.br/stored1", price=180.0, is_available=True, active=True,
        ))
        db.commit()
    finally:
        db.close()
    assert await _winning_price("7891111100022", weight_kg=15.0) == 180.0

"""
Catálogo mestre PETMOL — enriquecimento determinístico a partir dos feeds
Awin. GTIN é a chave; texto enriquece, nunca contradiz; nunca rebaixa
dado bom; discriminador que os feeds discordam fica NULO.
"""
import json

import pytest
from sqlalchemy import select

from src.affiliate_feed import AffiliateFeedOffer
from src.catalog_enrichment import (
    evidence_from_feed_offer,
    merge_product_catalog_identity,
)
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog


def _feed(gtin, title, *, merchant="cobasi", brand="Royal Canin", category=None, description=None):
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin", merchant=merchant, advertiser_id="17870",
            external_product_id=f"{merchant}-{gtin}-{abs(hash(title)) % 10000}",
            gtin=gtin, title=title, brand=brand, category=category, description=description,
            price=100.0, active=True, in_stock=True,
        ))
        db.commit()
    finally:
        db.close()


def _catalog(gtin) -> ProductCatalog:
    db = SessionLocal()
    try:
        return db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin))
    finally:
        db.close()


def _merge(gtin, **kw):
    db = SessionLocal()
    try:
        r = merge_product_catalog_identity(db, gtin, **kw)
        db.commit()
        return r
    finally:
        db.close()


# ── criação / identidade correta ──────────────────────────────────────

def test_awin_gtin_creates_catalog_row_with_identity():
    _feed("7896181215417", "Ração Royal Canin Veterinary Diet Urinary S/O para Gatos 1,5kg",
          merchant="zeenow", category="Gatos > Alimentos")
    r = _merge("7896181215417")
    assert r.created is True
    p = _catalog("7896181215417")
    assert p.species == "cat"
    assert p.weight_kg == 1.5
    assert "urinary" in (p.therapeutic_attributes_json or "")
    assert p.canonical_brand == "Royal Canin"


def test_species_comes_from_category_breadcrumb_even_if_title_omits_it():
    _feed("7891000000010", "Ração Golden Fórmula Adultos Frango e Arroz 15kg",
          brand="Golden", category="Cachorro > Ração > Ração Seca")
    _merge("7891000000010")
    assert _catalog("7891000000010").species == "dog"


# ── convergência entre feeds (cobasi família + zeenow SKU) ─────────────

def test_multiple_feeds_same_gtin_converge_and_prefer_sku_specific_name():
    g = "7896181298090"
    _feed(g, "Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães com Cálculos Urinários",
          merchant="cobasi", category="Cachorro > Ração > Ração Medicamentosa")
    _feed(g, "Ração Seca Royal Canin Urinary Small Dog Cães Porte Pequeno 7,5kg",
          merchant="zeenow", category="Cachorro > Alimentos")
    _merge(g)
    p = _catalog(g)
    assert "7,5" in p.canonical_name          # o título com o SKU vence
    assert p.weight_kg == 7.5
    assert p.species == "dog"
    ev = json.loads(p.identity_evidence_json)
    assert set(ev["canonical_name"]["sources"]) == {"cobasi", "zeenow"}
    assert ev["weight_kg"]["source"] == "AWIN_FEED"


def test_different_gtins_never_merged_by_similar_name():
    _feed("7890000000001", "Ração Royal Canin Urinary Small Dog 1,5kg", merchant="zeenow", category="Cachorro")
    _feed("7890000000002", "Ração Royal Canin Urinary Small Dog 7,5kg", merchant="zeenow", category="Cachorro")
    _merge("7890000000001")
    _merge("7890000000002")
    a, b = _catalog("7890000000001"), _catalog("7890000000002")
    assert a.id != b.id
    assert a.weight_kg == 1.5 and b.weight_kg == 7.5


# ── nunca rebaixa / idempotência ──────────────────────────────────────

def test_incomplete_later_feed_does_not_erase_known_weight():
    g = "7893333333331"
    _feed(g, "Coleira Antipulgas Scalibor Cães 65cm", merchant="zeenow", brand="Scalibor", category="Cachorro")
    _merge(g)
    assert _catalog(g).length_cm == 65.0
    # feed novo, título família sem o cm
    _feed(g, "Coleira Antipulgas Scalibor Cães", merchant="cobasi", brand="Scalibor", category="Cachorro")
    r = _merge(g)
    assert "length_cm" not in r.updated_fields
    assert _catalog(g).length_cm == 65.0


def test_force_refresh_retracts_stale_awin_value_after_extractor_fix():
    """Após corrigir um extrator, o re-enriquecimento com force revisa e
    RETRATA o que este mesmo pipeline gravou errado — nunca toca fontes
    protegidas."""
    g = "7893333344441"
    # 1ª passada: título ambíguo faz o extrator (à época) gravar weight_kg
    _feed(g, "Antipulgas NexGard Cães de 4,1 a 10 kg", merchant="zeenow", brand="NexGard", category="Cachorro")
    db = SessionLocal()
    try:
        r = merge_product_catalog_identity(db, g)
        db.commit()
    finally:
        db.close()
    # simula o dado ruim da leva pré-correção
    db = SessionLocal()
    try:
        p = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == g))
        p.weight_kg = 10.0
        ev = json.loads(p.identity_evidence_json)
        ev["weight_kg"] = {"value": 10.0, "source": "AWIN_FEED", "confidence": 0.75}
        p.identity_evidence_json = json.dumps(ev)
        db.commit()
    finally:
        db.close()
    # re-enriquecimento com force: o extrator corrigido não sustenta mais o valor
    db = SessionLocal()
    try:
        r = merge_product_catalog_identity(db, g, force_awin_refresh=True)
        db.commit()
    finally:
        db.close()
    assert "weight_kg" in r.updated_fields
    assert _catalog(g).weight_kg is None
    assert _catalog(g).animal_weight_min_kg == 4.1


def test_force_refresh_never_touches_protected_source():
    g = "7893333355551"
    db = SessionLocal()
    try:
        db.add(ProductCatalog(
            barcode=g, barcode_normalized=g, name="Bom", canonical_name="Bom", weight_kg=2.5,
            identity_evidence_json=json.dumps({"weight_kg": {"value": 2.5, "source": "MANUAL", "confidence": 1.0}}),
        ))
        db.commit()
    finally:
        db.close()
    _feed(g, "Ração X Cães 15kg", brand="X", category="Cachorro")
    db = SessionLocal()
    try:
        r = merge_product_catalog_identity(db, g, force_awin_refresh=True)
        db.commit()
    finally:
        db.close()
    assert "weight_kg" not in r.updated_fields
    assert _catalog(g).weight_kg == 2.5


def test_rerun_is_idempotent():
    g = "7894444444441"
    _feed(g, "Ração Premier Golden Cães Adultos Frango 15kg", brand="Premier", category="Cachorro")
    _merge(g)
    r2 = _merge(g)
    assert r2.updated_fields == []


def test_protected_source_field_is_never_overwritten():
    g = "7895555555551"
    db = SessionLocal()
    try:
        p = ProductCatalog(
            barcode=g, barcode_normalized=g, name="Nome bom validado", canonical_name="Nome bom validado",
            weight_kg=2.5,
            identity_evidence_json=json.dumps({"weight_kg": {"value": 2.5, "source": "MANUAL", "confidence": 1.0}}),
        )
        db.add(p)
        db.commit()
    finally:
        db.close()
    _feed(g, "Ração X Cães 15kg", brand="X", category="Cachorro")
    r = _merge(g)
    assert "weight_kg" not in r.updated_fields
    assert _catalog(g).weight_kg == 2.5


# ── discriminador que os feeds discordam → NULO + ambiguous ───────────

def test_conflicting_weight_across_feeds_is_left_null_and_logged():
    g = "7896666666661"
    _feed(g, "Ração Marca Y Cães Adultos 3kg", brand="Y", merchant="cobasi", category="Cachorro")
    _feed(g, "Ração Marca Y Cães Adultos 15kg", brand="Y", merchant="zeenow", category="Cachorro")
    r = _merge(g)
    assert "weight_kg" in r.ambiguous_fields
    p = _catalog(g)
    assert p.weight_kg is None
    ev = json.loads(p.identity_evidence_json)
    assert ev["weight_kg"]["ambiguous"] is True


def test_conflicting_species_left_null():
    g = "7896666666662"
    _feed(g, "Ração Marca Z 3kg", brand="Z", merchant="cobasi", category="Cachorro > Ração")
    _feed(g, "Ração Marca Z 3kg", brand="Z", merchant="zeenow", category="Gatos > Ração")
    r = _merge(g)
    assert "species" in r.ambiguous_fields
    assert _catalog(g).species is None


# ── description alimenta extração ────────────────────────────────────

def test_description_feeds_attribute_extraction():
    o = AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="17870", external_product_id="d1",
        gtin="7897777777771", title="Suplemento Glicopan Pet", brand="Vetnil",
        category="Cachorro > Suplementos",
        description="Suplemento vitamínico Glicopan Pet frasco de 250 ml para cães e gatos.",
    )
    e = evidence_from_feed_offer(o)
    assert e.identity.volume_ml == 250.0


# ── no feed → nada ───────────────────────────────────────────────────

def test_no_feed_rows_skips_cleanly():
    r = _merge("7899999999998")
    assert r.skipped_reason == "sem_evidencia_de_feed"
    assert _catalog("7899999999998") is None


# ── identidade enriquecida melhora o match da Shopee ─────────────────

def test_enriched_identity_lets_shopee_reject_wrong_weight_and_keep_unknown():
    from src.product_identity import IdentityDecision, MerchantCandidate, ProductIdentity, evaluate_identity

    g = "7898049717989"
    _feed(g, "Antipulgas Revolution para Cães de 5,1 a 10 kg", merchant="cobasi",
          brand="Revolution", category="Cachorro > Antipulgas e Carrapatos")
    _feed(g, "Revolution Cães 5,1kg a 10kg Antipulgas Pipeta", merchant="zeenow",
          brand="Revolution", category="Cachorro > Antipulgas")
    _merge(g)
    p = _catalog(g)
    ident = ProductIdentity.from_catalog(p)
    assert ident.species == "dog"
    assert ident.animal_weight_range == (5.1, 10.0)

    # anúncio de outra faixa → CONFLICT
    wrong = evaluate_identity(ident, MerchantCandidate.build(
        merchant="shopee", title="Revolution Antipulgas Cães 10,1kg a 20kg Pipeta"))
    assert wrong.decision == IdentityDecision.CONFLICT

    # anúncio sem faixa no título → UNKNOWN, nunca CONFLICT
    vague = evaluate_identity(ident, MerchantCandidate.build(
        merchant="shopee", title="Revolution Antipulgas para Cães Pipeta Original"))
    assert vague.decision != IdentityDecision.CONFLICT


def test_enrichment_never_touches_marketplace_offer_or_price():
    from src.affiliate_links import MarketplaceOffer

    g = "7891234000099"
    _feed(g, "Ração Golden Cães Adultos 15kg", brand="Golden", category="Cachorro")
    db = SessionLocal()
    try:
        p0 = ProductCatalog(barcode=g, barcode_normalized=g, name="Ração Golden")
        db.add(p0)
        db.commit()
        db.refresh(p0)
        db.add(MarketplaceOffer(
            product_id=p0.id, merchant="shopee", external_listing_id="keep-me",
            affiliate_url="https://s.shopee.com.br/x", price=199.0, is_available=True, active=True,
        ))
        db.commit()
    finally:
        db.close()
    _merge(g)
    db = SessionLocal()
    try:
        offer = db.scalar(select(MarketplaceOffer).where(MarketplaceOffer.external_listing_id == "keep-me"))
        assert offer is not None and offer.price == 199.0 and offer.active is True
    finally:
        db.close()

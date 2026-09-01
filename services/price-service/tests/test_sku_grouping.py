"""
Agrupamento de SKU cross-GTIN — determinístico, nunca por nome, qualquer
CONFLICT estrutural veta, dado faltando não agrupa, admin manda.
"""
import json

import pytest
from sqlalchemy import select

from src.affiliate_feed import AffiliateFeedOffer
from src.catalog_enrichment import merge_product_catalog_identity
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog, SkuGroupMember
from src import sku_grouping as sg


def _feed(gtin, title, *, merchant="cobasi", brand="Marca", category="Cachorro", mpn=None):
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin", merchant=merchant, advertiser_id="1",
            external_product_id=f"{merchant}-{gtin}-{abs(hash(title)) % 9999}",
            gtin=gtin, title=title, brand=brand, category=category, mpn=mpn,
            price=100.0, active=True, in_stock=True,
        ))
        db.commit()
    finally:
        db.close()


def _enrich(*gtins):
    db = SessionLocal()
    try:
        for g in gtins:
            merge_product_catalog_identity(db, g)
        db.commit()
    finally:
        db.close()


def _rebuild(gtin):
    db = SessionLocal()
    try:
        r = sg.rebuild_groups_for_gtin(db, gtin)
        db.commit()
        return r
    finally:
        db.close()


def _members(gtin):
    db = SessionLocal()
    try:
        return [m.member_gtin for m in sg.resolve_sku_group_members(db, gtin)]
    finally:
        db.close()


def test_scalibor_m_groups_with_48cm_sibling():
    _feed("7896185907004", "Coleira Antiparasitária Scalibor M", merchant="zeenow", brand="MSD")
    _feed("7896185957009", "Coleira Antiparasitária Scalibor Cães Pequenos e Médios - 48 cm", brand="Scalibor")
    _enrich("7896185907004", "7896185957009")
    r = _rebuild("7896185907004")
    assert r.group_key is not None
    assert set(r.members) == {"7896185907004", "7896185957009"}
    assert r.basis == "STRUCTURED_IDENTICAL"
    assert _members("7896185907004") == ["7896185957009"]


def test_48cm_and_65cm_never_group():
    _feed("7896185907004", "Coleira Antiparasitária Scalibor M", merchant="zeenow", brand="MSD")
    _feed("7896185907011", "Coleira Antiparasitária Scalibor Cães Grandes - 65 cm", brand="Scalibor")
    _enrich("7896185907004", "7896185907011")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "7896185907004", "7896185907011")
        assert d.grouped is False
        assert d.reason == "LENGTH_CM_CONFLICT"
    finally:
        db.close()


def test_nexgard_weight_bands_never_group_even_with_same_pack():
    _feed("7898053774343", "NexGard Cães 4,1 a 10kg 1 comprimido", merchant="zeenow", brand="Boehringer Ingelheim")
    _feed("7898053774435", "NexGard Cães 10,1 a 25kg 1 comprimido", merchant="zeenow", brand="Boehringer Ingelheim")
    _enrich("7898053774343", "7898053774435")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "7898053774343", "7898053774435")
        assert d.grouped is False
    finally:
        db.close()


def test_different_species_same_brand_never_group():
    _feed("7891000000101", "Ração Marca Gatos Adultos 3kg", brand="Marca", category="Gatos")
    _feed("7891000000102", "Ração Marca Cães Adultos 3kg", brand="Marca", category="Cachorro")
    _enrich("7891000000101", "7891000000102")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "7891000000101", "7891000000102")
        assert d.grouped is False
    finally:
        db.close()


def test_shared_mpn_groups_at_high_confidence():
    _feed("7890000000501", "Ração Golden Special Cães 15kg", brand="Golden", mpn="GLD-SP-15")
    _feed("7890000000502", "Golden Special para Cães Adultos 15kg", brand="Golden", mpn="gld-sp-15")
    _enrich("7890000000501", "7890000000502")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "7890000000501", "7890000000502")
        assert d.grouped is True
        assert d.basis == "SHARED_MPN"
        assert d.confidence == pytest.approx(0.95)
    finally:
        db.close()


def test_similar_name_without_structural_proof_does_not_group():
    _feed("7893000000011", "Coleira Passeio Premium Azul Cães", brand="AcmeColeiras")
    _feed("7893000000012", "Coleira Passeio Premium Vermelha Cães", brand="AcmeColeiras")
    _enrich("7893000000011", "7893000000012")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "7893000000011", "7893000000012")
        assert d.grouped is False
    finally:
        db.close()


def test_admin_confirm_overrides_and_survives_rebuild():
    _feed("7894000000021", "Vermífugo Marca Cães 4 comp", brand="Marca")
    _feed("7894000000022", "Vermífugo Marca Cães Sabor Carne 4 comprimidos", brand="Marca")
    _enrich("7894000000021", "7894000000022")
    db = SessionLocal()
    try:
        key = sg.confirm_membership(db, "7894000000021", "7894000000022", "tester")
        db.commit()
    finally:
        db.close()
    assert _members("7894000000021") == ["7894000000022"]
    _rebuild("7894000000021")
    _rebuild("7894000000021")
    db = SessionLocal()
    try:
        rows = db.scalars(select(SkuGroupMember).where(SkuGroupMember.member_gtin == "7894000000021")).all()
        assert any(r.confirmed_by == "tester" and r.status == "active" for r in rows)
    finally:
        db.close()


def test_admin_reject_blocks_a_pair_the_ladder_would_group():
    _feed("7895000000031", "Coleira Antiparasitária Scalibor M", merchant="zeenow", brand="MSD")
    _feed("7895000000032", "Coleira Antiparasitária Scalibor Cães Pequenos e Médios - 48 cm", brand="Scalibor")
    _enrich("7895000000031", "7895000000032")
    db = SessionLocal()
    try:
        sg.reject_pair(db, "7895000000031", "7895000000032", "tester")
        db.commit()
        d = sg.evaluate_pair(db, "7895000000031", "7895000000032")
        assert d.grouped is False
        assert d.reason == "admin_rejected"
    finally:
        db.close()
    assert _members("7895000000031") == []


def test_rebuild_is_idempotent():
    _feed("7896000000041", "Coleira Antiparasitária Scalibor M", merchant="zeenow", brand="MSD")
    _feed("7896000000042", "Coleira Antiparasitária Scalibor Cães Pequenos e Médios - 48 cm", brand="Scalibor")
    _enrich("7896000000041", "7896000000042")
    r1 = _rebuild("7896000000041")
    r2 = _rebuild("7896000000041")
    assert r1.group_key == r2.group_key
    assert r2.changed is False


def test_ungroupable_gtin_stays_ungrouped():
    _feed("7899000000091", "Produto Solitário Marca Única 2kg", brand="MarcaÚnica")
    _enrich("7899000000091")
    r = _rebuild("7899000000091")
    assert r.group_key is None
    assert _members("7899000000091") == []


def test_same_brand_different_product_type_never_group():
    # "Ração Alcon Peixes" vs "Ração Alcon Roedores" — mesma marca, pesos
    # minúsculos parecidos, mas produtos diferentes.
    _feed("7896108000001", "Ração para Peixes Carnívoros Alcon 90g", brand="Alcon", category="Peixe")
    _feed("7896108000002", "Ração Frutas e Legumes para Roedores e Coelhos Alcon 75g", brand="Alcon", category="Roedor")
    _enrich("7896108000001", "7896108000002")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "7896108000001", "7896108000002")
        assert d.grouped is False
    finally:
        db.close()


def test_hills_urinary_vs_renal_same_weight_never_group():
    _feed("0052742001111", "Ração Hills Prescription Diet c/d Multicare Feline Urinary 1,8kg",
          brand="Hills", category="Gatos")
    _feed("0052742002222", "Ração Hills Prescription Diet k/d Feline Renal 1,8kg",
          brand="Hills", category="Gatos")
    _enrich("0052742001111", "0052742002222")
    db = SessionLocal()
    try:
        d = sg.evaluate_pair(db, "0052742001111", "0052742002222")
        assert d.grouped is False
    finally:
        db.close()


def test_clique_no_transitive_closure():
    # A(porte NULO) casa com B(small) e com C(large); B e C conflitam →
    # grupo não pode conter B e C juntos.
    _feed("7897777770001", "Biscoito Marca Multi para Cães Adultos 500g", brand="MarcaBisc")
    _feed("7897777770002", "Biscoito Marca para Cães Raças Pequenas 500g", brand="MarcaBisc")
    _feed("7897777770003", "Biscoito Marca Maxi para Cães Grandes 500g", brand="MarcaBisc")
    _enrich("7897777770001", "7897777770002", "7897777770003")
    r = _rebuild("7897777770001")
    members = set(r.members or [])
    # nunca B e C no mesmo grupo
    assert not ({"7897777770002", "7897777770003"} <= members)

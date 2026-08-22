"""
AffiliateFeedOffer — modelo de oferta de feed de afiliados (Awin, futuras
redes). Nada real popula esta tabela ainda; estes testes cobrem só o
schema/constraints em si (ver docs/AFFILIATES.md).
"""
import pytest
from sqlalchemy.exc import IntegrityError

from src.affiliate_feed import AffiliateFeedOffer
from src.db import SessionLocal


def _offer(**overrides) -> AffiliateFeedOffer:
    defaults = dict(
        network="awin",
        merchant="cobasi",
        advertiser_id="17870",
        external_product_id="12345",
        gtin="7891234567895",
        title="Produto Teste",
        price=100.0,
        active=True,
    )
    defaults.update(overrides)
    return AffiliateFeedOffer(**defaults)


def test_same_gtin_allowed_across_different_merchants():
    """Um GTIN pode ter ofertas concorrentes em vários merchants — não é
    identidade de produto, é oferta comercial (ver affiliate_feed.py)."""
    db = SessionLocal()
    try:
        db.add(_offer(merchant="cobasi", advertiser_id="17870", external_product_id="1"))
        db.add(_offer(merchant="zeenow", advertiser_id="127557", external_product_id="2"))
        db.commit()

        rows = db.query(AffiliateFeedOffer).filter_by(gtin="7891234567895").all()
        assert len(rows) == 2
        assert {r.merchant for r in rows} == {"cobasi", "zeenow"}
    finally:
        db.close()


def test_dedupe_constraint_on_network_advertiser_external_id():
    """(network, advertiser_id, external_product_id) é a chave de upsert —
    duplicar isso deve falhar (constraint), não silenciosamente duplicar."""
    db = SessionLocal()
    try:
        db.add(_offer(external_product_id="dup-1"))
        db.commit()

        db.add(_offer(external_product_id="dup-1"))
        with pytest.raises(IntegrityError):
            db.commit()
    finally:
        db.rollback()
        db.close()


def test_same_external_id_allowed_across_different_advertisers():
    """IDs externos não são globalmente únicos — só dentro de
    (network, advertiser_id) — merchants diferentes podem coincidir em ID."""
    db = SessionLocal()
    try:
        db.add(_offer(merchant="cobasi", advertiser_id="17870", external_product_id="999"))
        db.add(_offer(merchant="zeedog", advertiser_id="127555", external_product_id="999"))
        db.commit()

        rows = db.query(AffiliateFeedOffer).filter_by(external_product_id="999").all()
        assert len(rows) == 2
    finally:
        db.close()

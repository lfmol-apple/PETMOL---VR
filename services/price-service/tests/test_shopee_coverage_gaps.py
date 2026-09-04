"""Relatório 'Cobasi sem Shopee' + tela admin de normalização."""
import pytest

from src.admin.deps import get_current_admin
from src.affiliate_feed import AffiliateFeedOffer
from src.affiliate_links import MarketplaceOffer
from src.db import SessionLocal
from src.main import app
from src.product_catalog_lookup import ProductCatalog
from src.shopee_coverage_gaps import ShopeeCoverageGap, rebuild_shopee_coverage_gaps


@pytest.fixture(autouse=True)
def _admin_auth():
    app.dependency_overrides[get_current_admin] = lambda: ("u", "a")
    yield
    app.dependency_overrides.pop(get_current_admin, None)


def _cobasi_feed(db, gtin, title="Ração Teste 15kg", price=100.0):
    db.add(AffiliateFeedOffer(
        network="awin", merchant="cobasi", advertiser_id="17870",
        external_product_id=f"c-{gtin}", gtin=gtin, title=title, brand="Marca",
        price=price, active=True, in_stock=True,
    ))


def test_rebuild_classifica_e_lista():
    db = SessionLocal()
    try:
        # A: Cobasi sim, Shopee validada sim → NÃO é gap
        pa = ProductCatalog(barcode="7890000000017", barcode_normalized="7890000000017", name="Com Shopee", category="food")
        # B: Cobasi sim, sem Shopee, nunca buscado → gap never_searched
        pb = ProductCatalog(barcode="7890000000024", barcode_normalized="7890000000024", name="Sem Shopee", category="food")
        db.add_all([pa, pb]); db.commit(); db.refresh(pa); db.refresh(pb)
        _cobasi_feed(db, "7890000000017")
        _cobasi_feed(db, "7890000000024", title="Antipulgas X", price=80.0)
        db.add(MarketplaceOffer(product_id=pa.id, merchant="shopee", affiliate_url="https://s.shopee.com.br/x",
                                active=True, match_decision="HIGH_CONFIDENCE", merchant_title="Com Shopee"))
        db.commit()

        summary = rebuild_shopee_coverage_gaps(db)
        assert summary["total_open"] == 1

        gaps = list(db.query(ShopeeCoverageGap).all())
        assert len(gaps) == 1
        g = gaps[0]
        assert g.gtin == "7890000000024"
        assert g.reason == "never_searched"
        assert g.cobasi_price == 80.0
        assert g.status == "open"
    finally:
        db.close()


def test_rebuild_resolve_automatico_quando_ganha_shopee():
    db = SessionLocal()
    try:
        p = ProductCatalog(barcode="7890000000031", barcode_normalized="7890000000031", name="P", category="food")
        db.add(p); db.commit(); db.refresh(p)
        _cobasi_feed(db, "7890000000031")
        db.commit()
        rebuild_shopee_coverage_gaps(db)
        assert db.query(ShopeeCoverageGap).filter_by(gtin="7890000000031", status="open").count() == 1

        # agora ganha Shopee validada
        db.add(MarketplaceOffer(product_id=p.id, merchant="shopee", affiliate_url="https://s.shopee.com.br/y",
                                active=True, match_decision="EXACT", merchant_title="P"))
        db.commit()
        rebuild_shopee_coverage_gaps(db)
        g = db.query(ShopeeCoverageGap).filter_by(gtin="7890000000031").one()
        assert g.status == "resolved"
    finally:
        db.close()


def test_admin_lista_e_marca_cobasi_only(client):
    db = SessionLocal()
    try:
        p = ProductCatalog(barcode="7890000000048", barcode_normalized="7890000000048", name="Biscrok", category="food")
        db.add(p); db.commit()
        _cobasi_feed(db, "7890000000048", title="Biscrok 500g")
        db.commit()
        rebuild_shopee_coverage_gaps(db)
    finally:
        db.close()

    r = client.get("/v1/admin/shopee-coverage?status=open")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    gid = body["items"][0]["id"]

    r2 = client.post(f"/v1/admin/shopee-coverage/{gid}/resolve", json={"action": "cobasi_only"})
    assert r2.status_code == 200
    assert r2.json()["status"] == "cobasi_only"

    # some da lista 'open'
    assert client.get("/v1/admin/shopee-coverage?status=open").json()["total"] == 0
    # e o rebuild não reabre
    db = SessionLocal()
    try:
        rebuild_shopee_coverage_gaps(db)
        assert db.query(ShopeeCoverageGap).filter_by(gtin="7890000000048").one().status == "cobasi_only"
    finally:
        db.close()


def test_admin_register_offer_resolve(client):
    db = SessionLocal()
    try:
        p = ProductCatalog(barcode="7890000000055", barcode_normalized="7890000000055", name="Ração Y 10kg", category="food")
        db.add(p); db.commit()
        _cobasi_feed(db, "7890000000055")
        db.commit()
        rebuild_shopee_coverage_gaps(db)
    finally:
        db.close()

    gid = client.get("/v1/admin/shopee-coverage?status=open").json()["items"][0]["id"]
    r = client.post(f"/v1/admin/shopee-coverage/{gid}/resolve", json={
        "action": "register_offer", "affiliate_url": "https://s.shopee.com.br/ABC123", "price": 99.9,
    })
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"

    db = SessionLocal()
    try:
        off = db.query(MarketplaceOffer).filter_by(product_id=db.query(ProductCatalog).filter_by(barcode_normalized="7890000000055").one().id).one()
        assert off.affiliate_url == "https://s.shopee.com.br/ABC123"
        assert off.match_decision == "HIGH_CONFIDENCE"
    finally:
        db.close()


def test_admin_register_offer_rejeita_link_invalido(client):
    db = SessionLocal()
    try:
        p = ProductCatalog(barcode="7890000000062", barcode_normalized="7890000000062", name="Z", category="food")
        db.add(p); db.commit()
        _cobasi_feed(db, "7890000000062")
        db.commit()
        rebuild_shopee_coverage_gaps(db)
    finally:
        db.close()
    gid = client.get("/v1/admin/shopee-coverage?status=open").json()["items"][0]["id"]
    r = client.post(f"/v1/admin/shopee-coverage/{gid}/resolve", json={
        "action": "register_offer", "affiliate_url": "https://golpe.com/xyz",
    })
    assert r.status_code == 400


def test_admin_bulk_cobasi_only(client):
    db = SessionLocal()
    try:
        for n in range(70, 74):
            g = f"789000000{n}00"
            p = ProductCatalog(barcode=g, barcode_normalized=g, name=f"P{n}", category="food")
            db.add(p); db.commit()
            _cobasi_feed(db, g)
        db.commit()
        rebuild_shopee_coverage_gaps(db)
    finally:
        db.close()

    ids = [it["id"] for it in client.get("/v1/admin/shopee-coverage?status=open&limit=500").json()["items"]]
    assert len(ids) >= 4
    r = client.post("/v1/admin/shopee-coverage/bulk", json={"action": "cobasi_only", "ids": ids})
    assert r.status_code == 200
    assert r.json()["done"] == len(ids)
    assert client.get("/v1/admin/shopee-coverage?status=open").json()["total"] == 0

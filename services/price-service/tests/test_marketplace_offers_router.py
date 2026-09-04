"""
Admin CRUD de MarketplaceOffer (/v1/admin/marketplace-offers) — nunca
aceita link que não seja https + domínio oficial do merchant (ver
shopee_link_validator.py); nunca reescreve a URL aceita.
"""
import pytest

from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.config import get_settings
from src.db import SessionLocal
from src.main import app
from src.product_catalog_lookup import ProductCatalog

GTIN = "7891234567890"
# Link longo com o rastreio da conta (não link.curto): validate_manual_
# shopee_affiliate_url passa sem precisar resolver redirect de verdade
# (ver shopee_link_validator.py — link curto exige rede de verdade).
OFFICIAL_URL = "https://shopee.com.br/produto-i.1.2?utm_source=an_18392191175"


@pytest.fixture(autouse=True)
def _admin_auth_override(monkeypatch):
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_ID", "18392191175")
    get_settings.cache_clear()
    app.dependency_overrides[get_current_admin] = lambda: ("fake-user", "fake-admin")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("fake-user", "fake-admin")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)
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


def test_create_official_shopee_link(client):
    _register_product()
    r = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": OFFICIAL_URL, "price": 59.9,
    })
    assert r.status_code == 201
    data = r.json()["data"]
    assert data["affiliate_url"] == OFFICIAL_URL  # nunca modificada
    assert data["merchant"] == "shopee"
    assert data["gtin"] == GTIN


def test_create_rejects_non_official_shopee_domain(client):
    _register_product()
    r = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": "https://golpeshopee.com.br/produto",
    })
    assert r.status_code == 400


def test_create_rejects_http(client):
    _register_product()
    r = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": "http://s.shopee.com.br/abc",
    })
    assert r.status_code == 400


def test_create_rejects_merchant_without_validator(client):
    """Merchant marketplace sem allowlist própria (ex: mercadolivre, ainda
    não implementado) é rejeitado explicitamente — nunca aceita "qualquer
    https://" por falta de checagem específica."""
    _register_product()
    r = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "mercadolivre", "affiliate_url": "https://mercadolivre.com.br/produto",
    })
    assert r.status_code == 400


def test_create_requires_product_already_in_catalog(client):
    r = client.post("/v1/admin/marketplace-offers", json={
        "gtin": "0000000000000", "merchant": "shopee", "affiliate_url": OFFICIAL_URL,
    })
    assert r.status_code == 404


def test_update_rejects_invalid_url_and_keeps_original(client):
    _register_product()
    created = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": OFFICIAL_URL,
    }).json()["data"]

    patch = client.patch(f"/v1/admin/marketplace-offers/{created['id']}", json={
        "affiliate_url": "https://golpeshopee.com.br/produto",
    })
    assert patch.status_code == 400

    unchanged = client.get("/v1/admin/marketplace-offers", params={"gtin": GTIN}).json()["data"]
    assert unchanged[0]["affiliate_url"] == OFFICIAL_URL


def test_deactivate_via_patch(client):
    _register_product()
    created = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": OFFICIAL_URL,
    }).json()["data"]

    patch = client.patch(f"/v1/admin/marketplace-offers/{created['id']}", json={"active": False})
    assert patch.status_code == 200
    assert patch.json()["data"]["active"] is False


def test_delete_offer(client):
    _register_product()
    created = client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": OFFICIAL_URL,
    }).json()["data"]

    delete = client.delete(f"/v1/admin/marketplace-offers/{created['id']}")
    assert delete.status_code == 200

    listed = client.get("/v1/admin/marketplace-offers", params={"gtin": GTIN}).json()["data"]
    assert listed == []


def test_list_filters_by_gtin_and_merchant(client):
    _register_product()
    client.post("/v1/admin/marketplace-offers", json={
        "gtin": GTIN, "merchant": "shopee", "affiliate_url": OFFICIAL_URL,
    })
    r = client.get("/v1/admin/marketplace-offers", params={"gtin": GTIN, "merchant": "shopee"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["gtin"] == GTIN

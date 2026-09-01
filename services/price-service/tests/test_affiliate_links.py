"""
Infra comercial/afiliados — ver docs/AFFILIATES.md.

Cobre a regra central: uma loja/oferta só é apresentada quando existe
caminho monetizável real; nunca cai para link comum sem comissão em
produção. `fetch_cobasi_price` é sempre monkeypatchado — estes testes
nunca devem depender da API externa da Cobasi estar no ar.
"""
import pytest

from src.affiliate_links import MarketplaceOffer, ProductAffiliateLink, STOREFRONT_AFFILIATE_URLS, get_monetized_offer
from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.commerce_pricing import ProductPriceResult
from src.config import get_settings
from src.db import SessionLocal
from src.main import app
from src.product_catalog_lookup import ProductCatalog


GTIN = "7891234567895"
COBASI_STOREFRONT_URL = "https://minhaloja.cobasi.com.br?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol"


@pytest.fixture(autouse=True)
def _admin_auth_override():
    app.dependency_overrides[get_current_admin] = lambda: ("fake-user", "fake-admin")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("fake-user", "fake-admin")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


@pytest.fixture(autouse=True)
def _force_env(monkeypatch):
    """Garante ENV=dev por padrão; testes de prod chamam _force_prod().
    COBASI_AFFILIATE_MODE=cached é explícito aqui porque o padrão real de
    produção desde 15/08/2026 é "disabled" (MAIS desativado, decisão de
    produto — ver config.py) — este arquivo testa especificamente a
    lógica de resolução da Cobasi via MAIS, então precisa do modo ligado
    independente de qual é o padrão vigente."""
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    # Explícito porque este arquivo testa a resolução de MarketplaceOffer
    # da Shopee — não depende de qual é o default vigente de
    # shopee_affiliate_enabled (já foi False no lançamento, voltou a True).
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "true")
    monkeypatch.delenv("AFFILIATE_ONLY_COMMERCE", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _force_prod(monkeypatch):
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "true")
    get_settings.cache_clear()


def _register_product(gtin: str = GTIN, name: str = "Royal Canin Urinary S/O 7,5kg", brand: str = "Royal Canin") -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name=name, brand=brand)
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


# ── Teste 5: storefront geral nunca é modificada ───────────────────────────

def test_cobasi_storefront_url_is_exact_and_unmodified():
    assert STOREFRONT_AFFILIATE_URLS["cobasi"] == COBASI_STOREFRONT_URL
    assert "?q=" not in STOREFRONT_AFFILIATE_URLS["cobasi"]


# ── Teste 2/8: área geral "Lojas" — só quem tem storefront aparece ─────────

def test_monetized_offer_store_context_cobasi_has_storefront(client):
    r = client.get("/commerce/monetized-offer", params={"merchant": "cobasi", "context": "store"})
    assert r.status_code == 200
    offer = r.json()["offer"]
    assert offer is not None
    assert offer["url"] == COBASI_STOREFRONT_URL
    assert offer["link_type"] == "affiliate_store"


def test_monetized_offer_store_context_petz_blocked_without_commercial_proof(client):
    """Diferente da Cobasi (acima): Petz tem um gate próprio adicional
    (petz_provider.is_petz_publicly_servable) porque a atribuição por
    cupom PETTMOL ainda não foi validada com uma compra real — ver
    docs/PETZ_COMMISSION_VALIDATION.md e tests/test_petz_integration.py
    pros testes completos do gate (desligado/parcial/ligado)."""
    r = client.get("/commerce/monetized-offer", params={"merchant": "petz", "context": "store"})
    assert r.status_code == 200
    assert r.json()["offer"] is None


# ── Teste 3/4: recompra de produto específico exige deep link daquele produto ──

def test_monetized_offer_product_context_without_link_is_none(client):
    _register_product()
    r = client.get("/commerce/monetized-offer", params={"merchant": "cobasi", "context": "product", "gtin": GTIN})
    assert r.status_code == 200
    assert r.json()["offer"] is None


def test_monetized_offer_product_context_with_link_returns_exact_url(client):
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id,
            merchant="cobasi",
            affiliate_product_url="https://minhaloja.cobasi.com.br/produto-x?tracking=abc123",
            active=True,
        ))
        db.commit()
    finally:
        db.close()

    r = client.get("/commerce/monetized-offer", params={"merchant": "cobasi", "context": "product", "gtin": GTIN})
    assert r.status_code == 200
    offer = r.json()["offer"]
    assert offer["url"] == "https://minhaloja.cobasi.com.br/produto-x?tracking=abc123"
    assert offer["link_type"] == "affiliate_product"


def test_monetized_offer_product_context_never_falls_back_to_storefront(client):
    """§7: recompra sem deep link não deve abrir a vitrine genérica."""
    _register_product()
    r = client.get("/commerce/monetized-offer", params={"merchant": "cobasi", "context": "product", "gtin": GTIN})
    offer = r.json()["offer"]
    assert offer is None
    assert offer != STOREFRONT_AFFILIATE_URLS["cobasi"]


# ── Teste 13: GTIN diferente não reaproveita o link de outro produto ──────

def test_different_gtin_does_not_reuse_link():
    product_id = _register_product(gtin=GTIN)
    other_id = _register_product(gtin="9999999999999", name="Royal Canin Urinary S/O 2,5kg")
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://minhaloja.cobasi.com.br/produto-75kg", active=True))
        db.commit()

        from src.affiliate_links import get_active_link
        assert get_active_link(db, other_id, "cobasi") is None
        assert get_active_link(db, product_id, "cobasi") is not None
    finally:
        db.close()


# ── /commerce/product-offer: casa preço Cobasi (por EAN) + link cadastrado ─

def _fake_price(ean: str | None, price: float = 16.9, url: str = "https://www.cobasi.com.br/produto-x/p") -> ProductPriceResult:
    return ProductPriceResult(found=True, store="cobasi", product_name="Produto Teste", brand="Royal Canin", price=price, list_price=None, is_available=True, url=url, ean=ean)


def test_product_offer_dev_fallback_when_no_link_registered(client, monkeypatch):
    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=None)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    r = client.get("/commerce/product-offer", params={"q": "royal canin urinary"})
    assert r.status_code == 200
    data = r.json()
    assert data["found"] is True
    assert data["link_type"] == "direct"  # dev-only fallback


def test_product_offer_prod_hides_when_no_link_registered(client, monkeypatch):
    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=None)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    _force_prod(monkeypatch)

    r = client.get("/commerce/product-offer", params={"q": "royal canin urinary"})
    assert r.status_code == 200
    assert r.json()["found"] is False


def test_product_offer_prefers_registered_affiliate_link_over_raw_url(client, monkeypatch):
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://minhaloja.cobasi.com.br/deep-link-teste", active=True))
        db.commit()
    finally:
        db.close()

    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=GTIN)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    r = client.get("/commerce/product-offer", params={"q": "royal canin urinary"})
    data = r.json()
    assert data["found"] is True
    assert data["url"] == "https://minhaloja.cobasi.com.br/deep-link-teste"
    assert data["link_type"] == "affiliate_product"


def test_registered_bare_cobasi_link_is_routed_through_minha_loja(client, monkeypatch):
    """Link cadastrado apontando pro site principal da Cobasi é servido
    reescrito pra vitrine "Minha Loja" + UTM MAIS."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="cobasi",
            affiliate_product_url="https://www.cobasi.com.br/racao-x-3827380/p", active=True,
        ))
        db.commit()
    finally:
        db.close()

    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=GTIN)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    r = client.get("/commerce/product-offer", params={"q": "royal canin urinary"})
    data = r.json()
    assert data["found"] is True
    assert data["url"].startswith("https://minhaloja.cobasi.com.br/racao-x-3827380/p")
    assert "utm_source=mais" in data["url"]
    assert data["link_type"] == "affiliate_product"


def test_registered_mais_shortlink_is_left_untouched(client, monkeypatch):
    """Shortlink MAIS (mais.app/...) já passa pela atribuição — não é mexido."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="cobasi",
            affiliate_product_url="https://mais.app/IvUCAG", active=True,
        ))
        db.commit()
    finally:
        db.close()

    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=GTIN)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    r = client.get("/commerce/product-offer", params={"q": "royal canin urinary"})
    assert r.json()["url"] == "https://mais.app/IvUCAG"


def test_product_offer_prod_with_registered_link_still_works(client, monkeypatch):
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://minhaloja.cobasi.com.br/deep-link-teste", active=True))
        db.commit()
    finally:
        db.close()

    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=GTIN)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)
    _force_prod(monkeypatch)

    r = client.get("/commerce/product-offer", params={"q": "royal canin urinary"})
    data = r.json()
    assert data["found"] is True
    assert data["link_type"] == "affiliate_product"


# ── Teste 14: desativar um link — oferta some sem deploy de frontend ──────

def test_deactivating_link_hides_offer_immediately(client, monkeypatch):
    product_id = _register_product()
    db = SessionLocal()
    try:
        link = ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://minhaloja.cobasi.com.br/deep-link-teste", active=True)
        db.add(link)
        db.commit()
        db.refresh(link)
        link_id = link.id
    finally:
        db.close()

    async def fake_fetch(query: str, target_weight_kg=None) -> ProductPriceResult:
        return _fake_price(ean=GTIN)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price", fake_fetch)

    before = client.get("/commerce/product-offer", params={"q": "royal canin urinary"}).json()
    assert before["found"] is True
    assert before["link_type"] == "affiliate_product"

    patch = client.patch(f"/v1/admin/affiliate-links/{link_id}", json={"active": False})
    assert patch.status_code == 200

    _force_prod(monkeypatch)
    after = client.get("/commerce/product-offer", params={"q": "royal canin urinary"}).json()
    assert after["found"] is False


# ── Admin CRUD — validação de URL (Teste 12) ───────────────────────────────

def test_admin_create_rejects_non_https_url(client):
    _register_product()
    r = client.post("/v1/admin/affiliate-links", json={
        "gtin": GTIN, "merchant": "cobasi", "affiliate_product_url": "http://minhaloja.cobasi.com.br/x",
    })
    assert r.status_code == 400


def test_admin_create_rejects_javascript_scheme(client):
    _register_product()
    r = client.post("/v1/admin/affiliate-links", json={
        "gtin": GTIN, "merchant": "cobasi", "affiliate_product_url": "javascript:alert(1)",
    })
    assert r.status_code == 400


def test_admin_create_requires_product_already_in_catalog(client):
    r = client.post("/v1/admin/affiliate-links", json={
        "gtin": "0000000000000", "merchant": "cobasi", "affiliate_product_url": "https://minhaloja.cobasi.com.br/x",
    })
    assert r.status_code == 404


def test_admin_create_duplicate_product_merchant_conflicts(client):
    _register_product()
    payload = {"gtin": GTIN, "merchant": "cobasi", "affiliate_product_url": "https://minhaloja.cobasi.com.br/x"}
    first = client.post("/v1/admin/affiliate-links", json=payload)
    assert first.status_code == 201
    second = client.post("/v1/admin/affiliate-links", json=payload)
    assert second.status_code == 409


def test_admin_list_filters_by_gtin_and_merchant(client):
    _register_product()
    client.post("/v1/admin/affiliate-links", json={
        "gtin": GTIN, "merchant": "cobasi", "affiliate_product_url": "https://minhaloja.cobasi.com.br/x",
    })
    r = client.get("/v1/admin/affiliate-links", params={"gtin": GTIN, "merchant": "cobasi"})
    assert r.status_code == 200
    data = r.json()["data"]
    assert len(data) == 1
    assert data[0]["gtin"] == GTIN


# ── Marketplace (Shopee/ML) — arquitetura pronta, nada integrado ainda ────
# PRODUCT != MARKETPLACE OFFER: uma oferta de marketplace pode expirar sem
# afetar o produto PETMOL (§8 do complemento). Sem crawler/job aqui — só a
# resolução determinística sobre linhas inseridas manualmente no teste.

def test_marketplace_offer_with_no_listing_is_none():
    """Nenhum merchant popula marketplace_offers ainda — equivalente a
    'marketplace pending/pendente' na prática: sem oferta, não aparece."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        assert get_monetized_offer(db, merchant="shopee", context="marketplace", product_id=product_id) is None
    finally:
        db.close()


def test_marketplace_offer_active_listing_appears():
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=product_id,
            merchant="shopee",
            external_listing_id="shopee-listing-123",
            seller_name="Loja Exemplo",
            affiliate_url="https://s.shopee.com.br/exemplo-afiliado",
            price=89.9,
            is_available=True,
            active=True,
        ))
        db.commit()

        offer = get_monetized_offer(db, merchant="shopee", context="marketplace", product_id=product_id)
        assert offer is not None
        assert offer["url"] == "https://s.shopee.com.br/exemplo-afiliado"
        assert offer["link_type"] == "affiliate_marketplace_offer"
    finally:
        db.close()


def test_marketplace_offer_inactive_listing_does_not_appear():
    """Oferta expirada/fora de estoque (active=False) — não deve aparecer."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(
            product_id=product_id,
            merchant="shopee",
            affiliate_url="https://s.shopee.com.br/exemplo-expirado",
            active=False,
        ))
        db.commit()

        offer = get_monetized_offer(db, merchant="shopee", context="marketplace", product_id=product_id)
        assert offer is None
    finally:
        db.close()


def test_product_survives_marketplace_offer_deactivation():
    """Desativar a oferta nunca apaga/altera o produto PETMOL (GTIN/catálogo)."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        offer = MarketplaceOffer(product_id=product_id, merchant="shopee", affiliate_url="https://s.shopee.com.br/x", active=True)
        db.add(offer)
        db.commit()
        db.refresh(offer)

        offer.active = False
        db.commit()

        product = db.get(ProductCatalog, product_id)
        assert product is not None
        assert product.barcode_normalized == GTIN
    finally:
        db.close()


def test_marketplace_context_via_http_endpoint(client):
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(MarketplaceOffer(product_id=product_id, merchant="shopee", affiliate_url="https://s.shopee.com.br/http-test", active=True))
        db.commit()
    finally:
        db.close()

    r = client.get("/commerce/monetized-offer", params={"merchant": "shopee", "context": "marketplace", "gtin": GTIN})
    assert r.status_code == 200
    offer = r.json()["offer"]
    assert offer["url"] == "https://s.shopee.com.br/http-test"
    assert offer["link_type"] == "affiliate_marketplace_offer"


# ── /commerce/offers e /commerce/product-offer aceitam gtin opcional ──────
# (preparação para providers estruturados como AwinFeedProvider — ver
# awin_feed_provider.py; não quebra o contrato query-only existente)

def test_offers_endpoint_requires_q_or_gtin(client):
    r = client.get("/commerce/offers")
    assert r.status_code == 400


def test_product_offer_endpoint_requires_q_or_gtin(client):
    r = client.get("/commerce/product-offer")
    assert r.status_code == 400


def test_offers_endpoint_accepts_gtin_only_without_query(client):
    """Sem provider estruturado registrado ainda, gtin sozinho retorna
    lista vazia (não erro) — Cobasi/VTEX exige texto, não GTIN."""
    r = client.get("/commerce/offers", params={"gtin": GTIN})
    assert r.status_code == 200
    assert r.json()["offers"] == []


def test_offers_endpoint_still_works_with_query_only(client):
    """Compatibilidade: nenhum caller existente que só manda `q` quebra."""
    r = client.get("/commerce/offers", params={"q": "produto que não existe xyz123"})
    assert r.status_code == 200
    assert "offers" in r.json()

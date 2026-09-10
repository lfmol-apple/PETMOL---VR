"""
Petz — aprendizado por produto (petz_mapping.py/petz_provider.py/
petz_link_validator.py). Testes proporcionais (ver spec de
implementação seção 24): validação de URL, mapping por GTIN, variante
correta, ambiguous/affiliate_pending nunca publicam, affiliate_ready
publica, direct_url nunca vira afiliada sozinha, CommerceEngine não
quebra. Nenhum teste faz scraping/chamada de rede à Petz.
"""
from __future__ import annotations

import pytest

from src.admin.deps import get_current_admin
from src.affiliate_links import (
    PETZ_AFFILIATE_PROGRAM,
    PETZ_COUPON_CODE,
    PETZ_PARTNER_STORE_URL,
    PETZ_SITE_SEARCH_BASE,
    ProductAffiliateLink,
    get_active_link,
)
from src.commerce_offers import get_commerce_offers
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.main import app
from src.petz_link_validator import InvalidPetzAffiliateUrlError, validate_petz_affiliate_url, validate_petz_product_url
from src.petz_mapping import (
    PetzVariantConflictError,
    build_petz_search_query,
    coverage_stats,
    confirm_petz_mapping,
    get_mapping,
    get_petz_learning_status,
    mark_ambiguous,
    reject_petz_candidate,
    suggest_petz_candidate,
)
from src.petz_provider import PetzProvider, is_petz_publicly_servable
from src.product_catalog_lookup import ProductCatalog

GTIN = "7896181298083"


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    monkeypatch.delenv("PETZ_AFFILIATE_ENABLED", raising=False)
    monkeypatch.delenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def admin_client(client):
    from src.admin.deps import get_current_admin_or_readonly_key

    app.dependency_overrides[get_current_admin] = lambda: ("fake-user", "fake-admin")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("fake-user", "fake-admin")
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_admin, None)
        app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def _enable_petz(monkeypatch) -> None:
    """Liga as DUAS flags do gate único (is_petz_publicly_servable) — o
    rollout técnico E a prova comercial (nunca confundir "produto
    confirmado" com "comissão comprovada", ver petz_provider.py).

    Desde 04/09/2026 as três flags já vêm True/True/False (ligado) por
    padrão em config.py, então isto é redundante na maioria dos testes —
    mantido explícito mesmo assim, tanto pra documentar a intenção de
    cada teste quanto pra continuar funcionando se o default mudar nesta
    suíte específica (setenv sempre vence sobre o default do Settings)."""
    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", "true")
    monkeypatch.setenv("PETZ_PUBLICLY_DISABLED", "false")
    get_settings.cache_clear()


def _enable_petz_search(monkeypatch) -> None:
    """Liga o gate + a flag `petz_product_search_link` (default OFF): "Ver
    na Petz" por produto passa a apontar pra BUSCA da Petz (`/busca?q=...`)
    em vez da vitrine `/parceiro/PETMOL`. Rollback em prod = env var +
    restart, sem deploy."""
    _enable_petz(monkeypatch)
    monkeypatch.setenv("PETZ_PRODUCT_SEARCH_LINK", "true")
    get_settings.cache_clear()


def _enable_petz_cart_prefill(monkeypatch) -> None:
    """Liga o gate + a flag `petz_cart_prefill` (default OFF): produto com
    PetzProductMapping confirmado + petz_product_id → /commerce/petz-direct-link
    devolve `coupon_apply_url` + `cart_add_url` + `destination: "cart"` pro
    bridge montar o carrinho da Petz com produto + cupom já aplicado."""
    _enable_petz(monkeypatch)
    monkeypatch.setenv("PETZ_CART_PREFILL", "true")
    get_settings.cache_clear()


def _disable_petz(monkeypatch) -> None:
    """Força o gate único DESLIGADO, explicitamente — usado pelos testes
    que verificam o kill-switch em si (defesa em profundidade), já que
    desde 04/09/2026 "ligado" é o default e não pode mais ser presumido
    sem monkeypatch."""
    monkeypatch.setenv("PETZ_PUBLICLY_DISABLED", "true")
    get_settings.cache_clear()


def _register_product(gtin: str = GTIN, **overrides) -> int:
    defaults = dict(barcode=gtin, barcode_normalized=gtin, name="Ração Royal Canin Urinary", brand="Royal Canin")
    defaults.update(overrides)
    db = SessionLocal()
    try:
        product = ProductCatalog(**defaults)
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _assert_petz_unavailable_payload(body: dict) -> None:
    """Master gate DESLIGADO — nenhum destino Petz é servido."""
    assert body["available"] is False
    assert body.get("partner_program_active") is False
    assert body["url"] is None
    assert body["direct_product_url"] is None
    assert body["search_url"] is None
    assert body["partner_store_url"] == PETZ_PARTNER_STORE_URL
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["affiliate_program"] == PETZ_AFFILIATE_PROGRAM


def _assert_petz_search_fallback(body: dict) -> None:
    """Master gate LIGADO, produto sem mapping confirmado — "Ver na Petz"
    ainda aparece, levando à busca do site da Petz + cupom PETMOL."""
    assert body["available"] is True
    assert body["partner_program_active"] is True
    assert body["direct_product_url"] is None
    assert body["search_url"].startswith(PETZ_SITE_SEARCH_BASE + "?q=")
    assert body["url"] == body["search_url"]
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["link_type"] == "affiliate_store"


# ── Validação de URL ─────────────────────────────────────────────────────

def test_validator_accepts_official_petz_host():
    url = validate_petz_affiliate_url("https://www.petz.com.br/produto/racao-royal-canin-100223")
    assert url == "https://www.petz.com.br/produto/racao-royal-canin-100223"


def test_product_url_validator_requires_real_product_path():
    url = validate_petz_product_url("https://www.petz.com.br/produto/racao-royal-canin-100223")
    assert url == "https://www.petz.com.br/produto/racao-royal-canin-100223"


@pytest.mark.parametrize("bad_url", [
    "",
    "http://petz.com.br/produto/x",  # não https
    "https://petz.com.br.evil.com/produto/x",  # host disfarçado
    "https://golpepetz.com.br/produto/x",  # host diferente
    "javascript:alert(1)",
    "data:text/html,<script>",
])
def test_validator_rejects_bad_urls(bad_url):
    with pytest.raises(InvalidPetzAffiliateUrlError):
        validate_petz_affiliate_url(bad_url)


@pytest.mark.parametrize("bad_url", [
    "https://www.petz.com.br/parceiro/PETMOL",
    "https://www.petz.com.br/busca?q=racao",
    "https://www.petz.com.br/produto/racao-100223?utm_source=x",
    "https://www.petz.com.br/produto/racao-100223#cupom",
])
def test_product_url_validator_rejects_non_product_or_mutated_urls(bad_url):
    with pytest.raises(InvalidPetzAffiliateUrlError):
        validate_petz_product_url(bad_url)


# ── Mapping por GTIN / query de busca ────────────────────────────────────

def test_search_query_prioritizes_gtin():
    query = build_petz_search_query(gtin="7896181298083", brand="Royal Canin", name="Urinary", weight_kg=7.5)
    assert query == "7896181298083"


def test_search_query_falls_back_to_brand_name_weight():
    query = build_petz_search_query(brand="Royal Canin", name="Urinary Small Dog", weight_kg=7.5)
    assert query == "Royal Canin Urinary Small Dog 7,5 kg"


def test_suggest_candidate_never_hits_network_only_stores_query(monkeypatch):
    def fail_if_called(*a, **k):
        raise AssertionError("suggest_petz_candidate must never make a network call")
    monkeypatch.setattr("httpx.get", fail_if_called, raising=False)

    product_id = _register_product()
    db = SessionLocal()
    try:
        mapping = suggest_petz_candidate(db, product_id, gtin=GTIN, brand="Royal Canin", name="Urinary")
        assert mapping.match_status == "candidate"
        assert mapping.search_query == GTIN
    finally:
        db.close()


# ── Ciclo de aprendizado: unknown → candidate → confirmed → affiliate_ready ──

def test_learning_status_starts_unknown():
    product_id = _register_product()
    db = SessionLocal()
    try:
        assert get_petz_learning_status(db, product_id) == "unknown"
    finally:
        db.close()


def test_confirm_stores_variant_correctly():
    product_id = _register_product()
    db = SessionLocal()
    try:
        mapping = confirm_petz_mapping(
            db, product_id,
            petz_product_id="100223",
            product_url="https://www.petz.com.br/produto/racao-royal-canin-veterinary-urinary-100223",
            variant_label="7,5 kg",
            variant_weight_kg=7.5,
            match_confidence=0.95,
        )
        assert mapping.match_status == "confirmed"
        assert mapping.variant_weight_kg == 7.5
        assert mapping.variant_label == "7,5 kg"
        assert mapping.petz_product_id == "100223"
    finally:
        db.close()


def test_confirm_rejects_non_product_url_before_persisting():
    product_id = _register_product()
    db = SessionLocal()
    try:
        with pytest.raises(InvalidPetzAffiliateUrlError):
            confirm_petz_mapping(
                db,
                product_id,
                petz_product_id="100223",
                product_url="https://www.petz.com.br/parceiro/PETMOL",
            )
        assert get_mapping(db, product_id) is None
    finally:
        db.close()


def test_admin_confirm_stores_partner_model_without_affiliate_product_link(admin_client):
    product_id = _register_product(gtin="9990000000091")

    resp = admin_client.post(
        "/v1/admin/petz/products/9990000000091/confirm",
        json={
            "petz_product_id": "100291",
            "product_url": "https://www.petz.com.br/produto/vermifugo-100291",
            "variant_label": "unidade",
            "match_confidence": 0.98,
        },
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["product_id"] == product_id
    assert body["product_url"] == "https://www.petz.com.br/produto/vermifugo-100291"
    assert body["direct_product_url"] == "https://www.petz.com.br/produto/vermifugo-100291"
    assert body["partner_store_url"] == PETZ_PARTNER_STORE_URL
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["affiliate_program"] == PETZ_AFFILIATE_PROGRAM
    assert body["partner_ready"] is True
    assert body["requires_affiliate_product_url"] is False

    db = SessionLocal()
    try:
        assert get_active_link(db, product_id, "petz") is None
    finally:
        db.close()


def test_admin_confirm_rejects_partner_or_mutated_urls(admin_client):
    _register_product(gtin="9990000000092")

    for bad_url in (
        "https://www.petz.com.br/parceiro/PETMOL",
        "https://www.petz.com.br/busca?q=vermifugo",
        "https://www.petz.com.br/produto/vermifugo-100292?utm_source=x",
    ):
        resp = admin_client.post(
            "/v1/admin/petz/products/9990000000092/confirm",
            json={"petz_product_id": "100292", "product_url": bad_url},
        )
        assert resp.status_code == 400


def test_reject_never_deletes_history_just_marks_status():
    product_id = _register_product()
    db = SessionLocal()
    try:
        mapping = reject_petz_candidate(db, product_id, reason="Produto errado — variante de 2kg, não 7,5kg")
        assert mapping.match_status == "rejected"
        assert "2kg" in mapping.rejection_reason
    finally:
        db.close()


def test_coverage_stats_counts_by_status():
    p1 = _register_product(gtin="1111111111111")
    p2 = _register_product(gtin="2222222222222")
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, p1, petz_product_id="1", product_url="https://www.petz.com.br/produto/a")
        reject_petz_candidate(db, p2, reason="sem correspondência")
        stats = coverage_stats(db)
        assert stats["confirmed"] == 1
        assert stats["rejected"] == 1
        assert stats["total"] == 2
    finally:
        db.close()


# ── Ambiguous / affiliate_pending nunca publicam ─────────────────────────

@pytest.mark.asyncio
async def test_ambiguous_mapping_never_produces_offer(monkeypatch):
    """Um mapping 'ambiguous' nunca cria ProductAffiliateLink — o produto
    fica sem nenhuma linha em product_affiliate_links, então PetzProvider
    nunca encontra nada pra ele."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        mark_ambiguous(db, product_id, reason="duas variantes plausíveis, nenhuma clara")
        provider = PetzProvider(db)
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_confirmed_without_affiliate_product_url_is_discovered_without_price(monkeypatch):
    """Petz Partner não tem affiliate_product_url individual. Mapping
    confirmado deve ser descoberto, mas sem preço inventado."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100223",
            product_url="https://www.petz.com.br/produto/racao-100223",
        )
        provider = PetzProvider(db)
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.direct_url == "https://www.petz.com.br/produto/racao-100223"
        assert offer.price is None
    finally:
        db.close()


# ── direct_url nunca vira afiliada sozinha ───────────────────────────────

def test_direct_product_url_never_becomes_affiliate_link_by_itself():
    """confirm_petz_mapping grava product_url (direta) mas NUNCA cria
    ProductAffiliateLink — Petz Partner usa storefront + cupom, não link
    afiliado individual por produto."""
    product_id = _register_product()
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100223",
            product_url="https://www.petz.com.br/produto/racao-100223",
        )
        link = get_active_link(db, product_id, "petz")
        assert link is None
    finally:
        db.close()


# ── Petz Partner usa direct product URL + cupom, sem affiliate_product_url ──

def test_partner_model_monetize_uses_direct_product_url_without_affiliate_product_url(monkeypatch):
    _enable_petz(monkeypatch)
    product_id = _register_product()
    product_url = "https://www.petz.com.br/produto/racao-royal-canin-100223"
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, product_id, petz_product_id="100223", product_url=product_url)
        assert get_active_link(db, product_id, "petz") is None

        provider = PetzProvider(db)
        discovered = DiscoveredOffer(merchant="petz", price=189.9, direct_url=product_url)
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result == (
            product_url,
            "affiliate_store",
            PETZ_AFFILIATE_PROGRAM,
            True,
        )
    finally:
        db.close()


def test_monetize_rejects_link_with_invalid_host(monkeypatch):
    """Defesa em profundidade: revalida o host no momento do 'clique',
    mesmo que o cadastro admin (que já valida) tenha sido contornado."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id,
            petz_product_id="100223",
            product_url="https://www.petz.com.br/produto/racao-100223",
        )

        provider = PetzProvider(db)
        discovered = DiscoveredOffer(merchant="petz", price=189.9, direct_url="https://golpepetz.com.br/produto/x")
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_never_invents_price_for_confirmed_petz_mapping(monkeypatch):
    """Mesmo com produto Petz confirmado, find_offer() sempre retorna
    price=None (nenhuma fonte de preço Petz confirmada hoje)."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, product_id, petz_product_id="100223", product_url="https://www.petz.com.br/produto/racao-100223")

        provider = PetzProvider(db)
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is not None
        assert offer.price is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_disabled_flag_finds_nothing_even_with_confirmed_link(monkeypatch):
    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "false")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, product_id, petz_product_id="100223", product_url="https://www.petz.com.br/produto/racao-100223")

        assert is_petz_publicly_servable() is False
        provider = PetzProvider(db)
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None
    finally:
        db.close()


# ── CommerceEngine não quebra ─────────────────────────────────────────────

@pytest.mark.asyncio
async def test_commerce_engine_does_not_crash_with_petz_registered(monkeypatch):
    """get_commerce_offers() roda ponta-a-ponta com PetzProvider
    registrado, mesmo sem nenhum mapping/link cadastrado — nunca
    levanta exceção, só retorna lista vazia pra esse produto."""
    _enable_petz(monkeypatch)
    _register_product()
    db = SessionLocal()
    try:
        offers = await get_commerce_offers(db, gtin=GTIN)
        assert isinstance(offers, list)
    finally:
        db.close()


@pytest.mark.asyncio
async def test_commerce_engine_still_returns_empty_with_confirmed_petz_but_no_price(monkeypatch):
    """Mesmo com produto Petz confirmado, sem preço a oferta nunca
    aparece na comparação pública."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, product_id, petz_product_id="100223", product_url="https://www.petz.com.br/produto/racao-100223")

        offers = await get_commerce_offers(db, gtin=GTIN)
        assert all(o.merchant != "petz" for o in offers)
    finally:
        db.close()


# ── GET /commerce/petz-direct-link ("Ver na Petz") ───────────────────────
# Caminho deliberadamente separado do CommerceEngine (ver docstring do
# endpoint em main.py). Retorna a URL real do produto confirmado,
# separada da storefront fixa + cupom PETMOL. Nunca lê nem inventa
# affiliate_product_url individual.

def test_petz_direct_link_unknown_gtin_without_name_falls_back_to_partner_store(client, monkeypatch):
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/petz-direct-link", params={"gtin": "0000000000000"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is True
    assert body["partner_program_active"] is True
    assert body["direct_product_url"] is None
    assert body["search_url"] is None
    assert body["url"] == PETZ_PARTNER_STORE_URL


def test_petz_direct_link_unknown_gtin_with_name_uses_site_search(client, monkeypatch):
    _enable_petz(monkeypatch)
    resp = client.get(
        "/commerce/petz-direct-link",
        params={"gtin": "0000000000000", "q": "Ração Golden Fórmula Adulto"},
    )
    _assert_petz_search_fallback(resp.json())


def test_petz_direct_link_no_gtin_with_name_uses_site_search(client, monkeypatch):
    """Produto sem GTIN (card da home, medicação sem código) — "Ver na
    Petz" ainda aparece, levando à busca do site pelo nome."""
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/petz-direct-link", params={"q": "Simparic 10 a 20 kg"})
    assert resp.status_code == 200
    _assert_petz_search_fallback(resp.json())


def test_petz_direct_link_no_gtin_no_name_still_ok_partner_store(client, monkeypatch):
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/petz-direct-link")
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is True
    assert body["direct_product_url"] is None
    assert body["search_url"] is None
    assert body["url"] == PETZ_PARTNER_STORE_URL


def test_petz_direct_link_bad_gtin_still_400(client, monkeypatch):
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/petz-direct-link", params={"gtin": "abc"})
    assert resp.status_code == 400


# ── flag petz_product_search_link (default OFF) ──────────────────────────

def test_petz_direct_link_flag_off_destination_is_store(client, monkeypatch):
    """Default: destination='store'. Comportamento idêntico ao de sempre."""
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/petz-direct-link", params={"q": "Ração Golden Fórmula"})
    body = resp.json()
    assert body["destination"] == "store"
    # url continua sendo direct_product_url or search_url or STORE
    assert body["url"] == body["search_url"]


def test_petz_direct_link_flag_on_destination_is_search(client, monkeypatch):
    """Flag ON + há busca utilizável → destination='search', url = search_url."""
    _enable_petz_search(monkeypatch)
    resp = client.get("/commerce/petz-direct-link", params={"q": "Simparic 10 a 20 kg"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["destination"] == "search"
    assert body["search_url"].startswith(PETZ_SITE_SEARCH_BASE + "?q=")
    assert body["url"] == body["search_url"]
    assert body["coupon_code"] == PETZ_COUPON_CODE


def test_petz_direct_link_flag_on_but_no_search_url_stays_store(client, monkeypatch):
    """Flag ON mas sem nome/GTIN → não há search_url → cai na vitrine."""
    _enable_petz_search(monkeypatch)
    resp = client.get("/commerce/petz-direct-link")
    body = resp.json()
    assert body["search_url"] is None
    assert body["destination"] == "store"
    assert body["url"] == PETZ_PARTNER_STORE_URL


def test_petz_direct_link_gate_off_destination_store(client, monkeypatch):
    """Gate desligado → available False, destination='store' (nunca ausente)."""
    _disable_petz(monkeypatch)
    resp = client.get("/commerce/petz-direct-link", params={"q": "Ração"})
    body = resp.json()
    assert body["available"] is False
    assert body["destination"] == "store"


# ── flag petz_cart_prefill (default OFF) — carrinho pré-montado ──────────

def _confirm(gtin: str, petz_product_id: str, url: str) -> int:
    product_id = _register_product(gtin=gtin)
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, product_id, petz_product_id=petz_product_id, product_url=url)
    finally:
        db.close()
    return product_id


def test_petz_direct_link_cart_prefill_off_no_extra_fields(client, monkeypatch):
    """Flag OFF (default) → cart_add_url/coupon_apply_url None, destination
    nunca é 'cart'. Comportamento idêntico ao de hoje."""
    _enable_petz(monkeypatch)
    _confirm("9990000000201", "100223", "https://www.petz.com.br/produto/racao-100223")
    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000201"}).json()
    assert body["cart_add_url"] is None
    assert body["coupon_apply_url"] is None
    assert body["petz_product_id"] == "100223"
    assert body["destination"] != "cart"


def test_petz_direct_link_cart_prefill_on_confirmed_product(client, monkeypatch):
    """Flag ON + mapping confirmado com petz_product_id → o bridge recebe
    as duas URLs Struts e destination='cart'."""
    _enable_petz_cart_prefill(monkeypatch)
    _confirm("9990000000202", "100223", "https://www.petz.com.br/produto/racao-100223")
    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000202"}).json()
    assert body["destination"] == "cart"
    assert body["coupon_apply_url"] == "https://www.petz.com.br/aplicarCupom_Loja.html?cupom=PETMOL"
    assert body["cart_add_url"] == "https://www.petz.com.br/comprarAgora_Loja.html?prod=100223&qtde=1"
    assert body["url"] == body["cart_add_url"]
    assert body["coupon_code"] == PETZ_COUPON_CODE
    # search_url continua vindo (fallback do bridge se as URLs Struts saírem do ar)
    assert body["search_url"] is not None


def test_petz_direct_link_cart_prefill_on_non_numeric_petz_product_id(client, monkeypatch):
    """Flag ON mas o petz_product_id não é numérico → não dá pra montar
    `comprarAgora_Loja.html?prod=` → sem carrinho pré-montado."""
    _enable_petz_cart_prefill(monkeypatch)
    _confirm("9990000000203", "abc-slug", "https://www.petz.com.br/produto/racao-abc-slug")
    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000203"}).json()
    assert body["cart_add_url"] is None
    assert body["coupon_apply_url"] is None
    assert body["destination"] != "cart"


def test_petz_direct_link_cart_prefill_on_unconfirmed_product_falls_back(client, monkeypatch):
    """Flag ON, produto sem mapping confirmado E fora do mapa GTIN→id Petz
    → nada de carrinho pré-montado, cai na busca/vitrine de sempre."""
    _enable_petz_cart_prefill(monkeypatch)
    _register_product(gtin="9990000000204")
    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000204"}).json()
    assert body["cart_add_url"] is None
    assert body["destination"] != "cart"


def test_petz_direct_link_cart_prefill_seed_gtin_without_mapping(client, monkeypatch):
    """Flag ON, produto SEM mapping mas com GTIN no mapa curado
    (`petz_product_id_for_gtin`) → carrinho pré-montado destrava mesmo assim."""
    _enable_petz_cart_prefill(monkeypatch)
    _register_product(gtin="7896181298083")  # seed → Petz prod 100223
    body = client.get("/commerce/petz-direct-link", params={"gtin": "7896181298083"}).json()
    assert body["destination"] == "cart"
    assert body["cart_add_url"] == "https://www.petz.com.br/comprarAgora_Loja.html?prod=100223&qtde=1"
    assert body["coupon_apply_url"] == "https://www.petz.com.br/aplicarCupom_Loja.html?cupom=PETMOL"
    assert body["petz_product_id"] == "100223"
    assert body["direct_product_url"] is None  # mapa curado NÃO cria página exata


def test_petz_direct_link_cart_prefill_seed_gtin_flag_off(client, monkeypatch):
    """Mesmo GTIN do seed, flag OFF → nada muda."""
    _enable_petz(monkeypatch)
    _register_product(gtin="7896181298083")
    body = client.get("/commerce/petz-direct-link", params={"gtin": "7896181298083"}).json()
    assert body["cart_add_url"] is None
    assert body["destination"] != "cart"


def test_backfill_catalog_dump_lists_unmapped_products(admin_client):
    """GET /v1/admin/petz/backfill/catalog — dump paginado do catálogo pro
    matching GTIN→id Petz. `only_unmapped` pula os já confirmados."""
    _register_product(gtin="8880000000011", name="Ração A", brand="Marca A")
    pid_b = _register_product(gtin="8880000000022", name="Ração B", brand="Marca B")
    db = SessionLocal()
    try:
        confirm_petz_mapping(db, pid_b, petz_product_id="555", product_url="https://www.petz.com.br/produto/racao-b-555")
    finally:
        db.close()

    body = admin_client.get("/v1/admin/petz/backfill/catalog", params={"only_unmapped": True, "limit": 500}).json()
    gtins = {p["gtin"] for p in body["products"]}
    assert "8880000000011" in gtins
    assert "8880000000022" not in gtins  # já mapeado
    row = next(p for p in body["products"] if p["gtin"] == "8880000000011")
    assert row["name"] == "Ração A" and row["brand"] == "Marca A"


def test_petz_site_search_term_is_short_and_brand_first(client, monkeypatch):
    """A busca da Petz devolve 0 resultados com o título Awin completo
    (marca + variante + tamanho). O fallback manda marca + poucas
    palavras significativas, sem tamanho/pontuação/"para Cães e Gatos"."""
    _enable_petz(monkeypatch)
    resp = client.get(
        "/commerce/petz-direct-link",
        params={
            "gtin": "0000000000001",
            "q": "Shampoo Tonalizante Pelos Claros Sanol - 500 ml",
            "brand": "Sanol",
        },
    )
    body = resp.json()
    from urllib.parse import parse_qs, urlsplit

    term = parse_qs(urlsplit(body["search_url"]).query)["q"][0]
    assert term.lower().startswith("sanol ")
    assert "500" not in term and "ml" not in term.lower().split()
    assert "-" not in term
    assert len(term.split()) <= 5


def test_petz_direct_link_never_learned_product_uses_site_search(client, monkeypatch):
    _enable_petz(monkeypatch)
    _register_product(gtin="9990000000001")
    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000001"})
    assert resp.status_code == 200
    _assert_petz_search_fallback(resp.json())


def test_petz_direct_link_ambiguous_candidate_uses_site_search(client, monkeypatch):
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000002")
    db = SessionLocal()
    try:
        mark_ambiguous(db, product_id, reason="duas variantes plausíveis")
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000002"})
    _assert_petz_search_fallback(resp.json())


def test_petz_direct_link_available_once_product_confirmed(client, monkeypatch):
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000003")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100223",
            product_url="https://www.petz.com.br/produto/racao-royal-canin-100223",
        )
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000003"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["available"] is True
    assert body["partner_program_active"] is True
    assert body["direct_product_url"] == "https://www.petz.com.br/produto/racao-royal-canin-100223"
    # search_url usa a BUSCA CURADA do petz_product_id 100223 (o frontend
    # abre /busca, nunca /produto/* — a AASA da Petz sequestra).
    assert body["search_url"] == "https://www.petz.com.br/busca?q=racao+royal+canin+urinary+small+dog"
    assert body["partner_store_url"] == PETZ_PARTNER_STORE_URL
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["affiliate_program"] == PETZ_AFFILIATE_PROGRAM
    assert body["link_type"] == "affiliate_store"


def test_petz_direct_link_confirmed_without_curated_query_deslugs_the_url(client, monkeypatch):
    """petz_product_id fora do dicionário curado → a busca vem do slug da
    própria URL do produto (sem o -<id> final)."""
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000123")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="555999",
            product_url="https://www.petz.com.br/produto/brinquedo-kong-classic-medio-para-caes-555999",
        )
    finally:
        db.close()

    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000123"}).json()
    assert body["search_url"] == (
        "https://www.petz.com.br/busca?q=brinquedo+kong+classic+medio+para+caes"
    )


def test_petz_direct_link_confirmed_without_product_url_falls_back_to_site_search(client, monkeypatch):
    """Produto confirmado mas sem product_url — não há link direto de
    produto, mas "Ver na Petz" continua (busca do site + cupom)."""
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000005")
    db = SessionLocal()
    try:
        mapping = confirm_petz_mapping(
            db, product_id, petz_product_id="100225",
            product_url="https://www.petz.com.br/produto/temp-100225",
        )
        mapping.product_url = None
        db.commit()
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000005"})
    _assert_petz_search_fallback(resp.json())


def test_petz_direct_link_never_exposes_a_per_product_affiliate_url(client, monkeypatch):
    """Mesmo se um ProductAffiliateLink(merchant="petz") já existir (ex:
    affiliate_ready), este endpoint continua devolvendo a URL de produto
    do MAPPING (product_url), nunca a affiliate_product_url de um link
    específico — este endpoint não sabe nem deveria saber sobre
    ProductAffiliateLink."""
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000004")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100224",
            product_url="https://www.petz.com.br/produto/direta-100224",
        )
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="petz",
            affiliate_product_url="https://www.petz.com.br/produto/afiliada-100224?matt=xyz",
            affiliate_program="petz_partner", active=True,
        ))
        db.commit()
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000004"})
    body = resp.json()
    assert body["url"] == "https://www.petz.com.br/produto/direta-100224"
    assert "afiliada" not in body["url"]


def test_petz_master_gate_blocks_direct_link_even_with_confirmed_product(client, monkeypatch):
    """Regressão do bug real: /commerce/petz-direct-link chegou a ficar no
    ar em produção servindo product_url pra qualquer produto confirmado,
    sem checar NENHUMA flag — nem petz_affiliate_enabled, nem prova
    comercial. Desde 04/09/2026 o gate vem LIGADO por padrão (ver
    test_petz_direct_link_served_by_default_since_04_09_2026 abaixo) —
    este teste passou a cobrir o outro lado: com o kill-switch
    explicitamente ligado (defesa em profundidade), nada pode ser
    servido, mesmo com um mapping totalmente confirmado."""
    _disable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000006")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100226",
            product_url="https://www.petz.com.br/produto/racao-100226",
        )
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000006"})
    assert resp.status_code == 200
    _assert_petz_unavailable_payload(resp.json())


def test_petz_direct_link_served_by_default_since_04_09_2026(client):
    """O gate único (is_petz_publicly_servable) vem LIGADO por padrão
    desde 04/09/2026 (PR de reativação) — SEM nenhum monkeypatch, um
    produto confirmado já serve o destino. A prova comercial
    (petz_coupon_attribution_verified) foi documentada com uma compra
    real em 29/08/2026 (docs/PETZ_COMMISSION_VALIDATION.md), não é mais
    uma suposição — por isso o default virou True."""
    product_id = _register_product(gtin="9990000000009")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100229",
            product_url="https://www.petz.com.br/produto/racao-100229",
        )
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000009"})
    body = resp.json()
    assert body["available"] is True
    assert body["direct_product_url"] == "https://www.petz.com.br/produto/racao-100229"
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["partner_store_url"] == PETZ_PARTNER_STORE_URL


def test_petz_confirmed_product_is_not_automatically_commercially_verified(client, monkeypatch):
    """"Produto confirmado" (petz_mapping.match_status) e "comissão
    comprovada" (petz_coupon_attribution_verified) são conceitos
    distintos por design — ligar só o rollout técnico não basta."""
    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", "false")
    get_settings.cache_clear()

    product_id = _register_product(gtin="9990000000007")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100227",
            product_url="https://www.petz.com.br/produto/racao-100227",
        )
    finally:
        db.close()

    assert is_petz_publicly_servable() is False
    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000007"})
    _assert_petz_unavailable_payload(resp.json())


def test_petz_coupon_verified_mode_allows_product_url(client, monkeypatch):
    """Com as duas flags ligadas (rollout técnico + prova comercial já
    validada por compra real), o produto confirmado passa a servir a
    URL — este é o caminho correto pra "ligar" a Petz de verdade."""
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000008")
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, product_id, petz_product_id="100228",
            product_url="https://www.petz.com.br/produto/racao-100228",
        )
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000008"})
    body = resp.json()
    assert body["available"] is True
    assert body["url"] == "https://www.petz.com.br/produto/racao-100228"
    assert body["direct_product_url"] == "https://www.petz.com.br/produto/racao-100228"
    assert body["partner_store_url"] == PETZ_PARTNER_STORE_URL
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["affiliate_program"] == PETZ_AFFILIATE_PROGRAM


def test_petz_monetized_offer_store_context_respects_master_gate(client, monkeypatch):
    """GET /commerce/monetized-offer?merchant=petz&context=store também
    respeita is_petz_publicly_servable() — não é um caminho paralelo com
    regra própria (ver affiliate_links.get_monetized_offer). O gate vem
    LIGADO por padrão desde 04/09/2026 (ver
    test_petz_monetized_offer_store_context_works_once_verified abaixo,
    que cobre isso sem monkeypatch nenhum) — este teste passou a cobrir
    o kill-switch explicitamente ligado."""
    _disable_petz(monkeypatch)
    resp = client.get("/commerce/monetized-offer", params={"merchant": "petz", "context": "store"})
    assert resp.json()["offer"] is None


def test_petz_monetized_offer_store_context_works_once_verified(client, monkeypatch):
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/monetized-offer", params={"merchant": "petz", "context": "store"})
    offer = resp.json()["offer"]
    assert offer == {
        "merchant": "petz",
        "url": "https://www.petz.com.br/parceiro/PETMOL",
        "link_type": "affiliate_store",
    }


# ── Guarda de identidade: peso/tamanho da variante Petz vs catálogo ──────
#
# "Ração X 3kg" e "Ração X 15kg" são PRODUTOS diferentes. Um mapeamento
# cuja variante confirmada não bate com o peso do produto do catálogo
# manda o tutor pro tamanho errado — nunca pode servir link direto.

def test_confirm_rejects_variant_weight_that_conflicts_with_catalog():
    product_id = _register_product(gtin="9990000000201", weight_kg=3.0)
    db = SessionLocal()
    try:
        with pytest.raises(PetzVariantConflictError):
            confirm_petz_mapping(
                db, product_id,
                petz_product_id="777001",
                product_url="https://www.petz.com.br/produto/racao-x-15kg-777001",
                variant_label="15 kg",
                variant_weight_kg=15.0,
            )
        # gravado como ambiguous (não 'confirmed'), com o motivo
        mapping = get_mapping(db, product_id)
        assert mapping is not None
        assert mapping.match_status == "ambiguous"
        assert mapping.rejection_reason and "confirmação" in mapping.rejection_reason
    finally:
        db.close()


def test_confirm_accepts_variant_weight_that_matches_catalog():
    product_id = _register_product(gtin="9990000000202", weight_kg=7.5)
    db = SessionLocal()
    try:
        mapping = confirm_petz_mapping(
            db, product_id,
            petz_product_id="777002",
            product_url="https://www.petz.com.br/produto/racao-x-75kg-777002",
            variant_label="7,5 kg",
            variant_weight_kg=7.5,
        )
        assert mapping.match_status == "confirmed"
    finally:
        db.close()


def test_admin_confirm_endpoint_returns_409_on_variant_conflict(admin_client):
    _register_product(gtin="9990000000203", weight_kg=1.0)
    resp = admin_client.post(
        "/v1/admin/petz/products/9990000000203/confirm",
        json={
            "petz_product_id": "777003",
            "product_url": "https://www.petz.com.br/produto/racao-x-10kg-777003",
            "variant_label": "10 kg",
            "variant_weight_kg": 10.0,
        },
    )
    assert resp.status_code == 409
    assert "ambíguo" in resp.json()["detail"].lower()


def test_direct_link_dropped_and_auto_healed_when_mapping_weight_diverges(client, monkeypatch):
    """Mapeamento 'confirmed' que aponta pro peso errado (dado legado /
    variante trocada depois) — o endpoint NÃO serve o link direto e
    rebaixa o mapping pra ambiguous sozinho."""
    _enable_petz(monkeypatch)
    product_id = _register_product(gtin="9990000000204", weight_kg=2.0)
    db = SessionLocal()
    try:
        # entra confirmado com a variante certa…
        confirm_petz_mapping(
            db, product_id, petz_product_id="777004",
            product_url="https://www.petz.com.br/produto/racao-x-2kg-777004",
            variant_label="2 kg", variant_weight_kg=2.0,
        )
        # …e depois a variante é adulterada pro tamanho errado
        m = get_mapping(db, product_id)
        m.variant_weight_kg = 10.1
        m.variant_label = "10,1 kg"
        db.commit()
    finally:
        db.close()

    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000204"}).json()
    assert body["direct_product_url"] is None
    assert body["search_url"] is not None  # ainda leva pra busca (com o peso do catálogo)

    db = SessionLocal()
    try:
        assert get_mapping(db, product_id).match_status == "ambiguous"
    finally:
        db.close()


def test_search_fallback_carries_catalog_weight(client, monkeypatch):
    _enable_petz(monkeypatch)
    _register_product(gtin="9990000000205", name="Ração Golden Fórmula Frango", brand="Golden", weight_kg=15.0)
    body = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000205"}).json()
    assert "15kg" in body["search_url"].replace("+", "").replace("%2C", ",")


# ── Painel de casamento assistido Petz (fila + evaluate) ─────────────────

def test_match_queue_lists_pending_and_hides_decided(admin_client):
    from src.petz_mapping import petz_pending_match_count

    pend = _register_product(gtin="9990000000301", name="Ração A", weight_kg=3.0)
    done = _register_product(gtin="9990000000302", name="Ração B", weight_kg=3.0)
    db = SessionLocal()
    try:
        confirm_petz_mapping(
            db, done, petz_product_id="800302",
            product_url="https://www.petz.com.br/produto/racao-b-800302",
        )
        before = petz_pending_match_count(db, only_cobasi=False)
    finally:
        db.close()

    body = admin_client.get("/v1/admin/petz/queue", params={"only_cobasi": False}).json()
    gtins = {i["gtin"] for i in body["items"]}
    assert "9990000000301" in gtins
    assert "9990000000302" not in gtins  # confirmado sai da fila
    assert body["total"] == before >= 1
    item = next(i for i in body["items"] if i["gtin"] == "9990000000301")
    assert item["petz_search_url"].startswith("https://www.petz.com.br/busca?q=")


def test_match_queue_only_cobasi_filters_by_feed(admin_client):
    _register_product(gtin="9990000000311", name="Só no catálogo", weight_kg=1.0)
    p_cobasi = _register_product(gtin="9990000000312", name="Na Cobasi", weight_kg=1.0)
    db = SessionLocal()
    try:
        from src.affiliate_feed import AffiliateFeedOffer

        db.add(AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870",
            external_product_id="c-312", gtin="9990000000312", title="Na Cobasi 1kg",
            brand="X", active=True,
        ))
        db.commit()
    finally:
        db.close()

    body = admin_client.get("/v1/admin/petz/queue", params={"only_cobasi": True}).json()
    gtins = {i["gtin"] for i in body["items"]}
    assert "9990000000312" in gtins
    assert "9990000000311" not in gtins


def test_evaluate_flags_weight_conflict(admin_client):
    _register_product(gtin="9990000000321", name="Ração X", brand="Golden", weight_kg=3.0)
    resp = admin_client.post(
        "/v1/admin/petz/products/9990000000321/evaluate",
        json={"product_url": "https://www.petz.com.br/produto/racao-golden-x-15kg-800321"},
    )
    body = resp.json()
    assert body["verdict"] == "conflict"
    assert body["would_confirm"] is False
    assert body["extracted_weight_kg"] == 15.0
    assert body["catalog_weight_kg"] == 3.0
    assert body["petz_product_id"] == "800321"
    # tabela lado a lado: o peso aparece marcado como conflito
    peso = next((c for c in body["comparison"] if c["attribute"] == "Peso"), None)
    assert peso and peso["status"] == "conflict"
    assert peso["catalog"] == "3.0" and "15" in peso["petz"]


def test_queue_item_carries_cobasi_and_coverage(admin_client):
    from src.affiliate_feed import AffiliateFeedOffer

    _register_product(gtin="9990000000331", name="Ração Golden", brand="Golden", weight_kg=15.0)
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin", merchant="cobasi", advertiser_id="17870",
            external_product_id="g-331", gtin="9990000000331",
            title="Ração Golden Fórmula Frango para Cães Adultos 15kg",
            description="Alimento completo e balanceado sabor frango.",
            category="Cães / Ração Seca", brand="Golden", price=189.9,
            merchant_url="https://www.cobasi.com.br/racao-golden-15kg", active=True,
        ))
        db.commit()
    finally:
        db.close()

    body = admin_client.get("/v1/admin/petz/queue", params={"only_cobasi": True}).json()
    assert body["catalog_total"] >= 1
    assert "matched" in body and "rejected" in body
    item = next(i for i in body["items"] if i["gtin"] == "9990000000331")
    assert item["cobasi_title"].startswith("Ração Golden Fórmula Frango")
    assert item["cobasi_description"]
    assert item["cobasi_category"] == "Cães / Ração Seca"
    assert item["cobasi_url"].startswith("https://www.cobasi.com.br/")
    assert "15" in item["suggested_search_term"]


def test_evaluate_accepts_aligned_candidate(admin_client):
    _register_product(gtin="9990000000322", name="Ração Golden Fórmula Frango 15kg", brand="Golden", weight_kg=15.0)
    resp = admin_client.post(
        "/v1/admin/petz/products/9990000000322/evaluate",
        json={"product_url": "https://www.petz.com.br/produto/racao-golden-formula-frango-15kg-800322"},
    )
    body = resp.json()
    assert body["verdict"] in ("match", "weak")
    assert body["would_confirm"] is True
    assert body["cart_test_url"] and "800322" in body["cart_test_url"]


def test_evaluate_rejects_non_product_url(admin_client):
    _register_product(gtin="9990000000323", name="Ração", weight_kg=1.0)
    resp = admin_client.post(
        "/v1/admin/petz/products/9990000000323/evaluate",
        json={"product_url": "https://www.petz.com.br/parceiro/PETMOL"},
    )
    assert resp.json()["verdict"] == "invalid"

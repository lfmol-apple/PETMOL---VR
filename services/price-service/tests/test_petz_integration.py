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
    app.dependency_overrides[get_current_admin] = lambda: ("fake-user", "fake-admin")
    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_current_admin, None)


def _enable_petz(monkeypatch) -> None:
    """Liga as DUAS flags do gate único (is_petz_publicly_servable) — o
    rollout técnico E a prova comercial (nunca confundir "produto
    confirmado" com "comissão comprovada", ver petz_provider.py)."""
    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", "true")
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
    ainda aparece, levando à busca do site da Petz + cupom PETTMOL."""
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
    "https://www.petz.com.br/parceiro/pettmol",
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
                product_url="https://www.petz.com.br/parceiro/pettmol",
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
        "https://www.petz.com.br/parceiro/pettmol",
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
# separada da storefront fixa + cupom PETTMOL. Nunca lê nem inventa
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
    # Produto confirmado → destino é a página real do produto.
    assert body["url"] == "https://www.petz.com.br/produto/racao-royal-canin-100223"
    assert body["direct_product_url"] == "https://www.petz.com.br/produto/racao-royal-canin-100223"
    assert body["partner_store_url"] == PETZ_PARTNER_STORE_URL
    assert body["coupon_code"] == PETZ_COUPON_CODE
    assert body["affiliate_program"] == PETZ_AFFILIATE_PROGRAM
    assert body["link_type"] == "affiliate_store"
    assert "/parceiro/pettmol/produto" not in body["url"]


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
    comercial. Com as duas flags no padrão (False), nada pode ser
    servido, mesmo com um mapping totalmente confirmado."""
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


def test_petz_monetized_offer_store_context_respects_master_gate(client):
    """GET /commerce/monetized-offer?merchant=petz&context=store também
    respeita is_petz_publicly_servable() — não é um caminho paralelo com
    regra própria (ver affiliate_links.get_monetized_offer)."""
    resp = client.get("/commerce/monetized-offer", params={"merchant": "petz", "context": "store"})
    assert resp.json()["offer"] is None


def test_petz_monetized_offer_store_context_works_once_verified(client, monkeypatch):
    _enable_petz(monkeypatch)
    resp = client.get("/commerce/monetized-offer", params={"merchant": "petz", "context": "store"})
    offer = resp.json()["offer"]
    assert offer == {
        "merchant": "petz",
        "url": "https://www.petz.com.br/parceiro/pettmol",
        "link_type": "affiliate_store",
    }

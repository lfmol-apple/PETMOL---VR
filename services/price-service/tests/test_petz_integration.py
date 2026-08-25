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

from src.affiliate_links import ProductAffiliateLink, get_active_link
from src.commerce_offers import get_commerce_offers
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.petz_link_validator import InvalidPetzAffiliateUrlError, validate_petz_affiliate_url
from src.petz_mapping import (
    build_petz_search_query,
    coverage_stats,
    confirm_petz_mapping,
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
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _enable_petz(monkeypatch) -> None:
    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "true")
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


# ── Validação de URL ─────────────────────────────────────────────────────

def test_validator_accepts_official_petz_host():
    url = validate_petz_affiliate_url("https://www.petz.com.br/produto/racao-royal-canin-100223")
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
async def test_confirmed_without_affiliate_link_never_produces_offer(monkeypatch):
    """'confirmed' (produto certo) sem link afiliado vinculado — ainda não
    é affiliate_ready, então PetzProvider continua sem nada pra mostrar."""
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
        assert offer is None
    finally:
        db.close()


# ── direct_url nunca vira afiliada sozinha ───────────────────────────────

def test_direct_product_url_never_becomes_affiliate_link_by_itself():
    """confirm_petz_mapping grava product_url (direta) mas NUNCA cria
    ProductAffiliateLink — as duas coisas são intencionalmente
    desacopladas (ver docstring de petz_mapping.py)."""
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


# ── affiliate_ready publica (via ProductAffiliateLink real) ─────────────

def test_affiliate_ready_link_is_monetized_correctly(monkeypatch):
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="petz",
            affiliate_product_url="https://www.petz.com.br/produto/racao-royal-canin-100223",
            direct_product_url="https://www.petz.com.br/produto/racao-royal-canin-100223",
            affiliate_program="petz_partner", active=True,
        ))
        db.commit()

        provider = PetzProvider(db)
        discovered = DiscoveredOffer(merchant="petz", price=189.9)  # preço hipotético só p/ testar monetize()
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result == (
            "https://www.petz.com.br/produto/racao-royal-canin-100223",
            "affiliate_product",
            "petz_partner",
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
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="petz",
            affiliate_product_url="https://golpepetz.com.br/produto/x",
            affiliate_program="petz_partner", active=True,
        ))
        db.commit()

        provider = PetzProvider(db)
        discovered = DiscoveredOffer(merchant="petz", price=189.9)
        result = provider.monetize(discovered, ProductContext(gtin=GTIN))
        assert result is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_never_invents_price_even_when_affiliate_ready(monkeypatch):
    """Mesmo com ProductAffiliateLink real, find_offer() sempre retorna
    price=None (nenhuma fonte de preço Petz confirmada hoje) — quem
    descarta a oferta é o CommerceEngine, não o provider."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="petz",
            affiliate_product_url="https://www.petz.com.br/produto/racao-100223",
            affiliate_program="petz_partner", active=True,
        ))
        db.commit()

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
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="petz",
            affiliate_product_url="https://www.petz.com.br/produto/racao-100223",
            affiliate_program="petz_partner", active=True,
        ))
        db.commit()

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
async def test_commerce_engine_still_returns_empty_with_real_affiliate_link_but_no_price(monkeypatch):
    """Confirma o comportamento estrutural central da spec: mesmo com
    link afiliado real+confirmado, sem preço a oferta nunca aparece na
    lista pública — 'não mostrar preço Petz' é garantido pelo
    CommerceEngine, não por uma regra extra no provider."""
    _enable_petz(monkeypatch)
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="petz",
            affiliate_product_url="https://www.petz.com.br/produto/racao-100223",
            affiliate_program="petz_partner", active=True,
        ))
        db.commit()

        offers = await get_commerce_offers(db, gtin=GTIN)
        assert all(o.merchant != "petz" for o in offers)
    finally:
        db.close()


# ── GET /commerce/petz-direct-link ("Ver na Petz") ───────────────────────
# Caminho deliberadamente separado do CommerceEngine (ver docstring do
# endpoint em main.py) — nunca depende de petz_affiliate_enabled, nunca
# retorna affiliate_product_url, só product_url (direta) quando o produto
# já foi confirmado por um humano.

def test_petz_direct_link_unavailable_for_unknown_gtin(client):
    resp = client.get("/commerce/petz-direct-link", params={"gtin": "0000000000000"})
    assert resp.status_code == 200
    assert resp.json() == {"available": False, "url": None}


def test_petz_direct_link_unavailable_when_never_learned(client):
    product_id = _register_product(gtin="9990000000001")
    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000001"})
    assert resp.status_code == 200
    assert resp.json()["available"] is False


def test_petz_direct_link_unavailable_for_ambiguous_candidate(client):
    product_id = _register_product(gtin="9990000000002")
    db = SessionLocal()
    try:
        mark_ambiguous(db, product_id, reason="duas variantes plausíveis")
    finally:
        db.close()

    resp = client.get("/commerce/petz-direct-link", params={"gtin": "9990000000002"})
    assert resp.json()["available"] is False


def test_petz_direct_link_available_once_product_confirmed(client):
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
    assert body == {
        "available": True,
        "url": "https://www.petz.com.br/produto/racao-royal-canin-100223",
        "link_type": "direct",
    }


def test_petz_direct_link_never_exposes_a_real_affiliate_url(client):
    """Mesmo se um ProductAffiliateLink(merchant="petz") já existir (ex:
    affiliate_ready), este endpoint continua devolvendo product_url (a
    URL direta do mapping), nunca affiliate_product_url — ele não sabe
    nem deveria saber sobre ProductAffiliateLink."""
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

"""
Cobasi agrupa vários tamanhos de pacote (SKUs) sob o mesmo produto — sem
saber o peso real do tutor, `items[0]` é só a ordem padrão do catálogo
deles, não necessariamente o pacote certo (ex: Royal Canin Urinary Small
Dog vem em 2kg E 7,5kg sob o mesmo productId, com EANs diferentes).

_select_item_by_weight é função pura sobre os dicts que a API da Cobasi
devolve — sem rede, sem mock de httpx.
"""
from src.commerce_pricing import _select_item_by_weight, _select_product_by_port, _shorten_query_variants, _infer_port

_ITEMS = [
    {"nameComplete": "Ração Royal Canin Urinary Small Dog 2kg", "ean": "111"},
    {"nameComplete": "Ração Royal Canin Urinary Small Dog 7,5kg", "ean": "222"},
]


def test_no_target_weight_keeps_first_item_unchanged():
    """Sem peso alvo, comportamento antigo é preservado — não regride
    nenhum outro chamador (candidatos de scan, etc.) que não passa peso."""
    assert _select_item_by_weight(_ITEMS, None) is _ITEMS[0]


def test_selects_exact_weight_match():
    assert _select_item_by_weight(_ITEMS, 7.5)["ean"] == "222"
    assert _select_item_by_weight(_ITEMS, 2.0)["ean"] == "111"


def test_falls_back_to_first_item_when_no_weight_matches():
    assert _select_item_by_weight(_ITEMS, 99.0) is _ITEMS[0]


def test_handles_weight_in_grams():
    items = [
        {"nameComplete": "Ração Úmida Royal Canin 85 g", "ean": "333"},
        {"nameComplete": "Ração Úmida Royal Canin 410 g", "ean": "444"},
    ]
    assert _select_item_by_weight(items, 0.085)["ean"] == "333"
    assert _select_item_by_weight(items, 0.41)["ean"] == "444"


def test_empty_items_returns_empty_dict():
    assert _select_item_by_weight([], 7.5) == {}
    assert _select_item_by_weight([], None) == {}


# ── _infer_port: concordância de gênero (raça é feminino: "média(s)") ─────

def test_infer_port_handles_feminine_agreement():
    """Caso real: 'Cães Raças Médias e Grandes' caía no check de 'grande'
    (só 'grandes' batia) em vez de 'medio', porque nem 'médio' nem 'media'
    (sem acento) são substring de 'médias' (com acento, terminação -as)."""
    assert _infer_port("Ração Premier Cães Raças Médias e Grandes") == "medio"
    assert _infer_port("Ração Premier Cães Raças Pequenas") == "pequeno"


# ── _select_product_by_port: várias RAÇÕES distintas, não só tamanhos ─────
# (diferente de _select_item_by_weight: aqui são productId diferentes)

_PRODUCTS = [
    {"productName": "Ração Premier Nutrição Clínica Gastrointestinal Cães Raças Pequenas"},
    {"productName": "Ração Premier Nutrição Clínica Gastrointestinal Cães Raças Médias e Grandes"},
]


def test_select_product_by_port_matches_query_port():
    query = "PremierPet Gastrointestinal Nutrição Clínica Cães de Portes Médio e Grande ração"
    selected = _select_product_by_port(_PRODUCTS, query)
    assert "Médias e Grandes" in selected["productName"]


def test_select_product_by_port_falls_back_to_first_without_port_signal():
    """Sem porte na query (ex: query já veio encurtada e perdeu a palavra
    de porte), mantém o primeiro resultado — nunca piora o caso comum de
    um produto só (ex: Royal Canin Urinary, sem ambiguidade de porte)."""
    query = "PremierPet Gastrointestinal ração"
    selected = _select_product_by_port(_PRODUCTS, query)
    assert selected is _PRODUCTS[0]


def test_select_product_by_port_empty_list_returns_empty_dict():
    assert _select_product_by_port([], "ração médio") == {}


# ── _shorten_query_variants: fallback pra buscas verbosas demais ──────────

def test_shorten_query_variants_short_query_returns_nothing():
    assert _shorten_query_variants("Royal Canin ração") == []


def test_shorten_query_variants_preserves_last_word():
    query = "PremierPet Gastrointestinal Nutrição Clínica Cães de Portes Médio e Grande Todas as idades Cão 10,1 kg ração"
    variants = _shorten_query_variants(query)
    assert len(variants) > 0
    for variant in variants:
        assert variant.endswith("ração")
        assert len(variant.split()) <= 7


# ── reason (observabilidade, PARTE A4) ──────────────────────────────────────

import pytest  # noqa: E402

from src.commerce_pricing import fetch_cobasi_price  # noqa: E402
from src.config import get_settings  # noqa: E402


@pytest.mark.asyncio
async def test_reason_empty_query():
    r = await fetch_cobasi_price("   ")
    assert r.found is False
    assert r.reason == "empty_query"


@pytest.mark.asyncio
async def test_reason_disabled(monkeypatch):
    monkeypatch.setenv("COMMERCE_PRICING_ENABLED", "false")
    get_settings.cache_clear()
    try:
        r = await fetch_cobasi_price("ração golden 15kg qualquer coisa nova")
        assert r.found is False
        assert r.reason == "disabled"
    finally:
        get_settings.cache_clear()

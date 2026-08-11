"""
Cobasi agrupa vários tamanhos de pacote (SKUs) sob o mesmo produto — sem
saber o peso real do tutor, `items[0]` é só a ordem padrão do catálogo
deles, não necessariamente o pacote certo (ex: Royal Canin Urinary Small
Dog vem em 2kg E 7,5kg sob o mesmo productId, com EANs diferentes).

_select_item_by_weight é função pura sobre os dicts que a API da Cobasi
devolve — sem rede, sem mock de httpx.
"""
from src.commerce_pricing import _select_item_by_weight

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

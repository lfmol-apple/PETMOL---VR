"""
GET /commerce/awin-search — busca textual local no catálogo Awin já
sincronizado (AffiliateFeedOffer), agrupada por GTIN (window function SQL,
não Python) entre todos os merchants publicamente liberados (ver
awin_advertisers.is_awin_merchant_publicly_servable). Nenhuma chamada à
Awin; existe pra dar ao frontend um jeito de descobrir um GTIN real e
então usar GET /commerce/offers (que decide o link final, respeitando
link cadastrado manualmente — ver test_commerce_offers_awin_dedupe.py).

Master gate: awin_enabled=False é o padrão real de produção — a maioria
dos testes aqui precisa ligar explicitamente via _enable_awin() pra
exercitar o caminho "com dado". Os testes de master gate (que começam com
test_master_gate_*) são a cobertura do bug crítico corrigido nesta tarefa:
um `merchant=` explícito não pode contornar awin_enabled=False nem um
merchant pending/disabled.
"""
import pytest

from src.affiliate_feed import AffiliateFeedOffer
from src.config import get_settings
from src.db import SessionLocal


@pytest.fixture(autouse=True)
def _reset_settings_cache():
    # get_settings() é @lru_cache — sem isso, um teste anterior que ligou
    # o master gate via monkeypatch.setenv deixaria o cache "vazado" pro
    # próximo teste, mesmo depois do monkeypatch reverter a env var.
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _enable_awin(monkeypatch) -> None:
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
    get_settings.cache_clear()


def _add_offer(**overrides) -> None:
    defaults = dict(
        network="awin", merchant="cobasi", advertiser_id="17870",
        external_product_id="1", gtin="7891234500001", title="Racao Golden Adulto 15kg",
        brand="Golden", price=120.0, in_stock=True, active=True,
        affiliate_url="https://www.awin1.com/pclick.php?p=1&a=3032803&m=17870",
    )
    defaults.update(overrides)
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(**defaults))
        db.commit()
    finally:
        db.close()


def _cleanup():
    db = SessionLocal()
    try:
        db.query(AffiliateFeedOffer).filter(AffiliateFeedOffer.network == "awin").delete()
        db.commit()
    finally:
        db.close()


def test_search_finds_by_title(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", gtin="7891234500001")
    _add_offer(external_product_id="2", title="Areia Sanitaria Pipicat 4kg", brand="Pipicat", gtin="7891234500002")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.status_code == 200
        results = r.json()["results"]
        assert len(results) == 1
        assert results[0]["gtin"] == "7891234500001"
        assert results[0]["title"] == "Racao Golden Adulto 15kg"
    finally:
        _cleanup()


def test_search_finds_by_brand(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Adulto 15kg", brand="Golden", gtin="7891234500001")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.status_code == 200
        assert len(r.json()["results"]) == 1
    finally:
        _cleanup()


def test_search_ignores_out_of_stock(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", in_stock=False)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_search_ignores_inactive(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", active=False)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_search_ignores_rows_without_gtin(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", gtin=None)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_search_respects_limit(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    for i in range(5):
        _add_offer(external_product_id=str(i), gtin=f"789123450000{i}", title="Racao Golden Adulto 15kg", price=100.0 + i)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden", "limit": 2})
        assert len(r.json()["results"]) == 2
    finally:
        _cleanup()


def test_search_requires_min_length_query(client):
    r = client.get("/commerce/awin-search", params={"q": "a"})
    assert r.status_code == 422


def test_search_explicit_merchant_filter(client, monkeypatch):
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", merchant="cobasi", gtin="7891234500001", title="Racao Golden Adulto 15kg")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden", "merchant": "cobasi"})
        assert len(r.json()["results"]) == 1
        # zeenow é pending (enabled=False) no estado real — merchant=zeenow
        # não pode contornar isso, mesmo com awin_enabled=True.
        r2 = client.get("/commerce/awin-search", params={"q": "golden", "merchant": "zeenow"})
        assert r2.json()["results"] == []
    finally:
        _cleanup()


def test_search_groups_same_gtin_across_merchants_keeping_cheapest(client, monkeypatch):
    """O caso que importa pro grid de preços: mesmo produto físico
    (mesmo GTIN) sincronizado em mais de um merchant Awin habilitado —
    vira UM resultado, com o preço/loja mais barata em destaque e
    offer_count contando quantas lojas têm aquele produto."""
    _enable_awin(monkeypatch)
    monkeypatch.setattr("src.awin_advertisers.is_awin_merchant_enabled", lambda m: m in ("cobasi", "zeenow"))
    _cleanup()
    _add_offer(external_product_id="1", merchant="cobasi", gtin="7891234500001", title="Racao Golden Adulto 15kg", price=150.0)
    _add_offer(external_product_id="1", merchant="zeenow", advertiser_id="127557", gtin="7891234500001", title="Racao Golden Adulto 15kg", price=139.90)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        results = r.json()["results"]
        assert len(results) == 1
        assert results[0]["offer_count"] == 2
        assert results[0]["price"] == 139.90
        assert results[0]["merchant"] == "zeenow"
    finally:
        _cleanup()


def test_search_disabled_merchant_never_included_by_default(client, monkeypatch):
    """Sem merchant explícito, só busca em merchants habilitados — Zee Now
    aprovada mas ainda não enabled=True não deve aparecer, mesmo com o
    master gate ligado."""
    _enable_awin(monkeypatch)
    _cleanup()
    _add_offer(external_product_id="1", merchant="zeenow", advertiser_id="127557", gtin="7891234500001", title="Racao Golden Adulto 15kg")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


# ── Master gate — cobertura do bug crítico corrigido nesta tarefa ─────────

def test_master_gate_off_blocks_search_even_with_real_data(client):
    """awin_enabled=False (padrão real) — mesmo com dado real no banco pro
    merchant tecnicamente enabled=True (cobasi), a busca pública não pode
    retornar nada."""
    assert get_settings().awin_enabled is False
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", gtin="7891234500001")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.status_code == 200
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_master_gate_off_merchant_param_does_not_bypass(client):
    """O bug exato descrito no brief: `merchant=cobasi` explícito não pode
    contornar awin_enabled=False."""
    assert get_settings().awin_enabled is False
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", gtin="7891234500001")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden", "merchant": "cobasi"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_shadow_mode_blocks_search_even_with_master_gate_on(client, monkeypatch):
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "true")
    get_settings.cache_clear()
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", gtin="7891234500001")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_merchant_without_feed_never_servable_even_if_enabled_by_mistake(client, monkeypatch):
    """Defesa em profundidade: um merchant sem Product Feed (ex: Araújo)
    nunca pode ficar publicamente pesquisável, mesmo que enabled=True seja
    setado por engano — feed_available=False é a trava final."""
    _enable_awin(monkeypatch)
    monkeypatch.setattr("src.awin_advertisers.is_awin_merchant_enabled", lambda m: m == "petz")
    _cleanup()
    # petz não tem feed (feed_available=False, real) — mesmo "enabled" pelo
    # monkeypatch acima, nunca deveria ser buscável.
    r = client.get("/commerce/awin-search", params={"q": "golden", "merchant": "petz"})
    assert r.json()["results"] == []

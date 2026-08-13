"""
GET /commerce/awin-search — busca textual local no catálogo Awin já
sincronizado (AffiliateFeedOffer), agrupada por GTIN entre todos os
merchants Awin habilitados (hoje só cobasi; Petz/Zee Now/Zee Dog entram
automaticamente quando aprovados+sincronizados, sem mudar este código —
ver awin_merchants_with_feed/is_awin_merchant_enabled). Nenhuma chamada
à Awin; existe pra dar ao frontend um jeito de descobrir um GTIN real e
então usar GET /commerce/offers (que decide o link final, respeitando
link cadastrado manualmente — ver test_commerce_offers_awin_dedupe.py).
"""
from src.affiliate_feed import AffiliateFeedOffer
from src.db import SessionLocal


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


def test_search_finds_by_title(client):
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


def test_search_finds_by_brand(client):
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Adulto 15kg", brand="Golden", gtin="7891234500001")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.status_code == 200
        assert len(r.json()["results"]) == 1
    finally:
        _cleanup()


def test_search_ignores_out_of_stock(client):
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", in_stock=False)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_search_ignores_inactive(client):
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", active=False)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_search_ignores_rows_without_gtin(client):
    _cleanup()
    _add_offer(external_product_id="1", title="Racao Golden Adulto 15kg", gtin=None)
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()


def test_search_respects_limit(client):
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


def test_search_explicit_merchant_filter(client):
    _cleanup()
    _add_offer(external_product_id="1", merchant="cobasi", gtin="7891234500001", title="Racao Golden Adulto 15kg")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden", "merchant": "cobasi"})
        assert len(r.json()["results"]) == 1
        r2 = client.get("/commerce/awin-search", params={"q": "golden", "merchant": "zeenow"})
        assert r2.json()["results"] == []
    finally:
        _cleanup()


def test_search_groups_same_gtin_across_merchants_keeping_cheapest(client, monkeypatch):
    """O caso que importa pro grid de preços: mesmo produto físico
    (mesmo GTIN) sincronizado em mais de um merchant Awin habilitado —
    vira UM resultado, com o preço/loja mais barata em destaque e
    offer_count contando quantas lojas têm aquele produto."""
    monkeypatch.setattr("src.awin_advertisers.is_awin_merchant_enabled", lambda m: m in ("cobasi", "zeenow"))
    monkeypatch.setattr("src.awin_advertisers.awin_merchants_with_feed", lambda: ["cobasi", "zeenow", "zeedog"])
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
    aprovada mas ainda não enabled=True não deve aparecer."""
    monkeypatch.setattr("src.awin_advertisers.is_awin_merchant_enabled", lambda m: m == "cobasi")
    monkeypatch.setattr("src.awin_advertisers.awin_merchants_with_feed", lambda: ["cobasi", "zeenow", "zeedog"])
    _cleanup()
    _add_offer(external_product_id="1", merchant="zeenow", advertiser_id="127557", gtin="7891234500001", title="Racao Golden Adulto 15kg")
    try:
        r = client.get("/commerce/awin-search", params={"q": "golden"})
        assert r.json()["results"] == []
    finally:
        _cleanup()

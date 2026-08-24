"""
Endpoint admin de disparo/acompanhamento do sync da Shopee via HTTPS
(admin/shopee_sync_router.py). Nunca chama a rede real da Shopee aqui:
sync_shopee_offer_for_gtin é sempre monkeypatchado.
"""
import time

import pytest

# Capturado antes de qualquer monkeypatch — sync_router.time é o MESMO
# objeto módulo que este `time` (módulos são singletons), então
# monkeypatch.setattr(sync_router.time, "sleep", ...) também neutraliza
# esta referência se ela for resolvida depois. Guardar a função original
# aqui garante um sleep de verdade pro teste de concorrência abaixo,
# independente do que os outros testes façam com sync_router.time.sleep.
_REAL_SLEEP = time.sleep

import src.admin.shopee_sync_router as sync_router
from src.affiliate_feed import AffiliateFeedOffer
from src.config import get_settings
from src.db import SessionLocal
from src.main import app
from src.product_catalog_lookup import ProductCatalog
from src.shopee_offer_audit import ShopeeOfferAuditResult

TOKEN = "test-trigger-token-123"


@pytest.fixture(autouse=True)
def _reset_state_and_settings(monkeypatch):
    monkeypatch.setenv("SHOPEE_SYNC_TRIGGER_TOKEN", "")
    get_settings.cache_clear()
    with sync_router.STATE.lock:
        sync_router.STATE.running = False
        sync_router.STATE.total = 0
        sync_router.STATE.processed = 0
        sync_router.STATE.matched = 0
        sync_router.STATE.phase = "idle"
        sync_router.STATE.audit_total = 0
        sync_router.STATE.audit_invalid = 0
        sync_router.STATE.audit_deactivated = 0
        sync_router.STATE.started_at = None
        sync_router.STATE.finished_at = None
        sync_router.STATE.error = None
    yield
    get_settings.cache_clear()


def _enable_token(monkeypatch, token: str = TOKEN) -> None:
    monkeypatch.setenv("SHOPEE_SYNC_TRIGGER_TOKEN", token)
    get_settings.cache_clear()


def _register_product(gtin: str) -> None:
    db = SessionLocal()
    try:
        db.add(ProductCatalog(
            barcode=gtin, barcode_normalized=gtin,
            name="Produto Teste", brand="Marca Teste", category="food",
        ))
        db.commit()
    finally:
        db.close()


def _wait_until_finished(client, headers, timeout_s: float = 5.0) -> dict:
    deadline = time.time() + timeout_s
    while time.time() < deadline:
        status = client.get("/v1/admin/shopee-sync/status", headers=headers).json()
        if not status["running"]:
            return status
        time.sleep(0.05)
    raise AssertionError("sync never finished within timeout")


def test_sem_token_configurado_recusa_com_401(client):
    r = client.post("/v1/admin/shopee-sync/run", json={}, headers={"X-Sync-Token": "qualquer-coisa"})
    assert r.status_code == 401


def test_token_errado_recusa_com_401(monkeypatch, client):
    _enable_token(monkeypatch)
    r = client.get("/v1/admin/shopee-sync/status", headers={"X-Sync-Token": "errado"})
    assert r.status_code == 401


def test_sem_header_nenhum_recusa_com_401(monkeypatch, client):
    _enable_token(monkeypatch)
    r = client.get("/v1/admin/shopee-sync/status")
    assert r.status_code == 401


def test_status_antes_de_qualquer_run_mostra_zerado(monkeypatch, client):
    _enable_token(monkeypatch)
    r = client.get("/v1/admin/shopee-sync/status", headers={"X-Sync-Token": TOKEN})
    assert r.status_code == 200
    body = r.json()
    assert body["running"] is False
    assert body["phase"] == "idle"
    assert body["total"] == 0
    assert body["matched"] == 0
    assert body["audit_total"] == 0


def test_progress_admin_mostra_percentual_sem_token_sync(client):
    app.dependency_overrides[sync_router.get_current_admin_or_readonly_key] = lambda: None
    try:
        with sync_router.STATE.lock:
            sync_router.STATE.running = True
            sync_router.STATE.total = 200
            sync_router.STATE.processed = 50
            sync_router.STATE.matched = 8
            sync_router.STATE.phase = "syncing"
            sync_router.STATE.audit_total = 10
            sync_router.STATE.audit_invalid = 2
            sync_router.STATE.audit_deactivated = 2
            sync_router.STATE.started_at = "2026-08-22T20:00:00+00:00"
            sync_router.STATE.finished_at = None
            sync_router.STATE.error = None

        r = client.get("/v1/admin/shopee-sync/progress")
        assert r.status_code == 200
        body = r.json()
        assert body["running"] is True
        assert body["total"] == 200
        assert body["processed"] == 50
        assert body["matched"] == 8
        assert body["phase"] == "syncing"
        assert body["audit_total"] == 10
        assert body["audit_invalid"] == 2
        assert body["audit_deactivated"] == 2
        assert body["percent"] == 25.0
        assert body["remaining"] == 150
        assert body["match_rate"] == 16.0
    finally:
        app.dependency_overrides.pop(sync_router.get_current_admin_or_readonly_key, None)


def test_run_dispara_processa_e_atualiza_status(monkeypatch, client):
    _enable_token(monkeypatch)
    gtin = "7891234500001"
    _register_product(gtin)

    def _fake_sync(db, g, limit=10, min_confidence=0.5):
        from src.shopee_offer_sync import ShopeeSyncResult
        return ShopeeSyncResult(gtin=g, matched=True, offer_id=1)

    monkeypatch.setattr(sync_router, "sync_shopee_offer_for_gtin", _fake_sync)
    monkeypatch.setattr(sync_router.time, "sleep", lambda _seconds: None)

    headers = {"X-Sync-Token": TOKEN}
    r = client.post("/v1/admin/shopee-sync/run", json={"categories": ["food"]}, headers=headers)
    assert r.status_code == 200
    assert r.json()["started"] is True

    final = _wait_until_finished(client, headers)
    assert final["total"] == 1
    assert final["processed"] == 1
    assert final["matched"] == 1
    assert final["error"] is None
    assert final["finished_at"] is not None


def test_run_awin_feed_all_usa_linha_do_feed_para_criar_catalogo(monkeypatch, client):
    _enable_token(monkeypatch)
    gtin = "7891234500094"
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(
            network="awin",
            merchant="zeenow",
            advertiser_id="127557",
            external_product_id="zn-router-1",
            gtin=gtin,
            title="Vermifugo Teste Zee Now 10kg",
            brand="Marca Teste",
            active=True,
            in_stock=True,
        ))
        db.commit()
    finally:
        db.close()

    calls = []
    audits = []

    def _fake_sync_from_feed(db, g, name, brand, limit=10, min_confidence=0.5, expected_weight_kg=None):
        from src.shopee_offer_sync import ShopeeSyncResult
        calls.append((g, name, brand))
        return ShopeeSyncResult(gtin=g, matched=True, offer_id=1)

    def _fake_audit(db, source_merchants=("cobasi", "zeenow", "zeedog"), deactivate_invalid=True):
        audits.append((source_merchants, deactivate_invalid))
        return ShopeeOfferAuditResult(total=3, valid=1, invalid=2, deactivated=2)

    monkeypatch.setattr(sync_router, "sync_shopee_offer_from_feed_row", _fake_sync_from_feed)
    monkeypatch.setattr(sync_router, "audit_active_shopee_offers", _fake_audit)
    monkeypatch.setattr(sync_router.time, "sleep", lambda _seconds: None)

    headers = {"X-Sync-Token": TOKEN}
    r = client.post(
        "/v1/admin/shopee-sync/run",
        json={"source": "awin_feed_all", "feed_merchants": ["cobasi", "zeenow", "zeedog"]},
        headers=headers,
    )
    assert r.status_code == 200
    assert r.json()["started"] is True

    final = _wait_until_finished(client, headers)
    assert final["total"] == 1
    assert final["processed"] == 1
    assert final["matched"] == 1
    assert final["audit_total"] == 3
    assert final["audit_invalid"] == 2
    assert final["audit_deactivated"] == 2
    assert audits == [((("cobasi", "zeenow", "zeedog")), True)]
    assert calls == [(gtin, "Vermifugo Teste Zee Now 10kg", "Marca Teste")]


def test_run_enquanto_ja_esta_rodando_nao_dispara_outro(monkeypatch, client):
    _enable_token(monkeypatch)
    _register_product("7891234500002")

    started = {"count": 0}

    def _slow_fake_sync(db, g, limit=10, min_confidence=0.5):
        from src.shopee_offer_sync import ShopeeSyncResult
        started["count"] += 1
        _REAL_SLEEP(0.3)
        return ShopeeSyncResult(gtin=g, matched=False, reason="teste")

    monkeypatch.setattr(sync_router, "sync_shopee_offer_for_gtin", _slow_fake_sync)
    monkeypatch.setattr(sync_router.time, "sleep", lambda _seconds: None)

    headers = {"X-Sync-Token": TOKEN}
    first = client.post("/v1/admin/shopee-sync/run", json={"categories": ["food"]}, headers=headers)
    assert first.json()["started"] is True

    second = client.post("/v1/admin/shopee-sync/run", json={"categories": ["food"]}, headers=headers)
    assert second.json() == {"started": False, "reason": "already_running"}

    _wait_until_finished(client, headers)


def test_um_erro_inesperado_num_gtin_nao_derruba_o_lote(monkeypatch, client):
    _enable_token(monkeypatch)
    _register_product("7891234500003")
    _register_product("7891234500004")

    calls = {"n": 0}

    def _flaky_sync(db, g, limit=10, min_confidence=0.5):
        from src.shopee_offer_sync import ShopeeSyncResult
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("erro simulado")
        return ShopeeSyncResult(gtin=g, matched=True, offer_id=2)

    monkeypatch.setattr(sync_router, "sync_shopee_offer_for_gtin", _flaky_sync)
    monkeypatch.setattr(sync_router.time, "sleep", lambda _seconds: None)

    headers = {"X-Sync-Token": TOKEN}
    client.post("/v1/admin/shopee-sync/run", json={"categories": ["food"]}, headers=headers)
    final = _wait_until_finished(client, headers)

    assert final["total"] == 2
    assert final["processed"] == 2
    assert final["matched"] == 1
    assert final["error"] is None

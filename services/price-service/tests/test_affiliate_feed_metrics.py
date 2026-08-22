"""
Métricas de cobertura do catálogo Awin — só admin, nunca superfície
pública (ver affiliate_feed_metrics.py e admin/affiliate_feed_metrics_router.py).
"""
import pytest

from src.admin.deps import get_current_admin_or_readonly_key
from src.affiliate_feed import AffiliateFeedOffer, AffiliateFeedSyncRun
from src.affiliate_feed_metrics import compute_affiliate_feed_metrics
from src.db import SessionLocal
from src.main import app


@pytest.fixture
def _admin_auth_override():
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("fake-user", "fake-admin")
    yield
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def test_metrics_endpoint_requires_admin_auth(client):
    """Sem override de auth — nem token nem cookie — deve ser 401, nunca
    vazar dados de catálogo pra requisição anônima."""
    response = client.get("/v1/admin/affiliate-feed/metrics")
    assert response.status_code == 401


def test_metrics_endpoint_lists_all_configured_merchants_even_empty(client, _admin_auth_override):
    """Uma linha por merchant configurado em AWIN_ADVERTISERS, mesmo os
    que nunca sincronizaram nada — pra deixar visível o que falta."""
    response = client.get("/v1/admin/affiliate-feed/metrics")
    assert response.status_code == 200
    merchants = {row["merchant"] for row in response.json()["data"]}
    assert merchants == {"cobasi", "petz", "zeenow", "zeedog", "araujo"}
    cobasi_row = next(row for row in response.json()["data"] if row["merchant"] == "cobasi")
    assert cobasi_row["rows_active"] == 0
    assert cobasi_row["coverage_gtin_rate"] is None


def _add_offer(**overrides) -> None:
    defaults = dict(
        network="awin", merchant="cobasi", advertiser_id="17870",
        external_product_id="1", gtin="7891234567895", title="Produto Teste",
        price=100.0, in_stock=True, active=True,
        affiliate_url="https://www.awin1.com/pclick.php?p=1",
        merchant_url="https://www.cobasi.com.br/produto-teste/p",
    )
    defaults.update(overrides)
    db = SessionLocal()
    try:
        db.add(AffiliateFeedOffer(**defaults))
        db.commit()
    finally:
        db.close()


def test_coverage_rates_computed_correctly():
    """3 ofertas ativas da Cobasi: 2 com gtin, 2 com affiliate_url, 1 em
    estoque — as taxas precisam refletir exatamente isso, não um
    arredondamento errado nem contar linhas inativas."""
    _add_offer(external_product_id="1", gtin="7891234567895", affiliate_url="https://www.awin1.com/x", in_stock=True)
    _add_offer(external_product_id="2", gtin="7899999999999", affiliate_url="https://www.awin1.com/y", in_stock=False)
    _add_offer(external_product_id="3", gtin=None, affiliate_url=None, in_stock=False)
    _add_offer(external_product_id="4", gtin="7891111111111", active=False)  # inativa, não deve contar

    db = SessionLocal()
    try:
        metrics = compute_affiliate_feed_metrics(db)
    finally:
        db.close()

    cobasi = next(m for m in metrics if m.merchant == "cobasi")
    assert cobasi.rows_active == 3
    assert cobasi.rows_with_gtin == 2
    assert cobasi.rows_with_affiliate_url == 2
    assert cobasi.rows_in_stock == 1
    assert cobasi.coverage_gtin_rate == pytest.approx(2 / 3, abs=1e-4)
    assert cobasi.affiliate_url_present_rate == pytest.approx(2 / 3, abs=1e-4)
    assert cobasi.in_stock_rate == pytest.approx(1 / 3, abs=1e-4)


def test_staleness_reflects_last_successful_sync_run(monkeypatch):
    """Sem nenhum AffiliateFeedSyncRun de sucesso, is_stale fica None (não
    dá pra afirmar) mesmo com linhas ativas — só um sync real permite
    calcular staleness de verdade."""
    _add_offer()
    db = SessionLocal()
    try:
        metrics = compute_affiliate_feed_metrics(db)
        cobasi = next(m for m in metrics if m.merchant == "cobasi")
        assert cobasi.is_stale is None

        from datetime import datetime, timedelta, timezone
        db.add(AffiliateFeedSyncRun(
            network="awin", merchant="cobasi", advertiser_id="17870",
            started_at=datetime.now(timezone.utc) - timedelta(hours=1),
            finished_at=datetime.now(timezone.utc) - timedelta(hours=1),
            status="success", rows_seen=1, rows_upserted=1,
        ))
        db.commit()

        metrics = compute_affiliate_feed_metrics(db)
        cobasi = next(m for m in metrics if m.merchant == "cobasi")
        assert cobasi.is_stale is False
        assert cobasi.last_sync_status == "success"
    finally:
        db.close()


def test_publicly_servable_flag_matches_master_gate(monkeypatch):
    """publicly_servable no relatório precisa refletir o mesmo master gate
    real usado pra decidir se um link chega ao tutor — nunca um cálculo
    paralelo que possa divergir."""
    _add_offer()
    db = SessionLocal()
    try:
        metrics = compute_affiliate_feed_metrics(db)
        cobasi = next(m for m in metrics if m.merchant == "cobasi")
        assert cobasi.publicly_servable is False  # awin_enabled=False é o padrão real
    finally:
        db.close()

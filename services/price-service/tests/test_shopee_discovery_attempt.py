"""
Discovery on-demand da Shopee (shopee_discovery_attempt.py) + o gatilho
dentro do MarketplaceOfferProvider. Nunca chama a rede real da Shopee:
sync_shopee_offer_for_gtin é sempre monkeypatchado.

Meta desta camada: quando o tutor abre a Loja de um produto com GTIN
confiável e ainda NÃO existe MarketplaceOffer Shopee, agenda UMA tentativa
em background, com cooldown persistido por GTIN. Nunca inline, nunca sem
GTIN, nunca lote.
"""
from datetime import datetime, timedelta, timezone

import pytest

from src.config import get_settings
from src.db import SessionLocal
from src.marketplace_offer_provider import MarketplaceOfferProvider
from src.commerce_provider import ProductContext
from src.product_catalog_lookup import ProductCatalog
import src.shopee_discovery_attempt as disc
from src.shopee_discovery_attempt import (
    ShopeeDiscoveryAttempt,
    record_attempt,
    should_attempt_discovery,
)

GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _reset(monkeypatch):
    monkeypatch.delenv("SHOPEE_AFFILIATE_ENABLED", raising=False)
    get_settings.cache_clear()
    with disc._inflight_lock:
        disc._inflight.clear()
    yield
    get_settings.cache_clear()
    with disc._inflight_lock:
        disc._inflight.clear()


def _enable_shopee(monkeypatch):
    monkeypatch.setenv("SHOPEE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()


def _register_product(gtin=GTIN, name="Ração Teste 10kg"):
    db = SessionLocal()
    try:
        db.add(ProductCatalog(barcode=gtin, barcode_normalized=gtin, name=name, brand="Marca", category="food"))
        db.commit()
    finally:
        db.close()


# ── cooldown persistido ────────────────────────────────────────────────

def test_first_time_gtin_is_always_attemptable():
    db = SessionLocal()
    try:
        assert should_attempt_discovery(db, GTIN) is True
    finally:
        db.close()


def test_recent_no_match_blocks_until_full_cooldown():
    db = SessionLocal()
    try:
        record_attempt(db, GTIN, "no_match")
        assert should_attempt_discovery(db, GTIN) is False
    finally:
        db.close()


def test_no_match_cooldown_expires_after_configured_hours(monkeypatch):
    monkeypatch.setenv("SHOPEE_MISS_RETRY_HOURS", "12")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        record_attempt(db, GTIN, "no_match")
        row = db.get(ShopeeDiscoveryAttempt, GTIN)
        row.last_attempt_at = datetime.now(timezone.utc) - timedelta(hours=13)
        db.commit()
        assert should_attempt_discovery(db, GTIN) is True
    finally:
        db.close()


def test_api_error_uses_short_retry_not_full_cooldown():
    db = SessionLocal()
    try:
        record_attempt(db, GTIN, "api_error")
        row = db.get(ShopeeDiscoveryAttempt, GTIN)
        # 2h atrás: além do retry curto (1h) de erro de API, mas ainda
        # dentro do cooldown longo (12h) de um miss normal.
        row.last_attempt_at = datetime.now(timezone.utc) - timedelta(hours=2)
        db.commit()
        assert should_attempt_discovery(db, GTIN) is True
    finally:
        db.close()


def test_record_attempt_increments_counter():
    db = SessionLocal()
    try:
        record_attempt(db, GTIN, "no_match")
        record_attempt(db, GTIN, "no_match")
        row = db.get(ShopeeDiscoveryAttempt, GTIN)
        assert row.attempts == 2
    finally:
        db.close()


def test_blank_gtin_never_attemptable():
    db = SessionLocal()
    try:
        assert should_attempt_discovery(db, "") is False
        assert should_attempt_discovery(db, "abc") is False
    finally:
        db.close()


# ── gatilho no provider ────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_miss_with_confident_gtin_schedules_discovery(monkeypatch):
    _enable_shopee(monkeypatch)
    _register_product()
    scheduled = []
    monkeypatch.setattr(disc, "schedule_shopee_discovery", lambda g: scheduled.append(g) or True)

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(gtin=GTIN))
        assert offer is None  # ainda sem oferta — mas agendou a descoberta
    finally:
        db.close()
    assert scheduled == [GTIN]


@pytest.mark.asyncio
async def test_miss_without_any_gtin_never_touches_shopee(monkeypatch):
    _enable_shopee(monkeypatch)
    monkeypatch.setattr(
        disc, "schedule_shopee_discovery",
        lambda g: (_ for _ in ()).throw(AssertionError("nunca agendar sem GTIN")),
    )

    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        offer = await provider.find_offer(ProductContext(query="ração genérica sem código"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_miss_within_cooldown_does_not_reschedule(monkeypatch):
    _enable_shopee(monkeypatch)
    _register_product()
    db = SessionLocal()
    try:
        record_attempt(db, GTIN, "no_match")
    finally:
        db.close()

    monkeypatch.setattr(
        disc, "schedule_shopee_discovery",
        lambda g: (_ for _ in ()).throw(AssertionError("cooldown deveria ter barrado")),
    )
    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "shopee")
        assert await provider.find_offer(ProductContext(gtin=GTIN)) is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_mercadolivre_miss_never_schedules_shopee_discovery(monkeypatch):
    monkeypatch.setenv("MERCADOLIVRE_AFFILIATE_ENABLED", "true")
    get_settings.cache_clear()
    _register_product()
    monkeypatch.setattr(
        disc, "schedule_shopee_discovery",
        lambda g: (_ for _ in ()).throw(AssertionError("ML nunca dispara discovery Shopee")),
    )
    db = SessionLocal()
    try:
        provider = MarketplaceOfferProvider(db, "mercadolivre")
        assert await provider.find_offer(ProductContext(gtin=GTIN)) is None
    finally:
        db.close()


# ── concorrência ───────────────────────────────────────────────────────

def test_schedule_dedups_inflight_gtin(monkeypatch):
    started = []
    monkeypatch.setattr(disc.threading, "Thread", _FakeThread(started))

    assert disc.schedule_shopee_discovery(GTIN) is True
    assert disc.schedule_shopee_discovery(GTIN) is False  # já em andamento
    assert started == [GTIN]


def test_schedule_respects_max_inflight(monkeypatch):
    started = []
    monkeypatch.setattr(disc.threading, "Thread", _FakeThread(started))

    for i in range(disc._MAX_INFLIGHT):
        assert disc.schedule_shopee_discovery(f"789123456789{i}") is True
    assert disc.schedule_shopee_discovery("7891234567000") is False
    assert len(started) == disc._MAX_INFLIGHT


class _FakeThread:
    """Substitui threading.Thread: registra o gtin em vez de rodar."""

    def __init__(self, sink):
        self._sink = sink

    def __call__(self, target=None, args=(), daemon=None, **kwargs):
        self._sink.append(args[0])

        class _T:
            def start(self_inner):
                pass

        return _T()

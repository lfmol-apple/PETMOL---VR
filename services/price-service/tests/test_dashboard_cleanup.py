"""Painel Loja sem período fantasma (o "Tudo" virava 30 dias em silêncio) e
plataforma normalizada (iOS casa com ios e ios_capacitor)."""
from datetime import datetime, timedelta, timezone

from src.admin.models import AdminUser
from src.analytics.install_models import AppInstall
from src.analytics.models import AnalyticsProductEvent
from src.config import get_settings
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _admin_headers():
    db = SessionLocal()
    try:
        u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin")
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="master"))
        db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _ev(eid, name, at, platform="web", anon="a"):
    return AnalyticsProductEvent(event_id=eid, event_name=name, platform=platform, anonymous_id=anon, received_at=at)


def test_loja_sem_periodo_conta_todo_o_historico_nao_so_30_dias(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        db.add_all([
            _ev("c1", "offer_viewed", now - timedelta(days=2)),
            _ev("c2", "offer_viewed", now - timedelta(days=90)),    # fora dos 30d — tem que entrar em "Tudo"
            _ev("c3", "commerce_click", now - timedelta(days=90)),
        ])
        db.commit()
    finally:
        db.close()

    todo = client.get("/v1/admin/analytics/commerce", headers=headers).json()
    assert todo["offer_viewed"] == 2 and todo["commerce_click"] == 1
    assert todo["window_since"] is None

    so_30 = client.get("/v1/admin/analytics/commerce", params={"period_days": 30}, headers=headers).json()
    assert so_30["offer_viewed"] == 1 and so_30["commerce_click"] == 0


def test_loja_respeita_o_fim_do_periodo(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        db.add_all([
            _ev("d1", "offer_viewed", now - timedelta(days=10)),
            _ev("d2", "offer_viewed", now - timedelta(days=1)),
        ])
        db.commit()
    finally:
        db.close()
    r = client.get("/v1/admin/analytics/commerce", params={
        "since": (now - timedelta(days=20)).isoformat(), "until": (now - timedelta(days=5)).isoformat(),
    }, headers=headers).json()
    assert r["offer_viewed"] == 1      # só o de 10 dias atrás; o de ontem está depois do fim


def test_plataforma_ios_casa_com_ios_capacitor_e_ios_puro(client, monkeypatch):
    monkeypatch.setattr(get_settings(), "install_count_since", "2026-01-01T00:00:00-03:00", raising=False)
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        db.query(AppInstall).delete()
        db.add_all([
            _ev("p1", "app_open", now, platform="ios_capacitor", anon="i1"),
            _ev("p2", "app_open", now, platform="ios", anon="i2"),
            _ev("p3", "app_open", now, platform="android_capacitor", anon="a1"),
            _ev("p4", "session_start", now, platform="web", anon="w1"),
            AppInstall(platform="ios", ip_hash="x", created_at=now),
            AppInstall(platform="android", ip_hash="y", created_at=now),
        ])
        db.commit()
    finally:
        db.close()

    ov = client.get("/v1/admin/analytics/overview", params={"platform": "ios"}, headers=headers).json()
    assert ov["acessos"]["total_sessions"] == 2       # ios_capacitor + ios; android e web fora
    assert ov["downloads"]["total"] == 1

    cru = client.get("/v1/admin/analytics/overview", params={"platform": "ios_capacitor"}, headers=headers).json()
    assert cru["acessos"]["total_sessions"] == 1      # valor cru continua funcionando (clique no gráfico)

    camp = client.get("/v1/admin/analytics/campaigns", params={"platform": "android"}, headers=headers).json()
    assert camp["totals"]["downloads"] == 1

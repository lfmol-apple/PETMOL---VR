"""Dashboard de inteligência de campanhas: atribuição UTM (downloads +
acessos), cards de Downloads/Acessos com período-aware + comparação com
período anterior, Locais com since/until + cadastros declarados, e o
drill-down linha-a-linha (location-events)."""
from datetime import datetime, timedelta, timezone

import pytest

from src.admin.models import AdminUser
from src.analytics.install_models import AppInstall
from src.analytics.models import AnalyticsProductEvent
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


# ── UTM capture (app-install + product event) ──────────────────────────────

def test_app_install_persists_utm_attribution(client):
    r = client.post("/analytics/app-install", json={
        "platform": "ios",
        "utm_source": "meta", "utm_medium": "cpc", "utm_campaign": "lancamento_v1",
        "utm_content": "carrossel_a", "utm_term": "adote um pet",
        "referrer_host": "instagram.com", "landing_path": "/register-pet",
    }, headers={"X-Forwarded-For": "203.0.113.9"})
    assert r.status_code == 202

    db = SessionLocal()
    try:
        row = db.query(AppInstall).filter(AppInstall.ip_hash.isnot(None)).order_by(AppInstall.created_at.desc()).first()
        assert row.utm_source == "meta"
        assert row.utm_medium == "cpc"
        assert row.utm_campaign == "lancamento_v1"
        assert row.referrer_host == "instagram.com"
        assert row.landing_path == "/register-pet"
    finally:
        db.close()


def test_product_event_persists_utm_and_triggers_geo_enrichment(client, monkeypatch):
    calls = []
    monkeypatch.setattr(
        "src.geoip.geoip_lookup",
        lambda ip: (calls.append(ip) or {"city": "Belo Horizonte", "region": "MG", "country": "BR"}),
    )

    r = client.post("/analytics/event", json={
        "event_name": "session_start",
        "session_id": "sess-1",
        "anonymous_id": "anon-1",
        "platform": "web",
        "utm_source": "google", "utm_medium": "cpc", "utm_campaign": "busca_racao",
    }, headers={"X-Forwarded-For": "198.51.100.7"})
    assert r.status_code == 201
    event_id = r.json()["event_id"]

    db = SessionLocal()
    try:
        row = db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.event_id == event_id).first()
        assert row.utm_source == "google"
        assert row.utm_campaign == "busca_racao"
        # geo roda em thread de fundo — dá tempo de terminar (best-effort,
        # sem sleep artificial: junta a thread se ainda estiver viva)
        import threading, time
        deadline = time.time() + 2
        while row.city is None and time.time() < deadline:
            time.sleep(0.02)
            db.refresh(row)
        assert row.city == "Belo Horizonte"
        assert row.region == "MG"
    finally:
        db.close()
    assert calls  # o lookup foi chamado


def test_product_event_screen_view_does_not_trigger_geo_lookup(client, monkeypatch):
    """Só eventos-âncora de sessão pedem geo-IP — screen_view/clique
    avulso não gasta lookup a cada evento."""
    calls = []
    monkeypatch.setattr("src.geoip.geoip_lookup", lambda ip: calls.append(ip) or {})

    r = client.post("/analytics/event", json={
        "event_name": "screen_view", "session_id": "sess-2", "screen": "home",
    })
    assert r.status_code == 201
    import time
    time.sleep(0.1)
    assert calls == []


# ── Overview: downloads/acessos cards ───────────────────────────────────────

def test_overview_downloads_split_by_platform_and_respects_period_filter(client, monkeypatch):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", created_at=now - timedelta(hours=1)),
            AppInstall(platform="ios", ip_hash="b", created_at=now - timedelta(hours=2)),
            AppInstall(platform="android", ip_hash="c", created_at=now - timedelta(hours=1)),
            AppInstall(platform="pwa", ip_hash="d", created_at=now - timedelta(hours=1)),
            AppInstall(platform="web", ip_hash="e", created_at=now - timedelta(hours=1)),  # não é download
            # fora do período de "hoje" que vamos filtrar
            AppInstall(platform="ios", ip_hash="f", created_at=now - timedelta(days=10)),
        ])
        db.commit()
    finally:
        db.close()

    since = (now - timedelta(days=1)).isoformat()
    r = client.get("/v1/admin/analytics/overview", params={"since": since}, headers=headers)
    assert r.status_code == 200, r.text
    dl = r.json()["downloads"]
    assert dl["total"] == 4         # 2 ios + 1 android + 1 pwa (web fora)
    assert dl["ios"] == 2
    assert dl["android"] == 1
    assert dl["pwa"] == 1
    assert "App Store" in dl["note"] or "Play" in dl["note"]  # deixa clara a limitação


def test_overview_downloads_delta_pct_compares_equal_length_previous_window(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        # janela atual (últimas 24h): 4 downloads
        db.add_all([AppInstall(platform="ios", ip_hash=f"cur{i}", created_at=now - timedelta(hours=1)) for i in range(4)])
        # janela anterior (24h-48h atrás): 2 downloads
        db.add_all([AppInstall(platform="ios", ip_hash=f"prev{i}", created_at=now - timedelta(hours=30)) for i in range(2)])
        db.commit()
    finally:
        db.close()

    since = (now - timedelta(hours=24)).isoformat()
    r = client.get("/v1/admin/analytics/overview", params={"since": since}, headers=headers)
    dl = r.json()["downloads"]
    assert dl["total"] == 4
    assert dl["prev_period_total"] == 2
    assert dl["delta_pct"] == 100.0   # dobrou


def test_overview_downloads_no_delta_when_all_time_selected(client):
    """'Tudo' selecionado (sem since) → sem período anterior comparável,
    delta_pct vem None em vez de inventar um número."""
    headers = _admin_headers()
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/overview", headers=headers)
    dl = r.json()["downloads"]
    assert dl["prev_period_total"] is None
    assert dl["delta_pct"] is None


def test_overview_acessos_counts_sessions_not_pageviews(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        db.add_all([
            AnalyticsProductEvent(event_id="e1", event_name="session_start", platform="web",
                                  anonymous_id="anon-1", received_at=now),
            AnalyticsProductEvent(event_id="e2", event_name="app_open", platform="ios",
                                  user_id=None, anonymous_id="anon-2", received_at=now),
            # screen_view NÃO conta como acesso (não é evento-âncora)
            AnalyticsProductEvent(event_id="e3", event_name="screen_view", platform="web",
                                  anonymous_id="anon-1", received_at=now),
        ])
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/overview", headers=headers)
    acc = r.json()["acessos"]
    assert acc["total_sessions"] == 2
    assert acc["web"] == 1


def test_overview_acessos_app_opens_recognizes_capacitor_platform_values(client):
    """session.ts::detectPlatform() manda 'ios_capacitor'/'android_capacitor'
    de dentro do app nativo — nunca o 'ios'/'android' puro (esse só existe em
    app_installs). Sem isso, 'aberturas do app' sempre dava 0 pra usuário
    real do app nativo."""
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        db.add_all([
            AnalyticsProductEvent(event_id="ec1", event_name="app_open", platform="ios_capacitor",
                                  anonymous_id="a1", received_at=now),
            AnalyticsProductEvent(event_id="ec2", event_name="app_open", platform="android_capacitor",
                                  anonymous_id="a2", received_at=now),
        ])
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/overview", headers=headers)
    acc = r.json()["acessos"]
    assert acc["app_opens"] == 2
    assert acc["web"] == 0
    assert acc["unique_visitors"] == 2


# ── Locations: período customizado + cadastros declarados ──────────────────

def test_locations_summary_with_custom_window_overrides_campaign_cutoff(client, monkeypatch):
    from src.config import get_settings
    st = get_settings()
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(st, "install_count_since", (now - timedelta(days=100)).isoformat(), raising=False)

    headers = _admin_headers()
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add(AppInstall(platform="ios", ip_hash="a", city="Recife", region="PE", country="BR",
                          created_at=now - timedelta(hours=2)))
        # fora da janela customizada que vamos pedir (últimas 24h)
        db.add(AppInstall(platform="ios", ip_hash="b", city="Recife", region="PE", country="BR",
                          created_at=now - timedelta(days=5)))
        db.commit()
    finally:
        db.close()

    since = (now - timedelta(hours=24)).isoformat()
    r = client.get("/v1/admin/analytics/locations", params={"since": since}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["custom_window"] is True
    assert body["total_campaign"] == 1   # só a linha dentro da janela customizada
    place = next(p for p in body["places"] if p["city"] == "Recife")
    assert place["downloads"] == 1


def test_locations_summary_shows_cadastros_as_separate_signal_from_ip_location(client):
    """Cadastros vêm de User.city/state (declarado) — sinal diferente do
    IP do acesso/download, nunca confundido/somado com ele."""
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.query(User).filter(User.email.like("cadastro%")).delete()
        db.add(AppInstall(platform="android", ip_hash="a", city="Salvador", region="BA", country="BR", created_at=now))
        db.add_all([
            User(email="cadastro1@x.com", password_hash="x", city="Salvador", state="BA"),
            User(email="cadastro2@x.com", password_hash="x", city="Salvador", state="BA"),
        ])
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/locations", headers=headers)
    body = r.json()
    place = next(p for p in body["places"] if p["city"] == "Salvador")
    assert place["downloads"] == 1
    assert place["cadastros_declared_location"] == 2
    assert "declarad" in body["note"].lower()


def test_locations_summary_sort_by_downloads_orders_differently_from_total(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        # Cidade A: 1 download, 5 acessos (total 6) — vence por total
        db.add_all([AppInstall(platform="ios" if i == 0 else "web", ip_hash=f"a{i}", city="Cidade A",
                               region="X", country="BR", created_at=now) for i in range(6)])
        # Cidade B: 3 downloads (total 3) — vence por downloads
        db.add_all([AppInstall(platform="android", ip_hash=f"b{i}", city="Cidade B",
                               region="X", country="BR", created_at=now) for i in range(3)])
        db.commit()
    finally:
        db.close()

    r_total = client.get("/v1/admin/analytics/locations", headers=headers)
    assert [p["city"] for p in r_total.json()["places"]][:2] == ["Cidade A", "Cidade B"]

    r_dl = client.get("/v1/admin/analytics/locations", params={"sort_by": "downloads"}, headers=headers)
    assert [p["city"] for p in r_dl.json()["places"]][:2] == ["Cidade B", "Cidade A"]


# ── Campaigns ────────────────────────────────────────────────────────────

def test_campaigns_summary_groups_by_utm_and_keeps_direct_traffic_visible(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.query(AnalyticsProductEvent).delete()
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", utm_source="meta", utm_medium="cpc",
                      utm_campaign="lancamento", created_at=now),
            AppInstall(platform="android", ip_hash="b", utm_source="meta", utm_medium="cpc",
                      utm_campaign="lancamento", created_at=now),
            AppInstall(platform="web", ip_hash="c", created_at=now),  # direto/orgânico
        ])
        db.add(AnalyticsProductEvent(
            event_id="ev1", event_name="session_start", platform="web",
            utm_source="meta", utm_medium="cpc", utm_campaign="lancamento",
            anonymous_id="anon-x", received_at=now,
        ))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/campaigns", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["has_any_attribution"] is True
    campanha = next(c for c in body["campaigns"] if c["utm_campaign"] == "lancamento")
    assert campanha["downloads"] == 2
    assert campanha["acessos"] == 1
    assert campanha["visitantes_unicos"] == 1
    direto = next(c for c in body["campaigns"] if c["utm_campaign"] == "(direto/orgânico)")
    assert direto["acessos"] == 1  # a instalação web sem UTM não some da lista


# ── Location events (drill-down) ────────────────────────────────────────────

def test_location_events_orders_by_most_recent_first_and_paginates(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.query(AnalyticsProductEvent).delete()
        for i in range(5):
            db.add(AppInstall(platform="ios", ip_hash=f"p{i}", city="Fortaleza", region="CE",
                              created_at=now - timedelta(minutes=i)))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/location-events", params={"page_size": 3}, headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total"] == 5
    assert len(body["items"]) == 3
    times = [it["occurred_at"] for it in body["items"]]
    assert times == sorted(times, reverse=True)  # mais recente primeiro


def test_location_events_download_never_shows_identified_user(client):
    """app_installs não tem identificador de usuário — todo download
    aparece como 'Visitante não identificado', nunca um nome inventado."""
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add(AppInstall(platform="android", ip_hash="z", city="Manaus", region="AM", created_at=now))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/location-events", headers=headers)
    item = next(it for it in r.json()["items"] if it["city"] == "Manaus")
    assert item["event"] == "download"
    assert item["identified"] is False
    assert item["name"] == "Visitante não identificado"


def test_location_events_acesso_shows_identified_tutor_when_session_authenticated(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AnalyticsProductEvent).delete()
        u = User(email="tutora@x.com", password_hash="x", name="Tutora Exemplo")
        db.add(u)
        db.commit()
        db.add(AnalyticsProductEvent(
            event_id="ev-ident", event_name="app_open", platform="ios",
            user_id=u.id, city="Belém", region="PA", received_at=now,
        ))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/location-events", headers=headers)
    item = next(it for it in r.json()["items"] if it["city"] == "Belém")
    assert item["identified"] is True
    assert item["name"] == "Tutora Exemplo"


def test_location_events_filters_by_event_type_and_city(client):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", city="Natal", region="RN", created_at=now),
            AppInstall(platform="web", ip_hash="b", city="Natal", region="RN", created_at=now),
            AppInstall(platform="ios", ip_hash="c", city="Maceió", region="AL", created_at=now),
        ])
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/location-events",
                   params={"city": "Natal", "event_type": "download"}, headers=headers)
    items = r.json()["items"]
    assert len(items) == 1
    assert items[0]["city"] == "Natal"
    assert items[0]["event"] == "download"


def test_location_events_requires_admin_auth(client):
    r = client.get("/v1/admin/analytics/location-events")
    assert r.status_code in (401, 403)

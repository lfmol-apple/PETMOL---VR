"""Teste A/B da landing: eventos gravados no servidor, sem renomear, sem contar duas vezes a mesma
pessoa, e o resumo do Mission Control (visitas × visitantes × cliques × conversão)."""
from datetime import datetime, timedelta, timezone

from src.admin.analytics import landing_ab_bi as bi
from src.admin.models import AdminUser
from src.analytics.install_models import AppInstall
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

EXP = bi.EXPERIMENT_ID


def _admin_headers():
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "leonardofmol@gmail.com").first()
        if not u:
            u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin")
            db.add(u)
            db.commit()
            db.add(AdminUser(user_id=u.id, role="master"))
            db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _ev(client, name, anon, variant, *, n=[0], props=None, **extra):
    n[0] += 1
    body = {
        "event_id": f"evt-{n[0]}-{anon}", "event_name": name, "anonymous_id": anon, "session_id": f"s-{anon}",
        "route": "/", "platform": "web", "os": "ios", "device_class": "mobile", "browser": "safari",
        "properties": {"experiment_id": EXP, "variant": variant, **(props or {})},
    }
    body.update(extra)
    return client.post("/analytics/event", json=body)


def _summary(client, **params):
    r = client.get("/v1/admin/analytics/landing-ab", params=params, headers=_admin_headers())
    assert r.status_code == 200, r.text
    return r.json()


def test_landing_events_are_stored_with_their_own_names(client):
    """`landing_view` termina em `_view`: sem estar na lista segura, viraria `screen_view` e sumiria do painel."""
    assert _ev(client, "landing_view", "a1", "A").json()["accepted"] is True
    _ev(client, "landing_download_click", "a1", "A", props={"button": "cta", "placement": "hero-botao"})
    _ev(client, "landing_store_redirect", "a1", "A", props={"store": "apple"})
    db = SessionLocal()
    try:
        names = sorted(e.event_name for e in db.query(AnalyticsProductEvent).all())
    finally:
        db.close()
    assert names == ["landing_download_click", "landing_store_redirect", "landing_view"]


def test_same_person_clicking_three_times_is_one_converted_visitor(client):
    _ev(client, "landing_view", "p1", "A")
    for _ in range(3):
        _ev(client, "landing_download_click", "p1", "A", props={"button": "cta"})
    _ev(client, "landing_view", "p2", "A")  # visitou e não clicou
    a = _summary(client)["variants"]["A"]
    assert (a["views"], a["visitors"], a["clicks"], a["clickers"]) == (2, 2, 3, 1)
    assert a["conversion"] == 0.5  # 1 de 2 visitantes — não 3 cliques


def test_retry_with_same_event_id_is_not_counted_twice(client):
    body = {"event_id": "dup-1", "event_name": "landing_view", "anonymous_id": "d1",
            "properties": {"experiment_id": EXP, "variant": "B"}}
    client.post("/analytics/event", json=body)
    client.post("/analytics/event", json=body)
    assert _summary(client)["variants"]["B"]["views"] == 1


def test_previews_and_other_experiments_are_ignored(client):
    _ev(client, "landing_view", "q1", "A", props={"preview": True})
    _ev(client, "landing_view", "q2", "A", props={"experiment_id": "outro"})
    _ev(client, "landing_view", "q3", "C")  # variante inválida
    s = _summary(client)["variants"]
    assert s["A"]["views"] == 0 and s["B"]["views"] == 0


def test_store_split_counts_apple_and_google(client):
    _ev(client, "landing_view", "s1", "B")
    _ev(client, "landing_store_redirect", "s1", "B", props={"store": "apple"})
    _ev(client, "landing_view", "s2", "B")
    _ev(client, "landing_store_redirect", "s2", "B", props={"store": "google"})
    _ev(client, "landing_store_redirect", "s2", "B", props={"store": "google"})
    b = _summary(client)["variants"]["B"]
    assert (b["apple_clicks"], b["google_clicks"]) == (1, 2)
    assert (b["apple_clickers"], b["google_clickers"]) == (1, 1)


def test_filters_campaign_os_source_and_instagram(client):
    _ev(client, "landing_view", "c1", "A", utm_source="instagram", utm_campaign="set26", os="ios")
    _ev(client, "landing_download_click", "c1", "A", utm_source="instagram", utm_campaign="set26", os="ios")
    _ev(client, "landing_view", "c2", "A", utm_source="google", utm_campaign="busca", os="android", device_class="mobile")
    _ev(client, "landing_view", "c3", "A", props={"iab": "instagram"}, os="android")  # IAB sem UTM
    assert _summary(client, campaign="set26")["variants"]["A"]["visitors"] == 1
    assert _summary(client, os="android")["variants"]["A"]["visitors"] == 2
    assert _summary(client, source="google")["variants"]["A"]["visitors"] == 1
    ig = _summary(client, instagram="true")["variants"]["A"]
    assert ig["visitors"] == 2 and ig["clickers"] == 1
    opts = _summary(client, campaign="set26")["options"]
    assert "busca" in opts["campaigns"] and "android" in opts["os"]  # seletor não some ao filtrar


def test_breakdowns_by_campaign_device_and_day(client):
    _ev(client, "landing_view", "b1", "A", utm_campaign="x", os="ios")
    _ev(client, "landing_view", "b2", "A", os="windows", device_class="desktop")
    a = _summary(client)["variants"]["A"]
    assert {r["name"] for r in a["by_campaign"]} == {"x", bi.NO_CAMPAIGN}
    assert {r["name"] for r in a["by_device"]} == {"iPhone", "Computador"}
    assert len(a["daily"]) == 1 and a["daily"][0]["views"] == 2


def test_visitor_seen_in_both_variants_is_flagged(client):
    _ev(client, "landing_view", "x1", "A")
    _ev(client, "landing_view", "x1", "B")
    assert _summary(client)["quality"]["cross_variant_visitors"] == 1


def test_verdict_needs_sample_and_significance(client):
    r = _summary(client)
    assert r["verdict"]["status"] == "insufficient"
    # significativo: A 10% × B 30% com 150 visitantes cada
    for i in range(150):
        _ev(client, "landing_view", f"va{i}", "A")
        _ev(client, "landing_view", f"vb{i}", "B")
        if i < 15:
            _ev(client, "landing_download_click", f"va{i}", "A")
        if i < 45:
            _ev(client, "landing_download_click", f"vb{i}", "B")
    v = _summary(client)["verdict"]
    assert v["status"] == "significant" and v["leader"] == "B" and v["p_value"] < 0.05


def test_equal_rates_are_not_a_winner(client):
    for i in range(120):
        _ev(client, "landing_view", f"ea{i}", "A")
        _ev(client, "landing_view", f"eb{i}", "B")
        if i < 24:
            _ev(client, "landing_download_click", f"ea{i}", "A")
            _ev(client, "landing_download_click", f"eb{i}", "B")
    assert _summary(client)["verdict"]["status"] == "no_difference"


def test_signups_only_when_same_browser_and_installs_are_not_attributed(client):
    _ev(client, "landing_view", "u1", "B")
    client.post("/analytics/event", json={"event_id": "reg-1", "event_name": "register_completed", "anonymous_id": "u1"})
    client.post("/analytics/event", json={"event_id": "reg-2", "event_name": "register_completed", "anonymous_id": "estranho"})
    db = SessionLocal()
    try:
        db.add(AppInstall(platform="ios", utm_campaign="set26", created_at=datetime.now(timezone.utc)))
        db.commit()
    finally:
        db.close()
    s = _summary(client)
    assert s["variants"]["B"]["signups_attributed"] == 1 and s["variants"]["A"]["signups_attributed"] == 0
    assert s["installs"]["attributable_to_variant"] is False
    assert s["installs"]["total"] in (0, 1)  # respeita o corte de contagem das campanhas
    assert "não recebe" in s["installs"]["reason"]


def test_period_filter_and_auth(client):
    _ev(client, "landing_view", "t1", "A")
    future = (datetime.now(timezone.utc) + timedelta(days=2)).date().isoformat()
    assert _summary(client, since=future)["variants"]["A"]["views"] == 0
    assert client.get("/v1/admin/analytics/landing-ab").status_code in (401, 403)


def test_no_data_returns_zeros_not_invented_numbers(client):
    s = _summary(client)
    for v in ("A", "B"):
        assert s["variants"][v]["visitors"] == 0 and s["variants"][v]["conversion"] is None
        assert s["variants"][v]["daily"] == []


def test_period_days_param_is_supported(client):
    _ev(client, "landing_view", "pd1", "A")
    assert _summary(client, period_days=7)["variants"]["A"]["views"] == 1

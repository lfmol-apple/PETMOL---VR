"""Introdução em vídeo da landing (mobile): eventos gravados no servidor, funil por visitantes únicos,
separação do teste A/B e ausência de números inventados."""
from src.admin.analytics import landing_ab_bi as ab
from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def _hdr():
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == "leonardofmol@gmail.com").first()
        if not u:
            u = User(email="leonardofmol@gmail.com", password_hash=hash_password("x"), name="Admin")
            db.add(u); db.commit()
            db.add(AdminUser(user_id=u.id, role="master")); db.commit()
        return {"Authorization": f"Bearer {create_access_token(u.id)}"}
    finally:
        db.close()


def _ev(client, name, anon, *, n=[0], props=None, **extra):
    n[0] += 1
    body = {"event_id": f"i-{n[0]}-{anon}", "event_name": name, "anonymous_id": anon, "session_id": f"s-{anon}", "route": "/",
            "platform": "web", "os": "ios", "device_class": "mobile", "browser": "safari",
            "properties": {"experiment_id": ab.EXPERIMENT_ID, "variant": "A", "intro": "shown", **(props or {})}}
    body.update(extra)
    return client.post("/analytics/event", json=body)


def _s(client, path="/v1/admin/analytics/landing-intro", **params):
    r = client.get(path, params=params, headers=_hdr())
    assert r.status_code == 200, r.text
    return r.json()


def test_intro_events_keep_their_names(client):
    """`landing_intro_poster_view` termina em `_view` — não pode virar `screen_view`."""
    for n in ("landing_intro_poster_view", "landing_intro_watch_click", "landing_intro_video_start",
              "landing_intro_video_complete", "landing_intro_skip", "landing_intro_video_error"):
        assert _ev(client, n, "a").json()["accepted"] is True
    db = SessionLocal()
    try:
        stored = sorted(e.event_name for e in db.query(AnalyticsProductEvent).all())
    finally:
        db.close()
    assert stored == sorted(["landing_intro_poster_view", "landing_intro_watch_click", "landing_intro_video_start",
                             "landing_intro_video_complete", "landing_intro_skip", "landing_intro_video_error"])


def test_funnel_counts_unique_visitors_and_rates(client):
    for a in ("v1", "v2", "v3", "v4"):
        _ev(client, "landing_intro_poster_view", a)
    for a in ("v1", "v2", "v3"):
        _ev(client, "landing_intro_watch_click", a)
    for a in ("v1", "v2"):
        _ev(client, "landing_intro_video_start", a, props={"muted": False})
    _ev(client, "landing_intro_video_start", "v1", props={"muted": False})  # repetição: 1 visitante só
    _ev(client, "landing_intro_video_complete", "v1")
    _ev(client, "landing_intro_skip", "v2", props={"reason": "video", "watched_s": 6.2})
    _ev(client, "landing_intro_skip", "v4", props={"reason": "poster"})
    f = _s(client)["funnel"]
    assert (f["poster_visitors"], f["watch_visitors"], f["start_visitors"], f["complete_visitors"], f["skip_visitors"]) == (4, 3, 2, 1, 2)
    assert f["watch_rate"] == 0.75 and f["start_rate"] == round(2 / 3, 4) and f["complete_rate"] == 0.5 and f["skip_rate"] == 0.5
    sk = _s(client)["skips"]
    assert (sk["at_poster"], sk["during_video"], sk["median_watched_s"]) == (1, 1, 6.2)


def test_errors_grouped_by_reason(client):
    _ev(client, "landing_intro_video_error", "e1", props={"reason": "play_rejected"})
    _ev(client, "landing_intro_video_error", "e2", props={"reason": "play_rejected"})
    _ev(client, "landing_intro_video_error", "e3", props={"reason": "start_timeout"})
    e = _s(client)["errors"]
    assert e["total"] == 3 and e["by_reason"][0] == {"reason": "play_rejected", "count": 2}


def test_downloads_during_and_after_video_by_store_without_double_counting_people(client):
    for _ in range(3):  # 3 cliques da mesma pessoa durante o vídeo = 1 visitante
        _ev(client, "landing_download_click", "d1", props={"placement": "intro-video", "store": "apple", "button": "cta"})
    _ev(client, "landing_download_click", "d2", props={"placement": "hero-botao", "store": "google", "button": "cta"})
    _ev(client, "landing_download_click", "d1", props={"placement": "hero", "store": "apple", "button": "badge"})
    _ev(client, "landing_intro_poster_view", "d1"); _ev(client, "landing_intro_poster_view", "d2")
    d = _s(client)["downloads"]
    assert d["during_video"] == {"clicks": 3, "clickers": 1, "apple": 3, "google": 0, "auto": 0}
    assert d["after_video"] == {"clicks": 2, "clickers": 2, "apple": 1, "google": 1, "auto": 0}
    assert d["clickers_total"] == 2 and d["conversion_of_poster_viewers"] == 1.0


def test_without_intro_is_a_separate_audience_with_explicit_caveat(client):
    _ev(client, "landing_view", "n1", props={"intro": "none"}, os="windows", device_class="desktop")
    _ev(client, "landing_view", "n2", props={"intro": "none"})
    _ev(client, "landing_download_click", "n2", props={"intro": "none", "placement": "hero-botao", "store": "apple"})
    w = _s(client)["without_intro"]
    assert (w["visitors"], w["clickers"], w["conversion"]) == (2, 1, 0.5)
    assert "público" in w["note"] and "não um teste controlado" in w["note"]


def test_previews_are_ignored_and_filters_apply(client):
    _ev(client, "landing_intro_poster_view", "p1", props={"preview": True})
    _ev(client, "landing_intro_poster_view", "i1", utm_source="instagram", utm_campaign="set26")
    _ev(client, "landing_intro_poster_view", "g1", utm_source="google", utm_campaign="busca", os="android")
    assert _s(client)["funnel"]["poster_visitors"] == 2
    assert _s(client, instagram="true")["funnel"]["poster_visitors"] == 1
    assert _s(client, campaign="busca")["funnel"]["poster_visitors"] == 1
    assert _s(client, os="android")["funnel"]["poster_visitors"] == 1


def test_daily_series_uses_sao_paulo_days_and_empty_returns_none_not_invented(client):
    e = _s(client)
    assert e["funnel"]["poster_visitors"] == 0 and e["funnel"]["watch_rate"] is None and e["daily"] == []
    _ev(client, "landing_intro_poster_view", "x1")
    assert len(_s(client)["daily"]) == 1


def test_ab_panel_can_split_by_intro_and_old_events_count_as_without_intro(client):
    _ev(client, "landing_view", "a1", props={"intro": "shown", "variant": "A"})
    _ev(client, "landing_view", "a2", props={"variant": "A", "intro": None})  # evento antigo: sem a propriedade
    ab_url = "/v1/admin/analytics/landing-ab"
    assert _s(client, ab_url)["variants"]["A"]["visitors"] == 2
    assert _s(client, ab_url, intro="shown")["variants"]["A"]["visitors"] == 1
    assert _s(client, ab_url, intro="none")["variants"]["A"]["visitors"] == 1
    r = _s(client, ab_url, intro="none")
    assert r["filters"]["intro"] == "none"


def test_auth_required(client):
    assert client.get("/v1/admin/analytics/landing-intro").status_code in (401, 403)

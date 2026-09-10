"""Registro de 1ª abertura do app + relatório."""


def test_app_install_records_and_dedups(client):
    r = client.post("/analytics/app-install", json={"platform": "ios"},
                    headers={"X-Forwarded-For": "8.8.8.8"})
    assert r.status_code == 202
    assert r.json().get("ok") is True

    # mesmo IP+plataforma em 24h → dedup
    r2 = client.post("/analytics/app-install", json={"platform": "ios"},
                     headers={"X-Forwarded-For": "8.8.8.8"})
    assert r2.json().get("dedup") is True

    # plataforma diferente conta
    r3 = client.post("/analytics/app-install", json={"platform": "pwa"},
                     headers={"X-Forwarded-For": "8.8.8.8"})
    assert r3.json().get("ok") is True and not r3.json().get("dedup")

    from src.db import SessionLocal
    from src.analytics.install_models import AppInstall
    with SessionLocal() as db:
        assert db.query(AppInstall).count() >= 2


def test_app_install_bad_platform_falls_back_to_web(client):
    r = client.post("/analytics/app-install", json={"platform": "🤖haxor"},
                    headers={"X-Forwarded-For": "1.2.3.4"})
    assert r.status_code == 202
    from src.db import SessionLocal
    from src.analytics.install_models import AppInstall
    with SessionLocal() as db:
        row = db.query(AppInstall).filter(AppInstall.ip_hash.isnot(None)).order_by(AppInstall.created_at.desc()).first()
        assert row.platform == "web"


def test_daily_install_report_runs():
    from src.analytics.install_report import send_daily_install_report
    # sem SMTP configurado → send_mail devolve False, mas a função não lança
    assert send_daily_install_report() in (True, False)

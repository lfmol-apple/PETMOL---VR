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


def test_daily_install_report_only_downloads_with_cumulative(monkeypatch):
    """E-mail diário: só downloads — total do dia e acumulado por local;
    nenhum bloco de Petz/outros avisos."""
    from datetime import datetime, timedelta, timezone

    from src.analytics import install_report as report_mod
    from src.analytics.install_models import AppInstall
    from src.db import SessionLocal

    ontem = datetime.now(timezone.utc) - timedelta(days=1)
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", user_agent="x", city="Belo Horizonte", region="MG", country="BR", created_at=ontem),
            AppInstall(platform="android", ip_hash="b", user_agent="x", city="Belo Horizonte", region="MG", country="BR", created_at=ontem),
            AppInstall(platform="ios", ip_hash="c", user_agent="x", city="Recife", region="PE", country="BR",
                       created_at=datetime.now(timezone.utc) - timedelta(days=30)),
        ])
        db.commit()
    finally:
        db.close()

    captured = {}
    def fake_send_mail(*, to, subject, body_text, body_html=None, **kw):
        captured.update(subject=subject, text=body_text, html=body_html)
        return True
    monkeypatch.setattr("src.mailer.send_mail", fake_send_mail)

    assert report_mod.send_daily_install_report() is True
    assert "3 no total" in captured["subject"]
    assert "Acumulado: 3" in captured["text"]
    assert "Belo Horizonte" in captured["text"] and "Recife" in captured["text"]
    assert "Petz" not in captured["text"] and "Petz" not in captured["html"]

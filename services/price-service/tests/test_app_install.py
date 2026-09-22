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


def _set_campaign(monkeypatch, since_iso, baseline=13):
    from src.config import get_settings

    st = get_settings()
    monkeypatch.setattr(st, "install_count_since", since_iso, raising=False)
    monkeypatch.setattr(st, "install_count_baseline", baseline, raising=False)


def test_campaign_total_is_baseline_plus_installs_since_cutoff(monkeypatch):
    """Total = 13 já existentes + só as instalações a partir do corte; o que veio
    antes é teste e não conta (mas continua no banco)."""
    from datetime import datetime, timedelta, timezone

    from src.analytics.install_models import AppInstall, campaign_total
    from src.db import SessionLocal

    corte = datetime.now(timezone.utc) - timedelta(hours=2)
    _set_campaign(monkeypatch, corte.isoformat())
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add_all([
            AppInstall(platform="web", ip_hash="a", user_agent="x", created_at=corte - timedelta(days=3)),   # teste (antes)
            AppInstall(platform="ios", ip_hash="b", user_agent="x", created_at=corte - timedelta(minutes=1)),  # antes do corte
            AppInstall(platform="web", ip_hash="c", user_agent="x", created_at=corte + timedelta(minutes=5)),  # campanha
            AppInstall(platform="android", ip_hash="d", user_agent="x", created_at=corte + timedelta(minutes=30)),  # campanha
        ])
        db.commit()
        total, base, camp = campaign_total(db)
        assert (total, base, camp) == (15, 13, 2)
        assert db.query(AppInstall).count() == 4  # nada foi apagado
    finally:
        db.close()


def test_daily_install_report_counts_only_from_campaign_cutoff(monkeypatch):
    """E-mail diário: dia e acumulado só desde o corte; total = base + campanha."""
    from datetime import datetime, timedelta, timezone

    from src.analytics import install_report as report_mod
    from src.analytics.install_models import AppInstall
    from src.db import SessionLocal

    ontem = datetime.now(timezone.utc) - timedelta(days=1)
    _set_campaign(monkeypatch, (ontem - timedelta(hours=1)).isoformat())
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", user_agent="x", city="Belo Horizonte", region="MG", country="BR", created_at=ontem),
            AppInstall(platform="android", ip_hash="b", user_agent="x", city="Belo Horizonte", region="MG", country="BR", created_at=ontem),
            AppInstall(platform="ios", ip_hash="c", user_agent="x", city="Recife", region="PE", country="BR",
                       created_at=datetime.now(timezone.utc) - timedelta(days=30)),  # antes do corte: teste
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
    assert "15 no total" in captured["subject"]           # 13 base + 2 campanha
    assert "Acumulado: 15 (13 já existentes + 2 da campanha)" in captured["text"]
    assert "Belo Horizonte" in captured["text"]
    assert "Recife" not in captured["text"]                # instalação antiga não entra
    assert "Petz" not in captured["text"] and "Petz" not in captured["html"]


def test_install_platform_label_qualifies_web_by_user_agent():
    from src.analytics.router import _install_platform_label

    iphone_ua = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
    android_ua = "Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36"
    desktop_ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"

    assert _install_platform_label("web", iphone_ua) == "navegador (iPhone)"
    assert _install_platform_label("web", android_ua) == "navegador (Android)"
    assert _install_platform_label("web", desktop_ua) == "navegador (computador)"
    assert _install_platform_label("web", None) == "navegador"
    assert _install_platform_label("pwa", android_ua) == "app instalado (Android)"
    # nativo já é inequívoco — UA não altera o rótulo
    assert _install_platform_label("ios", android_ua) == "iPhone"


def test_app_install_push_includes_device_hint_for_web(monkeypatch):
    from uuid import uuid4

    from src.config import get_settings
    from src.db import SessionLocal
    from src.user_auth.models import User

    db = SessionLocal()
    try:
        admin_email = get_settings().admin_master_email.lower()
        if not db.query(User).filter(User.email == admin_email).first():
            db.add(User(email=admin_email, password_hash="x", name="Admin"))
            db.commit()
    finally:
        db.close()

    sent = []
    monkeypatch.setattr("src.notifications.push_to_user", lambda uid, payload: sent.append(payload))

    from src.analytics.router import _enrich_and_notify_install
    from src.analytics.install_models import AppInstall

    db = SessionLocal()
    try:
        row = AppInstall(
            platform="web",
            ip_hash=f"t{uuid4().hex[:12]}",
            user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)",
        )
        db.add(row)
        db.commit()
        row_id = row.id
    finally:
        db.close()

    _enrich_and_notify_install(row_id, None, "web")
    assert len(sent) == 1
    assert "navegador (iPhone)" in sent[0]["body"]
    # web = só acessou o site, não instalou nada — não é "download"
    assert sent[0]["title"] == "🌐 Novo acesso ao PETMOL"


def test_app_install_push_title_distinguishes_acesso_from_download(monkeypatch):
    """web = acesso (só abriu o site); ios/android/pwa = download de verdade
    (app nativo ou instalado na tela de início)."""
    from uuid import uuid4

    from src.config import get_settings
    from src.db import SessionLocal
    from src.user_auth.models import User

    db = SessionLocal()
    try:
        admin_email = get_settings().admin_master_email.lower()
        if not db.query(User).filter(User.email == admin_email).first():
            db.add(User(email=admin_email, password_hash="x", name="Admin"))
            db.commit()
    finally:
        db.close()

    sent = []
    monkeypatch.setattr("src.notifications.push_to_user", lambda uid, payload: sent.append(payload))

    from src.analytics.router import _enrich_and_notify_install
    from src.analytics.install_models import AppInstall

    titles = {}
    for platform in ("web", "pwa", "ios", "android"):
        db = SessionLocal()
        try:
            row = AppInstall(platform=platform, ip_hash=f"t{uuid4().hex[:12]}")
            db.add(row)
            db.commit()
            row_id = row.id
        finally:
            db.close()
        sent.clear()
        _enrich_and_notify_install(row_id, None, platform)
        titles[platform] = sent[0]["title"]

    assert titles["web"] == "🌐 Novo acesso ao PETMOL"
    assert titles["pwa"] == "📲 Novo download do PETMOL"
    assert titles["ios"] == "📲 Novo download do PETMOL"
    assert titles["android"] == "📲 Novo download do PETMOL"

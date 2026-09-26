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
    assert "2 downloads" in captured["subject"]
    assert "0 acessos" in captured["subject"]
    assert "2 downloads no total" in captured["subject"]   # só ios/android — sem web nesse cenário
    assert "Downloads — dia: 2 · acumulado: 2" in captured["text"]
    assert "Acessos — dia: 0 · acumulado: 0" in captured["text"]
    assert "Contador da campanha (tudo somado, como antes): 15 (13 já existentes + 2 desde o corte)" in captured["text"]
    assert "Belo Horizonte" in captured["text"]
    assert "Recife" not in captured["text"]                # instalação antiga não entra
    assert "Petz" not in captured["text"] and "Petz" not in captured["html"]


def test_daily_install_report_separates_downloads_from_web_access(monkeypatch):
    """web (só abriu o navegador) nunca conta como download — nem no dia,
    nem no acumulado, nem no local. A pedido do dono, mesma distinção do
    push de 'novo acesso' vs 'novo download'."""
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
            AppInstall(platform="pwa", ip_hash="b", user_agent="x", city="Belo Horizonte", region="MG", country="BR", created_at=ontem),
            AppInstall(platform="web", ip_hash="c", user_agent="x", city="Curitiba", region="PR", country="BR", created_at=ontem),
            AppInstall(platform="web", ip_hash="d", user_agent="x", city="Curitiba", region="PR", country="BR", created_at=ontem),
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
    assert "2 downloads" in captured["subject"]
    assert "2 acessos" in captured["subject"]
    assert "2 downloads no total" in captured["subject"]   # Curitiba (web) não entra no total de downloads
    assert "Downloads — dia: 2 · acumulado: 2" in captured["text"]
    assert "Acessos — dia: 2 · acumulado: 2" in captured["text"]
    # Belo Horizonte (ios+pwa) só na seção de downloads; Curitiba (web) só na de acessos
    down_section, acc_section = captured["text"].split("Acessos (dia / acumulado):")
    assert "Belo Horizonte" in down_section and "Curitiba" not in down_section
    assert "Curitiba" in acc_section and "Belo Horizonte" not in acc_section


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


def test_app_install_push_also_reaches_secondary_recipient_when_account_exists(monkeypatch):
    """settings.secondary_install_push_email recebe o MESMO push do admin
    (mesmo título/corpo) — mas com deep link pra /home, nunca /admin/dashboard,
    já que essa conta não é admin."""
    from uuid import uuid4

    from src.config import get_settings
    from src.db import SessionLocal
    from src.user_auth.models import User

    settings = get_settings()
    admin_email = settings.admin_master_email.lower()
    secondary_email = "contato+teste-push@vepiconsorcios.com.br"
    monkeypatch.setattr(settings, "secondary_install_push_email", secondary_email, raising=False)

    db = SessionLocal()
    try:
        if not db.query(User).filter(User.email == admin_email).first():
            db.add(User(email=admin_email, password_hash="x", name="Admin"))
        if not db.query(User).filter(User.email == secondary_email).first():
            db.add(User(email=secondary_email, password_hash="x", name="Vepi Consorcios"))
        db.commit()
    finally:
        db.close()

    sent_by_recipient = []
    monkeypatch.setattr(
        "src.notifications.push_to_user",
        lambda uid, payload: sent_by_recipient.append((uid, payload)),
    )

    from src.analytics.router import _enrich_and_notify_install
    from src.analytics.install_models import AppInstall

    db = SessionLocal()
    try:
        row = AppInstall(platform="ios", ip_hash=f"t{uuid4().hex[:12]}")
        db.add(row)
        db.commit()
        row_id = row.id
    finally:
        db.close()

    _enrich_and_notify_install(row_id, None, "ios")

    assert len(sent_by_recipient) == 2
    (admin_uid, admin_payload), (secondary_uid, secondary_payload) = sent_by_recipient
    assert admin_uid != secondary_uid
    assert admin_payload["title"] == secondary_payload["title"] == "📲 Novo download do PETMOL"
    assert admin_payload["body"] == secondary_payload["body"]
    assert admin_payload["data"]["url"] == "/admin/dashboard"
    assert secondary_payload["data"]["url"] == "/home"


def test_app_install_push_secondary_recipient_without_account_is_noop(monkeypatch):
    """E-mail configurado mas sem conta cadastrada ainda: só o push do admin
    sai, sem erro nenhum (best-effort, nunca derruba o fluxo)."""
    from uuid import uuid4

    from src.config import get_settings
    from src.db import SessionLocal
    from src.user_auth.models import User

    settings = get_settings()
    admin_email = settings.admin_master_email.lower()
    monkeypatch.setattr(
        settings, "secondary_install_push_email", "ninguem-com-essa-conta@example.com", raising=False
    )

    db = SessionLocal()
    try:
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
        row = AppInstall(platform="android", ip_hash=f"t{uuid4().hex[:12]}")
        db.add(row)
        db.commit()
        row_id = row.id
    finally:
        db.close()

    _enrich_and_notify_install(row_id, None, "android")
    assert len(sent) == 1


def test_mountain_view_is_never_a_download():
    from src.analytics.install_models import is_non_download_location

    assert is_non_download_location("Mountain View", "Califórnia", "Estados Unidos")
    assert is_non_download_location("mountain view", "California", "United States")
    assert not is_non_download_location("São Paulo", "São Paulo", "Brasil")
    assert not is_non_download_location("Mountain View", "Arkansas", "Brasil")
    assert not is_non_download_location(None)


def test_enrichment_reclassifies_mountain_view_as_web(monkeypatch):
    from src.analytics import router as r
    from src.analytics.install_models import AppInstall
    from src.db import SessionLocal
    import src.geoip as geoip

    monkeypatch.setattr(geoip, "geoip_lookup", lambda ip: {
        "city": "Mountain View", "region": "Califórnia", "country": "Estados Unidos"})
    with SessionLocal() as db:
        row = AppInstall(platform="android", ip_hash="mvtest")
        db.add(row)
        db.commit()
        rid = row.id
    r._enrich_and_notify_install(rid, "8.8.4.4", "android")
    with SessionLocal() as db:
        assert db.query(AppInstall).get(rid).platform == "web"


def test_app_install_push_reaches_every_configured_recipient(monkeypatch):
    """gerenciamento@ (extra) e o secundário recebem o MESMO push do admin; e-mail repetido
    ou igual ao do admin não duplica; conta inexistente é ignorada sem derrubar os outros."""
    from uuid import uuid4

    from src.config import get_settings
    from src.db import SessionLocal
    from src.user_auth.models import User

    settings = get_settings()
    admin_email = settings.admin_master_email.lower()
    tag = uuid4().hex[:6]
    second, mgmt = f"segundo-{tag}@example.com", f"gerenciamento-{tag}@petmol.com.br"
    monkeypatch.setattr(settings, "secondary_install_push_email", second, raising=False)
    monkeypatch.setattr(
        settings, "extra_install_push_emails", f" {mgmt.upper()} ,{second},{admin_email},sem-conta-{tag}@example.com", raising=False
    )

    db = SessionLocal()
    try:
        for email in (admin_email, second, mgmt):
            if not db.query(User).filter(User.email == email).first():
                db.add(User(email=email, password_hash="x", name="T"))
        db.commit()
        uids = {e: str(db.query(User).filter(User.email == e).first().id) for e in (admin_email, second, mgmt)}
    finally:
        db.close()

    sent = []
    monkeypatch.setattr("src.notifications.push_to_user", lambda uid, payload: sent.append((uid, payload)))

    from src.analytics.router import _enrich_and_notify_install
    from src.analytics.install_models import AppInstall

    db = SessionLocal()
    try:
        row = AppInstall(platform="ios", ip_hash=f"t{uuid4().hex[:12]}")
        db.add(row)
        db.commit()
        row_id = row.id
    finally:
        db.close()

    _enrich_and_notify_install(row_id, None, "ios")

    assert sorted(u for u, _ in sent) == sorted(uids.values())  # 3 destinatários, cada um 1 vez
    assert len({p["title"] + p["body"] for _, p in sent}) == 1  # mesmo push para todos
    assert dict(sent)[uids[admin_email]]["data"]["url"] == "/admin/dashboard"
    assert dict(sent)[uids[mgmt]]["data"]["url"] == "/home"

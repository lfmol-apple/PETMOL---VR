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


def test_daily_install_report_warns_about_petz_id_conflicts(monkeypatch):
    """O e-mail diário avisa sozinho quando algum mapeamento Petz já
    confirmado compartilha id com peso/tamanho diferente — o admin não
    precisa testar produto por produto pra descobrir."""
    from src.db import SessionLocal
    from src.product_catalog_lookup import ProductCatalog
    from src.petz_mapping import confirm_petz_mapping
    from src.analytics import install_report as report_mod

    db = SessionLocal()
    try:
        p1 = ProductCatalog(barcode="9990000000901", barcode_normalized="9990000000901",
                             name="Ração Conflito 2kg", brand="X", weight_kg=2.0)
        p2 = ProductCatalog(barcode="9990000000902", barcode_normalized="9990000000902",
                             name="Ração Conflito 7,5kg", brand="X", weight_kg=7.5)
        db.add_all([p1, p2])
        db.commit()
        db.refresh(p1)
        db.refresh(p2)
        confirm_petz_mapping(db, p2.id, petz_product_id="999900",
                              product_url="https://www.petz.com.br/produto/racao-conflito-999900")
    finally:
        db.close()

    from src.affiliate_links import _PETZ_GTIN_PRODUCT_ID_SEED, _petz_gtin_product_id_map
    monkeypatch.setitem(_PETZ_GTIN_PRODUCT_ID_SEED, "9990000000901", "999900")
    _petz_gtin_product_id_map.cache_clear()

    captured = {}
    def fake_send_mail(*, to, subject, body_text, body_html=None, **kw):
        captured["text"] = body_text
        captured["html"] = body_html
        return True
    monkeypatch.setattr("src.mailer.send_mail", fake_send_mail)

    try:
        assert report_mod.send_daily_install_report() is True
        assert "id compartilhado por peso" in captured["text"]
        assert "id compartilhado" in captured["html"]
    finally:
        _petz_gtin_product_id_map.cache_clear()

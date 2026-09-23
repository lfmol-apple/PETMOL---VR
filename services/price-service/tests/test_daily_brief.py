"""Resumo do dia (aba "Hoje" + boletim por e-mail) — mesma fonte, dia civil
de America/Sao_Paulo, comparação com dia anterior e média de 7 dias."""
from datetime import date, datetime, timedelta, timezone

from src.admin.analytics import briefing_bi
from src.admin.models import AdminUser
from src.analytics.daily_brief_email import render, send_daily_brief
from src.analytics.install_models import AppInstall
from src.analytics.models import AnalyticsProductEvent
from src.config import get_settings
from src.db import SessionLocal
from src.missing_pets import MissingPet
from src.moderation.models import PhotoModerationDecision
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

DAY = date(2026, 9, 22)
# 15:00 UTC = 12:00 em SP — dentro do dia 22 nos dois fusos
NOON = datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc)


def _cutoff(monkeypatch, iso="2026-09-01T00:00:00-03:00"):
    monkeypatch.setattr(get_settings(), "install_count_since", iso, raising=False)


def _clean(db):
    for m in (AppInstall, AnalyticsProductEvent, Pet, MissingPet, PhotoModerationDecision):
        db.query(m).delete()
    db.query(User).filter(User.email.like("%@brief.test")).delete(synchronize_session=False)
    db.query(User).filter(User.email.like("%@petmol.guest")).delete(synchronize_session=False)
    db.commit()


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


def test_day_window_e_meia_noite_de_sao_paulo_em_utc():
    start, end = briefing_bi.day_window(DAY)
    assert start.isoformat() == "2026-09-22T03:00:00+00:00"
    assert end.isoformat() == "2026-09-23T03:00:00+00:00"


def test_metricas_do_dia_contam_so_o_que_e_do_dia_e_ignoram_guest(monkeypatch):
    _cutoff(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        u = User(email="a@brief.test", password_hash="x", name="A", created_at=NOON)
        guest = User(email="g@petmol.guest", password_hash="x", name="G", created_at=NOON)
        db.add_all([u, guest])
        db.commit()
        db.add(Pet(user_id=u.id, name="Rex", species="dog", created_at=NOON))
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", created_at=NOON),
            AppInstall(platform="android", ip_hash="b", created_at=NOON),
            AppInstall(platform="web", ip_hash="c", created_at=NOON),          # acesso, não download
            AppInstall(platform="ios", ip_hash="d", created_at=NOON - timedelta(days=2)),  # outro dia
        ])
        db.add_all([
            AnalyticsProductEvent(event_id="e1", event_name="session_start", platform="web",
                                  anonymous_id="x", received_at=NOON),
            AnalyticsProductEvent(event_id="e2", event_name="app_open", platform="ios_capacitor",
                                  user_id=u.id, received_at=NOON),
            AnalyticsProductEvent(event_id="e3", event_name="screen_view", platform="web",
                                  anonymous_id="x", received_at=NOON),          # não é âncora
            AnalyticsProductEvent(event_id="e4", event_name="store_opened", platform="web",
                                  anonymous_id="x", received_at=NOON),
            AnalyticsProductEvent(event_id="e5", event_name="commerce_click", platform="web",
                                  anonymous_id="x", received_at=NOON),
        ])
        db.commit()
        m = briefing_bi.window_metrics(db, *briefing_bi.day_window(DAY))
    finally:
        db.close()

    assert m["downloads"] == 2
    assert m["acessos"] == 2 and m["visitantes"] == 2
    assert m["cadastros"] == 1          # guest fora
    assert m["pets_novos"] == 1
    assert m["ativos"] == 1
    assert m["loja_aberturas"] == 1 and m["loja_cliques"] == 1


def test_downloads_antes_do_corte_da_campanha_nao_contam(monkeypatch):
    _cutoff(monkeypatch, "2026-09-22T12:00:00+00:00")   # corte no meio do dia
    db = SessionLocal()
    try:
        _clean(db)
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", created_at=datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)),  # teste
            AppInstall(platform="ios", ip_hash="b", created_at=datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc)),  # conta
        ])
        db.commit()
        assert briefing_bi.window_metrics(db, *briefing_bi.day_window(DAY))["downloads"] == 1
    finally:
        db.close()


def test_comparacao_com_dia_anterior_e_media_de_7_dias(monkeypatch):
    _cutoff(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        # hoje(22): 4 downloads · ontem(21): 2 · dias 15–20: 1 cada (6)
        db.add_all([AppInstall(platform="ios", ip_hash=f"t{i}", created_at=NOON) for i in range(4)])
        db.add_all([AppInstall(platform="ios", ip_hash=f"y{i}", created_at=NOON - timedelta(days=1)) for i in range(2)])
        db.add_all([AppInstall(platform="ios", ip_hash=f"h{i}", created_at=NOON - timedelta(days=i)) for i in range(2, 8)])
        db.commit()
        brief = briefing_bi.build_brief(db, DAY)
    finally:
        db.close()
    d = brief["metrics"]["downloads"]
    assert d["value"] == 4 and d["prev"] == 2
    assert d["delta_prev_pct"] == 100.0
    assert d["avg7"] == round((2 + 6) / 7, 1)
    # sem histórico de cadastros: sem base, nunca "infinito%"
    assert brief["metrics"]["cadastros"]["delta_prev_pct"] is None


def test_atencao_lista_moderacao_pendente_e_tutores_parados(monkeypatch):
    monkeypatch.setattr("src.runtime_metrics.request_metrics_summary", lambda **kw: {})
    db = SessionLocal()
    try:
        _clean(db)
        now = datetime.now(timezone.utc)
        db.add(User(email="parado@brief.test", password_hash="x", name="P", created_at=now - timedelta(days=10)))
        db.add(PhotoModerationDecision(context="pet_profile", storage_key="k", status="pending"))
        db.commit()
        items = briefing_bi._attention(db, now)
    finally:
        db.close()
    keys = {i["key"] for i in items}
    assert {"moderation", "stuck_no_pet"} <= keys
    assert next(i for i in items if i["key"] == "moderation")["severity"] == "attention"


def test_endpoints_today_e_brief_exigem_admin_e_devolvem_o_resumo(client, monkeypatch):
    assert client.get("/v1/admin/analytics/today").status_code in (401, 403)
    headers = _admin_headers()

    r = client.get("/v1/admin/analytics/today", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["is_today"] is True
    assert {"downloads", "acessos", "cadastros", "ativos"} <= set(body["metrics"])

    r2 = client.get("/v1/admin/analytics/brief", params={"day": "2026-09-22"}, headers=headers)
    assert r2.status_code == 200 and r2.json()["label"] == "22/09/2026"
    assert client.get("/v1/admin/analytics/brief", params={"day": "2026-13-45"}, headers=headers).status_code == 400
    assert client.get("/v1/admin/analytics/brief", params={"day": "ontem"}, headers=headers).status_code == 422


def test_email_tem_manchete_secoes_e_escapa_html(monkeypatch):
    _cutoff(monkeypatch)
    # métricas de API são em memória do processo (contam requests de OUTROS
    # testes da suíte) — isola pra o teste só ver a fila de moderação
    monkeypatch.setattr("src.runtime_metrics.request_metrics_summary", lambda **kw: {})
    db = SessionLocal()
    try:
        _clean(db)
        db.add(AppInstall(platform="ios", ip_hash="a", city="Belo Horizonte", region="MG",
                          utm_source="meta", utm_campaign="<script>x</script>", created_at=NOON))
        db.add(PhotoModerationDecision(context="pet_profile", storage_key="k", status="pending"))
        db.commit()
        brief = briefing_bi.build_brief(db, DAY)
    finally:
        db.close()

    subject, text, html = render(brief, app_url="https://petmol.com.br")
    assert subject.startswith("PETMOL 22/09: 1 downloads")
    assert "⚠ 1 atenção" in subject
    assert "Belo Horizonte" in html and "Funil do dia" in html and "Precisa de você" in html
    assert "<script>x</script>" not in html and "&lt;script&gt;" in html       # nada de HTML injetado
    assert "https://petmol.com.br/admin/dashboard" in html and "https://petmol.com.br/admin/dashboard" in text
    assert "não é o número confirmado pela" in text


def test_send_daily_brief_manda_pro_admin_com_dia_anterior_por_padrao(monkeypatch):
    sent = []
    monkeypatch.setattr("src.mailer.send_mail",
                        lambda *, to, subject, body_text, body_html=None, **kw: (sent.append((to, subject, body_html)) or True))
    assert send_daily_brief(DAY) is True
    to, subject, html = sent[0]
    assert to == get_settings().admin_master_email
    assert "22/09" in subject and html

    sent.clear()
    assert send_daily_brief() is True          # sem argumento = dia anterior fechado
    ontem = (datetime.now(briefing_bi._BR) - timedelta(days=1)).strftime("%d/%m")
    assert ontem in sent[0][1]

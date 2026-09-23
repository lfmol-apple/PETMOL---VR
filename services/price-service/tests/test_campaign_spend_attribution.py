"""Campanhas de ponta a ponta: cadastro atribuído ao primeiro toque com
campanha do aparelho, gasto lançado à mão, custo por download/cadastro,
e o corte da campanha valendo em todo lugar."""
from datetime import date, datetime, timedelta, timezone

from src.admin.analytics import campaign_bi
from src.admin.models import AdminUser
from src.analytics.install_models import AppInstall
from src.analytics.models import AnalyticsProductEvent
from src.analytics.spend_models import CampaignSpend
from src.config import get_settings
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

T0 = datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc)      # 12:00 em SP
SINCE = datetime(2026, 9, 22, 3, 0, tzinfo=timezone.utc)    # 00:00 SP do dia 22
UNTIL = datetime(2026, 9, 23, 3, 0, tzinfo=timezone.utc)    # 00:00 SP do dia 23 (exclusivo)


def _cutoff(monkeypatch, iso="2026-09-01T00:00:00-03:00"):
    monkeypatch.setattr(get_settings(), "install_count_since", iso, raising=False)


def _clean(db):
    for m in (AppInstall, AnalyticsProductEvent, CampaignSpend):
        db.query(m).delete()
    db.query(User).filter(User.email.like("%@camp.test")).delete(synchronize_session=False)
    db.query(User).filter(User.email.like("%@petmol.guest")).delete(synchronize_session=False)
    db.commit()


def _user(db, name, created=T0, email=None):
    u = User(email=email or f"{name}@camp.test", password_hash="x", name=name, created_at=created)
    db.add(u)
    db.commit()
    return u


def _anchor(eid, anon, at, **kw):
    return AnalyticsProductEvent(event_id=eid, event_name="session_start", platform="web",
                                 anonymous_id=anon, received_at=at, **kw)


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


def _row(summary, name):
    return next(c for c in summary["campaigns"] if c["utm_campaign"] == name)


# ── Cadastro por campanha ─────────────────────────────────────────────

def test_cadastro_e_atribuido_ao_primeiro_toque_com_campanha_do_aparelho(monkeypatch):
    _cutoff(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        a = _user(db, "ana")          # veio de campanha
        b = _user(db, "bia")          # organico: anchors sem UTM
        c = _user(db, "cris")         # sem vínculo de aparelho
        d = _user(db, "duda")         # 1º toque orgânico, depois campanha → campanha vence
        _user(db, "guest", email="g@petmol.guest")            # convidado não conta
        _user(db, "antiga", created=T0 - timedelta(days=5))   # fora do período
        db.add_all([
            _anchor("e1", "anonA", T0 - timedelta(hours=2), utm_source="meta", utm_medium="cpc", utm_campaign="lancamento"),
            AnalyticsProductEvent(event_id="e1b", event_name="screen_view", platform="web", anonymous_id="anonA",
                                  user_id=a.id, received_at=T0),
            _anchor("e2", "anonB", T0 - timedelta(hours=2)),
            AnalyticsProductEvent(event_id="e2b", event_name="screen_view", platform="web", anonymous_id="anonB",
                                  user_id=b.id, received_at=T0),
            _anchor("e4a", "anonD", T0 - timedelta(hours=5)),
            _anchor("e4b", "anonD", T0 - timedelta(hours=3), utm_source="google", utm_campaign="busca"),
            AnalyticsProductEvent(event_id="e4c", event_name="screen_view", platform="web", anonymous_id="anonD",
                                  user_id=d.id, received_at=T0),
        ])
        db.commit()
        s = campaign_bi.campaign_summary(db, since=SINCE, until=UNTIL)
    finally:
        db.close()

    assert _row(s, "lancamento")["cadastros"] == 1
    assert _row(s, "busca")["cadastros"] == 1                      # primeiro toque COM campanha vence o orgânico
    assert _row(s, campaign_bi.NO_CAMPAIGN)["cadastros"] == 1      # bia
    assert _row(s, campaign_bi.UNTRACKED)["cadastros"] == 1        # cris — nunca inventa origem
    assert s["totals"]["cadastros"] == 4                           # guest e "antiga" fora


# ── Gasto e custo ─────────────────────────────────────────────────────

def test_custo_por_download_e_por_cadastro_e_gasto_sem_retorno_aparece(monkeypatch):
    _cutoff(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        u1, u2 = _user(db, "u1"), _user(db, "u2")
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", utm_source="meta", utm_campaign="Lancamento", created_at=T0),
            AppInstall(platform="android", ip_hash="b", utm_source="meta", utm_campaign="lancamento", created_at=T0),
            _anchor("e1", "x1", T0, utm_source="meta", utm_campaign="lancamento"),
            _anchor("e2", "x2", T0, utm_source="meta", utm_campaign="lancamento"),
            AnalyticsProductEvent(event_id="l1", event_name="screen_view", platform="web", anonymous_id="x1",
                                  user_id=u1.id, received_at=T0),
            AnalyticsProductEvent(event_id="l2", event_name="screen_view", platform="web", anonymous_id="x2",
                                  user_id=u2.id, received_at=T0),
        ])
        db.add_all([
            CampaignSpend(utm_campaign="LANCAMENTO", spent_on=date(2026, 9, 22), amount_cents=20000),   # maiúscula diferente
            CampaignSpend(utm_campaign="lancamento", spent_on=date(2026, 9, 20), amount_cents=99900),   # fora do período
            CampaignSpend(utm_campaign="tiktok_teste", spent_on=date(2026, 9, 22), amount_cents=5000),  # sem tráfego
        ])
        db.commit()
        s = campaign_bi.campaign_summary(db, since=SINCE, until=UNTIL)
    finally:
        db.close()

    r = _row(s, "Lancamento")
    assert r["downloads"] == 2 and r["cadastros"] == 2
    assert r["gasto_brl"] == 200.0
    assert r["custo_por_download"] == 100.0 and r["custo_por_cadastro"] == 100.0
    # gasto sem retorno continua visível — é a informação mais importante
    t = _row(s, "tiktok_teste")
    assert t["gasto_brl"] == 50.0 and t["downloads"] == 0 and t["custo_por_download"] is None
    assert s["totals"]["gasto_brl"] == 250.0


def test_gasto_de_ontem_nao_entra_quando_o_periodo_e_hoje(monkeypatch):
    """`until` é o início do dia seguinte (exclusivo) — o gasto do dia
    seguinte não pode vazar pra dentro do período."""
    _cutoff(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        db.add_all([
            CampaignSpend(utm_campaign="c", spent_on=date(2026, 9, 22), amount_cents=1000),
            CampaignSpend(utm_campaign="c", spent_on=date(2026, 9, 23), amount_cents=7000),
        ])
        db.commit()
        s = campaign_bi.campaign_summary(db, since=SINCE, until=UNTIL)
    finally:
        db.close()
    assert _row(s, "c")["gasto_brl"] == 10.0


def test_endpoints_de_gasto_exigem_jwt_de_admin_e_validam(client, monkeypatch):
    _cutoff(monkeypatch)
    headers = _admin_headers()
    monkeypatch.setattr(get_settings(), "admin_ops_api_key", "test-ops-key", raising=False)
    db = SessionLocal()
    try:
        _clean(db)
    finally:
        db.close()

    body = {"utm_campaign": "meta_lancamento", "amount_brl": 150.5, "spent_on": "2026-09-22", "note": "carrossel"}
    assert client.post("/v1/admin/analytics/campaign-spend", json=body).status_code in (401, 403)
    # a chave de leitura NUNCA escreve
    assert client.post("/v1/admin/analytics/campaign-spend", json=body,
                       headers={"X-Admin-Api-Key": "test-ops-key"}).status_code in (401, 403)

    r = client.post("/v1/admin/analytics/campaign-spend", json=body, headers=headers)
    assert r.status_code == 201, r.text
    assert r.json()["amount_brl"] == 150.5
    spend_id = r.json()["id"]

    lst = client.get("/v1/admin/analytics/campaign-spend", headers=headers).json()["items"]
    assert lst[0]["utm_campaign"] == "meta_lancamento" and lst[0]["note"] == "carrossel"

    assert client.post("/v1/admin/analytics/campaign-spend", json={**body, "amount_brl": 0}, headers=headers).status_code == 422
    assert client.post("/v1/admin/analytics/campaign-spend", json={**body, "utm_campaign": "   "}, headers=headers).status_code == 422

    assert client.delete(f"/v1/admin/analytics/campaign-spend/{spend_id}", headers=headers).status_code == 200
    assert client.delete(f"/v1/admin/analytics/campaign-spend/{spend_id}", headers=headers).status_code == 404
    assert client.get("/v1/admin/analytics/campaign-spend", headers=headers).json()["items"] == []


# ── Corte da campanha em todo lugar ───────────────────────────────────

def test_instalacao_antes_do_corte_nao_conta_em_campanhas_nem_no_card(client, monkeypatch):
    _cutoff(monkeypatch, "2026-09-22T12:00:00+00:00")
    headers = _admin_headers()
    db = SessionLocal()
    try:
        _clean(db)
        db.add_all([
            AppInstall(platform="ios", ip_hash="a", utm_campaign="c", created_at=datetime(2026, 9, 22, 10, 0, tzinfo=timezone.utc)),  # teste
            AppInstall(platform="ios", ip_hash="b", utm_campaign="c", created_at=datetime(2026, 9, 22, 13, 0, tzinfo=timezone.utc)),  # conta
        ])
        db.commit()
        s = campaign_bi.campaign_summary(db, since=SINCE, until=UNTIL)
    finally:
        db.close()
    assert _row(s, "c")["downloads"] == 1

    ov = client.get("/v1/admin/analytics/overview", headers=headers).json()
    assert ov["downloads"]["total"] == 1     # "Tudo" não soma instalação de teste

"""Avisos de push aos destinatários (admin + parceiros) nos 4 momentos: download, 1º pet, 1ª ração, 1ª notificação.
E o boletim diário com Downloads → Cadastros completos → Alimentação → Notificações + ranking de cidades."""
import uuid
from datetime import date, datetime, timedelta, timezone

from src import admin_alerts
from src.admin.analytics import briefing_bi
from src.analytics.daily_brief_email import render, send_daily_brief
from src.analytics.install_models import AppInstall
from src.config import get_settings
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import NativePushToken, PushSubscription
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

MASTER = "leonardofmol@gmail.com"
PARTNER = "contato@vepiconsorcios.com.br"


def _user(db, email, name="Tutor"):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        return existing.id
    u = User(id=str(uuid.uuid4()), email=email, name=name, password_hash=hash_password("x"))
    db.add(u)
    db.commit()
    return u.id


def _setup(monkeypatch):
    sent = []
    monkeypatch.setattr("src.notifications.push_to_user", lambda uid, payload, *a, **k: sent.append((uid, payload)) or 1)
    db = SessionLocal()
    try:
        ids = {"master": _user(db, MASTER, "Leo"), "partner": _user(db, PARTNER, "Henrique")}
        ids["tutor"] = _user(db, f"tutora.{uuid.uuid4().hex[:6]}@example.com", "Karen Reis")
    finally:
        db.close()
    return sent, ids


def test_primeira_alimentacao_avisa_os_dois_uma_vez_so(monkeypatch):
    sent, ids = _setup(monkeypatch)
    admin_alerts._notify_first_feeding(ids["tutor"], "Mel")
    assert {uid for uid, _ in sent} == {ids["master"], ids["partner"]}
    assert all("Karen cadastrou a ração" in p["title"] for _, p in sent)

    sent.clear()
    admin_alerts._notify_first_feeding(ids["tutor"], "Mel")     # a mesma tutora de novo: nada
    assert sent == []


def test_notificacao_ativada_avisa_os_dois_e_nao_repete(monkeypatch):
    sent, ids = _setup(monkeypatch)
    admin_alerts._notify_push_enabled(ids["tutor"])
    assert {uid for uid, _ in sent} == {ids["master"], ids["partner"]}
    assert "ativou as notificações" in sent[0][1]["title"]
    sent.clear()
    admin_alerts._notify_push_enabled(ids["tutor"])
    assert sent == []


def test_primeiro_pet_avisa_os_dois_e_so_o_primeiro(monkeypatch):
    sent, ids = _setup(monkeypatch)
    db = SessionLocal()
    try:
        db.add(Pet(id=str(uuid.uuid4()), user_id=ids["tutor"], name="Mel", species="dog"))
        db.commit()
    finally:
        db.close()
    admin_alerts._notify_first_pet(ids["tutor"], "dog")
    assert {uid for uid, _ in sent} == {ids["master"], ids["partner"]}
    assert "cadastrou o 1º pet" in sent[0][1]["title"]


def test_nao_avisa_sobre_o_proprio_destinatario(monkeypatch):
    sent, ids = _setup(monkeypatch)
    admin_alerts._notify_first_feeding(ids["partner"], "Rex")   # conta de teste do próprio Henrique
    assert sent == []


def test_conta_criada_nao_avisa_mais(monkeypatch):
    sent, ids = _setup(monkeypatch)
    admin_alerts._notify_account_created(ids["tutor"], "1.2.3.4")
    assert sent == []


def test_inscrever_push_so_avisa_na_primeira_vez_do_tutor(monkeypatch, client):
    calls = []
    monkeypatch.setattr("src.admin_alerts.notify_push_enabled", lambda uid: calls.append(uid))
    db = SessionLocal()
    try:
        uid = _user(db, f"novo.{uuid.uuid4().hex[:6]}@example.com", "Novo")
    finally:
        db.close()
    headers = {"Authorization": f"Bearer {create_access_token(uid)}"}
    sub = lambda n: {"subscription": {"endpoint": f"https://push.example/{uid}/{n}", "keys": {"p256dh": "k", "auth": "a"}}}  # noqa: E731
    assert client.post("/notifications/subscribe", json=sub(1), headers=headers).status_code == 200
    assert calls == [uid]
    # reinscrever o mesmo aparelho / registrar outro: não é a "primeira notificação"
    assert client.post("/notifications/subscribe", json=sub(1), headers=headers).status_code == 200
    assert client.post("/notifications/subscribe", json=sub(2), headers=headers).status_code == 200
    assert calls == [uid]


def test_boletim_conta_marcos_e_tem_ranking_de_cidades(monkeypatch):
    monkeypatch.setattr(get_settings(), "install_count_since", "2026-09-01T00:00:00-03:00", raising=False)
    monkeypatch.setattr("src.runtime_metrics.request_metrics_summary", lambda **kw: {})
    day = date(2026, 9, 22)
    noon = datetime(2026, 9, 22, 15, 0, tzinfo=timezone.utc)
    db = SessionLocal()
    try:
        for m in (AppInstall, FeedingPlan, NativePushToken, PushSubscription, Pet):
            db.query(m).delete()
        db.query(User).filter(User.email.like("%@brief2.test")).delete(synchronize_session=False)
        db.commit()
        uid = _user(db, f"t.{uuid.uuid4().hex[:6]}@brief2.test", "Rita")
        pet = Pet(id=str(uuid.uuid4()), user_id=uid, name="Bolt", species="dog", created_at=noon)
        db.add(pet)
        db.commit()
        db.add(FeedingPlan(id=str(uuid.uuid4()), pet_id=pet.id, species="dog", country_code="BR",
                           food_brand="Golden", created_at=noon))
        db.add(NativePushToken(user_id=uid, platform="ios", token="t", created_at=noon))
        for city in ("Osasco", "Osasco", "Barueri"):
            db.add(AppInstall(platform="android", ip_hash=uuid.uuid4().hex[:8], city=city, region="SP", created_at=noon))
        db.commit()
        brief = briefing_bi.build_brief(db, day)
    finally:
        db.close()

    m = brief["metrics"]
    assert (m["cadastros_completos"]["value"], m["racao_primeira"]["value"], m["notificacao_primeira"]["value"]) == (1, 1, 1)
    assert [f["label"] for f in brief["funnel"]] == [
        "Downloads", "Cadastros", "Cadastros completos", "Alimentação cadastrada", "Notificações ativadas"]
    assert [c["city"] for c in brief["cities_downloads"]] == ["Osasco", "Barueri"]
    assert brief["cities_downloads"][0]["downloads"] == 2

    subject, text, html = render(brief, app_url="https://x", audience="partner")
    assert subject.startswith("PETMOL 22/09: 3 downloads · 1 cadastros completos · 1 ração · 1 notificações")
    assert "Ranking de downloads por cidade" in html and "Osasco" in html
    assert "/admin/dashboard" not in html and "Precisa de você" not in html     # parceiro: sem painel nem atenção


def test_boletim_vai_ao_admin_completo_e_ao_parceiro_enxuto(monkeypatch):
    sent = []
    monkeypatch.setattr("src.mailer.send_mail",
                        lambda *, to, subject, body_text, body_html=None, **kw: (sent.append((to, body_html)) or True))
    assert send_daily_brief(date(2026, 9, 22)) is True
    to = [t for t, _ in sent]
    assert to[0] == get_settings().admin_master_email and PARTNER in to
    partner_html = next(h for t, h in sent if t == PARTNER)
    assert "Abrir o Mission Control" not in partner_html
    assert "Abrir o Mission Control" in sent[0][1]

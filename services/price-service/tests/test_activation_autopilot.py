"""Piloto automático de ativação — limites para não ser chato."""
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from src import activation_autopilot as ap
from src.admin import activation_campaign_router as ac
from src.config import get_settings
from src.db import SessionLocal
from src.notifications import PushSubscription
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password

BR = ZoneInfo("America/Sao_Paulo")
AT_11 = datetime(2026, 10, 15, 11, 0, tzinfo=BR)
AT_22 = datetime(2026, 10, 15, 22, 0, tzinfo=BR)


def _user(db, tag, *, push=False, pet=True, age=10, name=None):
    u = User(id=str(uuid.uuid4()), email=f"{tag}.{uuid.uuid4().hex[:6]}@ap.test", name=name or tag,
             password_hash=hash_password("x"), created_at=datetime.now(timezone.utc) - timedelta(days=age))
    db.add(u); db.commit()
    if pet:
        db.add(Pet(id=str(uuid.uuid4()), user_id=u.id, name="Mel", species="dog")); db.commit()
    if push:
        db.add(PushSubscription(id=str(uuid.uuid4()), user_id=u.id, endpoint=f"https://p/{u.id}", p256dh="k", auth="a")); db.commit()
    return u.id


def _clean(db):
    for m in (ac.ActivationCampaignContact, ac.ActivationOptOut, ac.ActivationSetting, PushSubscription, Pet):
        db.query(m).delete()
    db.query(User).filter(User.email.like("%@ap.test")).delete(synchronize_session=False)
    db.commit()


def _patch(monkeypatch):
    out = {"mail": [], "push": []}
    monkeypatch.setattr(ap, "send_mail", lambda **kw: out["mail"].append(kw) or True)
    monkeypatch.setattr(ap, "push_to_user", lambda uid, payload: out["push"].append((uid, payload)) or 1)
    monkeypatch.setattr(ap, "_sleep", lambda s: None)
    return out


def test_push_so_push_e_email_so_para_quem_nao_tem_aparelho(monkeypatch):
    out = _patch(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        a = _user(db, "comPush", push=True); b = _user(db, "semPush")
    finally:
        db.close()
    r = ap.run_autopilot(now=AT_11)
    assert r["food_push"] == 1 and r["food_email"] >= 1
    assert [uid for uid, _ in out["push"]] == [a]
    assert not any(m["to"].startswith("comPush") for m in out["mail"])        # com push: não recebe e-mail
    mail = next(m for m in out["mail"] if m["to"].startswith("semPush"))
    assert "estes lembretes" in mail["body_text"]                                # rodapé de descadastro
    assert "unsubscribe-reminders" in mail["body_text"]


def test_uma_mensagem_por_semana_e_nao_repete_no_dia_seguinte(monkeypatch):
    out = _patch(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db); _user(db, "so1")
    finally:
        db.close()
    assert ap.run_autopilot(now=AT_11)["food_email"] == 1
    out["mail"].clear()
    assert ap.run_autopilot(now=AT_11 + timedelta(days=1))["food_email"] == 0   # 7 dias de pausa
    assert out["mail"] == []


def test_fora_do_horario_desligado_e_teto_do_dia(monkeypatch):
    out = _patch(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        for i in range(5):
            _user(db, f"t{i}")
    finally:
        db.close()
    assert ap.run_autopilot(now=AT_22)["skipped"].startswith("fora do horário")
    monkeypatch.setattr(get_settings(), "activation_autopilot_daily_cap", 3, raising=False)
    r = ap.run_autopilot(now=AT_11)
    assert r["food_email"] == 3 and len(out["mail"]) == 3                       # teto de 3 no dia

    db = SessionLocal()
    try:
        db.add(ac.ActivationSetting(key="autopilot_enabled", value="0")); db.commit()
    finally:
        db.close()
    assert ap.run_autopilot(now=AT_11 + timedelta(days=8))["skipped"] == "desligado"


def test_quem_pediu_para_parar_nunca_recebe(monkeypatch):
    out = _patch(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db)
        uid = _user(db, "optout")
        db.add(ac.ActivationOptOut(user_id=uid)); db.commit()
    finally:
        db.close()
    ap.run_autopilot(now=AT_11)
    assert not any(m["to"].startswith("optout") for m in out["mail"])


def test_link_de_descadastro_assinado(client):
    db = SessionLocal()
    try:
        _clean(db); uid = _user(db, "unsub")
    finally:
        db.close()
    assert client.get(f"/v1/unsubscribe-reminders?u={uid}&t=errado").status_code == 400
    ok = client.get(f"/v1/unsubscribe-reminders?u={uid}&t={ac.unsubscribe_token(uid)}")
    assert ok.status_code == 200 and "Pronto" in ok.text
    db = SessionLocal()
    try:
        assert uid in ac.opted_out_ids(db)
    finally:
        db.close()


def test_segundo_toque_de_racao_so_depois_de_14_dias(monkeypatch):
    out = _patch(monkeypatch)
    db = SessionLocal()
    try:
        _clean(db); uid = _user(db, "dois")
        db.add(ac.ActivationCampaignContact(campaign=ac.CAMPAIGN_FOOD, user_id=uid,
                                            sent_at=AT_11.astimezone(timezone.utc) - timedelta(days=10)))
        db.commit()
    finally:
        db.close()
    assert ap.run_autopilot(now=AT_11, dry_run=True)["planned"]["food"] == 0                       # 10 dias: cedo
    assert ap.run_autopilot(now=AT_11 + timedelta(days=5), dry_run=True)["planned"]["food"] == 1   # 15 dias: pode


def test_painel_exige_login_de_admin(client):
    assert client.get("/v1/admin/campaigns/panel/summary").status_code in (401, 403)
    assert client.post("/v1/admin/campaigns/panel/food/run", json={"dry_run": True}).status_code in (401, 403)
    assert client.post("/v1/admin/campaigns/panel/autopilot", json={"enabled": False}).status_code in (401, 403)

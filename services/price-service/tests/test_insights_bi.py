"""Inteligência da meta — estatística, modelo de propensão e recomendações no boletim."""
import random
import uuid
from datetime import date, datetime, timedelta, timezone

from src.admin.analytics import insights_bi as ib
from src.analytics.daily_brief_email import render, send_daily_brief
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import NativePushToken
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


def test_wilson_cresce_a_incerteza_com_amostra_pequena():
    lo_small, hi_small = ib.wilson(5, 10)
    lo_big, hi_big = ib.wilson(500, 1000)
    assert (hi_small - lo_small) > (hi_big - lo_big)
    assert ib.wilson(0, 0) == (0.0, 1.0)


def test_modelo_aprende_um_padrao_real_e_o_cv_nao_se_engana_com_ruido():
    rnd = random.Random(1)
    # padrão real: quem tem a 1ª feature = 1 completa quase sempre
    x = [[float(rnd.random() < 0.5)] + [rnd.random()] for _ in range(300)]
    y = [1 if (r[0] == 1 and rnd.random() < 0.9) or (r[0] == 0 and rnd.random() < 0.1) else 0 for r in x]
    assert ib.cross_val_auc(x, y) > 0.8
    # ruído puro: o AUC fica perto de 0,5 (não "descobre" nada)
    y_noise = [1 if rnd.random() < 0.3 else 0 for _ in range(300)]
    assert ib.cross_val_auc(x, y_noise) < 0.62


def test_poucos_casos_nao_usa_modelo_e_diz_por_que():
    rows = [{"age_days": 10, "complete": i < 3, "platform": "ios", "hour": "tarde", "from_campaign": False,
             "email_verified": True, "has_phone": False, "has_city": False} for i in range(40)]
    m = ib.train(rows)
    assert m["usable"] is False and "poucos casos" in m["reason"]


def _mk(db, *, pet=False, feeding=False, push=False, age_days=10, tag="x"):
    u = User(id=str(uuid.uuid4()), email=f"{tag}.{uuid.uuid4().hex[:6]}@ins.test", name=tag,
             password_hash=hash_password("x"), created_at=datetime.now(timezone.utc) - timedelta(days=age_days))
    db.add(u)
    db.commit()
    pid = None
    if pet:
        pid = str(uuid.uuid4())
        db.add(Pet(id=pid, user_id=u.id, name="Rex", species="dog"))
        db.commit()
    if feeding and pid:
        db.add(FeedingPlan(id=str(uuid.uuid4()), pet_id=pid, species="dog", country_code="BR", food_brand="Golden"))
        db.commit()
    if push:
        db.add(NativePushToken(user_id=u.id, platform="ios", token=uuid.uuid4().hex))
        db.commit()
    return u.id


def _clean(db):
    for m in (FeedingPlan, NativePushToken, Pet):
        db.query(m).delete()
    db.query(User).filter(User.email.like("%@ins.test")).delete(synchronize_session=False)
    db.commit()


def test_recomendacoes_apontam_etapa_fraca_e_quem_esta_a_um_passo():
    db = SessionLocal()
    try:
        _clean(db)
        for _ in range(6):
            _mk(db, pet=True, feeding=True, push=True)           # só falta localização (GPS)
        for _ in range(3):
            _mk(db, pet=True)                                     # falta ração, notificação e GPS
        for _ in range(2):
            _mk(db)                                               # só conta
        out = ib.recommendations(db)
    finally:
        db.close()
    g = out["goal"]
    steps = {s["key"]: s for s in g["steps"]}
    assert steps["location"]["have"] == 0 and steps["pet"]["have"] >= 9
    kinds = {r["kind"] for r in out["recommendations"]}
    assert "etapa" in kinds and "quase_la" in kinds
    near = next(r for r in out["recommendations"] if r["kind"] == "quase_la")
    assert near["impact"] >= 6 and "localização" in near["evidence"]
    assert out["model"]["usable"] is False            # base pequena: o modelo não finge saber
    assert all(r["confidence"] in ("alta", "média", "baixa") for r in out["recommendations"])


def test_boletim_traz_o_que_fazer_hoje_e_sobrevive_a_falha_do_modulo(monkeypatch):
    sent = []
    monkeypatch.setattr("src.mailer.send_mail",
                        lambda *, to, subject, body_text, body_html=None, **kw: (sent.append((to, body_text, body_html)) or True))
    monkeypatch.setattr(ib, "recommendations", lambda db: {
        "goal": {"total": 10, "complete": 2, "pct": 0.2, "steps": []},
        "recommendations": [{"kind": "etapa", "title": "Foque em notificação", "evidence": "8 de 10 sem notificação.",
                             "action": "Pedido de notificação: momento e texto.", "confidence": "média", "impact": 8}],
        "model": {"usable": False, "reason": "poucos casos"},
    })
    assert send_daily_brief(date(2026, 9, 22)) is True
    to, text, html = sent[0]
    assert "O que fazer hoje" in html and "Foque em notificação" in html and "2 de 10" in html
    assert "O QUE FAZER HOJE" in text

    # se o módulo quebrar, o boletim sai igual, sem o bloco
    sent.clear()
    def boom(db): raise RuntimeError("falhou")
    monkeypatch.setattr(ib, "recommendations", boom)
    assert send_daily_brief(date(2026, 9, 22)) is True
    assert sent and "O que fazer hoje" not in sent[0][2]


def test_endpoint_insights_exige_admin(client):
    assert client.get("/v1/admin/analytics/insights").status_code in (401, 403)

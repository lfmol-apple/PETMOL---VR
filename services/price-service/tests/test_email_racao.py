"""E-mail "Recado Importante" (17/10/2026): segmentação por pessoa (vários pets), exclusões e conteúdo."""
import uuid

from src.admin.activation_campaign_router import (
    ActivationOptOut, _email_racao_content, _target_users_email_racao,
)
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import PushSubscription  # noqa: F401  (garante a tabela)
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import hash_password


def _user(db, email, name="Tutor"):
    u = User(id=str(uuid.uuid4()), email=email, name=name, password_hash=hash_password("x"))
    db.add(u); db.commit()
    return u.id


def _pet(db, uid, name):
    p = Pet(id=str(uuid.uuid4()), user_id=uid, name=name, species="dog")
    db.add(p); db.commit()
    return p.id


def test_um_email_por_pessoa_com_varios_pets_e_exclusoes():
    db = SessionLocal()
    try:
        tag = uuid.uuid4().hex[:6]
        multi = _user(db, f"multi-{tag}@x.com", "Ana Souza")
        _pet(db, multi, "Ted"); _pet(db, multi, "Mel")
        optout = _user(db, f"out-{tag}@x.com")
        _pet(db, optout, "Rex")
        db.add(ActivationOptOut(user_id=optout)); db.commit()
        sem_pet = _user(db, f"nopet-{tag}@x.com")

        out = {t["user_id"]: t for t in _target_users_email_racao(db)}
        assert multi in out and len([1 for t in out.values() if t["user_id"] == multi]) == 1
        assert out[multi]["missing_pet_names"] == ["Ted", "Mel"]
        assert out[multi]["kind"] == "both"
        assert optout not in out and sem_pet not in out
    finally:
        db.close()


def test_conteudo_assunto_do_dono_e_botao():
    s, t, h = _email_racao_content("Ana Souza", ["Ted", "Mel"], True, "u1")
    assert s == "Urgente: Recado Importante do Petmol"
    assert "Cadastrar a ração de Ted e Mel" in h and "utm_content=imagem" in h and "utm_content=botao" in h
    assert "Oi Ana" in t
    _s, _t, h2 = _email_racao_content(None, [], False, None)
    assert "Ativar as notificações" in h2


def test_hostinger_recusa_espera_e_retoma_sem_duplicar_controle(monkeypatch):
    """3 recusas seguidas => espera (não desiste), depois volta a enviar; controle gravado uma vez."""
    import src.admin.activation_campaign_router as r
    import src.mailer as mailer

    db = SessionLocal()
    try:
        tag = uuid.uuid4().hex[:6]
        ids = []
        for n in range(6):
            uid = _user(db, f"drip{n}-{tag}@x.com")
            _pet(db, uid, f"Pet{n}")
            ids.append(uid)
    finally:
        db.close()

    waits = []
    monkeypatch.setattr(r, "_sleep", lambda s: waits.append(s))
    monkeypatch.setattr(mailer, "sendgrid_configured", lambda: False)
    calls = {"n": 0}

    def fake_send(**kw):
        calls["n"] += 1
        return calls["n"] > 3          # as 3 primeiras são recusadas, as seguintes passam
    monkeypatch.setattr(mailer, "send_mail", fake_send)
    monkeypatch.setattr(r, "EMAIL_DAILY_CAP", 10_000)

    r._run_email_racao(False, 0, pause_seconds=0)
    res = r.EMAIL_STATE["result"]
    assert 3600 in waits                       # esperou 1 h
    assert res["failed"] >= 3 and res["sent"] >= 1
    assert "stopped" not in res                # não desistiu

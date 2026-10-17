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


def _user_named(db, email, name):
    u = User(id=str(uuid.uuid4()), email=email, name=name, password_hash=hash_password("x"))
    db.add(u); db.commit()
    return u.id


def test_modelo_foto_personaliza_por_tutor_e_pets_sem_racao(monkeypatch):
    """Cada tutor recebe o nome dele e SÓ os pets sem ração (com a foto de cada um); controle e 'recente' respeitados."""
    import src.admin.activation_campaign_router as r
    import src.mailer as mailer
    from src.admin.activation_campaign_router import ActivationCampaignContact

    tag = uuid.uuid4().hex[:6]
    db = SessionLocal()
    try:
        ana = _user_named(db, f"ana-{tag}@x.com", "Ana Souza")
        ted = Pet(id=str(uuid.uuid4()), user_id=ana, name="Ted", species="dog", sex="male")
        mel = Pet(id=str(uuid.uuid4()), user_id=ana, name="Mel", species="dog", sex="female")
        db.add_all([ted, mel]); db.commit()
        db.add(FeedingPlan(id=str(uuid.uuid4()), pet_id=mel.id, species="dog", country_code="BR", food_brand="Golden")); db.commit()
        bia = _user_named(db, f"bia-{tag}@x.com", "Bia Lima")
        rex = Pet(id=str(uuid.uuid4()), user_id=bia, name="Rex", species="dog", sex="male")
        db.add(rex); db.commit()
        recente = _user_named(db, f"rec-{tag}@x.com", "Rita")
        _pet(db, recente, "Luna")
        db.add(ActivationCampaignContact(campaign="email_racao__nofood", user_id=recente)); db.commit()
        ted_id, rex_id, mel_id = ted.id, rex.id, mel.id
    finally:
        db.close()

    sent = {}
    monkeypatch.setattr(r, "_sleep", lambda s: None)
    monkeypatch.setattr(mailer, "sendgrid_configured", lambda: False)
    monkeypatch.setattr(r, "EMAIL_DAILY_CAP", 10_000)
    monkeypatch.setattr(mailer, "send_mail", lambda **kw: sent.__setitem__(kw["to"], kw) or True)

    r._run_email_racao(False, 0, pause_seconds=0, template="foto", variant="contando")

    a = sent[f"ana-{tag}@x.com"]
    assert a["subject"] == "Ana, o Ted está contando com você"          # nome do tutor + do pet (só o sem ração)
    assert ted_id in a["body_html"] and mel_id not in a["body_html"]    # foto só do pet sem ração
    assert "a ração do Ted" in a["body_html"]
    b = sent[f"bia-{tag}@x.com"]
    assert b["subject"].startswith("Bia,") and rex_id in b["body_html"]
    assert f"rec-{tag}@x.com" not in sent                               # recebeu o outro modelo há <7 dias

    db = SessionLocal()
    try:
        rows = {c for (c,) in db.query(ActivationCampaignContact.campaign).filter(
            ActivationCampaignContact.user_id.in_([ana, bia])).all()}
    finally:
        db.close()
    assert any(c.startswith("email_racao2__") for c in rows)            # registrado no modelo novo
    assert not any(c.startswith("email_racao__") for c in rows)         # sem contaminar o modelo antigo


def test_foto_do_pet_assinada_redimensionada_e_com_ilustracao_sem_foto(client):
    import base64, io
    from PIL import Image
    from src.admin.email_pet_photo import photo_sig

    big = io.BytesIO(); Image.new("RGB", (3000, 2000), (200, 120, 60)).save(big, "JPEG")   # foto "grande" embutida (cadastro antigo)
    db = SessionLocal()
    try:
        uid = _user(db, f"foto-{uuid.uuid4().hex[:6]}@x.com")
        com = Pet(id=str(uuid.uuid4()), user_id=uid, name="Com", species="dog",
                  photo="data:image/jpeg;base64," + base64.b64encode(big.getvalue()).decode())
        sem = Pet(id=str(uuid.uuid4()), user_id=uid, name="Sem", species="dog")
        db.add_all([com, sem]); db.commit()
        com_id, sem_id = com.id, sem.id
    finally:
        db.close()

    r = client.get(f"/v1/email/pet-photo/{com_id}/{photo_sig(com_id)}.jpg?k=hero")
    assert r.status_code == 200 and r.headers["content-type"] == "image/jpeg"
    assert Image.open(io.BytesIO(r.content)).size == (1120, 560) and len(r.content) < 200_000   # leve p/ e-mail
    assert client.get(f"/v1/email/pet-photo/{com_id}/{'0' * 24}.jpg").status_code == 404         # assinatura errada
    r2 = client.get(f"/v1/email/pet-photo/{sem_id}/{photo_sig(sem_id)}.jpg?k=sq")                # sem foto -> ilustração
    assert r2.status_code == 200 and Image.open(io.BytesIO(r2.content)).size == (480, 480)

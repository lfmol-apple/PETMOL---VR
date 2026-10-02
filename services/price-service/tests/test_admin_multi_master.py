"""Mais de um e-mail com acesso admin (ADMIN_EXTRA_EMAILS) — pedido real do
dono pra dar acesso ao /admin/dashboard pro irmão dele sem perder o próprio
acesso (admin_master_email continua sendo o único que recebe e-mail/push
operacional; isto aqui é só permissão de login no painel)."""
from src.admin.deps import admin_allowed_emails
from src.admin.models import AdminUser
from src.config import get_settings
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


def test_admin_allowed_emails_includes_master_and_extras(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_master_email", "dono@petmol.com.br", raising=False)
    monkeypatch.setattr(settings, "admin_extra_emails", " Irmao@Petmol.com.br , , outro@x.com", raising=False)

    assert admin_allowed_emails(settings) == {"dono@petmol.com.br", "irmao@petmol.com.br", "outro@x.com"}


def test_admin_allowed_emails_is_just_the_master_when_extras_empty():
    settings = get_settings()
    assert admin_allowed_emails(settings) == {settings.admin_master_email.strip().lower()}


def test_extra_admin_email_can_access_admin_endpoint_when_admin_user_row_exists(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_extra_emails", "irmao@vepiconsorcios.com.br", raising=False)

    db = SessionLocal()
    try:
        u = User(email="irmao@vepiconsorcios.com.br", password_hash=hash_password("x"), name="Irmão")
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="admin"))
        db.commit()
        token = create_access_token(u.id)
    finally:
        db.close()

    r = client.get("/v1/admin/app-installs", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 200, r.text


def test_email_outside_allowed_set_is_rejected_even_with_admin_user_row(client, monkeypatch):
    """Regressão: uma linha "perdida" em admin_users nunca basta sozinha —
    tem que estar em admin_allowed_emails também (master ou extra)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "admin_extra_emails", "", raising=False)

    db = SessionLocal()
    try:
        u = User(email="estranho@x.com", password_hash=hash_password("x"), name="Estranho")
        db.add(u)
        db.commit()
        db.add(AdminUser(user_id=u.id, role="admin"))
        db.commit()
        token = create_access_token(u.id)
    finally:
        db.close()

    r = client.get("/v1/admin/app-installs", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403

"""Aba Permissões: quem tem notificação ativa e quem compartilha localização (só leitura)."""
from datetime import datetime, timedelta, timezone

import pytest

from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.db import SessionLocal
from src.main import app
from src.notifications import NativePushToken, PushSubscription
from src.user_auth.models import User


@pytest.fixture(autouse=True)
def _admin():
    app.dependency_overrides[get_current_admin] = lambda: ("u", "a")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("u", "a")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def _seed():
    """5 tutores cobrindo a matriz notificação × localização."""
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        def user(email, **kw):
            u = User(email=email, password_hash="x", name=email.split("@")[0], **kw)
            db.add(u); db.commit(); db.refresh(u); return u
        ambos = user("ambos@x.com", lat=-19.9, lng=-43.9, location_source="gps", location_updated_at=now)
        so_push = user("sopush@x.com")
        so_gps_velho = user("sogps@x.com", lat=-19.9, lng=-43.9, location_source="gps", location_updated_at=now - timedelta(days=90))
        so_cidade = user("cidade@x.com", lat=-19.9, lng=-43.9, location_source="city", location_updated_at=now)
        nada = user("nada@x.com")
        db.add(NativePushToken(user_id=ambos.id, platform="ios", token="t-ios"))
        db.add(PushSubscription(user_id=so_push.id, endpoint="e1", p256dh="p", auth="a"))
        db.add(NativePushToken(user_id=so_push.id, platform="android", token="t-and"))
        # aparelho DESATIVADO (token rejeitado) não conta como ativo
        db.add(NativePushToken(user_id=nada.id, platform="ios", token="t-off", disabled_at=now))
        db.commit()
    finally:
        db.close()


def test_summary_conta_notificacao_e_localizacao(client):
    _seed()
    s = client.get("/v1/admin/analytics/permissions/summary").json()
    assert s["total_users"] == 5
    assert s["push"]["active"] == 2 and s["push"]["none"] == 3          # o token desativado NÃO conta
    assert (s["push"]["ios"], s["push"]["android"], s["push"]["web"]) == (1, 1, 1)
    assert s["location"]["gps"] == 2 and s["location"]["gps_fresh"] == 1  # GPS de 90 dias atrás não é recente
    assert s["location"]["city_only"] == 1 and s["location"]["none"] == 2
    c = s["combined"]
    assert (c["both"], c["only_push"], c["only_location"], c["neither"]) == (1, 1, 1, 2)
    assert sum(c.values()) == s["total_users"]


def test_tutores_e_pets_filtra_por_notificacao_localizacao_aparelho_e_busca(client):
    _seed()
    get = lambda **p: client.get("/v1/admin/analytics/users", params=p).json()
    emails = lambda r: sorted(i["email"] for i in r["items"])

    assert emails(get(push="active")) == ["ambos@x.com", "sopush@x.com"]
    assert emails(get(push="none", location="none")) == ["nada@x.com"]
    assert emails(get(location="gps")) == ["ambos@x.com", "sogps@x.com"]
    assert emails(get(location="city")) == ["cidade@x.com"]
    assert emails(get(push_platform="ios")) == ["ambos@x.com"]
    assert emails(get(push_platform="web")) == ["sopush@x.com"]
    assert emails(get(search="AMBOS")) == ["ambos@x.com"]

    r = get()
    assert r["total"] == 5
    by = {i["email"]: i for i in r["items"]}
    assert by["ambos@x.com"]["push_active"] and by["ambos@x.com"]["location_shared"] and by["ambos@x.com"]["location_fresh"]
    assert by["ambos@x.com"]["push_platforms"] == ["ios"]
    assert by["sopush@x.com"]["push_platforms"] == ["android", "web"]
    assert by["sogps@x.com"]["location_shared"] and not by["sogps@x.com"]["location_fresh"]
    assert not by["cidade@x.com"]["location_shared"]                     # cidade do cadastro ≠ compartilhou
    assert not by["nada@x.com"]["push_active"] and by["nada@x.com"]["push_platforms"] == []


def test_filtros_de_uso_pet_alimentacao_atividade_e_email(client):
    from src.analytics.models import AnalyticsProductEvent
    from src.pets.models import Pet
    _seed()
    now = datetime.now(timezone.utc)
    db = SessionLocal()
    try:
        ids = {u.email: u.id for u in db.query(User).all()}
        db.add(Pet(user_id=ids["ambos@x.com"], name="Rex", species="dog"))
        ev = lambda uid, days: AnalyticsProductEvent(
            event_id=f"e-{uid}-{days}", event_name="app_open", user_id=uid, anonymous_id=f"a-{uid}-{days}", session_id="s",
            platform="web", received_at=now - timedelta(days=days),
        )
        db.add_all([ev(ids["ambos@x.com"], 0), ev(ids["sopush@x.com"], 30), ev(ids["sogps@x.com"], 90)])
        db.query(User).filter(User.id == ids["ambos@x.com"]).update({"email_verified": True})
        db.commit()
    finally:
        db.close()
    get = lambda **p: sorted(i["email"] for i in client.get("/v1/admin/analytics/users", params=p).json()["items"])

    assert get(has_pet="yes") == ["ambos@x.com"]
    assert len(get(has_pet="no")) == 4
    assert get(activity="active") == ["ambos@x.com"]
    assert get(activity="cooling") == ["sopush@x.com"]
    assert get(activity="dormant") == ["sogps@x.com"]
    assert get(activity="no_analytics") == ["cidade@x.com", "nada@x.com"]
    assert get(email_verified="yes") == ["ambos@x.com"]
    assert len(get(email_verified="no")) == 4
    assert get(has_feeding="yes") == []                                   # ninguém tem plano de ração neste cenário
    assert get(push="active", activity="active") == ["ambos@x.com"]        # filtros se combinam

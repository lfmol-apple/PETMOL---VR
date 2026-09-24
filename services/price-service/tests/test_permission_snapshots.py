"""Fotografias de permissões: linha de base única, uma por dia, e "gravar agora" só com JWT de admin."""
from datetime import datetime, timedelta, timezone

import pytest

from src.admin.analytics.permission_snapshots import PermissionSnapshot, ensure_baseline, ensure_daily, history, take_snapshot
from src.admin.deps import get_current_admin, get_current_admin_or_readonly_key
from src.db import SessionLocal
from src.main import app
from src.notifications import NativePushToken
from src.user_auth.models import User


@pytest.fixture(autouse=True)
def _admin():
    app.dependency_overrides[get_current_admin] = lambda: ("u", "a")
    app.dependency_overrides[get_current_admin_or_readonly_key] = lambda: ("u", "a")
    yield
    app.dependency_overrides.pop(get_current_admin, None)
    app.dependency_overrides.pop(get_current_admin_or_readonly_key, None)


def _seed_user(db, email, push=False, gps=False):
    now = datetime.now(timezone.utc)
    u = User(email=email, password_hash="x", name=email, **({"lat": -19.9, "lng": -43.9, "location_source": "gps", "location_updated_at": now} if gps else {}))
    db.add(u); db.commit(); db.refresh(u)
    if push:
        db.add(NativePushToken(user_id=u.id, platform="ios", token=f"t-{email}")); db.commit()
    return u


def test_baseline_e_gravada_uma_unica_vez_com_os_totais_daquele_momento():
    db = SessionLocal()
    try:
        db.query(PermissionSnapshot).delete(); db.commit()
        _seed_user(db, "a@x.com", push=True, gps=True)
        _seed_user(db, "b@x.com")
        first = ensure_baseline(db)
        assert first is not None and first.kind == "baseline"
        assert ensure_baseline(db) is None                       # 2ª chamada não regrava
        _seed_user(db, "c@x.com", push=True)                     # muda depois: a linha de base NÃO muda
        h = history(db)
        assert len(h) == 1 and h[0]["kind"] == "baseline"
        assert (h[0]["total_users"], h[0]["push_active"], h[0]["gps"], h[0]["both"], h[0]["neither"]) == (2, 1, 1, 1, 1)
    finally:
        db.close()


def test_uma_por_dia_e_ordem_cronologica():
    db = SessionLocal()
    try:
        db.query(PermissionSnapshot).delete(); db.commit()
        _seed_user(db, "a@x.com", push=True)
        ensure_baseline(db)
        assert ensure_daily(db) is None                          # ainda é o mesmo dia
        old = db.query(PermissionSnapshot).one()
        old.taken_at = datetime.now(timezone.utc) - timedelta(hours=25)
        db.commit()
        _seed_user(db, "b@x.com", push=True, gps=True)
        daily = ensure_daily(db)
        assert daily is not None and daily.kind == "daily"
        h = history(db)
        assert [x["kind"] for x in h] == ["baseline", "daily"]
        assert (h[0]["push_active"], h[1]["push_active"]) == (1, 2)      # a evolução aparece
        assert h[1]["gps"] == 1
    finally:
        db.close()


def test_endpoints_historico_e_gravar_agora(client):
    db = SessionLocal()
    try:
        db.query(PermissionSnapshot).delete(); db.commit()
    finally:
        db.close()
    r = client.get("/v1/admin/analytics/permissions/history").json()
    assert [x["kind"] for x in r["items"]] == ["baseline"]              # painel aberto sem nada gravado → cria a base
    r2 = client.post("/v1/admin/analytics/permissions/snapshots").json()
    assert [x["kind"] for x in r2["items"]] == ["baseline", "manual"]

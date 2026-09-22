"""Mission Control Fase A: tipo de dispositivo, miniatura do pet, versão legível."""
import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

from src.admin.analytics.queries import _app_version_label, _classify_device
from src.admin.models import AdminUser
from src.analytics.models import AnalyticsProductEvent
from src.db import SessionLocal
from src.pets.models import Pet
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password

NOW = datetime.now(timezone.utc)


def _admin_headers():
    # get_current_admin só aceita o e-mail master fixo (settings.admin_master_email),
    # não basta ter uma linha em admin_users — mesmo padrão de test_admin_analytics.py.
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


# ── classificação pura (sem banco) ──────────────────────────────────────────

def test_classify_device():
    assert _classify_device("ios", "mobile") == "iphone"
    assert _classify_device("ios", "tablet") == "ipad"
    assert _classify_device("android", "mobile") == "android"
    assert _classify_device("android", "tablet") == "android"
    assert _classify_device("macos", "desktop") == "desktop"
    assert _classify_device("windows", "desktop") == "desktop"
    assert _classify_device("linux", "desktop") == "desktop"
    assert _classify_device("chromeos-ish", "desktop") == "outros"
    assert _classify_device(None, None) is None


def test_app_version_label():
    assert _app_version_label("web", None) == "Versão não identificada"
    assert _app_version_label("web", "unknown") == "Versão não identificada"
    # sha de build (o que hoje aparece cru na tela) vira rótulo curto
    assert _app_version_label("web", "817911ad7f32df581044c02078ae3291a7a2cf65-1790093721") == "Web (build 817911a)"
    assert _app_version_label("pwa", "817911ad7f32df581044c02078ae3291a7a2cf65-1790093721") == "PWA (build 817911a)"
    # versão real do nativo passa direto, com prefixo da plataforma
    assert _app_version_label("ios", "1.0 (7)") == "iPhone 1.0 (7)"  # rótulo alinhado com a coluna Dispositivo
    assert _app_version_label("android", "1.0 (4)") == "Android 1.0 (4)"


# ── endpoint /users — device_type, miniatura, dispositivo mais recente ─────

def _seed_two_tutors_different_devices():
    db = SessionLocal()
    try:
        a = User(email=f"a-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Ana")
        b = User(email=f"b-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Beto")
        db.add_all([a, b])
        db.commit()

        pet = Pet(user_id=a.id, name="Rex", species="dog", photo="pets/rex.jpg")
        db.add(pet)
        db.commit()

        # Tutor A: usou desktop há 10 dias, iPhone ontem — o MAIS RECENTE
        # (iPhone) é o que deve aparecer, não o mais antigo nem um "max()"
        # de coluna solta que misturaria os dois eventos.
        db.add(AnalyticsProductEvent(
            event_id=f"old-{uuid4().hex[:8]}", event_name="app_open", user_id=a.id,
            platform="web", os="windows", device_class="desktop", app_version="unknown",
            received_at=NOW - timedelta(days=10),
        ))
        db.add(AnalyticsProductEvent(
            event_id=f"new-{uuid4().hex[:8]}", event_name="app_open", user_id=a.id,
            platform="ios", os="ios", device_class="mobile", app_version="1.0 (7)",
            received_at=NOW - timedelta(days=1),
        ))
        # Tutor B: só Android
        db.add(AnalyticsProductEvent(
            event_id=f"b-{uuid4().hex[:8]}", event_name="app_open", user_id=b.id,
            platform="android", os="android", device_class="mobile", app_version="1.0 (4)",
            received_at=NOW - timedelta(hours=3),
        ))
        db.commit()
        return {"a": a.id, "b": b.id, "pet": pet.id}
    finally:
        db.close()


def test_users_list_shows_most_recent_device_and_thumbnail(client):
    headers = _admin_headers()
    ids = _seed_two_tutors_different_devices()

    r = client.get("/v1/admin/analytics/users", headers=headers)
    assert r.status_code == 200, r.text
    items = {row["user_id"]: row for row in r.json()["items"]}

    a = items[ids["a"]]
    assert a["device_type"] == "iphone"  # o mais recente, não o desktop antigo
    assert a["app_version_label"] == "iPhone 1.0 (7)"
    assert len(a["pet_thumbnails"]) == 1
    assert a["pet_thumbnails"][0]["name"] == "Rex"
    assert a["pet_thumbnails"][0]["photo_url"]

    b = items[ids["b"]]
    assert b["device_type"] == "android"
    assert b["pet_thumbnails"] == []


def test_users_list_filters_by_device_type(client):
    headers = _admin_headers()
    ids = _seed_two_tutors_different_devices()

    r = client.get("/v1/admin/analytics/users?device_type=android", headers=headers)
    rows = r.json()["items"]
    assert [row["user_id"] for row in rows] == [ids["b"]]

    r2 = client.get("/v1/admin/analytics/users?device_type=iphone", headers=headers)
    assert [row["user_id"] for row in r2.json()["items"]] == [ids["a"]]

    # O filtro é "já usou esse tipo de dispositivo alguma vez" (útil pra
    # achar todo mundo que passou por ali) — diferente da coluna da tabela,
    # que mostra só o dispositivo MAIS RECENTE. O tutor A usou desktop no
    # passado mesmo hoje aparecendo como iPhone na lista: o filtro pega ele.
    r3 = client.get("/v1/admin/analytics/users?device_type=desktop", headers=headers)
    assert [row["user_id"] for row in r3.json()["items"]] == [ids["a"]]


def test_user_and_pet_detail_expose_photo_url_and_device(client):
    headers = _admin_headers()
    ids = _seed_two_tutors_different_devices()

    r = client.get(f"/v1/admin/analytics/users/{ids['a']}", headers=headers)
    body = r.json()
    assert body["activity"]["device_type"] == "iphone"
    assert body["activity"]["last_app_version_label"] == "iPhone 1.0 (7)"
    assert body["pets"][0]["photo_url"]

    r2 = client.get(f"/v1/admin/analytics/pets/{ids['pet']}", headers=headers)
    assert r2.json()["pet"]["photo_url"]


def test_overview_version_ranking_collapses_web_builds(client):
    """Cada deploy do web/PWA tem um app_version diferente (sha do build) —
    antes disso virava uma barra por deploy; agora Web/PWA colapsam num
    rótulo só, e só o nativo mostra versão real."""
    headers = _admin_headers()
    db = SessionLocal()
    try:
        u = User(email=f"c-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Carla")
        db.add(u)
        db.commit()
        for i, sha in enumerate(["aaaaaaa1111111111111111111111111111111-1790000000000", "bbbbbbb2222222222222222222222222222222-1790000001000"]):
            db.add(AnalyticsProductEvent(
                event_id=f"v{i}-{uuid4().hex[:8]}", event_name="app_open", user_id=u.id,
                platform="web", app_version=sha, received_at=NOW - timedelta(days=i),
            ))
        db.add(AnalyticsProductEvent(
            event_id=f"nat-{uuid4().hex[:8]}", event_name="app_open", user_id=u.id,
            platform="ios", app_version="1.0 (7)", received_at=NOW,
        ))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/overview", headers=headers)
    assert r.status_code == 200, r.text
    versions = {row["version"]: row["users"] for row in r.json()["app_versions"]}
    assert "Web" in versions
    assert versions["Web"] == 1  # 1 tutor, 2 builds diferentes — não 2 barras
    assert any(k.startswith("iPhone") for k in versions)
    assert not any(len(k) > 30 for k in versions)  # nenhum hash cru sobrando


def test_app_version_label_matches_real_capacitor_platform_values():
    """Em produção o app nativo reporta platform='ios_capacitor'/'android_capacitor'
    (não 'ios'/'android' puro) e, hoje, a MESMA sha de build do web — sem o
    sufixo '-timestamp' (bare hash). As duas formas têm que virar rótulo
    curto, não o hash cru (era exatamente a reclamação original)."""
    bare_sha = "817911ad7f32df581044c02078ae3291a7a2cf65"
    assert _app_version_label("ios_capacitor", bare_sha) == "iPhone (build 817911a)"
    assert _app_version_label("android_capacitor", bare_sha) == "Android (build 817911a)"
    assert _app_version_label("web", bare_sha) == "Web (build 817911a)"
    # quando existir versão real (App.getInfo() nativo, futuro), passa direto
    assert _app_version_label("ios_capacitor", "1.0 (7)") == "iPhone 1.0 (7)"


def test_overview_version_ranking_collapses_capacitor_builds_too(client):
    headers = _admin_headers()
    db = SessionLocal()
    try:
        u = User(email=f"d-{uuid4().hex[:8]}@example.com", password_hash=hash_password("x"), name="Duda")
        db.add(u)
        db.commit()
        for i, sha in enumerate([
            "817911ad7f32df581044c02078ae3291a7a2cf65",
            "df537c7afb53d8702cc1099411538650e340f7a0",
        ]):
            db.add(AnalyticsProductEvent(
                event_id=f"cap{i}-{uuid4().hex[:8]}", event_name="app_open", user_id=u.id,
                platform="ios_capacitor", app_version=sha, received_at=NOW - timedelta(days=i),
            ))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/overview", headers=headers)
    versions = {row["version"]: row["users"] for row in r.json()["app_versions"]}
    assert versions.get("iPhone") == 1  # 1 tutora, 2 builds — 1 barra, não 2
    assert not any(len(k) > 20 for k in versions)


def test_users_list_filters_by_platform(client):
    """f.platform era aceito pela API mas nunca aplicado — filtro cruzado
    (clicar na barra de plataforma da Visão Geral) dependia disso."""
    headers = _admin_headers()
    ids = _seed_two_tutors_different_devices()  # a: web+ios eventos; b: android

    r = client.get("/v1/admin/analytics/users?platform=android", headers=headers)
    assert [row["user_id"] for row in r.json()["items"]] == [ids["b"]]

    r2 = client.get("/v1/admin/analytics/users?platform=ios", headers=headers)
    assert [row["user_id"] for row in r2.json()["items"]] == [ids["a"]]

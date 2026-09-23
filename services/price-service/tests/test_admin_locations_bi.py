"""Painel "Locais" do Mission Control — mesmo dado do push/e-mail de acesso
e download (cidade por IP), agregado num só endpoint em vez de precisar
vasculhar centenas de notificações avulsas."""
from datetime import datetime, timedelta, timezone

import pytest

from src.admin.models import AdminUser
from src.analytics.install_models import AppInstall
from src.db import SessionLocal
from src.user_auth.models import User
from src.user_auth.security import create_access_token, hash_password


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


def _set_campaign(monkeypatch, since_iso, baseline=0):
    from src.config import get_settings

    st = get_settings()
    monkeypatch.setattr(st, "install_count_since", since_iso, raising=False)
    monkeypatch.setattr(st, "install_count_baseline", baseline, raising=False)


def test_locations_summary_splits_download_vs_acesso_by_city(client, monkeypatch):
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    _set_campaign(monkeypatch, (now - timedelta(days=2)).isoformat())

    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add_all([
            # Belo Horizonte: 2 downloads (ios, pwa) + 1 acesso (web)
            AppInstall(platform="ios", ip_hash="a", city="Belo Horizonte", region="MG", country="BR", created_at=now),
            AppInstall(platform="pwa", ip_hash="b", city="Belo Horizonte", region="MG", country="BR", created_at=now),
            AppInstall(platform="web", ip_hash="c", city="Belo Horizonte", region="MG", country="BR", created_at=now),
            # Curitiba: 1 download (android)
            AppInstall(platform="android", ip_hash="d", city="Curitiba", region="PR", country="BR", created_at=now),
            # fora do corte da campanha — não deve contar em nada
            AppInstall(platform="ios", ip_hash="e", city="Recife", region="PE", country="BR",
                       created_at=now - timedelta(days=10)),
        ])
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/locations", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()

    assert body["downloads_campaign"] == 3   # ios + pwa + android
    assert body["acessos_campaign"] == 1      # web
    assert body["total_campaign"] == 4
    assert body["downloads_today"] == 3
    assert body["acessos_today"] == 1

    by_city = {p["city"]: p for p in body["places"]}
    assert "Recife" not in by_city             # fora do corte, não aparece
    assert by_city["Belo Horizonte"]["downloads"] == 2
    assert by_city["Belo Horizonte"]["acessos"] == 1
    assert by_city["Belo Horizonte"]["total"] == 3
    assert by_city["Curitiba"]["downloads"] == 1
    assert by_city["Curitiba"]["acessos"] == 0

    # ranking por total desc — Belo Horizonte (3) antes de Curitiba (1)
    assert [p["city"] for p in body["places"]] == ["Belo Horizonte", "Curitiba"]
    assert body["places_total"] == 2
    assert "IP" in body["note"]

    # sem tutor geocodificado nessas cidades no cenário — nenhuma cidade
    # tem coordenada, e o painel deixa isso explícito (não inventa ponto)
    assert by_city["Belo Horizonte"]["lat"] is None
    assert by_city["Curitiba"]["lng"] is None
    assert body["mapped_places"] == 0
    assert body["unmapped_places"] == 2


def test_locations_summary_resolves_coordinate_from_geocoded_tutors_same_city(client, monkeypatch):
    """A cidade de um acesso/download ganha lat/lng quando existe pelo
    menos um tutor JÁ geocodificado (User.lat/lng) na mesma cidade — a
    mesma fonte do Mapa dos Tutores, nunca uma coordenada inventada."""
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    _set_campaign(monkeypatch, (now - timedelta(days=1)).isoformat())

    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        # dois tutores em Belo Horizonte, geocodificados — a média dos dois
        # vira o centro aproximado da cidade
        db.add_all([
            User(email="a@x.com", password_hash="x", name="A", city="Belo Horizonte",
                 lat=-19.90, lng=-43.93, location_source="gps"),
            User(email="b@x.com", password_hash="x", name="B", city="Belo Horizonte",
                 lat=-19.92, lng=-43.95, location_source="city"),
            # tutor sem lat/lng não entra na média
            User(email="c@x.com", password_hash="x", name="C", city="Belo Horizonte"),
        ])
        # Curitiba não tem nenhum tutor geocodificado no cenário
        db.add(AppInstall(platform="ios", ip_hash="a", city="Belo Horizonte", region="MG", country="BR", created_at=now))
        db.add(AppInstall(platform="android", ip_hash="b", city="Curitiba", region="PR", country="BR", created_at=now))
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/locations", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    by_city = {p["city"]: p for p in body["places"]}

    assert by_city["Belo Horizonte"]["lat"] == pytest.approx(-19.91)   # média de -19.90 e -19.92
    assert by_city["Belo Horizonte"]["lng"] == pytest.approx(-43.94)
    assert by_city["Curitiba"]["lat"] is None
    assert by_city["Curitiba"]["lng"] is None
    assert body["mapped_places"] == 1
    assert body["unmapped_places"] == 1


def test_locations_summary_resolves_coordinate_from_persistent_geocode_cache(client, monkeypatch):
    """Sem tutor geocodificado na cidade (camada 1), mas já existe uma
    geocodificação anterior guardada em `GeocodeCache` (camada 2, uma
    consulta passada ao Nominatim) — usa ela, sem pedir geocodificação de
    novo (a cidade já está resolvida pra sempre)."""
    from src.geocoding import GeocodeCache, _cache_key

    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    _set_campaign(monkeypatch, (now - timedelta(days=1)).isoformat())

    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.query(GeocodeCache).delete()
        db.add(AppInstall(platform="ios", ip_hash="a", city="Sorocaba", region="São Paulo", country="Brasil", created_at=now))
        db.add(GeocodeCache(
            key=_cache_key("Sorocaba", "São Paulo", "Brasil"),
            city="Sorocaba", region="São Paulo", country="Brasil", lat=-23.5, lng=-47.45,
        ))
        db.commit()
    finally:
        db.close()

    calls = []
    monkeypatch.setattr("src.admin.analytics.locations_bi.queue_geocode",
                        lambda *a, **k: calls.append(a))

    r = client.get("/v1/admin/analytics/locations", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    place = next(p for p in body["places"] if p["city"] == "Sorocaba")

    assert place["lat"] == pytest.approx(-23.5)
    assert place["lng"] == pytest.approx(-47.45)
    assert calls == []   # já resolvida — não pede geocodificação de novo


def test_locations_summary_queues_geocoding_when_neither_tier_resolves(client, monkeypatch):
    """Sem tutor na cidade e sem cache prévio: a cidade fica sem coordenada
    NESTA resposta (nunca inventa um ponto), mas o painel pede a
    geocodificação em segundo plano pra aparecer numa próxima consulta."""
    headers = _admin_headers()
    now = datetime.now(timezone.utc)
    _set_campaign(monkeypatch, (now - timedelta(days=1)).isoformat())

    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.add(AppInstall(platform="android", ip_hash="a", city="Diamantina", region="Minas Gerais", country="Brasil", created_at=now))
        db.commit()
    finally:
        db.close()

    calls = []
    monkeypatch.setattr("src.admin.analytics.locations_bi.queue_geocode",
                        lambda city, region, country: calls.append((city, region, country)))

    r = client.get("/v1/admin/analytics/locations", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    place = next(p for p in body["places"] if p["city"] == "Diamantina")

    assert place["lat"] is None and place["lng"] is None
    assert calls == [("Diamantina", "Minas Gerais", "Brasil")]


def test_locations_summary_empty_when_no_installs(client, monkeypatch):
    headers = _admin_headers()
    _set_campaign(monkeypatch, (datetime.now(timezone.utc) - timedelta(days=1)).isoformat())
    db = SessionLocal()
    try:
        db.query(AppInstall).delete()
        db.commit()
    finally:
        db.close()

    r = client.get("/v1/admin/analytics/locations", headers=headers)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["total_campaign"] == 0
    assert body["places"] == []
    assert body["places_total"] == 0

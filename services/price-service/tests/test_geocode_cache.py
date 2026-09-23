"""Cache persistente de geocodificação (`src/geocoding.py`) — usado pelo
painel "Locais" do Mission Control pra plotar cidades sem coordenada
própria. Todo teste aqui troca `geocode_place` por um dublê (nunca chama a
rede de verdade — Nominatim, `.venv`/CI não devem depender disso)."""
import time
import uuid

import pytest


def _unique_city() -> str:
    # nome único por teste — mesmo se um job atrasado escrever depois do
    # `_reset_db` de um teste seguinte, não colide com nenhuma asserção.
    return f"CidadeTeste-{uuid.uuid4().hex[:10]}"


def _wait_until(predicate, timeout=3.0, interval=0.05):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def test_get_cached_geocode_never_touches_the_network(monkeypatch):
    """Leitura pura do cache — nunca chama `geocode_place`."""
    import src.geocoding as geocoding
    from src.db import SessionLocal

    def _boom(*a, **k):
        raise AssertionError("get_cached_geocode não deveria chamar geocode_place")
    monkeypatch.setattr(geocoding, "geocode_place", _boom)

    city = _unique_city()
    db = SessionLocal()
    try:
        assert geocoding.get_cached_geocode(db, city, "MG", "Brasil") is None

        db.add(geocoding.GeocodeCache(
            key=geocoding._cache_key(city, "MG", "Brasil"),
            city=city, region="MG", country="Brasil", lat=-19.9, lng=-43.9,
        ))
        db.commit()

        coord = geocoding.get_cached_geocode(db, city, "MG", "Brasil")
        assert coord == (-19.9, -43.9)
    finally:
        db.close()


def test_queue_geocode_resolves_in_background_and_persists(monkeypatch):
    """`queue_geocode` não bloqueia — o worker escreve no cache quando o
    `geocode_place` (dublê) responde."""
    import src.geocoding as geocoding
    from src.db import SessionLocal

    city = _unique_city()
    monkeypatch.setattr(geocoding, "geocode_place", lambda *a, **k: (-15.5, -47.5))

    geocoding.queue_geocode(city, "DF", "Brasil")

    db = SessionLocal()
    try:
        found = _wait_until(lambda: geocoding.get_cached_geocode(db, city, "DF", "Brasil") is not None)
        assert found, "geocode em background não gravou no cache a tempo"
        assert geocoding.get_cached_geocode(db, city, "DF", "Brasil") == pytest.approx((-15.5, -47.5))
    finally:
        db.close()


def test_queue_geocode_skips_when_geocode_place_returns_none(monkeypatch):
    """Nominatim sem resultado (dublê devolve None) — nada é gravado, e a
    cidade fica livre pra ser tentada de novo numa chamada futura (não
    marca `_inflight` pra sempre)."""
    import src.geocoding as geocoding
    from src.db import SessionLocal

    city = _unique_city()
    monkeypatch.setattr(geocoding, "geocode_place", lambda *a, **k: None)

    geocoding.queue_geocode(city, "SP", "Brasil")
    key = geocoding._cache_key(city, "SP", "Brasil")
    # o _inflight some assim que o job termina (com ou sem sucesso)
    cleared = _wait_until(lambda: key not in geocoding._inflight)
    assert cleared

    db = SessionLocal()
    try:
        assert geocoding.get_cached_geocode(db, city, "SP", "Brasil") is None
    finally:
        db.close()


def test_queue_geocode_does_not_duplicate_inflight_city(monkeypatch):
    """Duas chamadas rápidas pra mesma cidade só disparam UMA geocodificação
    de verdade — Nominatim pede uso comedido, nunca em paralelo pra mesma
    consulta."""
    import src.geocoding as geocoding

    city = _unique_city()
    calls = []

    def _slow_geocode(city_arg, *a, **k):
        calls.append(city_arg)
        time.sleep(0.2)
        return (-10.0, -20.0)
    monkeypatch.setattr(geocoding, "geocode_place", _slow_geocode)

    geocoding.queue_geocode(city, "RJ", "Brasil")
    geocoding.queue_geocode(city, "RJ", "Brasil")  # mesma cidade, quase junto

    key = geocoding._cache_key(city, "RJ", "Brasil")
    _wait_until(lambda: key not in geocoding._inflight, timeout=3.0)
    assert len(calls) == 1


def test_cache_key_is_case_insensitive_and_stable():
    from src.geocoding import _cache_key

    assert _cache_key("Belo Horizonte", "MG", "Brasil") == _cache_key("belo horizonte", "mg", "brasil")
    assert _cache_key("", None, None) == "||"

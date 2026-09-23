"""Geocodificação leve de cidade → coordenadas (Nominatim / OpenStreetMap).

Usado para dar uma localização aproximada (centro da cidade) a quem informa a
cidade no cadastro mas não concede GPS — o suficiente para o alerta de Pet
Sumido com raio mais largo. Nunca sobrescreve uma localização de GPS.

`GeocodeCache` (abaixo) é um segundo uso da mesma função: cache PERSISTENTE
de cidade → coordenada, pra qualquer painel plotar uma cidade que não tem
coordenada própria (hoje: painel "Locais" do Mission Control, cidades de
acesso/download que vêm só com nome via geo-IP). Motivo de existir separado
do `@lru_cache` acima: aquele é só em memória do processo — some a cada
deploy/restart; este sobrevive, então uma cidade só é geocodificada uma vez
na vida do produto, nunca de novo.
"""
from __future__ import annotations

import logging
import queue as _queue
import threading
import time
from datetime import datetime
from functools import lru_cache
from typing import Optional, Tuple
from uuid import uuid4

from sqlalchemy import DateTime, Float, String, func
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base

logger = logging.getLogger(__name__)

_UA = "PETMOL/1.0 (https://petmol.com.br)"


@lru_cache(maxsize=2048)
def geocode_place(city: str, state: Optional[str] = None, country: str = "Brasil") -> Optional[Tuple[float, float]]:
    """(lat, lng) do centro da cidade, ou None. Resultado é cacheado em memória."""
    city = (city or "").strip()
    if not city:
        return None
    query = ", ".join(p for p in [city, (state or "").strip(), country] if p)
    try:
        import httpx

        resp = httpx.get(
            "https://nominatim.openstreetmap.org/search",
            params={"q": query, "format": "json", "limit": 1},
            headers={"User-Agent": _UA},
            timeout=10.0,
        )
        data = resp.json()
        if not data:
            return None
        lat = float(data[0]["lat"])
        lng = float(data[0]["lon"])
        return (lat, lng)
    except Exception as exc:  # rede, parsing, rate-limit — nunca quebra o fluxo
        logger.info("geocode_place falhou para %r: %s", query, exc)
        return None


# ═══════════════════════════════════════════════════════════════════════════
#  Cache persistente + fila em background (respeita o limite do Nominatim:
#  ~1 requisição/segundo, nunca em paralelo)
# ═══════════════════════════════════════════════════════════════════════════

class GeocodeCache(Base):
    """Uma linha por cidade já geocodificada — `key` é a chave normalizada
    (cidade|região|país, minúsculo). Nunca reescrita: a cidade não muda de
    coordenada, só é preenchida a primeira vez."""

    __tablename__ = "geocode_cache"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    key: Mapped[str] = mapped_column(String(300), nullable=False, unique=True, index=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    region: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    lat: Mapped[float] = mapped_column(Float, nullable=False)
    lng: Mapped[float] = mapped_column(Float, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _cache_key(city: str, region: Optional[str], country: Optional[str]) -> str:
    return "|".join(p.strip().lower() for p in [city or "", region or "", country or ""])


_inflight_lock = threading.Lock()
_inflight: set[str] = set()
_geocode_queue: "_queue.Queue[tuple[str, str, Optional[str], Optional[str]]]" = _queue.Queue()
_worker_lock = threading.Lock()
_worker_started = False
# Intervalo entre requisições do worker — Nominatim pede "no máximo ~1 req/s".
# Módulo-level (não um literal dentro do worker) só pra o teste conseguir
# zerar via monkeypatch: sem isso, a thread de background fica ACORDADA por
# até 1.1s depois de cada job processado, competindo pela GIL com QUALQUER
# outro teste que rode nesse intervalo — foi exatamente isso que derrubou
# `test_already_enriched_product_never_touches_enrichment` (assert de tempo
# `elapsed < 1.0`) numa rodada de suíte completa, sem relação nenhuma de
# lógica com geocodificação. Ver tests/conftest.py `_fast_geocode_pacing`.
_PACING_SECONDS = 1.1


def get_cached_geocode(db, city: str, region: Optional[str] = None, country: Optional[str] = None) -> Optional[Tuple[float, float]]:
    """Só lê o cache — nunca bloqueia, nunca chama a rede."""
    key = _cache_key(city, region, country)
    if not key.strip("|"):
        return None
    row = db.query(GeocodeCache).filter(GeocodeCache.key == key).first()
    return (row.lat, row.lng) if row else None


def _ensure_worker() -> None:
    global _worker_started
    with _worker_lock:
        if _worker_started:
            return
        _worker_started = True

        def _worker() -> None:
            while True:
                key, city, region, country = _geocode_queue.get()
                try:
                    coords = geocode_place(city, region, country or "Brasil")
                    if coords:
                        from .db import SessionLocal
                        db = SessionLocal()
                        try:
                            if not db.query(GeocodeCache).filter(GeocodeCache.key == key).first():
                                db.add(GeocodeCache(
                                    key=key, city=city, region=region, country=country,
                                    lat=coords[0], lng=coords[1],
                                ))
                                db.commit()
                        finally:
                            db.close()
                except Exception as exc:
                    logger.info("geocode em background falhou pra %r: %s", key, exc)
                finally:
                    with _inflight_lock:
                        _inflight.discard(key)
                    # Nominatim pede uso "no máximo ~1 req/s" pro endpoint
                    # público — nunca em paralelo. Um worker só, sequencial.
                    time.sleep(_PACING_SECONDS)

        threading.Thread(target=_worker, daemon=True, name="geocode-cache-worker").start()


def queue_geocode(city: str, region: Optional[str] = None, country: Optional[str] = None) -> None:
    """Pede a geocodificação em background e grava no cache quando voltar —
    nunca bloqueia o request que chamou. Sem duplicar: uma cidade já em
    fila/andamento neste processo não entra de novo."""
    key = _cache_key(city, region, country)
    if not key.strip("|"):
        return
    with _inflight_lock:
        if key in _inflight:
            return
        _inflight.add(key)
    _ensure_worker()
    _geocode_queue.put((key, city, region, country))

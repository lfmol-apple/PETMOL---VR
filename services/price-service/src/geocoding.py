"""Geocodificação leve de cidade → coordenadas (Nominatim / OpenStreetMap).

Usado para dar uma localização aproximada (centro da cidade) a quem informa a
cidade no cadastro mas não concede GPS — o suficiente para o alerta de Pet
Sumido com raio mais largo. Nunca sobrescreve uma localização de GPS.
"""
from __future__ import annotations

import logging
from functools import lru_cache
from typing import Optional, Tuple

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

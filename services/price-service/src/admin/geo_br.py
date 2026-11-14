"""GPS → cidade/estado APROXIMADOS, offline. Município de referência mais próximo da coordenada, dentro de um teto de distância.

Não é geocodificação reversa de verdade: o ponto de cada município é o seu centro de referência, então perto de divisas (ou em municípios
grandes) o resultado pode ser o município vizinho. Por isso tudo que sai daqui é rotulado como APROXIMADO. As coordenadas guardadas
nunca são alteradas: a conversão é calculada na consulta e não é gravada.
"""
from __future__ import annotations

import csv
import math
from functools import lru_cache
from pathlib import Path
from typing import Optional

_FILE = Path(__file__).parent / "data" / "municipios_br.csv"
MAX_KM = 60.0            # mais longe que isso do centro de qualquer município → sem resultado (fora do Brasil, mar, dado ruim)
_CELL = 1.0              # grade de 1° (~111 km): a busca olha a célula e as 8 vizinhas


def _hav(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 6371.0088 * 2 * math.asin(min(1.0, math.sqrt(a)))


@lru_cache(maxsize=1)
def _index() -> dict[tuple[int, int], list[tuple[float, float, str, str]]]:
    grid: dict[tuple[int, int], list[tuple[float, float, str, str]]] = {}
    with open(_FILE, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            lat, lng = float(r["latitude"]), float(r["longitude"])
            grid.setdefault((math.floor(lat / _CELL), math.floor(lng / _CELL)), []).append((lat, lng, r["nome"], r["uf"]))
    return grid


def nearest_municipality(lat: Optional[float], lng: Optional[float]) -> Optional[tuple[str, str, float]]:
    """(município, UF, distância em km) do centro mais próximo, ou None. Desempate determinístico (distância, nome)."""
    if lat is None or lng is None:
        return None
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return None
    if not (math.isfinite(lat) and math.isfinite(lng)) or not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    grid, ci, cj = _index(), math.floor(lat / _CELL), math.floor(lng / _CELL)
    best: Optional[tuple[float, str, str]] = None
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            for (la, lo, nome, uf) in grid.get((ci + di, cj + dj), ()):
                d = _hav(lat, lng, la, lo)
                if best is None or (d, nome) < (best[0], best[1]):
                    best = (d, nome, uf)
    if best is None or best[0] > MAX_KM:
        return None
    return best[1], best[2], best[0]

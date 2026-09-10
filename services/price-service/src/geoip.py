"""Geo-IP aproximado (cidade/estado/país) via ip-api.com — grátis, sem chave.

Precisão: cidade. Não dá rua nem bairro (nenhum geo-IP dá). Cacheado por IP.
"""
from __future__ import annotations

import ipaddress
import logging
from functools import lru_cache
from typing import Optional, TypedDict

logger = logging.getLogger(__name__)


class GeoIP(TypedDict, total=False):
    city: Optional[str]
    region: Optional[str]   # estado / província
    country: Optional[str]


def _is_public(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
        return not (addr.is_private or addr.is_loopback or addr.is_link_local or addr.is_reserved)
    except ValueError:
        return False


@lru_cache(maxsize=4096)
def geoip_lookup(ip: str) -> Optional[GeoIP]:
    ip = (ip or "").split(",")[0].strip()
    if not ip or ip == "unknown" or not _is_public(ip):
        return None
    try:
        import httpx

        resp = httpx.get(
            f"http://ip-api.com/json/{ip}",
            params={"fields": "status,country,regionName,city", "lang": "pt-BR"},
            timeout=6.0,
        )
        data = resp.json()
        if data.get("status") != "success":
            return None
        return {
            "city": data.get("city") or None,
            "region": data.get("regionName") or None,
            "country": data.get("country") or None,
        }
    except Exception as exc:
        logger.info("geoip_lookup falhou para %s: %s", ip, exc)
        return None

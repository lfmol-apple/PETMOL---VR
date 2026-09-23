"""Locais — de onde vêm os acessos e downloads do app.

O dono recebe um push (e um e-mail diário) por instalação/acesso, com a
cidade aproximada (geo-IP) — mas isso nunca tinha um lugar agregado dentro
do Mission Control: pra "ver onde o PETMOL está sendo usado" era preciso
vasculhar centenas de notificações avulsas uma por uma. Este módulo expõe
o mesmo dado (mesma fonte, mesma distinção acesso/download do push e do
e-mail — ver `analytics/router.py` e `analytics/install_report.py`) como
um painel só: totais de hoje/campanha + ranking por cidade.

Sem filtro de período/plataforma do resto do BI de propósito — é um
recorte pequeno e o dono quer "os 300 locais", não um corte fatiado.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...analytics.install_models import AppInstall, DOWNLOAD_PLATFORMS, install_count_cutoff
from ...user_auth.models import User

_BR = ZoneInfo("America/Sao_Paulo")


def _city_centroids(db: Session) -> dict[str, tuple[float, float]]:
    """Coordenada aproximada de cada cidade = média das coordenadas reais
    dos tutores dessa cidade (mesma fonte do Mapa — `User.lat/lng`, nunca
    inventada). Só ajuda a plotar o local de um acesso/download quando
    algum tutor JÁ geocodificado mora na mesma cidade; sem isso, o local
    fica de fora do mapa (mas continua no ranking por cidade)."""
    rows = (
        db.query(func.lower(User.city), func.avg(User.lat), func.avg(User.lng))
        .filter(User.city.isnot(None), User.lat.isnot(None), User.lng.isnot(None))
        .group_by(func.lower(User.city))
        .all()
    )
    return {city: (float(lat), float(lng)) for city, lat, lng in rows if city and lat is not None and lng is not None}


def locations_summary(db: Session, *, limit_places: int = 80) -> dict[str, Any]:
    cutoff = install_count_cutoff()
    today_start_utc = (
        datetime.now(_BR).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    )

    # Volume é da ordem de centenas/poucos milhares desde o corte da
    # campanha — agregar em Python (como o e-mail diário já faz) evita
    # depender de CASE/boolean-sum específico de cada banco (SQLite nos
    # testes, Postgres em produção).
    rows = db.query(AppInstall).filter(AppInstall.created_at >= cutoff).all()
    # Filtro de "hoje" vai pro SQL, não pra comparação em Python — SQLite
    # (testes) devolve `created_at` sem tzinfo, e comparar um datetime
    # naive com um aware (today_start_utc) explode em TypeError. Deixando o
    # banco fazer a comparação (como o e-mail diário já faz), funciona nos
    # dois motores.
    rows_today = db.query(AppInstall).filter(AppInstall.created_at >= max(cutoff, today_start_utc)).all()

    def _is_download(platform: str) -> bool:
        return platform in DOWNLOAD_PLATFORMS

    downloads_campaign = sum(1 for r in rows if _is_download(r.platform))
    acessos_campaign = len(rows) - downloads_campaign

    downloads_today = sum(1 for r in rows_today if _is_download(r.platform))
    acessos_today = len(rows_today) - downloads_today

    by_place: dict[tuple[str, str, str], dict[str, int]] = {}
    for r in rows:
        key = (r.city or "—", r.region or "", r.country or "")
        slot = by_place.setdefault(key, {"downloads": 0, "acessos": 0})
        if _is_download(r.platform):
            slot["downloads"] += 1
        else:
            slot["acessos"] += 1

    centroids = _city_centroids(db)
    places: list[dict[str, Any]] = []
    for (city, region, country), v in by_place.items():
        coord: Optional[tuple[float, float]] = centroids.get(city.lower()) if city != "—" else None
        places.append({
            "city": city, "region": region, "country": country,
            "downloads": v["downloads"], "acessos": v["acessos"],
            "total": v["downloads"] + v["acessos"],
            "lat": coord[0] if coord else None,
            "lng": coord[1] if coord else None,
        })
    places.sort(key=lambda p: -p["total"])
    mapped_places = sum(1 for p in places if p["lat"] is not None)

    return {
        "downloads_today": downloads_today,
        "acessos_today": acessos_today,
        "downloads_campaign": downloads_campaign,
        "acessos_campaign": acessos_campaign,
        "total_campaign": len(rows),
        "places": places[:limit_places],
        "places_total": len(places),
        "mapped_places": mapped_places,
        "unmapped_places": len(places) - mapped_places,
        "note": (
            "Local vem do IP (cidade aproximada) — sem rua/bairro. Download = "
            "instalou o app (iPhone/Android) ou adicionou à tela de início "
            "(PWA). Acesso = só abriu o site no navegador, sem instalar nada. "
            "A coordenada no mapa (quando existe) é a média da localização de "
            "tutores já geocodificados na mesma cidade — nunca inventada; sem "
            "isso, a cidade fica de fora do mapa mas continua no ranking."
        ),
    }

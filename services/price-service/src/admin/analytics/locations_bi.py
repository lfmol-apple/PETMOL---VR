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
from ...analytics.models import AnalyticsProductEvent
from ...geocoding import get_cached_geocode, queue_geocode
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


def _user_city_counts(db: Session) -> dict[tuple[str, str], int]:
    """Cadastros por (cidade, estado) — cidade DECLARADA pelo tutor no
    cadastro (User.city/state), nunca a localização aproximada por IP dos
    acessos/downloads. Sinal diferente, junta pela mesma chave só pra
    exibir lado a lado — nunca soma ou confunde as duas fontes."""
    rows = (
        db.query(func.lower(User.city), func.lower(User.state), func.count(User.id))
        .filter(User.city.isnot(None))
        .group_by(func.lower(User.city), func.lower(User.state))
        .all()
    )
    return {(city or "", state or ""): n for city, state, n in rows if city}


def locations_summary(
    db: Session, *,
    limit_places: int = 80,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    sort_by: str = "total",
) -> dict[str, Any]:
    """`since`/`until`: quando ausentes (comportamento padrão, preservado),
    a janela é o corte da campanha — "os locais desde que a campanha
    começou", como sempre foi. Quando o dono seleciona um período no filtro
    global do Mission Control (item 1 do pedido de evolução do dashboard),
    esses dois vêm preenchidos e a janela vira exatamente o período
    selecionado — o rótulo da resposta (`window_label`) diz qual dos dois
    modos está ativo, pra nunca mostrar um número sem dizer de onde veio."""
    cutoff = install_count_cutoff()
    today_start_utc = (
        datetime.now(_BR).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    )
    custom_window = since is not None or until is not None
    window_start = max(since, cutoff) if since else cutoff   # nunca antes do corte (teste)

    # Volume é da ordem de centenas/poucos milhares desde o corte da
    # campanha — agregar em Python (como o e-mail diário já faz) evita
    # depender de CASE/boolean-sum específico de cada banco (SQLite nos
    # testes, Postgres em produção).
    q = db.query(AppInstall).filter(AppInstall.created_at >= window_start)
    if until:
        q = q.filter(AppInstall.created_at <= until)
    rows = q.all()
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
    cadastros_by_place = _user_city_counts(db)
    places: list[dict[str, Any]] = []
    for (city, region, country), v in by_place.items():
        coord: Optional[tuple[float, float]] = None
        if city != "—":
            # 1) Tutor já geocodificado na mesma cidade (instantâneo,
            #    mesma fonte do Mapa). 2) Cache persistente de uma
            #    geocodificação anterior dessa cidade (Nominatim, gravada
            #    por `queue_geocode` numa chamada passada). 3) Nenhum dos
            #    dois: pede a geocodificação em BACKGROUND (worker
            #    sequencial, nunca bloqueia este request) — aparece no
            #    mapa a partir da próxima vez que o painel for aberto.
            coord = centroids.get(city.lower()) or get_cached_geocode(db, city, region, country)
            if not coord:
                queue_geocode(city, region, country)
        places.append({
            "city": city, "region": region, "country": country,
            "downloads": v["downloads"], "acessos": v["acessos"],
            "total": v["downloads"] + v["acessos"],
            # Cadastros: sinal DIFERENTE (User.city/state declarado no
            # cadastro), nunca o mesmo IP do acesso/download que originou
            # essa linha — cruzamento só por nome de cidade/estado, não por
            # identidade de pessoa/evento. `cadastros_declared_location`
            # deixa isso explícito pro frontend nunca legendar como "vindos
            # desse acesso/download".
            "cadastros_declared_location": cadastros_by_place.get((city.lower(), region.lower()), 0) if city != "—" else 0,
            "lat": coord[0] if coord else None,
            "lng": coord[1] if coord else None,
        })
    sort_key = {"downloads": "downloads", "acessos": "acessos"}.get(sort_by, "total")
    places.sort(key=lambda p: -p[sort_key])
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
        "sort_by": sort_key,
        "window_label": (
            f"Período selecionado ({since.isoformat() if since else '—'} até {until.isoformat() if until else 'agora'})"
            if custom_window else "Desde o início da campanha (contagem cumulativa, não filtrada por período)"
        ),
        "custom_window": custom_window,
        "note": (
            "Local dos acessos/downloads vem do IP (cidade aproximada) — sem "
            "rua/bairro. Download = instalou o app (iPhone/Android) ou "
            "adicionou à tela de início (PWA). Acesso = só abriu o site no "
            "navegador, sem instalar nada. Cadastros = cidade DECLARADA pelo "
            "tutor no cadastro (sinal diferente do IP, pode divergir). "
            "Coordenada no mapa: primeiro a média de tutores já geocodificados "
            "na mesma cidade; sem isso, o centro da cidade (OpenStreetMap), "
            "geocodificado uma vez e guardado — cidades novas aparecem no mapa "
            "em até alguns minutos, não na hora."
        ),
    }


# Candidatos buscados por fonte antes de mesclar por data/hora e paginar em
# Python — evita uma SQL UNION entre duas tabelas de formato bem diferente
# (app_installs não tem user_id nem event_name; analytics_product_events não
# é "download"). No volume atual do PETMOL (milhares de linhas, não
# milhões) isso é rápido e simples; se o volume crescer muito, vale migrar
# pra uma UNION real no banco.
_LOCATION_EVENTS_FETCH_CAP = 3000


def location_events(
    db: Session, *,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    state: Optional[str] = None,
    city: Optional[str] = None,
    platform: Optional[str] = None,
    utm_campaign: Optional[str] = None,
    event_type: Optional[str] = None,
    registered_only: Optional[bool] = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Drill-down linha a linha de Locais: cada download/acesso, mais
    recente primeiro. Junta app_installs (downloads + acesso web) e
    analytics_product_events (eventos-âncora de sessão) num feed só.

    Downloads NUNCA aparecem com usuário identificado hoje — app_installs
    não tem (nem nunca teve) um identificador de usuário vinculado; ver
    limitação documentada no PR. Acessos mostram o tutor quando a sessão
    estava autenticada no momento do evento."""
    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    # corte da campanha: instalação anterior é aparelho/conta de teste
    cutoff = install_count_cutoff()
    installs_q = db.query(AppInstall).filter(AppInstall.created_at >= (max(since, cutoff) if since else cutoff))
    if until:
        installs_q = installs_q.filter(AppInstall.created_at <= until)
    if city:
        installs_q = installs_q.filter(func.lower(AppInstall.city) == city.lower())
    if state:
        installs_q = installs_q.filter(func.lower(AppInstall.region) == state.lower())
    if platform:
        installs_q = installs_q.filter(AppInstall.platform == platform)
    if utm_campaign:
        installs_q = installs_q.filter(AppInstall.utm_campaign == utm_campaign)
    if event_type == "acesso":
        installs_q = installs_q.filter(~AppInstall.platform.in_(DOWNLOAD_PLATFORMS))
    elif event_type == "download":
        installs_q = installs_q.filter(AppInstall.platform.in_(DOWNLOAD_PLATFORMS))
    installs = (
        [] if registered_only is True  # app_installs nunca tem usuário identificado
        else installs_q.order_by(AppInstall.created_at.desc()).limit(_LOCATION_EVENTS_FETCH_CAP).all()
    )

    events_q = db.query(AnalyticsProductEvent).filter(
        AnalyticsProductEvent.event_name.in_(("app_open", "session_start"))
    )
    if since:
        events_q = events_q.filter(AnalyticsProductEvent.received_at >= since)
    if until:
        events_q = events_q.filter(AnalyticsProductEvent.received_at <= until)
    if city:
        events_q = events_q.filter(func.lower(AnalyticsProductEvent.city) == city.lower())
    if state:
        events_q = events_q.filter(func.lower(AnalyticsProductEvent.region) == state.lower())
    if platform:
        events_q = events_q.filter(AnalyticsProductEvent.platform == platform)
    if utm_campaign:
        events_q = events_q.filter(AnalyticsProductEvent.utm_campaign == utm_campaign)
    if registered_only is True:
        events_q = events_q.filter(AnalyticsProductEvent.user_id.isnot(None))
    elif registered_only is False:
        events_q = events_q.filter(AnalyticsProductEvent.user_id.is_(None))
    events = (
        [] if event_type == "download"  # product_events nunca é "download" nesta taxonomia
        else events_q.order_by(AnalyticsProductEvent.received_at.desc()).limit(_LOCATION_EVENTS_FETCH_CAP).all()
    )

    user_ids = {e.user_id for e in events if e.user_id}
    users_by_id: dict[str, dict[str, Optional[str]]] = {}
    if user_ids:
        for uid, name, email in db.query(User.id, User.name, User.email).filter(User.id.in_(user_ids)).all():
            users_by_id[uid] = {"name": name, "email": email}

    epoch = datetime.min.replace(tzinfo=timezone.utc)
    rows: list[dict[str, Any]] = []
    for r in installs:
        rows.append({
            "occurred_at": r.created_at,
            "event": "download" if r.platform in DOWNLOAD_PLATFORMS else "acesso",
            "user_id": None,
            "name": None,
            "city": r.city, "state": r.region,
            "platform": r.platform,
            "utm_campaign": r.utm_campaign, "utm_source": r.utm_source,
        })
    for e in events:
        u = users_by_id.get(e.user_id) if e.user_id else None
        rows.append({
            "occurred_at": e.received_at,
            "event": "acesso",
            "user_id": e.user_id,
            "name": (u.get("name") or u.get("email")) if u else None,
            "city": e.city, "state": e.region,
            "platform": e.platform,
            "utm_campaign": e.utm_campaign, "utm_source": e.utm_source,
        })

    def _sort_key(r: dict[str, Any]) -> datetime:
        dt = r["occurred_at"]
        if dt is None:
            return epoch
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)

    rows.sort(key=_sort_key, reverse=True)
    total = len(rows)
    start = (page - 1) * page_size
    page_rows = rows[start:start + page_size]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "occurred_at": r["occurred_at"].isoformat() if r["occurred_at"] else None,
                "event": r["event"],
                "user_id": r["user_id"],
                "name": r["name"] or "Visitante não identificado",
                "identified": r["user_id"] is not None,
                "city": r["city"] or "—",
                "state": r["state"] or "",
                "platform": r["platform"],
                "utm_campaign": r["utm_campaign"] or "(direto/orgânico)",
                "utm_source": r["utm_source"],
            }
            for r in page_rows
        ],
        "note": (
            "Downloads (app_installs) ainda não têm um identificador de usuário "
            "vinculado — aparecem sempre como 'Visitante não identificado', "
            "mesmo que a mesma pessoa tenha se cadastrado depois. Acessos "
            "(sessão) mostram o tutor quando a sessão estava autenticada no "
            "momento do evento."
        ),
    }

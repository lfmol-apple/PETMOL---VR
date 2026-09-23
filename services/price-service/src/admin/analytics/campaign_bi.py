"""Inteligência de campanhas — agrupa downloads/acessos por origem (UTM).

Duas fontes, cada uma já rotulada com a atribuição capturada na entrada
(ver `analytics/router.py`, `POST /app-install` e `POST /analytics/event`):
- Downloads: `app_installs` filtrado a `DOWNLOAD_PLATFORMS` (mesma
  distinção usada em todo o resto do painel — nunca conta acesso web).
- Acessos/visitantes: `analytics_product_events` nos eventos-âncora de
  sessão (`app_open`/`session_start`) — um por sessão, então também serve
  de "visitantes únicos" via `session_id`/`anonymous_id`.

Sem campanha (nenhum utm_* preenchido) = "(direto/orgânico)", nunca some
essas linhas na agregação — acesso direto É um dado, não ruído.

IMPORTANTE (pedido explícito do dono, item 4 do dashboard de campanhas):
isto não tenta reconstruir atribuição individual de instalação a partir de
dados agregados das lojas (App Store/Play não expõem isso por usuário) —
é só o que o próprio PETMOL capturou na URL de entrada de quem realmente
abriu o app ou acessou o site.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from sqlalchemy.orm import Session

from ...analytics.install_models import AppInstall, DOWNLOAD_PLATFORMS
from ...analytics.models import AnalyticsProductEvent

_SESSION_ANCHOR_EVENTS = ("app_open", "session_start")
_NO_CAMPAIGN_LABEL = "(direto/orgânico)"


def _bucket(source: Optional[str], medium: Optional[str], campaign: Optional[str]) -> tuple[str, str, str]:
    return (source or _NO_CAMPAIGN_LABEL, medium or "—", campaign or _NO_CAMPAIGN_LABEL)


def campaign_summary(
    db: Session, *,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    platform: Optional[str] = None,
) -> dict[str, Any]:
    installs_q = db.query(AppInstall)
    if since:
        installs_q = installs_q.filter(AppInstall.created_at >= since)
    if until:
        installs_q = installs_q.filter(AppInstall.created_at <= until)
    if platform:
        installs_q = installs_q.filter(AppInstall.platform == platform)
    installs = installs_q.all()

    events_q = db.query(AnalyticsProductEvent).filter(
        AnalyticsProductEvent.event_name.in_(_SESSION_ANCHOR_EVENTS)
    )
    if since:
        events_q = events_q.filter(AnalyticsProductEvent.received_at >= since)
    if until:
        events_q = events_q.filter(AnalyticsProductEvent.received_at <= until)
    if platform:
        events_q = events_q.filter(AnalyticsProductEvent.platform == platform)
    events = events_q.all()

    buckets: dict[tuple[str, str, str], dict[str, Any]] = {}

    def _slot(key: tuple[str, str, str]) -> dict[str, Any]:
        return buckets.setdefault(key, {
            "downloads": 0, "acessos": 0,
            "visitors": set(), "signups": 0,
        })

    for r in installs:
        key = _bucket(r.utm_source, r.utm_medium, r.utm_campaign)
        slot = _slot(key)
        if r.platform in DOWNLOAD_PLATFORMS:
            slot["downloads"] += 1
        else:
            slot["acessos"] += 1

    for e in events:
        key = _bucket(e.utm_source, e.utm_medium, e.utm_campaign)
        slot = _slot(key)
        slot["acessos"] += 1
        visitor = e.user_id or e.anonymous_id or e.session_id
        if visitor:
            slot["visitors"].add(visitor)
        if e.user_id:
            slot["signups"] += 1

    rows = [
        {
            "utm_source": src, "utm_medium": med, "utm_campaign": camp,
            "downloads": v["downloads"], "acessos": v["acessos"],
            "visitantes_unicos": len(v["visitors"]),
            # "Cadastros" aqui = sessões (com esse rótulo de campanha) que
            # JÁ estavam autenticadas no momento do evento-âncora — não é
            # "converteu depois", é "já era cadastrado quando acessou com
            # esse rótulo". Atribuição de cadastro NOVO por campanha
            # exigiria persistir o rótulo no momento do cadastro; não
            # implementado nesta versão (ver limitações no PR).
            "sessoes_autenticadas": v["signups"],
            "total": v["downloads"] + v["acessos"],
        }
        for (src, med, camp), v in buckets.items()
    ]
    rows.sort(key=lambda r: -r["total"])

    return {
        "campaigns": rows,
        "campaigns_total": len(rows),
        "has_any_attribution": any(r["utm_campaign"] != _NO_CAMPAIGN_LABEL for r in rows),
        "note": (
            "Downloads/acessos por origem (utm_source/utm_medium/utm_campaign) "
            "capturados da URL de entrada de quem realmente abriu o app ou "
            "acessou o site — não é o relatório agregado da App Store/Play "
            "(essas plataformas não expõem atribuição por usuário). "
            f"'{_NO_CAMPAIGN_LABEL}' = sem parâmetros de campanha na URL de "
            "entrada (acesso direto, digitou o endereço, ou app já instalado "
            "sem link de campanha). 'Sessões autenticadas' = sessões com "
            "esse rótulo em que o tutor já estava logado — não é "
            "necessariamente um cadastro novo."
        ),
    }

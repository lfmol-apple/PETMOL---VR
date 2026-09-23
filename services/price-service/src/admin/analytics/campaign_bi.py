"""Inteligência de campanhas — uma linha por CAMPANHA (utm_campaign), com o
funil inteiro e o custo: acessos → downloads → cadastros → gasto → custo por
download / por cadastro.

Fontes (todas capturadas pelo próprio PETMOL, ver `analytics/router.py`):
- Downloads: `app_installs` filtrado a `DOWNLOAD_PLATFORMS` (mesma distinção
  do resto do painel — nunca conta acesso web) e ao corte da campanha
  (`install_count_cutoff`: o que veio antes é aparelho/conta de teste).
- Acessos/visitantes: `analytics_product_events` nos eventos-âncora de
  sessão (`app_open`/`session_start`).
- Cadastros: usuários criados no período, atribuídos pelo **primeiro toque
  com campanha** do(s) aparelho(s) dele — o mesmo `anonymous_id` aparece nos
  eventos-âncora (com UTM) e, depois do login, nos eventos com `user_id`.
  Sem esse vínculo o cadastro vai pra "(sem origem rastreada)" — nunca
  inventa origem. Cadastro que veio orgânico (sem UTM em nenhum toque) vai
  pra "(direto/orgânico)".
- Gasto: lançado à mão (`campaign_spend`) — não há integração com Meta/
  Google Ads. Gasto sem tráfego continua aparecendo (dinheiro sem retorno
  É a informação mais importante).

Não tenta reconstruir atribuição individual a partir de dados agregados das
lojas (App Store/Play não expõem isso por usuário) — só o que o PETMOL viu.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ...analytics.install_models import AppInstall, DOWNLOAD_PLATFORMS, install_count_cutoff
from ...analytics.models import AnalyticsProductEvent
from ...analytics.spend_models import CampaignSpend
from ...user_auth.models import User
from .filters import PLATFORM_GROUPS, platform_clause

_BR = ZoneInfo("America/Sao_Paulo")
_ANCHORS = ("app_open", "session_start")
NO_CAMPAIGN = "(direto/orgânico)"
UNTRACKED = "(sem origem rastreada)"
_CHUNK = 400  # SQLite limita ~999 variáveis por consulta


def _sp_date(dt: datetime) -> date:
    return dt.astimezone(_BR).date()


def _chunks(items: list[str]):
    for i in range(0, len(items), _CHUNK):
        yield items[i:i + _CHUNK]


def _slot(buckets: dict[str, dict[str, Any]], name: str) -> dict[str, Any]:
    key = name.lower()
    if key not in buckets:
        buckets[key] = {
            "name": name, "sources": set(), "mediums": set(), "downloads": 0, "acessos": 0,
            "visitors": set(), "cadastros": 0, "spend_cents": 0,
        }
    return buckets[key]


def _signup_origins(
    db: Session, since: Optional[datetime], until: Optional[datetime], platform: Optional[str],
) -> list[tuple[str, Optional[str], Optional[str]]]:
    """(campanha, source, medium) de cada cadastro do período — primeiro
    toque COM campanha do aparelho dele; sem UTM em nenhum toque = orgânico;
    sem vínculo de aparelho = não rastreado."""
    uq = db.query(User.id).filter(~User.email.like("%@petmol.guest"))
    if since:
        uq = uq.filter(User.created_at >= since)
    if until:
        uq = uq.filter(User.created_at <= until)
    user_ids = [r[0] for r in uq.all()]
    if not user_ids:
        return []

    anon_by_user: dict[str, set[str]] = {}
    for chunk in _chunks(user_ids):
        for uid, anon in (
            db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.anonymous_id)
            .filter(AnalyticsProductEvent.user_id.in_(chunk), AnalyticsProductEvent.anonymous_id.isnot(None))
            .distinct().all()
        ):
            anon_by_user.setdefault(uid, set()).add(anon)

    all_anons = sorted({a for s in anon_by_user.values() for a in s})
    anchors_by_anon: dict[str, list[AnalyticsProductEvent]] = {}
    for chunk in _chunks(all_anons):
        for e in (
            db.query(AnalyticsProductEvent)
            .filter(AnalyticsProductEvent.anonymous_id.in_(chunk), AnalyticsProductEvent.event_name.in_(_ANCHORS))
            .order_by(AnalyticsProductEvent.received_at.asc()).all()
        ):
            anchors_by_anon.setdefault(e.anonymous_id, []).append(e)

    origins: list[tuple[str, Optional[str], Optional[str]]] = []
    for uid in user_ids:
        events = sorted(
            (e for a in anon_by_user.get(uid, ()) for e in anchors_by_anon.get(a, ())),
            key=lambda e: e.received_at,
        )
        if not events:
            origins.append((UNTRACKED, None, None))
            continue
        tracked = next((e for e in events if e.utm_campaign or e.utm_source), None)
        first = tracked or events[0]
        if platform and first.platform not in (PLATFORM_GROUPS.get(platform) or (platform,)):
            continue
        origins.append((tracked.utm_campaign or tracked.utm_source, tracked.utm_source, tracked.utm_medium)
                       if tracked else (NO_CAMPAIGN, None, None))
    return origins


def _brl(cents: int) -> float:
    return round(cents / 100, 2)


def _cost(spend_cents: int, n: int) -> Optional[float]:
    return round(spend_cents / 100 / n, 2) if spend_cents and n else None


def campaign_summary(
    db: Session, *,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    platform: Optional[str] = None,
) -> dict[str, Any]:
    buckets: dict[str, dict[str, Any]] = {}

    inst_since = max(since, install_count_cutoff()) if since else install_count_cutoff()
    iq = db.query(AppInstall).filter(AppInstall.created_at >= inst_since)
    if until:
        iq = iq.filter(AppInstall.created_at <= until)
    if platform:
        iq = iq.filter(platform_clause(AppInstall.platform, platform))
    for r in iq.all():
        slot = _slot(buckets, r.utm_campaign or NO_CAMPAIGN)
        if r.utm_source:
            slot["sources"].add(r.utm_source)
        if r.utm_medium:
            slot["mediums"].add(r.utm_medium)
        if r.platform in DOWNLOAD_PLATFORMS:
            slot["downloads"] += 1
        else:
            slot["acessos"] += 1

    eq = db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.event_name.in_(_ANCHORS))
    if since:
        eq = eq.filter(AnalyticsProductEvent.received_at >= since)
    if until:
        eq = eq.filter(AnalyticsProductEvent.received_at <= until)
    if platform:
        eq = eq.filter(platform_clause(AnalyticsProductEvent.platform, platform))
    for e in eq.all():
        slot = _slot(buckets, e.utm_campaign or NO_CAMPAIGN)
        if e.utm_source:
            slot["sources"].add(e.utm_source)
        if e.utm_medium:
            slot["mediums"].add(e.utm_medium)
        slot["acessos"] += 1
        visitor = e.user_id or e.anonymous_id or e.session_id
        if visitor:
            slot["visitors"].add(visitor)

    for name, source, medium in _signup_origins(db, since, until, platform):
        slot = _slot(buckets, name)
        slot["cadastros"] += 1
        if source:
            slot["sources"].add(source)
        if medium:
            slot["mediums"].add(medium)

    sq = db.query(CampaignSpend)
    if since:
        sq = sq.filter(CampaignSpend.spent_on >= _sp_date(since))
    if until:
        sq = sq.filter(CampaignSpend.spent_on <= _sp_date(until - timedelta(microseconds=1)))
    for sp in sq.all():
        _slot(buckets, sp.utm_campaign)["spend_cents"] += sp.amount_cents

    def _join(values: set[str], empty: str) -> str:
        return empty if not values else next(iter(values)) if len(values) == 1 else "vários"

    rows = []
    for slot in buckets.values():
        rows.append({
            "utm_campaign": slot["name"],
            "utm_source": _join(slot["sources"], slot["name"] if slot["name"] in (NO_CAMPAIGN, UNTRACKED) else "—"),
            "utm_medium": _join(slot["mediums"], "—"),
            "downloads": slot["downloads"], "acessos": slot["acessos"],
            "visitantes_unicos": len(slot["visitors"]),
            "cadastros": slot["cadastros"],
            "gasto_brl": _brl(slot["spend_cents"]),
            "custo_por_download": _cost(slot["spend_cents"], slot["downloads"]),
            "custo_por_cadastro": _cost(slot["spend_cents"], slot["cadastros"]),
            "total": slot["downloads"] + slot["acessos"],
        })
    rows.sort(key=lambda r: (-r["total"], -r["cadastros"], -r["gasto_brl"]))

    spend_total = sum(s["spend_cents"] for s in buckets.values())
    tracked_rows = [r for r in rows if r["utm_campaign"] not in (NO_CAMPAIGN, UNTRACKED)]
    dl_total = sum(r["downloads"] for r in rows)
    sg_total = sum(r["cadastros"] for r in rows)
    return {
        "campaigns": rows,
        "campaigns_total": len(rows),
        "has_any_attribution": any(r["total"] or r["cadastros"] for r in tracked_rows),
        "totals": {
            "downloads": dl_total, "cadastros": sg_total, "gasto_brl": _brl(spend_total),
            "custo_por_download": _cost(spend_total, dl_total),
            "custo_por_cadastro": _cost(spend_total, sg_total),
        },
        "note": (
            "Uma linha por campanha (utm_campaign). Downloads = 1ª abertura no dispositivo "
            "(não é o número confirmado pela App Store/Play). Cadastros são atribuídos ao "
            "PRIMEIRO toque com campanha do aparelho da pessoa; '(sem origem rastreada)' = "
            "cadastro sem vínculo com nenhum acesso registrado; '(direto/orgânico)' = veio "
            "sem UTM em nenhum toque. Gasto é lançado à mão (não há integração com Meta/"
            "Google Ads); custo = gasto ÷ downloads (ou cadastros) da mesma campanha no "
            "período — sem gasto lançado, sem custo."
        ),
    }

"""Introdução em vídeo da landing (mobile) — funil do comercial, lido do que o cliente enviou de verdade.

Fonte ÚNICA: `analytics_product_events`. Eventos `landing_intro_*` (pôster exibido → clicou em "Assistir com
som" → vídeo começou → concluiu / pulou / falhou) e `landing_download_click` com `placement` `intro-video`
(clique durante o vídeo) ou qualquer outro placement (clique na landing, depois da introdução).

Conceitos (nunca misturados):
- Visitante = `anonymous_id` distinto (navegador, estimativa). Etapa do funil = visitantes distintos que a fizeram.
- Clique em download ≠ instalação (instalação não é atribuível: o app nativo não recebe estes dados).
- Quem viu a introdução (`intro = shown`) e quem não viu (`none`: computador, sessão repetida, sem suporte) são
  PÚBLICOS DIFERENTES: a comparação de conversão é informativa, não é um teste controlado. Para comparar de
  verdade, use o teste A/B da landing com o filtro "Introdução".
- Horários em São Paulo (`sp_time` no evento; o gráfico diário usa America/Sao_Paulo).
Eventos de teste (`preview`) são ignorados.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent
from .landing_ab_bi import NO_CAMPAIGN, is_instagram, origin_label

INTRO_EVENTS = (
    "landing_intro_poster_view", "landing_intro_watch_click", "landing_intro_video_start",
    "landing_intro_video_complete", "landing_intro_skip", "landing_intro_video_error",
)
_ALL = INTRO_EVENTS + ("landing_download_click", "landing_store_redirect", "landing_view")
_BR = ZoneInfo("America/Sao_Paulo")


def _props(row: AnalyticsProductEvent) -> dict[str, Any]:
    try:
        v = json.loads(row.properties_json) if row.properties_json else {}
        return v if isinstance(v, dict) else {}
    except ValueError:
        return {}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _rate(n: int, d: int) -> Optional[float]:
    return round(n / d, 4) if d else None


def landing_intro_summary(
    db: Session, *,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    campaign: Optional[str] = None,
    source: Optional[str] = None,
    os: Optional[str] = None,
    instagram_only: bool = False,
) -> dict[str, Any]:
    q = db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.event_name.in_(_ALL))
    if since:
        q = q.filter(AnalyticsProductEvent.received_at >= since)
    if until:
        q = q.filter(AnalyticsProductEvent.received_at <= until)

    rows: list[tuple[AnalyticsProductEvent, dict[str, Any]]] = []
    for r in q.order_by(AnalyticsProductEvent.received_at.asc()).all():
        p = _props(r)
        if p.get("preview"):
            continue
        if campaign and (r.utm_campaign or NO_CAMPAIGN).lower() != campaign.lower():
            continue
        if source and origin_label(r) != source.lower():
            continue
        if os and (r.os or "unknown").lower() != os.lower():
            continue
        if instagram_only and not is_instagram(r, p):
            continue
        rows.append((r, p))

    stage = {k: set() for k in INTRO_EVENTS}
    counts = {k: 0 for k in INTRO_EVENTS}
    errors: dict[str, int] = {}
    skip_at: dict[str, int] = {"poster": 0, "video": 0}
    watched: list[float] = []
    dl = {"during": {"clicks": 0, "clickers": set(), "apple": 0, "google": 0, "auto": 0},
          "after": {"clicks": 0, "clickers": set(), "apple": 0, "google": 0, "auto": 0}}
    intro_visitors: set[str] = set()
    view_none: set[str] = set()
    clickers_by_group: dict[str, set[str]] = {"shown": set(), "none": set()}
    by_day: dict[str, dict[str, Any]] = {}
    sound_on = 0

    for r, p in rows:
        anon = r.anonymous_id
        name = r.event_name
        day = _aware(r.received_at).astimezone(_BR).date().isoformat() if r.received_at else None
        group = "shown" if p.get("intro") == "shown" else "none"

        if name in INTRO_EVENTS:
            counts[name] += 1
            if anon:
                stage[name].add(anon)
                intro_visitors.add(anon)
            if day:
                slot = by_day.setdefault(day, {"date": day, "poster": set(), "watch": set(), "complete": set()})
                if name == "landing_intro_poster_view" and anon:
                    slot["poster"].add(anon)
                if name == "landing_intro_watch_click" and anon:
                    slot["watch"].add(anon)
                if name == "landing_intro_video_complete" and anon:
                    slot["complete"].add(anon)
            if name == "landing_intro_video_error":
                reason = str(p.get("reason") or "desconhecido")[:40]
                errors[reason] = errors.get(reason, 0) + 1
            elif name == "landing_intro_skip":
                skip_at["poster" if p.get("reason") == "poster" else "video"] += 1
                if p.get("reason") != "poster" and isinstance(p.get("watched_s"), (int, float)):
                    watched.append(float(p["watched_s"]))
            elif name == "landing_intro_video_start" and p.get("muted") is False:
                sound_on += 1
        elif name == "landing_view":
            if group == "none" and anon:
                view_none.add(anon)
        elif name == "landing_download_click":
            if group == "shown" and anon:
                clickers_by_group["shown"].add(anon)
            elif group == "none" and anon:
                clickers_by_group["none"].add(anon)
            if group == "shown":
                bucket = dl["during" if str(p.get("placement") or "").startswith("intro-") else "after"]
                bucket["clicks"] += 1
                if anon:
                    bucket["clickers"].add(anon)
                st = p.get("store")
                bucket[st if st in ("apple", "google") else "auto"] += 1

    def n(k: str) -> int:
        return len(stage[k])

    poster = n("landing_intro_poster_view")
    watch = n("landing_intro_watch_click")
    start = n("landing_intro_video_start")
    complete = n("landing_intro_video_complete")
    skipped = n("landing_intro_skip")
    none_visitors = len(view_none)
    shown_clickers = len(clickers_by_group["shown"])

    watched.sort()
    median = watched[len(watched) // 2] if watched else None

    def dlsum(b: dict[str, Any]) -> dict[str, Any]:
        return {"clicks": b["clicks"], "clickers": len(b["clickers"]), "apple": b["apple"], "google": b["google"], "auto": b["auto"]}

    return {
        "period": {"since": since.isoformat() if since else None, "until": until.isoformat() if until else None},
        "filters": {"campaign": campaign, "source": source, "os": os, "instagram_only": instagram_only},
        "funnel": {
            "poster_visitors": poster, "watch_visitors": watch, "start_visitors": start, "complete_visitors": complete,
            "skip_visitors": skipped,
            "watch_rate": _rate(watch, poster), "start_rate": _rate(start, watch),
            "complete_rate": _rate(complete, start), "skip_rate": _rate(skipped, poster),
            "started_with_sound": sound_on,
        },
        "skips": {"at_poster": skip_at["poster"], "during_video": skip_at["video"],
                  "median_watched_s": round(median, 1) if median is not None else None},
        "errors": {"total": counts["landing_intro_video_error"], "visitors": n("landing_intro_video_error"),
                   "by_reason": [{"reason": k, "count": v} for k, v in sorted(errors.items(), key=lambda kv: -kv[1])]},
        "downloads": {"during_video": dlsum(dl["during"]), "after_video": dlsum(dl["after"]),
                      "clickers_total": shown_clickers,
                      "conversion_of_poster_viewers": _rate(shown_clickers, poster)},
        "without_intro": {
            "visitors": none_visitors, "clickers": len(clickers_by_group["none"]),
            "conversion": _rate(len(clickers_by_group["none"]), none_visitors),
            "note": "Quem não viu a introdução (computador, sessão repetida, etc.) é um público diferente: comparar com "
                    "quem viu é só uma referência, não um teste controlado. Para o teste controlado, use o A/B da landing.",
        },
        "daily": [{"date": d, "poster": len(v["poster"]), "watch": len(v["watch"]), "complete": len(v["complete"])} for d, v in sorted(by_day.items())],
        "installs_note": "Clique em download não é instalação: o app instalado não recebe estes dados, então instalações não são atribuíveis à introdução.",
    }

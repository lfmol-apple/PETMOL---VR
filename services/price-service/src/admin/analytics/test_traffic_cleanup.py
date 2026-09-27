"""Limpeza pontual (26-27/09/2026): sessões de teste geradas por mim durante o desenvolvimento do
comercial do Pet Sumido bateram no backend de verdade (servidor local apontando para a API de
produção) e ficaram registradas como se fossem visita real, com utm_source=instagram — contaminando
a atribuição de campanha e o funil do comercial no Mission Control.

Assinatura usada para achar essas sessões, sem risco de pegar visitante real: nelas o vídeo do
comercial "terminou" a menos de 3 segundos depois de "começar" — impossível para alguém assistindo de
verdade um filme de 27 ou 45 segundos (foi um `video.currentTime = duration` do teste automatizado).
Junto com esse par, remove só os outros eventos de landing (não de conta/pet/vacina) do mesmo
`anonymous_id`, dentro de uma janela de 2 minutos ao redor.

Rota de uso único; remover depois de rodar (ver docs/LIMPEZA_EVENTOS_TESTE_2026_09_27.md).
"""
from __future__ import annotations

from datetime import timedelta
from typing import Any

from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent

_LANDING_EVENTS = (
    "app_open", "session_start", "landing_view",
    "landing_intro_poster_view", "landing_intro_watch_click", "landing_intro_video_start",
    "landing_intro_video_complete", "landing_intro_skip", "landing_intro_video_error",
    "landing_download_click", "landing_store_redirect",
)
_FAST_FORWARD_SECONDS = 3  # nenhum visitante real termina o vídeo <3s depois de começar
_WINDOW = timedelta(minutes=2)


def _bot_anonymous_ids(db: Session) -> set[str]:
    starts = {
        e.anonymous_id: e.occurred_at or e.received_at
        for e in db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.event_name == "landing_intro_video_start")
        if e.anonymous_id
    }
    bad: set[str] = set()
    for e in db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.event_name == "landing_intro_video_complete"):
        if not e.anonymous_id or e.anonymous_id not in starts:
            continue
        start_t = starts[e.anonymous_id]
        end_t = e.occurred_at or e.received_at
        if start_t and end_t and abs((end_t - start_t).total_seconds()) < _FAST_FORWARD_SECONDS:
            bad.add(e.anonymous_id)
    return bad


def run(db: Session, *, dry_run: bool) -> dict[str, Any]:
    bad_ids = _bot_anonymous_ids(db)
    if not bad_ids:
        return {"bot_anonymous_ids": 0, "matched_rows": 0, "deleted": False, "sample": []}
    rows = (
        db.query(AnalyticsProductEvent)
        .filter(AnalyticsProductEvent.anonymous_id.in_(bad_ids))
        .filter(AnalyticsProductEvent.event_name.in_(_LANDING_EVENTS))
        .all()
    )
    sample = [
        {"event_name": r.event_name, "anonymous_id": r.anonymous_id, "occurred_at": str(r.occurred_at or r.received_at),
         "utm_source": r.utm_source, "route": r.route}
        for r in rows[:40]
    ]
    if not dry_run:
        for r in rows:
            db.delete(r)
        db.commit()
    return {"bot_anonymous_ids": len(bad_ids), "matched_rows": len(rows), "deleted": not dry_run, "sample": sample}

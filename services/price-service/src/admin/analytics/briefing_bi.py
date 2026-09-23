"""Resumo do dia — fonte ÚNICA do "Hoje" do Mission Control e do boletim
diário por e-mail. Um cálculo só: o que aparece na tela e o que chega no
e-mail nunca divergem.

Dia = dia civil em America/Sao_Paulo (ZoneInfo, nunca deslocamento fixo);
timestamps continuam em UTC no banco. Cada métrica vem com o dia anterior e
a média dos 7 dias anteriores, pra o número nunca aparecer solto.

Downloads respeitam o corte da campanha (`install_count_cutoff`): o que veio
antes é aparelho/conta de teste e não entra na conta — mesma regra do push,
do e-mail antigo e do painel Locais.

Contas convidadas (`@petmol.guest`, cuidador por link de convite) não são
cadastro de tutor e ficam de fora de "cadastros".
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...analytics.install_models import AppInstall, DOWNLOAD_PLATFORMS, install_count_cutoff
from ...analytics.models import AnalyticsProductEvent
from ...missing_pets import MissingPet
from ...moderation.models import PhotoModerationDecision
from ...pets.models import Pet
from ...user_auth.models import User
from . import campaign_bi
from .filters import AnalyticsFilters

_BR = ZoneInfo("America/Sao_Paulo")
_ANCHORS = ("app_open", "session_start")

# (chave, rótulo, "mais é melhor?") — ordem = ordem de exibição
METRICS: list[tuple[str, str]] = [
    ("downloads", "Downloads"),
    ("acessos", "Acessos"),
    ("visitantes", "Visitantes únicos"),
    ("cadastros", "Cadastros"),
    ("pets_novos", "Pets cadastrados"),
    ("ativos", "Tutores ativos"),
    ("loja_aberturas", "Aberturas da Loja"),
    ("loja_cliques", "Cliques em ofertas"),
    ("sumido_novos", "Pets sumidos (novos alertas)"),
    ("sumido_encontrados", "Pets encontrados"),
]


def today_br(now: Optional[datetime] = None) -> date:
    return (now or datetime.now(_BR)).astimezone(_BR).date()


def day_window(day: date) -> tuple[datetime, datetime]:
    """[início, fim) do dia civil de SP, em UTC."""
    start = datetime(day.year, day.month, day.day, tzinfo=_BR)
    end = start + timedelta(days=1)  # aritmética de parede em zoneinfo
    return start.astimezone(timezone.utc), end.astimezone(timezone.utc)


def _real_users(q):
    return q.filter(~User.email.like("%@petmol.guest"))


def window_metrics(db: Session, start: datetime, end: datetime) -> dict[str, int]:
    cutoff = install_count_cutoff()
    d_start = max(start, cutoff)

    def _events(*names: str):
        return (
            db.query(AnalyticsProductEvent)
            .filter(AnalyticsProductEvent.event_name.in_(names),
                    AnalyticsProductEvent.received_at >= start,
                    AnalyticsProductEvent.received_at < end)
        )

    downloads = (
        db.query(func.count(AppInstall.id))
        .filter(AppInstall.platform.in_(DOWNLOAD_PLATFORMS),
                AppInstall.created_at >= d_start, AppInstall.created_at < end)
        .scalar() if d_start < end else 0
    ) or 0

    anchors = _events(*_ANCHORS).all()
    identities = {(e.user_id or e.anonymous_id or e.session_id) for e in anchors
                  if (e.user_id or e.anonymous_id or e.session_id)}

    ativos = (
        db.query(func.count(func.distinct(AnalyticsProductEvent.user_id)))
        .filter(AnalyticsProductEvent.user_id.isnot(None),
                AnalyticsProductEvent.received_at >= start,
                AnalyticsProductEvent.received_at < end)
        .scalar()
    ) or 0

    return {
        "downloads": int(downloads),
        "acessos": len(anchors),
        "visitantes": len(identities),
        "cadastros": int(_real_users(db.query(func.count(User.id)))
                         .filter(User.created_at >= start, User.created_at < end).scalar() or 0),
        "pets_novos": int(db.query(func.count(Pet.id))
                          .filter(Pet.created_at >= start, Pet.created_at < end).scalar() or 0),
        "ativos": int(ativos),
        "loja_aberturas": _events("store_opened").count(),
        "loja_cliques": _events("commerce_click").count(),
        "sumido_novos": int(db.query(func.count(MissingPet.id))
                            .filter(MissingPet.created_at >= start, MissingPet.created_at < end).scalar() or 0),
        "sumido_encontrados": int(db.query(func.count(MissingPet.id))
                                  .filter(MissingPet.found_at >= start, MissingPet.found_at < end).scalar() or 0),
    }


def _delta_pct(current: float, base: Optional[float]) -> Optional[float]:
    """None quando não há base (0/ausente) — nunca "infinito%"."""
    if not base:
        return None
    return round((current - base) / base * 100, 1)


def metrics_with_comparison(db: Session, day: date) -> dict[str, dict[str, Any]]:
    cur = window_metrics(db, *day_window(day))
    prev = window_metrics(db, *day_window(day - timedelta(days=1)))
    history = [window_metrics(db, *day_window(day - timedelta(days=i))) for i in range(1, 8)]
    out: dict[str, dict[str, Any]] = {}
    for key, label in METRICS:
        avg7 = round(sum(h[key] for h in history) / len(history), 1)
        out[key] = {
            "label": label,
            "value": cur[key],
            "prev": prev[key],
            "avg7": avg7,
            "delta_prev_pct": _delta_pct(cur[key], prev[key]),
            "delta_avg7_pct": _delta_pct(cur[key], avg7),
        }
    return out


def _top_cities(db: Session, start: datetime, end: datetime, limit: int = 5) -> list[dict[str, Any]]:
    d_start = max(start, install_count_cutoff())
    if d_start >= end:
        return []
    rows = (
        db.query(AppInstall.city, AppInstall.region, AppInstall.platform)
        .filter(AppInstall.created_at >= d_start, AppInstall.created_at < end)
        .all()
    )
    by: dict[tuple[str, str], dict[str, int]] = {}
    for city, region, platform in rows:
        slot = by.setdefault((city or "Local desconhecido", region or ""), {"downloads": 0, "acessos": 0})
        slot["downloads" if platform in DOWNLOAD_PLATFORMS else "acessos"] += 1
    ranked = sorted(by.items(), key=lambda kv: -(kv[1]["downloads"] + kv[1]["acessos"]))[:limit]
    return [{"city": c, "region": r, **v} for (c, r), v in ranked]


def _attention(db: Session, now: datetime) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []

    pending = int(db.query(func.count(PhotoModerationDecision.id))
                  .filter(PhotoModerationDecision.status == "pending").scalar() or 0)
    if pending:
        items.append({"severity": "attention", "key": "moderation",
                      "message": f"{pending} foto(s) aguardando revisão humana (Moderação)."})

    try:
        from ...runtime_metrics import request_metrics_summary
        api = request_metrics_summary(window_minutes=60)
        if api.get("errors_5xx", 0) > 0:
            items.append({"severity": "critical" if api["errors_5xx"] >= 5 else "attention", "key": "api",
                          "message": f"{api['errors_5xx']} resposta(s) 5xx na API na última hora."})
        elif api.get("p95_ms") and api["p95_ms"] > 1000:
            items.append({"severity": "attention", "key": "api",
                          "message": f"API lenta: p95 de {api['p95_ms']}ms na última hora."})
    except Exception:
        pass

    # tutores que se cadastraram entre 3 e 30 dias atrás e nunca cadastraram
    # um pet — o público mais barato de recuperar
    has_pet = db.query(Pet.id).filter(Pet.user_id == User.id).exists()
    stuck = int(_real_users(db.query(func.count(User.id)))
                .filter(User.created_at < now - timedelta(days=3),
                        User.created_at >= now - timedelta(days=30), ~has_pet).scalar() or 0)
    if stuck:
        items.append({"severity": "info", "key": "stuck_no_pet",
                      "message": f"{stuck} tutor(es) cadastrados há 3–30 dias ainda sem nenhum pet."})
    return items


def _suggestion(db: Session) -> Optional[dict[str, Any]]:
    try:
        from . import tactical_bi
        sugg = tactical_bi.tactical_suggestions(db, AnalyticsFilters.build()).get("suggestions") or []
        pending = [s for s in sugg if not s.get("decision")]
        top = (pending or sugg or [None])[0]
        return {"title": top["title"], "body": top["body"]} if top else None
    except Exception:
        return None


def build_brief(db: Session, day: date, *, now: Optional[datetime] = None) -> dict[str, Any]:
    now = now or datetime.now(timezone.utc)
    start, end = day_window(day)
    metrics = metrics_with_comparison(db, day)
    campaigns = campaign_bi.campaign_summary(db, since=max(start, install_count_cutoff()), until=end)
    return {
        "day": day.isoformat(),
        "label": day.strftime("%d/%m/%Y"),
        "is_today": day == today_br(now),
        "metrics": metrics,
        "funnel": [
            {"label": "Acessos", "n": metrics["acessos"]["value"]},
            {"label": "Downloads", "n": metrics["downloads"]["value"]},
            {"label": "Cadastros", "n": metrics["cadastros"]["value"]},
            {"label": "Pets cadastrados", "n": metrics["pets_novos"]["value"]},
        ],
        "campaigns": [c for c in campaigns["campaigns"][:3]],
        "has_campaign_attribution": campaigns["has_any_attribution"],
        "cities": _top_cities(db, start, end),
        "attention": _attention(db, now),
        "suggestion": _suggestion(db),
        "note": (
            "Downloads = 1ª abertura no dispositivo (não é o número confirmado pela "
            "App Store/Play). Dia civil em America/Sao_Paulo."
        ),
    }

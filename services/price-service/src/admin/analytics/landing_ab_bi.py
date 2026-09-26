"""Teste A/B da landing (COM imagem × SEM imagem) — resultado por variante, lido do que o cliente enviou de verdade.

Fonte ÚNICA: `analytics_product_events` (mesma tabela do resto do Mission Control), eventos
`landing_view`, `landing_download_click` e `landing_store_redirect`, com `experiment_id`, `variant`
(A|B), `button`, `placement` e `store` em `properties_json`. Nenhuma tabela nova.

Conceitos (nunca misturados):
- **Visita** = `landing_view` (cada carregamento da página).
- **Visitante único estimado** = `anonymous_id` distinto (id gerado no navegador — mesma pessoa em dois
  navegadores/aparelhos conta duas vezes; limpar o armazenamento também). É estimativa, não pessoa.
- **Clique em download** = `landing_download_click` (botão azul, selo App Store/Play, barra fixa, zoom).
  Uma pessoa que clica 3 vezes conta 3 CLIQUES mas 1 VISITANTE QUE CLICOU.
- **Conversão** = visitantes que clicaram ÷ visitantes da variante. NÃO é instalação.
- **Instalação** = `app_installs` (1ª abertura do app). O app nativo tem armazenamento próprio e não
  recebe o `anonymous_id`/variante da landing — por isso instalações NÃO são atribuíveis à variante e
  aparecem só como total do período/campanha, deixando isso explícito.
- **Cadastro atribuído** = cadastro concluído no MESMO navegador da landing (mesmo `anonymous_id`) —
  o caminho "Usar agora no navegador". Cadastros feitos dentro do app nativo não entram.

Eventos de pré-visualização (`?variant=` / QA) são ignorados.
"""
from __future__ import annotations

import json
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from ...analytics.install_models import AppInstall, DOWNLOAD_PLATFORMS, install_count_cutoff
from ...analytics.models import AnalyticsProductEvent
from ...user_auth.models import User

EXPERIMENT_ID = "landing_imagem_2026_09"  # A = com imagem do app (atual) × B = sem imagem
VIEW, CLICK, REDIRECT = "landing_view", "landing_download_click", "landing_store_redirect"
_EVENTS = (VIEW, CLICK, REDIRECT)
VARIANTS = ("A", "B")
NO_CAMPAIGN = "(direto/orgânico)"
NO_SOURCE = "(direto)"
MIN_SAMPLE = 100  # visitantes por variante para dar um veredito
_BR = ZoneInfo("America/Sao_Paulo")
_CHUNK = 400


def _props(row: AnalyticsProductEvent) -> dict[str, Any]:
    if not row.properties_json:
        return {}
    try:
        v = json.loads(row.properties_json)
        return v if isinstance(v, dict) else {}
    except ValueError:
        return {}


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def origin_label(row: AnalyticsProductEvent) -> str:
    return (row.utm_source or row.referrer_host or NO_SOURCE).strip().lower()


def is_instagram(row: AnalyticsProductEvent, props: dict[str, Any]) -> bool:
    return (
        "instagram" in (row.utm_source or "").lower()
        or (row.utm_source or "").lower() in ("ig", "meta", "facebook", "fb")
        or "instagram" in (row.referrer_host or "").lower()
        or props.get("iab") == "instagram"
    )


def device_label(row: AnalyticsProductEvent) -> str:
    os_ = (row.os or "").lower()
    cls = (row.device_class or "").lower()
    if os_ == "ios":
        return "iPad" if cls == "tablet" else "iPhone"
    if os_ == "android":
        return "Android"
    if cls == "desktop" or os_ in ("macos", "windows", "linux"):
        return "Computador"
    return "Outros"


def two_proportion_p_value(x1: int, n1: int, x2: int, n2: int) -> Optional[float]:
    """Teste z de duas proporções (bilateral). None se não der para calcular."""
    if n1 <= 0 or n2 <= 0:
        return None
    p1, p2 = x1 / n1, x2 / n2
    pooled = (x1 + x2) / (n1 + n2)
    se = math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))
    if se == 0:
        return None
    z = (p2 - p1) / se
    return math.erfc(abs(z) / math.sqrt(2))


def _rate(clickers: int, visitors: int) -> Optional[float]:
    return round(clickers / visitors, 4) if visitors else None


def _blank() -> dict[str, Any]:
    return {"views": 0, "visitors": set(), "clicks": 0, "clickers": set(), "apple": 0, "google": 0,
            "apple_clickers": set(), "google_clickers": set()}


def _fold(slot: dict[str, Any], name: str, anon: Optional[str], store: Optional[str]) -> None:
    if anon:
        slot["visitors"].add(anon)
    if name == VIEW:
        slot["views"] += 1
    elif name == CLICK:
        slot["clicks"] += 1
        if anon:
            slot["clickers"].add(anon)
    elif name == REDIRECT:
        if store == "apple":
            slot["apple"] += 1
            if anon:
                slot["apple_clickers"].add(anon)
        elif store == "google":
            slot["google"] += 1
            if anon:
                slot["google_clickers"].add(anon)


def _summary(slot: dict[str, Any]) -> dict[str, Any]:
    v, c = len(slot["visitors"]), len(slot["clickers"])
    return {
        "views": slot["views"], "visitors": v, "clicks": slot["clicks"], "clickers": c,
        "conversion": _rate(c, v),
        "apple_clicks": slot["apple"], "google_clicks": slot["google"],
        "apple_clickers": len(slot["apple_clickers"]), "google_clickers": len(slot["google_clickers"]),
    }


def _chunks(items: list[str]):
    for i in range(0, len(items), _CHUNK):
        yield items[i:i + _CHUNK]


def landing_ab_summary(
    db: Session, *,
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    campaign: Optional[str] = None,
    source: Optional[str] = None,
    os: Optional[str] = None,
    instagram_only: bool = False,
    intro: Optional[str] = None,
    experiment_id: str = EXPERIMENT_ID,
) -> dict[str, Any]:
    q = db.query(AnalyticsProductEvent).filter(AnalyticsProductEvent.event_name.in_(_EVENTS))
    if since:
        q = q.filter(AnalyticsProductEvent.received_at >= since)
    if until:
        q = q.filter(AnalyticsProductEvent.received_at <= until)

    # Só eventos deste experimento, com variante válida e fora de pré-visualização.
    rows: list[tuple[AnalyticsProductEvent, dict[str, Any]]] = []
    for r in q.order_by(AnalyticsProductEvent.received_at.asc()).all():
        p = _props(r)
        if p.get("experiment_id") != experiment_id or p.get("variant") not in VARIANTS or p.get("preview"):
            continue
        rows.append((r, p))

    # Opções dos filtros (calculadas antes de aplicar campanha/origem/SO, para o seletor não "sumir").
    options = {
        "campaigns": sorted({(r.utm_campaign or NO_CAMPAIGN) for r, _ in rows}),
        "sources": sorted({origin_label(r) for r, _ in rows}),
        "os": sorted({(r.os or "unknown") for r, _ in rows}),
    }

    def keep(r: AnalyticsProductEvent, p: dict[str, Any]) -> bool:
        if campaign and (r.utm_campaign or NO_CAMPAIGN).lower() != campaign.lower():
            return False
        if source and origin_label(r) != source.lower():
            return False
        if os and (r.os or "unknown").lower() != os.lower():
            return False
        if instagram_only and not is_instagram(r, p):
            return False
        # Introdução em vídeo (mobile): eventos anteriores a ela não têm a propriedade → contam como "none".
        if intro in ("shown", "none") and (p.get("intro") or "none") != intro:
            return False
        return True

    rows = [(r, p) for r, p in rows if keep(r, p)]

    # Variante "dona" de cada visitante = a da primeira aparição; quem aparece nas duas é sinalizado.
    first_variant: dict[str, str] = {}
    seen_variants: dict[str, set[str]] = {}
    for r, p in rows:
        if r.anonymous_id:
            first_variant.setdefault(r.anonymous_id, p["variant"])
            seen_variants.setdefault(r.anonymous_id, set()).add(p["variant"])
    cross_variant = sum(1 for v in seen_variants.values() if len(v) > 1)

    total = {v: _blank() for v in VARIANTS}
    by_campaign: dict[str, dict[str, dict[str, Any]]] = {v: {} for v in VARIANTS}
    by_device: dict[str, dict[str, dict[str, Any]]] = {v: {} for v in VARIANTS}
    by_day: dict[str, dict[str, dict[str, Any]]] = {v: {} for v in VARIANTS}

    for r, p in rows:
        v = p["variant"]
        store = p.get("store") if isinstance(p.get("store"), str) else None
        day = _aware(r.received_at).astimezone(_BR).date().isoformat() if r.received_at else None
        _fold(total[v], r.event_name, r.anonymous_id, store)
        _fold(by_campaign[v].setdefault(r.utm_campaign or NO_CAMPAIGN, _blank()), r.event_name, r.anonymous_id, store)
        _fold(by_device[v].setdefault(device_label(r), _blank()), r.event_name, r.anonymous_id, store)
        if day:
            _fold(by_day[v].setdefault(day, _blank()), r.event_name, r.anonymous_id, store)

    def table(groups: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        out = [{"name": k, **_summary(s)} for k, s in groups.items()]
        return sorted(out, key=lambda x: (-x["visitors"], x["name"]))

    def daily(groups: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
        return [{"date": d, **_summary(groups[d])} for d in sorted(groups)]

    variants: dict[str, Any] = {}
    for v in VARIANTS:
        variants[v] = {
            **_summary(total[v]),
            "by_campaign": table(by_campaign[v]),
            "by_device": table(by_device[v]),
            "daily": daily(by_day[v]),
        }

    # ── Cadastros no MESMO navegador (mesmo anonymous_id) ────────────────
    signups = {v: 0 for v in VARIANTS}
    anons = sorted(first_variant)
    seen_users: set[str] = set()
    for chunk in _chunks(anons):
        q2 = db.query(AnalyticsProductEvent).filter(
            AnalyticsProductEvent.anonymous_id.in_(chunk),
            AnalyticsProductEvent.event_name == "register_completed",
        )
        if since:
            q2 = q2.filter(AnalyticsProductEvent.received_at >= since)
        for e in q2.all():
            key = e.user_id or f"anon:{e.anonymous_id}"
            if key in seen_users:
                continue
            seen_users.add(key)
            signups[first_variant[e.anonymous_id]] += 1
    for v in VARIANTS:
        variants[v]["signups_attributed"] = signups[v]

    # ── Instalações: só total do período — NÃO atribuíveis à variante ────
    inst_since = max(since, install_count_cutoff()) if since else install_count_cutoff()
    iq = db.query(AppInstall).filter(AppInstall.created_at >= inst_since, AppInstall.platform.in_(DOWNLOAD_PLATFORMS))
    if until:
        iq = iq.filter(AppInstall.created_at <= until)
    if campaign:
        iq = iq.filter(AppInstall.utm_campaign == (None if campaign == NO_CAMPAIGN else campaign))
    by_camp: dict[str, int] = {}
    inst_total = 0
    for i in iq.all():
        inst_total += 1
        by_camp[i.utm_campaign or NO_CAMPAIGN] = by_camp.get(i.utm_campaign or NO_CAMPAIGN, 0) + 1

    # ── Veredito ─────────────────────────────────────────────────────────
    a, b = variants["A"], variants["B"]
    p_value = two_proportion_p_value(a["clickers"], a["visitors"], b["clickers"], b["visitors"])
    if a["visitors"] < MIN_SAMPLE or b["visitors"] < MIN_SAMPLE:
        verdict, leader = "insufficient", None
    elif p_value is not None and p_value < 0.05:
        verdict, leader = "significant", ("B" if (b["conversion"] or 0) > (a["conversion"] or 0) else "A")
    else:
        verdict, leader = "no_difference", None

    return {
        "experiment_id": experiment_id,
        "period": {"since": since.isoformat() if since else None, "until": until.isoformat() if until else None},
        "filters": {"campaign": campaign, "source": source, "os": os, "instagram_only": instagram_only, "intro": intro},
        "options": options,
        "variants": variants,
        "verdict": {"status": verdict, "leader": leader, "p_value": round(p_value, 4) if p_value is not None else None,
                    "min_sample": MIN_SAMPLE},
        "quality": {"cross_variant_visitors": cross_variant,
                    "note": "Visitante único = navegador (anonymous_id): estimativa, não pessoa."},
        "installs": {
            "total": inst_total,
            "by_campaign": [{"name": k, "installs": n} for k, n in sorted(by_camp.items(), key=lambda kv: -kv[1])],
            "attributable_to_variant": False,
            "reason": "O app instalado tem armazenamento próprio: não recebe a variante nem o identificador da "
                      "landing. Aqui aparece só o total de 1ª aberturas do período/campanha.",
        },
        "signups_note": "Cadastros atribuídos = concluídos no mesmo navegador da landing (\"Usar agora no "
                        "navegador\"); cadastros feitos dentro do app nativo não são atribuíveis.",
    }

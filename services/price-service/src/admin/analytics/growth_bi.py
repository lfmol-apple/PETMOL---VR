"""Crescimento — o funil que o dono quer enxergar: acessos → downloads →
cadastros → pet → alimentação, com o gargalo apontado.

Alimenta o Dashboard 2 (/admin/dashboard2). Não substitui nada: o Mission
Control continua como está e usa suas próprias fontes.

Duas naturezas de número, deliberadamente separadas (misturar enganaria):
- **Volume na janela** (acessos, downloads, cadastros): contagens do mesmo
  período, mas NÃO são as mesmas pessoas — um cadastro de hoje pode ter
  baixado o app semana passada. A taxa entre elas é indicativa.
- **Coorte dos cadastros** (pet, perfil, alimentação, retorno): de cada
  pessoa que se cadastrou na janela, quantas chegaram lá. Aqui a taxa é
  exata.

Filtros: período e plataforma valem para tudo. UF/cidade valem para
cadastros (endereço do tutor) e downloads (cidade por IP); acessos não têm
localização e por isso NÃO são filtrados por UF/cidade (vem sinalizado em
`filters_applied`) — nada é inventado.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...analytics.install_models import AppInstall, DOWNLOAD_PLATFORMS, install_count_cutoff
from ...analytics.models import AnalyticsProductEvent
from ...user_auth.models import User
from . import campaign_bi
from . import journey_bi
from . import permissions_bi
from .filters import AnalyticsFilters, PLATFORM_GROUPS, platform_clause
from .queries import _aware, _utcnow

_BR = ZoneInfo("America/Sao_Paulo")
_ANCHORS = ("app_open", "session_start")
_CHUNK = 400  # SQLite limita ~999 variáveis por consulta
_PLATFORMS = ("ios", "android", "pwa", "web")
_SERIES_MAX_DAYS = 120

# Onde mexer quando falta cada parte da meta de ativação.
_ACTIVATION_HINT = {
    "pet": "Onboarding: o primeiro pet logo depois do cadastro (tela de boas-vindas).",
    "feeding": "Cadastro da ração: lembrar e facilitar para quem já tem pet.",
    "push": "Pedido de notificação: momento e texto da permissão (explicar o benefício).",
    "location": "Pedido de localização (GPS): momento e texto, ligado ao Pet Sumido.",
}
_ACTIVATION_LABEL = {
    "pet": "Cadastraram o pet", "feeding": "Configuraram a ração",
    "push": "Ativaram notificações", "location": "Compartilham a localização (GPS)",
}

# Onde mexer quando a passagem [de → para] é o maior vazamento.
_WHERE_TO_ACT = {
    ("downloads", "cadastros"): "Primeira tela do app e cadastro: quem instala e não cria conta.",
    ("cadastros", "pet"): "Onboarding: quem cria conta e não cadastra o primeiro pet.",
    ("pet", "feeding"): "Cadastro da alimentação: quem tem pet e não configura a ração.",
}


def _chunks(items: list[str]):
    for i in range(0, len(items), _CHUNK):
        yield items[i:i + _CHUNK]


def _real_users(q):
    return q.filter(~User.email.like("%@petmol.guest"))


def _platform_of_event(raw: Optional[str]) -> str:
    """Valor cru de analytics_product_events.platform → grupo da UI."""
    for group, raws in PLATFORM_GROUPS.items():
        if raw in raws:
            return group
    return raw or "web"


def _in_window(col, since: Optional[datetime], until: Optional[datetime]):
    clauses = []
    if since:
        clauses.append(col >= since)
    if until:
        clauses.append(col <= until)
    return clauses


def _signup_users(db: Session, f: AnalyticsFilters) -> dict[str, datetime]:
    """user_id → created_at dos cadastros da janela, respeitando UF/cidade e,
    quando há filtro de plataforma, só quem usou o PETMOL naquela plataforma
    (cadastro não guarda plataforma própria — vem dos eventos do tutor)."""
    q = _real_users(db.query(User.id, User.created_at))
    for c in _in_window(User.created_at, f.since, f.until):
        q = q.filter(c)
    if f.state:
        q = q.filter(func.lower(User.state) == f.state.lower())
    if f.city:
        q = q.filter(func.lower(User.city) == f.city.lower())
    users = {uid: created for uid, created in q.all()}

    if f.platform and users:
        keep: set[str] = set()
        ids = list(users)
        for chunk in _chunks(ids):
            rows = (
                db.query(AnalyticsProductEvent.user_id)
                .filter(AnalyticsProductEvent.user_id.in_(chunk),
                        platform_clause(AnalyticsProductEvent.platform, f.platform))
                .distinct().all()
            )
            keep.update(r[0] for r in rows)
        users = {uid: c for uid, c in users.items() if uid in keep}
    return users


def _installs(db: Session, f: AnalyticsFilters) -> list[tuple[str, datetime]]:
    cutoff = install_count_cutoff()
    q = db.query(AppInstall.platform, AppInstall.created_at).filter(
        AppInstall.platform.in_(DOWNLOAD_PLATFORMS),
        AppInstall.created_at >= (max(_aware(f.since), cutoff) if f.since else cutoff),
    )
    if f.until:
        q = q.filter(AppInstall.created_at <= f.until)
    if f.platform:
        q = q.filter(platform_clause(AppInstall.platform, f.platform))
    if f.city:
        q = q.filter(func.lower(AppInstall.city) == f.city.lower())
    return [(p, c) for p, c in q.all()]


def _sessions(db: Session, f: AnalyticsFilters) -> list[tuple[str, Optional[str], datetime, str]]:
    """(plataforma, identidade, quando, ...) dos eventos-âncora de sessão."""
    q = db.query(
        AnalyticsProductEvent.platform, AnalyticsProductEvent.user_id,
        AnalyticsProductEvent.anonymous_id, AnalyticsProductEvent.session_id,
        AnalyticsProductEvent.received_at,
    ).filter(AnalyticsProductEvent.event_name.in_(_ANCHORS))
    for c in _in_window(AnalyticsProductEvent.received_at, f.since, f.until):
        q = q.filter(c)
    if f.platform:
        q = q.filter(platform_clause(AnalyticsProductEvent.platform, f.platform))
    out = []
    for platform, user_id, anon, sess, at in q.all():
        out.append((_platform_of_event(platform), user_id or anon or sess, at, ""))
    return out


def _step(key: str, label: str, n: int, prev: Optional[int], top: int, kind: str) -> dict[str, Any]:
    return {
        "key": key, "label": label, "n": n, "kind": kind,
        "pct_from_previous": round(n / prev, 4) if prev else None,
        "pct_of_top": round(n / top, 4) if top else None,
    }


def _biggest_leak(steps: list[dict[str, Any]]) -> Optional[dict[str, Any]]:
    best: Optional[dict[str, Any]] = None
    for prev, cur in zip(steps, steps[1:]):
        if not prev["n"] or cur["pct_from_previous"] is None:
            continue
        # só compara passagens que fazem sentido de ação (ver _WHERE_TO_ACT)
        # acessos → downloads fica de fora: acesso inclui visitante recorrente
        # e navegador web, que nem deveria "baixar" — não é um vazamento
        # comparável aos de dentro do app.
        if prev["key"] == "acessos":
            continue
        hint = _WHERE_TO_ACT.get((prev["key"], cur["key"]))
        if not hint:
            continue
        lost = max(prev["n"] - cur["n"], 0)
        cand = {
            "from": prev["key"], "to": cur["key"],
            "from_label": prev["label"], "to_label": cur["label"],
            "pct": cur["pct_from_previous"], "lost": lost, "where_to_act": hint,
            "kind": cur["kind"],
        }
        if best is None or cand["pct"] < best["pct"]:
            best = cand
    return best


def growth_funnel(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    since = _aware(f.since) if f.since else None
    until = _aware(f.until) if f.until else None

    sessions = _sessions(db, f)
    installs = _installs(db, f)
    signups = _signup_users(db, f)

    cohort = set(signups)
    sets = journey_bi._step_user_sets(db, cohort) if cohort else {
        k: set() for k, _ in journey_bi.STEPS
    }

    # ── meta de ativação: pet + ração + notificação + localização ─────────
    push_set: set[str] = set()
    gps_set: set[str] = set()
    if cohort:
        ids = list(cohort)
        for chunk in _chunks(ids):
            push_set.update(r[0] for r in db.query(User.id).filter(
                User.id.in_(chunk), permissions_bi.has_any_push(User.id)).all())
            gps_set.update(r[0] for r in db.query(User.id).filter(
                User.id.in_(chunk), permissions_bi.shares_location()).all())
    parts = {"pet": sets["pet"], "feeding": sets["feeding"], "push": push_set, "location": gps_set}
    complete = cohort & parts["pet"] & parts["feeding"] & parts["push"] & parts["location"]
    n_cohort = len(cohort)
    missing_count: dict[int, int] = defaultdict(int)
    only_missing: dict[str, int] = defaultdict(int)
    for uid in cohort:
        lacks = [k for k, st in parts.items() if uid not in st]
        missing_count[len(lacks)] += 1
        if len(lacks) == 1:
            only_missing[lacks[0]] += 1
    activation_items = [
        {"key": k, "label": _ACTIVATION_LABEL[k], "n": len(parts[k]),
         "pct": round(len(parts[k]) / n_cohort, 4) if n_cohort else None,
         "missing": n_cohort - len(parts[k]), "only_missing": only_missing.get(k, 0),
         "where_to_act": _ACTIVATION_HINT[k]}
        for k in parts
    ]
    weakest = min((i for i in activation_items if i["pct"] is not None), key=lambda i: i["pct"], default=None)
    activation = {
        "total": n_cohort,
        "complete": len(complete),
        "complete_pct": round(len(complete) / n_cohort, 4) if n_cohort else None,
        "items": activation_items,
        "weakest": weakest["key"] if weakest else None,
        "missing_distribution": {str(k): v for k, v in sorted(missing_count.items())},
    }

    # ── meta de ativação por campanha de origem ───────────────────────────
    origins = campaign_bi.signup_origins_by_user(db, since, until, f.platform) if cohort else {}
    camp: dict[str, dict[str, Any]] = {}
    for uid in cohort:
        name = (origins.get(uid) or (campaign_bi.UNTRACKED, None, None))[0]
        slot = camp.setdefault(name.lower(), {"name": name, "cadastros": 0, "pet": 0, "feeding": 0,
                                               "push": 0, "location": 0, "complete": 0})
        slot["cadastros"] += 1
        for key, st in parts.items():
            if uid in st:
                slot[key] += 1
        if uid in complete:
            slot["complete"] += 1
    # Gasto lançado por campanha no mesmo período → custo por tutor que COMPLETOU a meta.
    # Campanha com gasto e nenhum cadastro também aparece: dinheiro sem retorno.
    spend_rows = [
        r for r in campaign_bi.campaign_summary(db, since=since, until=until, platform=f.platform)["campaigns"]
        if r["gasto_brl"]
    ]
    spend_by_name: dict[str, float] = {r["utm_campaign"].lower(): r["gasto_brl"] for r in spend_rows}
    for r in spend_rows:
        key = r["utm_campaign"].lower()
        camp.setdefault(key, {"name": r["utm_campaign"], "cadastros": 0, "pet": 0, "feeding": 0,
                              "push": 0, "location": 0, "complete": 0})
    for key, slot in camp.items():
        spent = spend_by_name.get(key)
        slot["gasto_brl"] = spent
        slot["custo_por_cadastro"] = round(spent / slot["cadastros"], 2) if spent and slot["cadastros"] else None
        slot["custo_por_ativado"] = round(spent / slot["complete"], 2) if spent and slot["complete"] else None
    campaigns_activation = sorted(camp.values(), key=lambda c: (-c["cadastros"], -(c["gasto_brl"] or 0)))[:15]

    n_acessos = len(sessions)
    n_visitantes = len({ident for _, ident, _, _ in sessions if ident})
    n_downloads = len(installs)
    n_cadastros = len(cohort)
    n_pet = len(sets["pet"])
    n_feeding = len(sets["feeding"])
    n_profile = len(sets["profile"])
    n_returned = len(sets["returned"])

    steps = [
        _step("acessos", "Acessos", n_acessos, None, n_acessos, "volume"),
        _step("downloads", "Downloads", n_downloads, n_acessos, n_acessos, "volume"),
        _step("cadastros", "Cadastros", n_cadastros, n_downloads, n_acessos, "volume"),
        _step("pet", "Cadastraram o pet", n_pet, n_cadastros, n_acessos, "cohort"),
        _step("feeding", "Configuraram a alimentação", n_feeding, n_pet, n_acessos, "cohort"),
    ]
    # etapas extras da coorte (não entram no gargalo — são aprofundamento)
    extra = [
        _step("profile", "Perfil do pet completo", n_profile, n_pet, n_acessos, "cohort"),
        _step("returned", "Voltaram em outro dia", n_returned, n_cadastros, n_acessos, "cohort"),
    ]

    # ── por plataforma ────────────────────────────────────────────────────
    by_plat: dict[str, dict[str, int]] = {p: defaultdict(int) for p in _PLATFORMS}
    for plat, _ident, _at, _ in sessions:
        if plat in by_plat:
            by_plat[plat]["acessos"] += 1
    for plat, _at in installs:
        if plat in by_plat:
            by_plat[plat]["downloads"] += 1
    if signups:
        ids = list(signups)
        user_plats: dict[str, set[str]] = defaultdict(set)
        for chunk in _chunks(ids):
            rows = (
                db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.platform)
                .filter(AnalyticsProductEvent.user_id.in_(chunk)).distinct().all()
            )
            for uid, plat in rows:
                user_plats[uid].add(_platform_of_event(plat))
        for uid in ids:
            for plat in user_plats.get(uid, ()):
                if plat in by_plat:
                    by_plat[plat]["cadastros"] += 1
                    if uid in sets["pet"]:
                        by_plat[plat]["pet"] += 1
                    if uid in sets["feeding"]:
                        by_plat[plat]["feeding"] += 1
                    if uid in push_set:
                        by_plat[plat]["push"] += 1
                    if uid in gps_set:
                        by_plat[plat]["location"] += 1
                    if uid in complete:
                        by_plat[plat]["complete"] += 1
    platforms = [
        {"platform": p, "acessos": v["acessos"], "downloads": v["downloads"],
         "cadastros": v["cadastros"], "pet": v["pet"], "feeding": v["feeding"],
         "push": v["push"], "location": v["location"], "complete": v["complete"]}
        for p, v in by_plat.items()
    ]

    # ── série diária (dia civil de São Paulo) ─────────────────────────────
    first = since or (now - timedelta(days=_SERIES_MAX_DAYS))
    first = max(first, now - timedelta(days=_SERIES_MAX_DAYS))
    last = until or now
    day0 = first.astimezone(_BR).date()
    day1 = last.astimezone(_BR).date()
    series_map: dict[Any, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for _p, _i, at, _ in sessions:
        series_map[_aware(at).astimezone(_BR).date()]["acessos"] += 1
    for _p, at in installs:
        series_map[_aware(at).astimezone(_BR).date()]["downloads"] += 1
    for at in signups.values():
        series_map[_aware(at).astimezone(_BR).date()]["cadastros"] += 1
    series = []
    d = day0
    while d <= day1:
        v = series_map.get(d, {})
        series.append({"date": d.isoformat(), "acessos": v.get("acessos", 0),
                       "downloads": v.get("downloads", 0), "cadastros": v.get("cadastros", 0)})
        d += timedelta(days=1)

    # ── tutores parados (alvo de ação) ────────────────────────────────────
    stuck_no_pet = n_cadastros - n_pet
    stuck_no_feeding = n_pet - n_feeding

    return {
        "generated_at": now.isoformat(),
        "steps": steps,
        "extra_steps": extra,
        "visitantes_unicos": n_visitantes,
        "activation": activation,
        "campaigns_activation": campaigns_activation,
        "biggest_leak": _biggest_leak(steps),
        "platforms": platforms,
        "series": series,
        "stuck": {"cadastro_sem_pet": stuck_no_pet, "pet_sem_alimentacao": stuck_no_feeding},
        "filters_applied": {
            "period": bool(f.since or f.until),
            "platform": bool(f.platform),
            "state": {"cadastros": bool(f.state), "downloads": False, "acessos": False},
            "city": {"cadastros": bool(f.city), "downloads": bool(f.city), "acessos": False},
        },
        "notes": [
            "Acessos, downloads e cadastros são volumes do mesmo período, não as "
            "mesmas pessoas; a taxa entre eles é indicativa.",
            "Da etapa 'Cadastraram o pet' em diante a taxa é exata: parte só de "
            "quem se cadastrou no período.",
            "Downloads = 1ª abertura no aparelho (não é o número da App Store/Play).",
        ] + ([
            "Acessos não têm localização: filtros de UF/cidade não os afetam."
        ] if (f.state or f.city) else []) + ([
            "Cadastros filtrados por plataforma = quem usou o PETMOL naquela "
            "plataforma (um tutor pode aparecer em mais de uma)."
        ] if f.platform else []),
    }

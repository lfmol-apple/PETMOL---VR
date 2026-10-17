"""Entrada do app — do primeiro acesso ao cadastro concluído.

Responde "baixou e não cadastrou: onde a pessoa parou?". Conta PESSOAS
distintas (anonymous_id, ou session_id quando não há) que chegaram a cada
tela, usando os eventos que o app já manda antes do login:

    abriu o app (ainda sem conta) → viu a tela de entrada → abriu o cadastro
    → passou do nome → concluiu o cadastro

Cuidados:
- "Abriu o app" só conta quem tem pelo menos um acesso SEM user_id (ainda
  não logado) — quem já tem conta e só volta ao app não entra na conta.
- `auth_screen_shown` só existe a partir da versão com a tela de escolha;
  antes disso a etapa aparece zerada e as demais continuam valendo.
- Sem filtro de plataforma, a conta é do app nativo (iOS/Android) — é de
  onde vêm os downloads. Com filtro, respeita o escolhido.
- Os passos são contagens independentes de pessoas, não uma fila estrita.
"""
from __future__ import annotations

import json
from collections import defaultdict
from typing import Any, Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent
from .filters import AnalyticsFilters, PLATFORM_GROUPS, platform_clause
from .queries import _utcnow

_ANCHORS = ("app_open", "session_start")
_NATIVE = PLATFORM_GROUPS["ios"] + PLATFORM_GROUPS["android"]

STEPS: list[tuple[str, str, str]] = [
    ("opened", "Abriram o app (sem conta)", ""),
    ("auth_screen", "Viram a tela de entrada", "auth_screen_shown"),
    ("signup_started", "Abriram o cadastro", "signup_started"),
    ("step1", "Passaram do nome", "register_step1_completed"),
    ("completed", "Concluíram o cadastro", "register_completed"),
]

_HINT = {
    ("opened", "signup_started"): "Primeira tela: a pessoa abre o app e não chega ao cadastro (texto, botão, tela de entrada).",
    ("signup_started", "step1"): "Primeiro campo (nome): a pessoa abre o cadastro e não avança.",
    ("step1", "completed"): "E-mail, senha e termos: onde mais se desiste (ver motivos de falha).",
}


def _identity(row) -> Optional[str]:
    return row.anonymous_id or row.session_id


def entry_funnel(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    q = db.query(
        AnalyticsProductEvent.event_name, AnalyticsProductEvent.anonymous_id,
        AnalyticsProductEvent.session_id, AnalyticsProductEvent.user_id,
        AnalyticsProductEvent.properties_json,
    ).filter(AnalyticsProductEvent.event_name.in_(
        [*_ANCHORS, *(e for _, _, e in STEPS if e), "auth_choice_register", "auth_choice_login", "register_failed"]
    ))
    if f.since:
        q = q.filter(AnalyticsProductEvent.received_at >= f.since)
    if f.until:
        q = q.filter(AnalyticsProductEvent.received_at <= f.until)
    if f.platform:
        q = q.filter(platform_clause(AnalyticsProductEvent.platform, f.platform))
    else:
        q = q.filter(or_(AnalyticsProductEvent.platform.in_(_NATIVE)))

    people: dict[str, set[str]] = defaultdict(set)
    choices: dict[str, int] = defaultdict(int)
    failures: dict[str, int] = defaultdict(int)
    for name, anon, sess, user_id, props in q.all():
        ident = anon or sess
        if name in _ANCHORS:
            if ident and user_id is None:
                people["opened"].add(ident)
        elif name == "register_failed":
            try:
                p = json.loads(props) if props else {}
            except (TypeError, ValueError):
                p = {}
            reason = str(p.get("reason") or "desconhecido")
            if p.get("field"):
                reason = f"{reason}:{p['field']}"
            failures[reason] += 1
        elif name in ("auth_choice_register", "auth_choice_login"):
            choices[name] += 1
        elif ident:
            key = next((k for k, _, e in STEPS if e == name), None)
            if key:
                people[key].add(ident)

    top = len(people["opened"])
    steps = []
    for key, label, _ in STEPS:
        n = len(people[key])
        steps.append({"key": key, "label": label, "n": n,
                      "pct_of_opened": round(n / top, 4) if top else None})

    # maior perda entre passos que formam fila de verdade (sem a tela de entrada,
    # que não existe nos dados antigos)
    chain = [s for s in steps if s["key"] != "auth_screen"]
    leak = None
    for prev, cur in zip(chain, chain[1:]):
        if not prev["n"]:
            continue
        pct = cur["n"] / prev["n"]
        hint = _HINT.get((prev["key"], cur["key"])) or _HINT.get((chain[0]["key"], cur["key"]))
        cand = {"from_label": prev["label"], "to_label": cur["label"], "pct": round(pct, 4),
                "lost": max(prev["n"] - cur["n"], 0), "where_to_act": hint or ""}
        if leak is None or cand["pct"] < leak["pct"]:
            leak = cand

    return {
        "generated_at": _utcnow().isoformat(),
        "steps": steps,
        "biggest_leak": leak,
        "choices": {"register": choices.get("auth_choice_register", 0),
                    "login": choices.get("auth_choice_login", 0)},
        "failures": [{"reason": r, "count": c} for r, c in sorted(failures.items(), key=lambda kv: -kv[1])],
        "scope": "platform" if f.platform else "native",
        "notes": [
            "Conta pessoas distintas (aparelho), não cadastros: um aparelho pode ter mais de um cadastro.",
            "'Viram a tela de entrada' só existe a partir da versão que passou a medir isso.",
        ],
    }


def signup_reconciliation(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    """Confere o funil: quantas contas NASCERAM (tabela de tutores) × quantas têm o evento
    `register_completed`. Se as duas colunas não batem, o buraco é de medição, não de desistência.
    Quebra por dia, plataforma, versão do app e método de login para achar onde o evento se perde."""
    from datetime import timedelta
    from ...user_auth.models import User
    from .growth_bi import _chunks, _platform_of_event, _real_users

    since = f.since or (_utcnow() - timedelta(days=14))
    q = _real_users(db.query(User.id, User.created_at, User.apple_sub, User.google_sub)).filter(User.created_at >= since)
    if f.until:
        q = q.filter(User.created_at <= f.until)
    users = q.all()
    ids = [u[0] for u in users]

    has_event: set[str] = set()
    first_ctx: dict[str, tuple[Optional[str], Optional[str]]] = {}
    for chunk in _chunks(ids):
        for (uid,) in db.query(AnalyticsProductEvent.user_id).filter(
                AnalyticsProductEvent.user_id.in_(chunk),
                AnalyticsProductEvent.event_name == "register_completed").distinct().all():
            has_event.add(uid)
        rows = (db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.platform,
                         AnalyticsProductEvent.app_version, AnalyticsProductEvent.occurred_at)
                .filter(AnalyticsProductEvent.user_id.in_(chunk))
                .order_by(AnalyticsProductEvent.occurred_at.asc()).all())
        for uid, plat, ver, _at in rows:
            first_ctx.setdefault(uid, (_platform_of_event(plat), ver))

    def bucket() -> dict[str, int]:
        return {"accounts": 0, "with_event": 0}

    days: dict[str, dict[str, int]] = defaultdict(bucket)
    plats: dict[str, dict[str, int]] = defaultdict(bucket)
    vers: dict[str, dict[str, int]] = defaultdict(bucket)
    methods: dict[str, dict[str, int]] = defaultdict(bucket)
    for uid, created, apple, google in users:
        ok = 1 if uid in has_event else 0
        day = ((created.replace(tzinfo=None) if created else _utcnow().replace(tzinfo=None)) - timedelta(hours=3)).strftime("%Y-%m-%d")
        plat, ver = first_ctx.get(uid, ("sem evento", None))
        method = "apple" if apple else ("google" if google else "senha")
        for d, k in ((days, day), (plats, plat), (vers, ver or "sem versão"), (methods, method)):
            d[k]["accounts"] += 1
            d[k]["with_event"] += ok

    def rows_of(d: dict[str, dict[str, int]], sort_key=None, limit: int = 15) -> list[dict[str, Any]]:
        items = [{"key": k, "accounts": v["accounts"], "with_event": v["with_event"],
                  "pct": round(v["with_event"] / v["accounts"], 4) if v["accounts"] else None} for k, v in d.items()]
        items.sort(key=sort_key or (lambda r: -r["accounts"]))
        return items[:limit]

    total = len(users)
    with_ev = sum(1 for u in users if u[0] in has_event)
    return {
        "generated_at": _utcnow().isoformat(),
        "totals": {"accounts": total, "with_event": with_ev,
                   "pct": round(with_ev / total, 4) if total else None},
        "by_day": rows_of(days, sort_key=lambda r: r["key"], limit=40),
        "by_platform": rows_of(plats),
        "by_version": rows_of(vers),
        "by_method": rows_of(methods),
        "note": ("with_event = a conta tem o evento register_completed. Se for bem menor que accounts, "
                 "o evento se perde (ou a conta nasce por outro caminho) e a taxa do funil de entrada fica subestimada."),
    }


# Os eventos de entrada só são confiáveis desde 15/10/2026 (antes, `register_completed` não disparava
# quando o cadastro vinha com redirecionamento). Sem período escolhido, o comparativo parte daí.
ENTRY_RELIABLE_SINCE = "2026-10-15T13:00:00Z"


def entry_by_platform(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    """Funil de entrada lado a lado: iPhone × Android, só com dados confiáveis."""
    out: dict[str, Any] = {"since": (f.since.isoformat() if f.since else ENTRY_RELIABLE_SINCE), "platforms": {}}
    for plat in ("ios", "android"):
        f2 = AnalyticsFilters.build(
            since=(f.since.isoformat() if f.since else ENTRY_RELIABLE_SINCE),
            until=(f.until.isoformat() if f.until else None),
            platform=plat,
        )
        res = entry_funnel(db, f2)
        out["platforms"][plat] = {"steps": res["steps"], "choices": res["choices"], "failures": res["failures"]}
    return out


_BR = {"brazil", "brasil", "br", "república federativa do brasil", "republica federativa do brasil"}
_US = {"united states", "estados unidos", "eua", "us", "usa"}


def _norm_country(raw: Optional[str]) -> str:
    if not raw or not raw.strip():
        return "sem país"
    k = raw.strip().lower()
    if k in _BR:
        return "Brasil"
    if k in _US:
        return "Estados Unidos"
    return raw.strip()


def installs_quality(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    """Confere a contagem de "1ªs aberturas" POR PLATAFORMA: quantas parecem repetidas (mesmo user-agent
    nas 24 h anteriores), quantas vêm de fora do Brasil (centros de dados/robôs) e quais aparelhos mais
    se repetem. Serve para comparar com o Play Console / App Store Connect e achar o que infla o número."""
    from datetime import timedelta
    from ...analytics.install_models import AppInstall

    since = f.since or (_utcnow() - timedelta(days=30))
    q = db.query(AppInstall.platform, AppInstall.country, AppInstall.city, AppInstall.user_agent,
                 AppInstall.created_at).filter(AppInstall.created_at >= since)
    if f.until:
        q = q.filter(AppInstall.created_at <= f.until)
    rows = q.order_by(AppInstall.created_at.asc()).all()

    plats: dict[str, dict[str, Any]] = {}
    for plat, country, city, ua, at in rows:
        p = plats.setdefault(plat or "?", {"total": 0, "repeated": 0, "outside": defaultdict(int), "ua": defaultdict(int),
                                           "last": {}, "no_country": 0})
        p["total"] += 1
        c = _norm_country(country)
        if c == "sem país":
            p["no_country"] += 1
        elif c != "Brasil":
            p["outside"][f"{city or '?'} / {c}"] += 1
        if ua:
            p["ua"][ua[:110]] += 1
            prev = p["last"].get(ua)
            if prev is not None and at is not None and (at - prev) <= timedelta(hours=24):
                p["repeated"] += 1
            if at is not None:
                p["last"][ua] = at

    def top(d: dict, n: int = 6, min_count: int = 1):
        return [{"key": k, "count": v} for k, v in sorted(d.items(), key=lambda kv: -kv[1])[:n] if v >= min_count]

    out = []
    for plat in sorted(plats, key=lambda k: -plats[k]["total"]):
        p = plats[plat]
        outside_total = sum(p["outside"].values())
        out.append({
            "platform": plat, "total": p["total"], "repeated": p["repeated"],
            "repeated_pct": round(p["repeated"] / p["total"], 4) if p["total"] else None,
            "outside_brazil": outside_total, "no_country": p["no_country"],
            "outside_top": top(p["outside"]), "top_user_agents": top(p["ua"], 5, 2),
        })
    return {
        "generated_at": _utcnow().isoformat(),
        "platforms": out,
        "note": ("repetidas = aberturas cujo aparelho/navegador (user-agent) já abriu na mesma plataforma nas 24 h "
                 "anteriores. Fora do Brasil costuma ser robô/centro de dados (Google, Meta, Amazon), não pessoa."),
    }


_PERM_EVENTS = ("perm_push_asked", "perm_push_result", "perm_push_registered",
                "perm_location_asked", "perm_location_result")


def permission_steps(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    """Pedidos de notificação e localização, PASSO A PASSO e por plataforma: perguntado → permitido →
    obtido/registrado → salvo, e o motivo de cada falha. Mostra em que passo o Android perde em relação ao iPhone.
    Só existe a partir da versão que passou a medir (eventos perm_*)."""
    from datetime import timedelta
    from .growth_bi import _platform_of_event

    since = f.since or (_utcnow() - timedelta(days=30))
    q = db.query(AnalyticsProductEvent.event_name, AnalyticsProductEvent.platform, AnalyticsProductEvent.user_id,
                 AnalyticsProductEvent.anonymous_id, AnalyticsProductEvent.properties_json,
                 AnalyticsProductEvent.received_at).filter(
        AnalyticsProductEvent.event_name.in_(_PERM_EVENTS), AnalyticsProductEvent.received_at >= since)
    if f.until:
        q = q.filter(AnalyticsProductEvent.received_at <= f.until)

    people: dict[str, dict[str, set[str]]] = {}
    results: dict[str, dict[str, dict[str, int]]] = {}
    first_seen = None
    for name, plat, uid, anon, props, at in q.all():
        group = _platform_of_event(plat)
        if group not in ("ios", "android"):
            continue
        who = uid or anon
        if not who:
            continue
        try:
            p = json.loads(props) if props else {}
        except (TypeError, ValueError):
            p = {}
        if name in ("perm_push_asked", "perm_location_asked"):
            key = name
        elif name == "perm_push_registered":
            key = "perm_push_registered:" + ("ok" if p.get("ok") else "falhou")
        else:
            key = f"{name}:{p.get('result', '?')}"
        people.setdefault(group, {}).setdefault(key, set()).add(who)
        if name == "perm_push_registered" and not p.get("ok"):
            why = str(p.get("why") or "?")[:60]
            results.setdefault(group, {}).setdefault("push_falhas", {}).setdefault(why, 0)
            results[group]["push_falhas"][why] += 1
        if at is not None and (first_seen is None or at < first_seen):
            first_seen = at

    def count(group: str, key: str) -> int:
        return len(people.get(group, {}).get(key, set()))

    def block(group: str) -> dict[str, Any]:
        loc_keys = sorted({k for k in people.get(group, {}) if k.startswith("perm_location_result:")})
        push_keys = sorted({k for k in people.get(group, {}) if k.startswith("perm_push_result:")})
        return {
            "push_asked": count(group, "perm_push_asked"),
            "push_results": [{"key": k.split(":", 1)[1], "people": count(group, k)} for k in push_keys],
            "push_registered_ok": count(group, "perm_push_registered:ok"),
            "push_registered_fail": count(group, "perm_push_registered:falhou"),
            "push_failures": [{"key": k, "count": v} for k, v in sorted(
                results.get(group, {}).get("push_falhas", {}).items(), key=lambda kv: -kv[1])[:5]],
            "location_asked": count(group, "perm_location_asked"),
            "location_results": [{"key": k.split(":", 1)[1], "people": count(group, k)} for k in loc_keys],
        }

    return {
        "generated_at": _utcnow().isoformat(),
        "since": since.isoformat(),
        "first_event_at": first_seen.isoformat() if first_seen else None,
        "ios": block("ios"),
        "android": block("android"),
        "note": ("Pessoas distintas por passo. Só conta a partir da versão que passou a medir; nos primeiros dias o "
                 "volume é pequeno. location 'saved' = posição obtida E gravada; 'timeout' = estourou o tempo; "
                 "'denied' = a pessoa recusou."),
    }

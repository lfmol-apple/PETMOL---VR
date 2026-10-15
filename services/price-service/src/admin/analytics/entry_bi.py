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

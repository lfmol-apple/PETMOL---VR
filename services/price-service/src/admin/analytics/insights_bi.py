"""Inteligência da meta — lê os dados e diz o que fazer para o tutor chegar a pet + ração + notificação + GPS.

Duas camadas, deliberadamente separadas (a primeira vale sempre, a segunda só quando os dados permitem):

1. **Leitura descritiva** (sempre): taxa de meta completa por plataforma, origem, horário de cadastro,
   com o tamanho da amostra. Só vira recomendação quando há gente suficiente de cada lado e a
   diferença não é ruído (intervalo de confiança de Wilson sem sobreposição).
2. **Modelo de propensão** (só se passar na validação): regressão logística escrita aqui, em Python
   puro (sem dependência nova), treinada nos tutores com tempo de ter ativado. Mede "quem tem mais
   chance de completar a meta" e ordena quem vale a pena avisar primeiro. Só é usado quando a
   validação cruzada (AUC) e o número de casos positivos mostram que ele enxerga algo além do acaso;
   com pouca gente, diz "dados insuficientes" e usa só a camada 1. Nada aqui afirma CAUSA — são
   associações observadas.

A saída é uma lista curta de recomendações com evidência, ação e confiança — é ela que o boletim
diário traz em "O que fazer hoje". Ninguém é contactado por isso: o sistema recomenda, o dono decide.
"""
from __future__ import annotations

import math
import random
from collections import defaultdict
from datetime import datetime, timedelta
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent
from ...user_auth.models import User
from . import campaign_bi, journey_bi, permissions_bi
from .filters import PLATFORM_GROUPS
from .queries import _aware, _utcnow

_BR = ZoneInfo("America/Sao_Paulo")
_CHUNK = 400

MIN_AGE_DAYS = 3          # só tutores com tempo de ter ativado entram no treino
MIN_POSITIVES = 15        # abaixo disso o modelo não é confiável
MIN_AUC = 0.62            # abaixo disso ele não enxerga nada além do acaso
MIN_GROUP = 20            # tamanho mínimo de cada lado para comparar grupos

_HINT = {
    "pet": "Onboarding: o primeiro pet logo depois do cadastro.",
    "feeding": "Cadastro da ração: lembrar e facilitar para quem já tem pet.",
    "push": "Pedido de notificação: momento e texto da permissão.",
    "location": "Pedido de localização (GPS): momento e texto, ligado ao Pet Sumido.",
}
_LABEL = {"pet": "pet", "feeding": "ração", "push": "notificação", "location": "localização"}


# ── Estatística pequena, sem dependências ───────────────────────────────────

def wilson(k: int, n: int, z: float = 1.96) -> tuple[float, float]:
    """Intervalo de confiança de Wilson para uma proporção."""
    if n == 0:
        return (0.0, 1.0)
    p = k / n
    d = 1 + z * z / n
    c = p + z * z / (2 * n)
    m = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))
    return ((c - m) / d, (c + m) / d)


def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Resolve a·x = b (eliminação gaussiana com pivô parcial)."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        piv = max(range(col, n), key=lambda r: abs(m[r][col]))
        m[col], m[piv] = m[piv], m[col]
        if abs(m[col][col]) < 1e-12:
            m[col][col] = 1e-12
        for r in range(col + 1, n):
            f = m[r][col] / m[col][col]
            for c in range(col, n + 1):
                m[r][c] -= f * m[col][c]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (m[i][n] - sum(m[i][j] * x[j] for j in range(i + 1, n))) / m[i][i]
    return x


def _sigmoid(z: float) -> float:
    if z >= 0:
        return 1 / (1 + math.exp(-z))
    e = math.exp(z)
    return e / (1 + e)


def fit_logistic(x: list[list[float]], y: list[int], l2: float = 1.0, iters: int = 30) -> list[float]:
    """Regressão logística (Newton, L2) — coeficientes com o intercepto na posição 0."""
    n, d = len(x), len(x[0]) + 1
    rows = [[1.0] + r for r in x]
    w = [0.0] * d
    for _ in range(iters):
        grad = [0.0] * d
        hess = [[0.0] * d for _ in range(d)]
        for r, yi in zip(rows, y):
            p = _sigmoid(sum(wi * ri for wi, ri in zip(w, r)))
            err = p - yi
            s = p * (1 - p)
            for i in range(d):
                grad[i] += err * r[i]
                for j in range(d):
                    hess[i][j] += s * r[i] * r[j]
        for i in range(1, d):          # intercepto não é penalizado
            grad[i] += l2 * w[i]
            hess[i][i] += l2
        step = _solve(hess, grad)
        w = [wi - si for wi, si in zip(w, step)]
        if max(abs(s) for s in step) < 1e-6:
            break
    return w


def predict(w: list[float], x: list[float]) -> float:
    return _sigmoid(w[0] + sum(wi * xi for wi, xi in zip(w[1:], x)))


def auc(scores: list[float], labels: list[int]) -> Optional[float]:
    """Área sob a curva ROC (probabilidade de um positivo pontuar acima de um negativo)."""
    pos = [s for s, l in zip(scores, labels) if l == 1]
    neg = [s for s, l in zip(scores, labels) if l == 0]
    if not pos or not neg:
        return None
    wins = sum((p > q) + 0.5 * (p == q) for p in pos for q in neg)
    return wins / (len(pos) * len(neg))


def cross_val_auc(x: list[list[float]], y: list[int], folds: int = 5, seed: int = 7) -> Optional[float]:
    """AUC em validação cruzada estratificada — nota em dados que o modelo NÃO viu."""
    idx_pos = [i for i, v in enumerate(y) if v == 1]
    idx_neg = [i for i, v in enumerate(y) if v == 0]
    if len(idx_pos) < folds or len(idx_neg) < folds:
        return None
    rnd = random.Random(seed)
    rnd.shuffle(idx_pos)
    rnd.shuffle(idx_neg)
    fold_of = {}
    for k, i in enumerate(idx_pos):
        fold_of[i] = k % folds
    for k, i in enumerate(idx_neg):
        fold_of[i] = k % folds
    scores, labels = [], []
    for f in range(folds):
        train = [i for i in range(len(y)) if fold_of[i] != f]
        test = [i for i in range(len(y)) if fold_of[i] == f]
        w = fit_logistic([x[i] for i in train], [y[i] for i in train])
        for i in test:
            scores.append(predict(w, x[i]))
            labels.append(y[i])
    return auc(scores, labels)


# ── Dados ───────────────────────────────────────────────────────────────────

def _chunks(items: list[str]):
    for i in range(0, len(items), _CHUNK):
        yield items[i:i + _CHUNK]


def _hour_bucket(dt: datetime) -> str:
    h = _aware(dt).astimezone(_BR).hour
    return "madrugada" if h < 6 else "manha" if h < 12 else "tarde" if h < 18 else "noite"


def collect(db: Session) -> list[dict[str, Any]]:
    """Uma linha por tutor real, com atributos conhecidos e os 4 marcos da meta."""
    now = _utcnow()
    users = (
        db.query(User.id, User.created_at, User.email_verified, User.phone, User.city)
        .filter(~User.email.like("%@petmol.guest")).all()
    )
    cohort = {str(u.id) for u in users}
    if not cohort:
        return []
    sets = journey_bi._step_user_sets(db, cohort)

    push: set[str] = set()
    gps: set[str] = set()
    ids = list(cohort)
    for chunk in _chunks(ids):
        push.update(str(r[0]) for r in db.query(User.id).filter(User.id.in_(chunk), permissions_bi.has_any_push(User.id)).all())
        gps.update(str(r[0]) for r in db.query(User.id).filter(User.id.in_(chunk), permissions_bi.shares_location()).all())

    # plataforma mais usada por tutor
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for chunk in _chunks(ids):
        for uid, plat, n in (
            db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.platform, func.count())
            .filter(AnalyticsProductEvent.user_id.in_(chunk)).group_by(AnalyticsProductEvent.user_id, AnalyticsProductEvent.platform).all()
        ):
            group = next((g for g, raws in PLATFORM_GROUPS.items() if plat in raws), plat or "web")
            counts[str(uid)][group] += n

    origins = campaign_bi.signup_origins_by_user(db, None, None, None)

    rows = []
    for u in users:
        uid = str(u.id)
        plat = max(counts[uid], key=counts[uid].get) if counts.get(uid) else "desconhecida"
        origin = (origins.get(uid) or (campaign_bi.UNTRACKED, None, None))[0]
        rows.append({
            "user_id": uid,
            "age_days": max((now - _aware(u.created_at)).total_seconds() / 86400, 0.0),
            "platform": plat,
            "hour": _hour_bucket(u.created_at),
            "from_campaign": origin not in (campaign_bi.NO_CAMPAIGN, campaign_bi.UNTRACKED),
            "email_verified": bool(u.email_verified),
            "has_phone": bool(u.phone),
            "has_city": bool(u.city),
            "pet": uid in sets["pet"], "feeding": uid in sets["feeding"],
            "push": uid in push, "location": uid in gps,
        })
    for r in rows:
        r["complete"] = r["pet"] and r["feeding"] and r["push"] and r["location"]
        r["missing"] = [k for k in ("pet", "feeding", "push", "location") if not r[k]]
    return rows


# ── Camada 1: leitura descritiva ────────────────────────────────────────────

def _rate(rows: list[dict[str, Any]]) -> dict[str, Any]:
    n = len(rows)
    k = sum(1 for r in rows if r["complete"])
    lo, hi = wilson(k, n)
    return {"n": n, "complete": k, "rate": round(k / n, 4) if n else None, "lo": round(lo, 4), "hi": round(hi, 4)}


def segments(rows: list[dict[str, Any]]) -> dict[str, dict[str, dict[str, Any]]]:
    out: dict[str, dict[str, dict[str, Any]]] = {}
    for dim, key in (("plataforma", "platform"), ("horario", "hour")):
        groups: dict[str, list] = defaultdict(list)
        for r in rows:
            groups[r[key]].append(r)
        out[dim] = {g: _rate(rs) for g, rs in groups.items()}
    out["origem"] = {
        "campanha": _rate([r for r in rows if r["from_campaign"]]),
        "organico": _rate([r for r in rows if not r["from_campaign"]]),
    }
    return out


# ── Camada 2: modelo de propensão ───────────────────────────────────────────

_FEATURES = ("ios", "android", "from_campaign", "email_verified", "has_phone", "has_city", "tarde", "noite", "madrugada")


def _vector(r: dict[str, Any]) -> list[float]:
    return [
        1.0 if r["platform"] == "ios" else 0.0, 1.0 if r["platform"] == "android" else 0.0,
        float(r["from_campaign"]), float(r["email_verified"]), float(r["has_phone"]), float(r["has_city"]),
        1.0 if r["hour"] == "tarde" else 0.0, 1.0 if r["hour"] == "noite" else 0.0, 1.0 if r["hour"] == "madrugada" else 0.0,
        math.log1p(r["age_days"]) / 4.0,
    ]


def train(rows: list[dict[str, Any]]) -> dict[str, Any]:
    trainable = [r for r in rows if r["age_days"] >= MIN_AGE_DAYS]
    y = [1 if r["complete"] else 0 for r in trainable]
    info: dict[str, Any] = {"n": len(trainable), "positives": sum(y), "usable": False, "auc": None, "weights": None}
    if sum(y) < MIN_POSITIVES or len(y) - sum(y) < MIN_POSITIVES:
        info["reason"] = f"poucos casos para aprender (precisa de {MIN_POSITIVES}+ que completaram e {MIN_POSITIVES}+ que não)"
        return info
    x = [_vector(r) for r in trainable]
    a = cross_val_auc(x, y)
    info["auc"] = round(a, 3) if a is not None else None
    if a is None or a < MIN_AUC:
        info["reason"] = "o modelo não separa quem completa de quem não completa melhor que o acaso"
        return info
    w = fit_logistic(x, y)
    info.update(usable=True, weights=w, odds={n: round(math.exp(c), 2) for n, c in zip(_FEATURES, w[1:len(_FEATURES) + 1])})
    return info


# ── Recomendações ───────────────────────────────────────────────────────────

def _confidence(n: int) -> str:
    return "alta" if n >= 100 else "média" if n >= 40 else "baixa"


def recommendations(db: Session) -> dict[str, Any]:
    rows = collect(db)
    total = len(rows)
    complete = sum(1 for r in rows if r["complete"])
    recs: list[dict[str, Any]] = []

    # 1) etapa mais fraca e o ganho mais barato
    steps = []
    for k in ("pet", "feeding", "push", "location"):
        have = sum(1 for r in rows if r[k])
        only = sum(1 for r in rows if r["missing"] == [k])
        steps.append({"key": k, "label": _LABEL[k], "have": have, "pct": round(have / total, 4) if total else None,
                      "missing": total - have, "only_missing": only})
    weakest = min((s for s in steps if s["pct"] is not None), key=lambda s: s["pct"], default=None)
    if weakest:
        recs.append({
            "kind": "etapa",
            "title": f"Foque em {weakest['label']}: é onde menos gente chega ({round(weakest['pct'] * 100)}%)",
            "evidence": f"{weakest['missing']} de {total} tutores ainda não têm {weakest['label']}; "
                        f"{weakest['only_missing']} deles só precisam dessa etapa para completar a meta.",
            "action": _HINT[weakest["key"]],
            "confidence": _confidence(total), "impact": weakest["only_missing"],
        })

    # 2) quem está a um passo da meta (o ganho mais barato, em qualquer etapa)
    one_away = defaultdict(int)
    for r in rows:
        if len(r["missing"]) == 1:
            one_away[r["missing"][0]] += 1
    near = sum(one_away.values())
    if near:
        top = max(one_away, key=one_away.get)
        recs.append({
            "kind": "quase_la",
            "title": f"{near} tutores estão a UM passo da meta",
            "evidence": ", ".join(f"{n} só sem {_LABEL[k]}" for k, n in sorted(one_away.items(), key=lambda kv: -kv[1])),
            "action": f"Mande a mensagem de {_LABEL[top]} primeiro para quem falta só isso: é o grupo mais barato de converter.",
            "confidence": "alta", "impact": near,
        })

    # 3) diferenças reais entre grupos (só com amostra suficiente e sem sobreposição de intervalos)
    seg = segments(rows)
    for dim, groups in seg.items():
        big = {g: s for g, s in groups.items() if s["n"] >= MIN_GROUP and g != "desconhecida"}
        if len(big) < 2:
            continue
        best = max(big, key=lambda g: big[g]["rate"] or 0)
        worst = min(big, key=lambda g: big[g]["rate"] or 0)
        b, w = big[best], big[worst]
        if b["lo"] > w["hi"]:     # intervalos de confiança não se sobrepõem: não é acaso
            recs.append({
                "kind": "grupo",
                "title": f"Por {dim}: {worst} completa a meta bem menos que {best}",
                "evidence": f"{round(w['rate'] * 100)}% ({w['complete']}/{w['n']}) contra {round(b['rate'] * 100)}% ({b['complete']}/{b['n']}).",
                "action": f"Investigue o que {worst} tem de diferente no cadastro e nos pedidos de permissão. "
                          "É uma associação observada, não prova de causa.",
                "confidence": _confidence(min(w["n"], b["n"])), "impact": w["n"] - w["complete"],
            })

    # 4) modelo de propensão: ordem de quem avisar
    model = train(rows)
    if model["usable"]:
        scored = sorted(
            ((predict(model["weights"], _vector(r)), r) for r in rows if not r["complete"] and r["age_days"] >= 1),
            key=lambda t: -t[0])
        hot = [r for s, r in scored if s >= 0.3 and len(r["missing"]) <= 2]
        if hot:
            recs.append({
                "kind": "modelo",
                "title": f"{len(hot)} tutores têm alta chance de completar com um empurrão",
                "evidence": f"Modelo (acerto medido em dados que ele não viu: AUC {model['auc']}, {model['positives']} casos de sucesso).",
                "action": "Priorize estes na campanha de ativação; a lista é ordenada por chance.",
                "confidence": "média", "impact": len(hot),
            })

    recs.sort(key=lambda r: -r["impact"])
    return {
        "generated_at": _utcnow().isoformat(),
        "goal": {"total": total, "complete": complete, "pct": round(complete / total, 4) if total else None, "steps": steps},
        "recommendations": recs[:5],
        "model": {k: v for k, v in model.items() if k != "weights"},
        "segments": seg,
        "notes": [
            "São associações observadas nos dados do PETMOL, não relações de causa e efeito.",
            "Com poucos tutores, diferenças pequenas podem ser acaso: por isso cada recomendação traz a amostra e a confiança.",
        ],
    }

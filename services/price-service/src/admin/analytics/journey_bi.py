"""Jornada e Conversão — funil de aquisição completo, do cadastro até a loja.

Continuação do que já existia em `queries.activation_funnel` (mantido lá,
sem quebrar quem já chama), com três diferenças:
1. Respeita o filtro de período (cohort: só tutores criados na janela) — o
   original sempre contava TODOS os tutores, ignorando o filtro que a tela
   já mostrava como se estivesse aplicado.
2. Estende até a Loja do Pet (loja aberta → oferta vista → clique), usando
   os mesmos eventos reais do funil comercial da Ração — um funil contínuo
   de aquisição até intenção de compra, não dois funis desconectados.
3. Cada etapa tem drill-down (population): clicar mostra os tutores.

Continua SEM inventar o que não existe: primeiro acesso antes do cadastro
(não há como linkar anonymous_id → user_id de forma confiável hoje), tempo
entre etapas, e venda/comissão confirmada (isso é o `commerce_funnel` já
declarado em feeding_bi.py) — nada disso está aqui.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...analytics.models import AnalyticsProductEvent
from ...pets.grooming_models import GroomingRecord
from ...pets.models import Pet
from ...pets.parasite_models import ParasiteControlRecord
from ...pets.vaccine_models import VaccineRecord
from ...user_auth.models import User
from .filters import AnalyticsFilters
from .queries import _aware, _feeding_configured_pet_ids, _resolve_photo_url, _utcnow

STEPS: list[tuple[str, str]] = [
    ("account", "Conta criada"),
    ("pet", "Pet cadastrado"),
    ("profile", "Perfil básico completo"),
    ("feeding", "Alimentação cadastrada"),
    ("control", "Primeiro controle configurado"),
    ("returned", "Retornou (>1 dia de uso)"),
    ("store_opened", "Loja do Pet aberta"),
    ("offer_viewed", "Oferta visualizada"),
    ("commerce_click", "Clique em oferta/link afiliado"),
]
STEP_LABEL = dict(STEPS)


def _cohort_user_ids(db: Session, f: AnalyticsFilters) -> set[str]:
    q = db.query(User.id)
    if f.since:
        q = q.filter(User.created_at >= f.since)
    if f.until:
        q = q.filter(User.created_at <= f.until)
    if f.state:
        q = q.filter(func.lower(User.state) == f.state.lower())
    if f.city:
        q = q.filter(func.lower(User.city) == f.city.lower())
    return {r[0] for r in q.all()}


def _step_user_sets(db: Session, cohort: set[str]) -> dict[str, set[str]]:
    """Um conjunto de user_id por etapa — só dentro do cohort do filtro."""
    users_with_pet = {r[0] for r in db.query(Pet.user_id).distinct().all()} & cohort

    pet_rows = db.query(Pet.user_id, Pet.species, Pet.breed, Pet.birth_date) \
        .filter(Pet.user_id.in_(cohort or {"__none__"})).all()
    users_profile_ok: set[str] = {uid for uid, sp, br, bd in pet_rows if sp and (br or bd)}

    feeding_pet_ids = _feeding_configured_pet_ids(db)
    users_feeding = {
        r[0] for r in db.query(Pet.user_id)
        .filter(Pet.id.in_(feeding_pet_ids or {"__none__"}), Pet.user_id.in_(cohort or {"__none__"}))
        .distinct()
    }

    users_control: set[str] = set()
    for model, col in (
        (VaccineRecord, VaccineRecord.pet_id),
        (ParasiteControlRecord, ParasiteControlRecord.pet_id),
        (GroomingRecord, GroomingRecord.pet_id),
    ):
        pids = {r[0] for r in db.query(col).all()}
        for (uid,) in db.query(Pet.user_id).filter(
            Pet.id.in_(pids or {"__none__"}), Pet.user_id.in_(cohort or {"__none__"})
        ).distinct():
            users_control.add(uid)

    first_last = db.query(
        AnalyticsProductEvent.user_id,
        func.min(AnalyticsProductEvent.received_at),
        func.max(AnalyticsProductEvent.received_at),
    ).filter(AnalyticsProductEvent.user_id.in_(cohort or {"__none__"})) \
        .group_by(AnalyticsProductEvent.user_id).all()
    users_returned = {
        uid for uid, first, last in first_last
        if first and last and (_aware(last) - _aware(first)).total_seconds() > 86400
    }

    event_sets: dict[str, set[str]] = {}
    for name in ("store_opened", "offer_viewed", "commerce_click"):
        event_sets[name] = {
            r[0] for r in db.query(AnalyticsProductEvent.user_id)
            .filter(AnalyticsProductEvent.event_name == name,
                    AnalyticsProductEvent.user_id.in_(cohort or {"__none__"}))
            .distinct().all()
        }

    return {
        "account": cohort,
        "pet": users_with_pet,
        "profile": users_profile_ok,
        "feeding": users_feeding,
        "control": users_control,
        "returned": users_returned,
        "store_opened": event_sets["store_opened"],
        "offer_viewed": event_sets["offer_viewed"],
        "commerce_click": event_sets["commerce_click"],
    }


def journey_funnel(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    now = _utcnow()
    cohort = _cohort_user_ids(db, f)
    sets = _step_user_sets(db, cohort)
    total = len(cohort)

    steps = []
    prev: Optional[int] = None
    for key, label in STEPS:
        n = len(sets[key])
        steps.append({
            "key": key, "label": label, "users": n,
            "pct_of_total": round(n / total, 4) if total else 0.0,
            "pct_from_previous": round(n / prev, 4) if prev else None,
        })
        prev = n

    return {
        "generated_at": now.isoformat(),
        "cohort_total": total,
        "cohort_note": (
            "Cada etapa conta tutores ÚNICOS dentro do cohort filtrado (tutores "
            "criados no período escolhido) — muda com o filtro de período/UF/cidade, "
            "diferente da versão anterior que sempre somava todos os tutores."
        ),
        "steps": steps,
        "instrumentation_gaps": [
            "Primeiro acesso antes de criar conta não é medido — não há como ligar "
            "de forma confiável um visitante anônimo (antes do cadastro) à conta "
            "que ele criou depois.",
            "Tempo entre etapas não é medido — os dados dizem SE cada etapa foi "
            "concluída, não QUANDO em relação às outras.",
            "Venda e comissão confirmada: ver o funil comercial da Ração — não "
            "existe integração com as plataformas afiliadas para confirmar isso.",
        ],
    }


def journey_step_population(
    db: Session, step: str, f: AnalyticsFilters, *, page: int, page_size: int
) -> dict[str, Any]:
    if step not in STEP_LABEL:
        return {"error": f"etapa desconhecida: {step}"}
    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    cohort = _cohort_user_ids(db, f)
    sets = _step_user_sets(db, cohort)
    user_ids = sorted(sets[step])
    total = len(user_ids)

    users = db.query(User).filter(User.id.in_(user_ids or {"__none__"})) \
        .order_by(User.created_at.desc()).all()
    users = users[(page - 1) * page_size: page * page_size]
    page_ids = [u.id for u in users]

    pets_by_user: dict[str, list] = {}
    if page_ids:
        for p in db.query(Pet.id, Pet.user_id, Pet.name, Pet.species, Pet.photo) \
                .filter(Pet.user_id.in_(page_ids)).all():
            pets_by_user.setdefault(p[1], []).append(
                {"pet_id": p[0], "name": p[2], "species": p[3], "photo_url": _resolve_photo_url(p[4])}
            )

    items = [
        {
            "user_id": u.id, "name": u.name, "email": u.email,
            "city": u.city, "state": u.state, "created_at": u.created_at.isoformat() if u.created_at else None,
            "pet_thumbnails": pets_by_user.get(u.id, [])[:4],
        }
        for u in users
    ]

    return {"step": step, "label": STEP_LABEL[step], "total": total, "page": page, "page_size": page_size, "items": items}

"""Painel de Alimentação e Ração — prioridade máxima do Mission Control.

Tudo aqui é ESTADO real do banco (FeedingPlan/items_json), não eventos —
não existe instrumentação de tentativa de leitura de código de barras, busca
manual ou "abandonou o formulário" no catálogo de eventos hoje (ver
analytics/router.py `_SAFE_EVENT_NAMES`). Por isso este módulo responde "em
que estágio o cadastro parou" (funil histórico de cadastro), não "em que
passo, no tempo, o tutor abandonou a tela" (funil de eventos) — as duas
coisas são diferentes e não devem ser misturadas (o pedido original foi
claro sobre isso). O funil comercial (loja/oferta/clique), que É baseado em
eventos reais, mora em `commerce_funnel()` no fim do arquivo.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from ...health.models import FeedingPlan
from ...pets.models import Pet
from ...user_auth.models import User
from .filters import AnalyticsFilters
from .queries import _identity_expr, _resolve_photo_url

# Ordem = ordem de exibição no funil (cada estágio é um corte do anterior).
STAGES: list[tuple[str, str]] = [
    ("sem_inicio", "Sem alimentação cadastrada"),
    ("sem_produto", "Iniciou, sem produto definido"),
    ("sem_correspondencia", "Produto sem GTIN/correspondência comercial"),
    ("sem_quantidade_duracao", "Sem quantidade ou duração configurada"),
    ("configurado_inativo", "Configurado, mas desativado"),
    ("controle_ativo", "Controle alimentar ativo"),
]
STAGE_LABEL = dict(STAGES)


def _items(raw: Optional[str]) -> list[dict]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, list) else []
    except (TypeError, ValueError):
        return []


def feeding_stage(plan: Optional[FeedingPlan]) -> str:
    """Um pet, um estágio — nunca dois ao mesmo tempo."""
    if plan is None or plan.deleted_at is not None:
        return "sem_inicio"
    items = _items(plan.items_json)
    has_brand = bool(plan.food_brand)
    if not has_brand and not items:
        return "sem_produto"
    has_gtin = any((it or {}).get("barcode") or (it or {}).get("gtin") for it in items)
    if not has_gtin:
        return "sem_correspondencia"
    has_qty = plan.daily_amount_g is not None
    has_duration = plan.duration_days is not None or bool(plan.no_consumption_control)
    if not (has_qty and has_duration):
        return "sem_quantidade_duracao"
    if not plan.enabled:
        return "configurado_inativo"
    return "controle_ativo"


def _apply_geo(db: Session, q, f: AnalyticsFilters):
    if f.state:
        q = q.filter(func.lower(User.state) == f.state.lower())
    if f.city:
        q = q.filter(func.lower(User.city) == f.city.lower())
    return q


def feeding_funnel(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    q = db.query(Pet, FeedingPlan).join(User, User.id == Pet.user_id).outerjoin(
        FeedingPlan, (FeedingPlan.pet_id == Pet.id) & (FeedingPlan.deleted_at.is_(None))
    )
    q = _apply_geo(db, q, f)
    rows = q.all()

    counts: dict[str, int] = {k: 0 for k, _ in STAGES}
    for _pet, plan in rows:
        counts[feeding_stage(plan)] += 1
    total = len(rows)

    funnel = []
    # "acima da linha" = pets que já passaram desse corte (>= estágio atual).
    order = [k for k, _ in STAGES]
    for i, (key, label) in enumerate(STAGES):
        at_or_beyond = sum(counts[k] for k in order[i:])
        funnel.append({
            "key": key, "label": label, "pets": counts[key],
            "pets_at_or_beyond": at_or_beyond,
            "pct_of_total": round(at_or_beyond / total, 4) if total else 0.0,
        })

    # Marcas mais cadastradas — só entre quem tem produto definido.
    brand_rows = (
        db.query(FeedingPlan.food_brand, func.count(func.distinct(FeedingPlan.pet_id)))
        .join(Pet, Pet.id == FeedingPlan.pet_id).join(User, User.id == Pet.user_id)
        .filter(FeedingPlan.deleted_at.is_(None), FeedingPlan.food_brand.isnot(None))
    )
    brand_rows = _apply_geo(db, brand_rows, f)
    top_brands = sorted(
        [{"brand": b, "pets": int(c)} for b, c in brand_rows.group_by(FeedingPlan.food_brand).all()],
        key=lambda r: r["pets"], reverse=True,
    )[:10]

    # Previsão de término — só entre controles ativos com data calculada.
    # Calculado em Python a partir das linhas (volume baixo o bastante pra
    # não precisar de operador de data no SQL, e evita divergência entre o
    # dialeto usado em produção — Postgres — e o do teste — SQLite).
    now = datetime.now(timezone.utc).date()
    active_end_dates = (
        db.query(FeedingPlan.estimated_end_date)
        .join(Pet, Pet.id == FeedingPlan.pet_id).join(User, User.id == Pet.user_id)
        .filter(FeedingPlan.deleted_at.is_(None), FeedingPlan.enabled.is_(True), FeedingPlan.estimated_end_date.isnot(None))
    )
    active_end_dates = _apply_geo(db, active_end_dates, f)
    ending_soon_n = sum(1 for (d,) in active_end_dates.all() if d is not None and 0 <= (d - now).days <= 7)

    return {
        "total_pets": total,
        "funnel": funnel,
        "top_brands": top_brands,
        "ending_soon_7d": ending_soon_n,
        "instrumentation_gaps": [
            "Leitura de código de barras (tentativas, sucesso/falha) não é registrada — não existe evento para isso hoje.",
            "Busca manual de produto (texto pesquisado, encontrado/não encontrado) não é registrada.",
            "Este funil é por ESTADO do cadastro salvo, não por passos no tempo — não indica quanto tempo um tutor ficou parado numa tela nem confirma abandono, só o que ficou incompleto.",
        ],
    }


def feeding_stage_population(
    db: Session, stage: str, f: AnalyticsFilters, *, page: int, page_size: int
) -> dict[str, Any]:
    if stage not in STAGE_LABEL:
        return {"error": f"estágio desconhecido: {stage}"}
    page = max(1, page)
    page_size = max(1, min(page_size, 200))

    q = db.query(Pet, FeedingPlan, User).join(User, User.id == Pet.user_id).outerjoin(
        FeedingPlan, (FeedingPlan.pet_id == Pet.id) & (FeedingPlan.deleted_at.is_(None))
    )
    q = _apply_geo(db, q, f)
    all_rows = q.all()
    matched = [(pet, plan, user) for pet, plan, user in all_rows if feeding_stage(plan) == stage]
    total = len(matched)
    matched.sort(key=lambda r: r[0].created_at or datetime.min, reverse=True)
    page_rows = matched[(page - 1) * page_size: page * page_size]

    items = []
    for pet, plan, user in page_rows:
        items.append({
            "pet_id": pet.id, "pet_name": pet.name, "species": pet.species, "breed": pet.breed,
            "photo_url": _resolve_photo_url(pet.photo),
            "food_brand": plan.food_brand if plan else None,
            "user_id": user.id, "tutor_name": user.name, "tutor_email": user.email,
            "city": user.city, "state": user.state,
        })

    return {
        "stage": stage, "label": STAGE_LABEL[stage],
        "total": total, "page": page, "page_size": page_size,
        "items": items,
    }


# ═══════════════════════════════════════════════════════════════════════════
#  FUNIL COMERCIAL — baseado em eventos reais (analytics_product_events)
# ═══════════════════════════════════════════════════════════════════════════

_COMMERCE_STEPS = [
    ("store_opened", "Loja do Pet aberta"),
    ("offer_viewed", "Oferta visualizada"),
    ("commerce_click", "Clique em oferta/link afiliado"),
]


def commerce_funnel(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    from ...analytics.models import AnalyticsProductEvent

    q = db.query(AnalyticsProductEvent)
    if f.since:
        q = q.filter(AnalyticsProductEvent.received_at >= f.since)
    if f.until:
        q = q.filter(AnalyticsProductEvent.received_at <= f.until)

    steps = []
    for name, label in _COMMERCE_STEPS:
        n = q.filter(AnalyticsProductEvent.event_name == name) \
            .with_entities(func.count(func.distinct(_identity_expr()))).scalar() or 0
        steps.append({"key": name, "label": label, "users": int(n)})

    return {
        "steps": steps,
        "sale_confirmed": None,
        "commission_confirmed": None,
        "note": (
            "Venda confirmada e comissão confirmada: conversão não disponível — "
            "não existe integração com as plataformas afiliadas (Awin/Cobasi/Shopee) "
            "que devolva confirmação de venda ou valor de comissão. Clique não é venda; "
            "venda não é comissão confirmada — nenhum dos dois é inventado aqui."
        ),
    }

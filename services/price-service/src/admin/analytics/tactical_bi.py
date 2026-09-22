"""Inteligência tática — sugestões baseadas em dados reais, decisão humana.

O sistema RECOMENDA a partir de números que já existem em produção (nenhum
evento novo, nenhuma coleta nova); o master APROVA, ADIA ou DESCARTA. Nada
daqui envia push — a decisão fica só registrada (`TacticalDecision`), pra
quando/se uma campanha de verdade for desenhada, fora desta reconstrução.

Também traz os cards de Pets Desaparecidos/Encontrados — "encontrado com
participação comprovada do PETMOL" só conta quando existe um avistamento
(`PetSighting.matched_missing_pet_id`) ligado ao alerta; sem isso, o pet
"encontrado" pode ter sido achado por conta própria do tutor — não
atribuímos mérito sem essa evidência.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.orm import Session

from ...db import Base
from .feeding_bi import feeding_funnel
from .filters import AnalyticsFilters
from .journey_bi import journey_funnel


class TacticalDecision(Base):
    """Uma linha por sugestão tática decidida — nunca dispara nada sozinha."""

    __tablename__ = "tactical_decisions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    suggestion_key: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)  # approved_for_review | postponed | discarded
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    decided_by: Mapped[Optional[str]] = mapped_column(String(320), nullable=True)
    # default em Python (microssegundo), não server_default=func.now() — o
    # SQLite só guarda CURRENT_TIMESTAMP em resolução de segundo, e duas
    # decisões na mesma sugestão dentro do mesmo segundo empatavam o
    # ORDER BY DESC de _latest_decisions, pegando a mais antiga às vezes.
    decided_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )


_DECISION_LABEL = {
    "approved_for_review": "Análise solicitada",
    "postponed": "Adiada",
    "discarded": "Descartada",
}


def _latest_decisions(db: Session, keys: list[str]) -> dict[str, dict[str, Any]]:
    if not keys:
        return {}
    rows = (
        db.query(TacticalDecision)
        .filter(TacticalDecision.suggestion_key.in_(keys))
        .order_by(TacticalDecision.decided_at.desc())
        .all()
    )
    out: dict[str, dict[str, Any]] = {}
    for r in rows:
        if r.suggestion_key in out:
            continue  # já pegamos a mais recente (ordenado desc)
        out[r.suggestion_key] = {
            "decision": r.decision,
            "decision_label": _DECISION_LABEL.get(r.decision, r.decision),
            "note": r.note,
            "decided_by": r.decided_by,
            "decided_at": r.decided_at.isoformat() if r.decided_at else None,
        }
    return out


def tactical_suggestions(db: Session, f: AnalyticsFilters) -> dict[str, Any]:
    feeding = feeding_funnel(db, f)
    journey = journey_funnel(db, f)

    sem_inicio = next((s for s in feeding["funnel"] if s["key"] == "sem_inicio"), None)
    sem_inicio_n = sem_inicio["pets"] if sem_inicio else 0

    # maior queda de uma etapa pra outra no funil de aquisição (fora a 1ª,
    # que é sempre 100% por definição)
    steps = journey["steps"]
    worst_drop = None
    for i in range(1, len(steps)):
        prev_n, cur_n = steps[i - 1]["users"], steps[i]["users"]
        if prev_n <= 0:
            continue
        drop_pct = 1 - (cur_n / prev_n)
        if worst_drop is None or drop_pct > worst_drop["drop_pct"]:
            worst_drop = {"from": steps[i - 1]["label"], "to": steps[i]["label"], "drop_pct": drop_pct, "lost": prev_n - cur_n}

    stale_control = next((s for s in feeding["funnel"] if s["key"] == "configurado_inativo"), None)
    stale_n = stale_control["pets"] if stale_control else 0

    candidates = []
    if sem_inicio_n > 0:
        pct = round(sem_inicio_n / max(1, feeding["total_pets"]) * 100, 1)
        candidates.append({
            "key": "feeding_missing",
            "title": f"{sem_inicio_n} pets sem alimentação cadastrada",
            "body": (
                f"{pct}% dos pets ainda não têm nenhum início de cadastro de ração. "
                "Antes de recomendar um push, vale segmentar quem nunca abriu a tela de "
                "quem começou e não terminou — são públicos diferentes."
            ),
            "example_message": "Cadastre a ração do seu pet para acompanhar o consumo e encontrar ofertas do mesmo produto.",
            "audience_size": sem_inicio_n,
        })
    if worst_drop and worst_drop["lost"] > 0:
        candidates.append({
            "key": "journey_worst_drop",
            "title": f"Maior queda da jornada: \"{worst_drop['from']}\" → \"{worst_drop['to']}\"",
            "body": (
                f"{worst_drop['lost']} tutor(es) chegaram em \"{worst_drop['from']}\" e não avançaram até "
                f"\"{worst_drop['to']}\" ({round(worst_drop['drop_pct'] * 100)}% de queda). Vale entender o "
                "motivo antes de qualquer comunicação — a causa pode ser de produto, não de lembrete."
            ),
            "example_message": None,
            "audience_size": worst_drop["lost"],
        })
    if stale_n > 0:
        candidates.append({
            "key": "feeding_configured_inactive",
            "title": f"{stale_n} controle(s) de ração configurado(s) mas desativado(s)",
            "body": (
                "O tutor terminou de configurar e depois desativou (ou nunca ativou). "
                "Pode ser um lembrete útil de reativação, ou pode ser um sinal de que o "
                "controle não estava servindo — vale checar antes de reengajar."
            ),
            "example_message": "Seu controle de ração está pausado. Quer retomar os lembretes de reposição?",
            "audience_size": stale_n,
        })

    keys = [c["key"] for c in candidates]
    decisions = _latest_decisions(db, keys)
    for c in candidates:
        c["decision"] = decisions.get(c["key"])

    return {
        "suggestions": candidates,
        "note": (
            "Geradas a partir de dados já existentes (Alimentação/Jornada), sem coleta "
            "nova. O sistema recomenda; nenhum push é enviado por este painel — aprovar "
            "só registra a decisão pra referência futura."
        ),
    }


def record_tactical_decision(
    db: Session, suggestion_key: str, decision: str, note: Optional[str], decided_by: Optional[str]
) -> dict[str, Any]:
    if decision not in ("approved_for_review", "postponed", "discarded"):
        return {"error": f"decisão inválida: {decision}"}
    row = TacticalDecision(
        suggestion_key=suggestion_key, decision=decision, note=note, decided_by=decided_by,
    )
    db.add(row)
    db.commit()
    return {
        "ok": True, "suggestion_key": suggestion_key, "decision": decision,
        "decision_label": _DECISION_LABEL[decision],
        "decided_at": row.decided_at.isoformat() if row.decided_at else datetime.now(timezone.utc).isoformat(),
    }


def missing_pets_summary(db: Session) -> dict[str, Any]:
    from ...missing_pets import MissingPet, PetSighting

    active = db.query(func.count(MissingPet.id)).filter(MissingPet.status == "active").scalar() or 0
    found_total = db.query(func.count(MissingPet.id)).filter(MissingPet.status == "found").scalar() or 0

    found_ids = {r[0] for r in db.query(MissingPet.id).filter(MissingPet.status == "found").all()}
    matched_ids = {
        r[0] for r in db.query(PetSighting.matched_missing_pet_id)
        .filter(PetSighting.matched_missing_pet_id.in_(found_ids or {"__none__"}))
        .distinct().all()
    }
    found_with_participation = len(found_ids & matched_ids)

    return {
        "active": int(active),
        "found_total": int(found_total),
        "found_with_petmol_participation": found_with_participation,
        "note": (
            "'Com participação comprovada' conta só os casos com pelo menos um "
            "avistamento reportado pelo app ligado ao alerta — os demais 'encontrados' "
            "podem ter sido achados pelo tutor por conta própria; não atribuímos mérito "
            "sem essa evidência."
        ),
    }

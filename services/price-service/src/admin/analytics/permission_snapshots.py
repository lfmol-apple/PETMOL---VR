"""Fotografias periódicas do estado de permissões (notificação ativa × localização compartilhada).

Serve para ACOMPANHAR a evolução: a primeira ("baseline") é gravada sozinha na 1ª vez que a API sobe
com esta versão — antes de qualquer melhoria que mude os números —, e depois uma por dia (preguiçosa,
quando alguém abre o painel) ou sob demanda ("Gravar agora"). Só guarda totais agregados, nenhum dado
de tutor.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from ...db import Base
from . import permissions_bi

DAILY_MIN_AGE = timedelta(hours=20)


class PermissionSnapshot(Base):
    __tablename__ = "permission_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    taken_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    kind: Mapped[str] = mapped_column(String(12), nullable=False)      # baseline | daily | manual
    data_json: Mapped[str] = mapped_column(Text, nullable=False)


def take_snapshot(db: Session, kind: str = "manual") -> PermissionSnapshot:
    row = PermissionSnapshot(kind=kind, data_json=json.dumps(permissions_bi.summary(db)), taken_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def ensure_baseline(db: Session) -> Optional[PermissionSnapshot]:
    """Grava a linha de base se ainda não existe nenhuma fotografia."""
    if db.query(PermissionSnapshot.id).first() is not None:
        return None
    return take_snapshot(db, "baseline")


def ensure_daily(db: Session) -> Optional[PermissionSnapshot]:
    """Grava a do dia se a última tem mais de ~20 h (chamada preguiçosa ao abrir o painel)."""
    last = db.query(PermissionSnapshot).order_by(PermissionSnapshot.taken_at.desc()).first()
    if last is None:
        return take_snapshot(db, "baseline")
    taken = last.taken_at if last.taken_at.tzinfo else last.taken_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - taken >= DAILY_MIN_AGE:
        return take_snapshot(db, "daily")
    return None


def _flat(row: PermissionSnapshot) -> dict:
    d = json.loads(row.data_json)
    taken = row.taken_at if row.taken_at.tzinfo else row.taken_at.replace(tzinfo=timezone.utc)
    return {
        "id": row.id, "kind": row.kind, "taken_at": taken.isoformat(),
        "total_users": d["total_users"],
        "push_active": d["push"]["active"], "push_ios": d["push"]["ios"], "push_android": d["push"]["android"], "push_web": d["push"]["web"],
        "gps": d["location"]["gps"], "gps_fresh": d["location"]["gps_fresh"],
        "both": d["combined"]["both"], "only_push": d["combined"]["only_push"],
        "only_location": d["combined"]["only_location"], "neither": d["combined"]["neither"],
    }


def history(db: Session, limit: int = 120) -> list[dict]:
    """Fotografias em ordem cronológica (a primeira é a linha de base)."""
    rows = db.query(PermissionSnapshot).order_by(PermissionSnapshot.taken_at.desc()).limit(limit).all()
    return [_flat(r) for r in reversed(rows)]

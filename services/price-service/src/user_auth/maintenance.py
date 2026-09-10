"""Limpeza periódica de contas guest órfãs.

Uma conta guest (`guest_<uuid>@petmol.guest`) é criada quando alguém entra
como cuidador de um pet por link de convite (ver pets/router.py::guest_join).
Se o vínculo de cuidador some (o pet foi apagado, o convite foi revogado)
sobra uma conta que não consegue fazer nada — só polui o banco e o painel admin.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

logger = logging.getLogger(__name__)

_MIN_AGE_DAYS = 7


def prune_orphan_guest_accounts() -> int:
    """Apaga contas @petmol.guest com mais de 7 dias e SEM nenhum vínculo de
    cuidador ativo. Retorna quantas foram apagadas."""
    from ..db import SessionLocal
    from .models import User
    from ..pets.caretaker_models import PetCaretaker

    cutoff = datetime.now(timezone.utc) - timedelta(days=_MIN_AGE_DAYS)
    db = SessionLocal()
    try:
        linked = select(PetCaretaker.user_id).distinct()
        orphans = (
            db.query(User)
            .filter(
                User.email.like("%@petmol.guest"),
                User.created_at < cutoff,
                ~User.id.in_(linked),
            )
            .all()
        )
        for u in orphans:
            db.delete(u)  # cascade cuida de pets/registros (guest não tem)
        db.commit()
        if orphans:
            logger.info("[guest-prune] %d conta(s) guest órfã(s) apagada(s)", len(orphans))
        return len(orphans)
    except Exception as exc:
        db.rollback()
        logger.warning("[guest-prune] falhou: %s", exc)
        return 0
    finally:
        db.close()

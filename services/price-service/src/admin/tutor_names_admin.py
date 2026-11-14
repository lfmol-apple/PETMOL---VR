"""Página TEMPORÁRIA de normalização de nomes (/admin/nomes): lista os primeiros nomes que o sistema não identificou como tutor/tutora e deixa o
dono dizer, UMA vez por primeiro nome, se é Homem ou Mulher. Grava só o dicionário nome→sexo (tutor_sex.FirstNameSex), nunca por tutor.
Não mostra e-mail nem id de ninguém: só o primeiro nome e quantos tutores alcançáveis têm esse nome."""
from __future__ import annotations

from collections import Counter
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func

from ..db import SessionLocal
from ..user_auth.models import User
from . import tutor_sex
from .deps import get_current_admin
from .push_audience import AudienceContext

router = APIRouter(prefix="/v1/admin/tutor-names", tags=["Admin Nomes"])


class SexBody(BaseModel):
    sex: Literal["male", "female"]


def _pending(db) -> dict:
    ctx = AudienceContext(db)
    reach = ctx.reachable_universe
    ov = tutor_sex.load_overrides(db)
    people = {str(i): (n, e) for i, n, e in db.query(User.id, User.name, User.email).all() if str(i) in reach}
    counts: Counter = Counter()
    display: dict[str, str] = {}
    classified = by_ibge = by_manual = by_email = unusable = 0
    for n, e in people.values():
        key = tutor_sex.name_key(n)
        if not key:
            unusable += 1
            if tutor_sex.estimate(n, e, ov) != tutor_sex.UNKNOWN:
                by_email += 1
                classified += 1
            continue
        if key in ov:
            by_manual += 1; classified += 1
        elif tutor_sex.estimate(n, None, None) != tutor_sex.UNKNOWN:
            by_ibge += 1; classified += 1
        else:
            counts[key] += 1
            display.setdefault(key, tutor_sex.first_name(n).capitalize())
    total = len(people)
    return {
        "reachable": total, "classified": classified, "classified_percent": round(100 * classified / total, 1) if total else 0.0,
        "by_ibge": by_ibge, "by_manual": by_manual, "by_email": by_email, "unusable_name": unusable,
        "pending_tutors": sum(counts.values()), "pending_names": len(counts),
        "pending": [{"key": k, "name": display[k], "tutors": c} for k, c in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))[:400]],
        "enabled": tutor_sex.enabled(),
    }


@router.get("")
def pending(_admin=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        out = _pending(db)
        out["decided"] = [{"key": k, "sex": v} for k, v in sorted(tutor_sex.load_overrides(db).items())]
        return out
    finally:
        db.rollback(); db.close()


@router.put("/{key}")
def decide(key: str, body: SexBody, _admin=Depends(get_current_admin)):
    k = tutor_sex._fold(key)
    if not k.isalpha() or not (2 <= len(k) <= 30):
        raise HTTPException(status_code=422, detail="Nome inválido.")
    db = SessionLocal()
    try:
        row = db.get(tutor_sex.FirstNameSex, k)
        if row:
            row.sex = body.sex
        else:
            db.add(tutor_sex.FirstNameSex(name_key=k, sex=body.sex))
        db.commit()
        return {"key": k, "sex": body.sex}
    finally:
        db.close()


@router.delete("/{key}")
def undo(key: str, _admin=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        db.query(tutor_sex.FirstNameSex).filter(tutor_sex.FirstNameSex.name_key == tutor_sex._fold(key)).delete()
        db.commit()
        return {"key": key, "removed": True}
    finally:
        db.close()

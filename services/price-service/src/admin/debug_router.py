"""Read-only production inspector for support/debugging.

Every route here is guarded by ``get_current_admin_or_readonly_key`` (master
admin JWT *or* the standing ``ADMIN_OPS_API_KEY`` header). It exists so
support can pull the full picture of one account's health records — vaccines,
antiparasitics, grooming, feeding, reminders — without a DB shell.

Never add a route that mutates or deletes a user's data here: the API key has
no per-action audit trail. The one exception is ``/apns-test`` — it sends a
push notification (an outbound side effect, not a data mutation) to help
diagnose native-push delivery without SSH access to server logs.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from ..db import get_db
from ..user_auth.models import User
from ..pets.models import Pet
from ..pets.caretaker_models import PetCaretaker
from ..pets.vaccine_models import VaccineRecord
from ..pets.parasite_models import ParasiteControlRecord
from ..pets.grooming_models import GroomingRecord
from ..health.models import FeedingPlan
from ..notifications import NativePushToken, PushSubscription, Reminder
from ..notifications.apns import (
    _PROD_HOST as APNS_PROD_HOST,
    _SANDBOX_HOST as APNS_SANDBOX_HOST,
    get_recent_apns_attempts,
    send_apns,
)
from .deps import get_current_admin_or_readonly_key

router = APIRouter(prefix="/v1/admin/debug", tags=["Admin Debug"])


def _norm(value: Any) -> Any:
    # Datas são gravadas como timestamptz; o app serializa tudo em UTC ("...Z")
    # e mostra só a parte da data. Normalizar aqui pra UTC deixa a saída
    # diretamente comparável com o que o tutor vê na tela.
    if isinstance(value, datetime):
        dt = value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
        return dt.isoformat().replace("+00:00", "Z")
    return value


def _row_to_dict(obj: Any) -> dict:
    """Every mapped column of a SQLAlchemy row as a plain dict (datas em UTC)."""
    mapper = sa_inspect(obj).mapper
    return {col.key: _norm(getattr(obj, col.key)) for col in mapper.column_attrs}


@router.get("/user")
def inspect_user(
    email: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None),
    include_deleted: bool = Query(default=True),
    _auth=Depends(get_current_admin_or_readonly_key),
    db: Session = Depends(get_db),
):
    """Full health-record dump for one account (by email or user_id)."""
    if not email and not user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="informe email ou user_id")

    q = db.query(User)
    if user_id:
        q = q.filter(User.id == user_id)
    else:
        q = q.filter(User.email == email.strip().lower())
    user = q.first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="usuário não encontrado")

    pets = db.query(Pet).filter(Pet.user_id == user.id).order_by(Pet.created_at).all()

    caretaker_rows = db.query(PetCaretaker).filter(PetCaretaker.user_id == user.id).all()
    caretaker_of = []
    for c in caretaker_rows:
        other_pet = db.query(Pet).filter(Pet.id == c.pet_id).first()
        caretaker_of.append({
            "pet_id": c.pet_id,
            "pet_name": other_pet.name if other_pet else None,
            "owner_user_id": other_pet.user_id if other_pet else None,
            "joined_at": _norm(c.joined_at),
        })

    def _for_pet(model, pet_id: str, order_col: str) -> list[dict]:
        rows = db.query(model).filter(model.pet_id == pet_id)
        if not include_deleted and hasattr(model, "deleted"):
            rows = rows.filter(model.deleted.is_(False))
        rows = rows.order_by(getattr(model, order_col)).all()
        return [_row_to_dict(r) for r in rows]

    pets_out = []
    for p in pets:
        pets_out.append(
            {
                "pet": _row_to_dict(p),
                "vaccine_records": _for_pet(VaccineRecord, p.id, "applied_date"),
                "parasite_control_records": _for_pet(ParasiteControlRecord, p.id, "date_applied"),
                "grooming_records": _for_pet(GroomingRecord, p.id, "created_at"),
                "feeding_plans": _for_pet(FeedingPlan, p.id, "created_at"),
                "reminders": [
                    _row_to_dict(r)
                    for r in db.query(Reminder)
                    .filter(Reminder.pet_id == p.id)
                    .order_by(Reminder.remind_at)
                    .all()
                ],
            }
        )

    # p256dh/auth (Web Push) e token (APNs/FCM) nunca aparecem aqui — dão
    # pra mandar push em nome do usuário. Só o suficiente pra diagnosticar
    # "por que o push não chegou": existe/está ativo, quando, em qual device.
    push_subscriptions = [
        {
            "id": s.id,
            "endpoint_host": (s.endpoint or "").split("/")[2] if "//" in (s.endpoint or "") else s.endpoint,
            "device_id": s.device_id,
            "created_at": _norm(s.created_at),
            "last_seen_at": _norm(s.last_seen_at),
            "disabled_at": _norm(s.disabled_at),
        }
        for s in db.query(PushSubscription).filter(PushSubscription.user_id == user.id).all()
    ]
    native_push_tokens = [
        {
            "id": t.id,
            "platform": t.platform,
            "token_suffix": (t.token or "")[-8:],
            "created_at": _norm(t.created_at),
            "last_seen_at": _norm(t.last_seen_at),
            "disabled_at": _norm(t.disabled_at),
        }
        for t in db.query(NativePushToken).filter(NativePushToken.user_id == user.id).all()
    ]

    return {
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "created_at": user.created_at,
        },
        "pets": pets_out,
        "caretaker_of": caretaker_of,
        "push_subscriptions": push_subscriptions,
        "native_push_tokens": native_push_tokens,
        "counts": {
            "pets": len(pets_out),
            "vaccine_records": sum(len(x["vaccine_records"]) for x in pets_out),
        },
    }


@router.get("/apns-log")
def apns_log(_auth=Depends(get_current_admin_or_readonly_key)):
    """Últimas tentativas reais de envio via APNs (resposta da Apple, não só
    o que o app achou que aconteceu) — cruzar `token_suffix` com
    `native_push_tokens` de /user pra achar de qual usuário/device é.
    Diagnóstico temporário, ver notifications/apns.py."""
    return {"attempts": get_recent_apns_attempts()}


@router.post("/apns-test")
def apns_test(
    email: str = Query(...),
    db: Session = Depends(get_db),
    _auth=Depends(get_current_admin_or_readonly_key),
):
    """Manda um push de teste pro(s) token(s) iOS ativo(s) do usuário, uma vez
    via host de PRODUÇÃO e uma vez via SANDBOX. Existe pra distinguir "a Apple
    aceitou com 200 mas nunca entrega" causado por token de build de
    desenvolvimento (precisa do sandbox) sendo mandado pro host de produção —
    isso não aparece nos logs normais porque a produção às vezes aceita um
    token sandbox com 200 sem nunca entregar de fato."""
    user = db.query(User).filter(User.email == email.strip().lower()).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="usuário não encontrado")

    tokens = (
        db.query(NativePushToken)
        .filter(
            NativePushToken.user_id == user.id,
            NativePushToken.platform == "ios",
            NativePushToken.disabled_at.is_(None),
        )
        .all()
    )
    if not tokens:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sem token iOS ativo")

    payload = {
        "title": "🔔 Teste PETMOL (diagnóstico)",
        "body": "Se você está vendo isso, chegou! Pode ignorar.",
        "data": {"url": "/home"},
    }
    results = []
    for t in tokens:
        row = {"token_suffix": (t.token or "")[-8:], "created_at": _norm(t.created_at)}
        for label, host in (("production", APNS_PROD_HOST), ("sandbox", APNS_SANDBOX_HOST)):
            ok, invalid = send_apns(t.token, payload, host_override=host)
            row[label] = {"ok": ok, "invalid": invalid}
        results.append(row)
    return {"email": user.email, "results": results}

"""Aviso único aos tutores que registraram vacina pelo "registro rápido" enquanto
ele gravava a data do REGISTRO como data da aplicação (corrigido no PR #527).

Quem é avisado: registros `source=quick_add`, aplicação confirmada, criados na
janela [since, until), cuja data de aplicação coincide com o dia do registro
(fuso de São Paulo) ou é o dia 1º do mês do registro (a antiga opção "Esse mês")
— ou seja, onde a data provavelmente não foi escolhida pelo tutor.

Segurança: a prévia devolve só contagens (sem e-mails); o envio exige JWT de
admin; cada tutor recebe uma única vez (log por chave do aviso)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import DateTime, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from ..admin.deps import get_current_admin, get_current_admin_or_readonly_key
from ..db import Base, get_db

router = APIRouter(prefix="/v1/admin/notices/vaccine-date", tags=["Admin Notices"])

NOTICE_KEY = "vaccine-quick-date-2026-09"
SP = ZoneInfo("America/Sao_Paulo")
# ontem 00:00 (São Paulo) → momento em que a correção entrou no ar (deploy do #527)
DEFAULT_SINCE = datetime(2026, 9, 22, 3, 0, tzinfo=timezone.utc)
DEFAULT_UNTIL = datetime(2026, 9, 23, 22, 2, 21, tzinfo=timezone.utc)


class AdminNoticeLog(Base):
    __tablename__ = "admin_notice_log"
    __table_args__ = (UniqueConstraint("notice_key", "user_id", name="uq_admin_notice_key_user"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    notice_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


def _sp_date(dt: datetime):
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(SP).date()


def _applied_day(dt: datetime):
    """Data de aplicação como o app a mostra: parte de data do instante guardado (UTC)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).date()


def affected_records(db: Session, since: datetime, until: datetime) -> dict[str, list[tuple[str, str]]]:
    """{user_id: [(pet_name, vaccine_name), ...]} dos registros prováveis de estarem com data errada."""
    from ..pets.models import Pet
    from ..pets.vaccine_models import VaccineRecord

    rows = (
        db.query(VaccineRecord, Pet)
        .join(Pet, Pet.id == VaccineRecord.pet_id)
        .filter(
            VaccineRecord.source == "quick_add",
            VaccineRecord.deleted.is_(False),
            VaccineRecord.record_type == "confirmed_application",
            VaccineRecord.created_at >= since,
            VaccineRecord.created_at < until,
        )
        .all()
    )
    out: dict[str, list[tuple[str, str]]] = {}
    for rec, pet in rows:
        created = _sp_date(rec.created_at)
        applied = _applied_day(rec.applied_date)
        same_day = applied == created
        first_of_month = applied.day == 1 and (applied.year, applied.month) == (created.year, created.month)
        if not (same_day or first_of_month):
            continue
        out.setdefault(str(pet.user_id), []).append((pet.name or "seu pet", rec.vaccine_name))
    return out


def _pending(db: Session, affected: dict) -> dict:
    done = {
        r[0] for r in db.query(AdminNoticeLog.user_id).filter(AdminNoticeLog.notice_key == NOTICE_KEY).all()
    }
    return {uid: items for uid, items in affected.items() if uid not in done}


class WindowBody(BaseModel):
    since: Optional[datetime] = None
    until: Optional[datetime] = None


def _window(since, until):
    return since or DEFAULT_SINCE, until or DEFAULT_UNTIL


@router.get("/preview")
def preview(
    since: Optional[datetime] = None,
    until: Optional[datetime] = None,
    db: Session = Depends(get_db),
    _=Depends(get_current_admin_or_readonly_key),
):
    s, u = _window(since, until)
    affected = affected_records(db, s, u)
    pending = _pending(db, affected)
    return {
        "since": s.isoformat(), "until": u.isoformat(),
        "users_affected": len(affected),
        "records_affected": sum(len(v) for v in affected.values()),
        "already_notified": len(affected) - len(pending),
        "to_notify_now": len(pending),
    }


def _message(name: str, items: list[tuple[str, str]]):
    from ..admin_alerts import first_name

    greeting = first_name(name)
    lines = "\n".join(f"  • {v} — {p}" for p, v in items[:10])
    push = {
        "title": "Confira a data da vacina que você registrou",
        "body": "O registro rápido guardava a data de hoje como data da aplicação. Já corrigimos: se foi outro dia, ajuste no histórico do pet.",
        "tag": "petmol-vaccine-date-notice",
        "data": {"url": "/home"},
    }
    text = (
        f"Olá{', ' + greeting if greeting else ''}!\n\n"
        "Ontem ou hoje você registrou uma vacina pelo \"registro rápido\" do PETMOL. "
        "Até agora, esse atalho guardava o dia do registro como se fosse o dia da aplicação — "
        "sem perguntar a data real. Isso era uma limitação nossa, e já foi corrigida: "
        "agora o app pergunta a data da aplicação (você pode escolher uma data anterior) "
        "antes de salvar.\n\n"
        "Vacinas registradas por esse atalho no período:\n"
        f"{lines}\n\n"
        "Se alguma delas foi aplicada em outro dia, é só abrir o PETMOL, entrar no histórico de vacinas do pet, "
        "tocar em editar e corrigir a data de aplicação — confira também a data da próxima dose. "
        "Se a data já estava certa, não precisa fazer nada.\n\n"
        "Obrigado por usar o PETMOL!\nEquipe PETMOL"
    )
    return push, text


class SendBody(WindowBody):
    pass


@router.post("/send")
def send(
    body: SendBody,
    db: Session = Depends(get_db),
    admin=Depends(get_current_admin),
):
    from ..mailer import send_mail
    from ..notifications import push_to_user
    from ..user_auth.models import User

    s, u = _window(body.since, body.until)
    pending = _pending(db, affected_records(db, s, u))
    stats = {"users": 0, "push_devices": 0, "emails": 0, "email_failed": 0}
    for uid, items in pending.items():
        user = db.query(User).filter(User.id == uid).first()
        if not user:
            continue
        push_payload, text = _message(user.name or "", items)
        # marca ANTES de enviar: se algo travar no meio, ninguém recebe duas vezes
        db.add(AdminNoticeLog(notice_key=NOTICE_KEY, user_id=uid))
        db.commit()
        stats["users"] += 1
        try:
            stats["push_devices"] += int(push_to_user(uid, push_payload) or 0)
        except Exception:
            pass
        try:
            if user.email and send_mail(
                to=user.email, subject="PETMOL — confira a data da vacina que você registrou", body_text=text,
            ):
                stats["emails"] += 1
            else:
                stats["email_failed"] += 1
        except Exception:
            stats["email_failed"] += 1
    return {"ok": True, **stats}

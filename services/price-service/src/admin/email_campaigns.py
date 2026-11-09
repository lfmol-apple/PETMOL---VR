"""Aba "E-mails" do painel do dono: campanhas de e-mail, uma lista simples.

Decisões do dono (09/11/2026):
- Sem limite por pessoa: NÃO existe "já recebeu ontem" nem teto semanal/diário aqui. A única proteção entre campanhas
  é a de cada campanha consigo mesma (quem já recebeu ESTA campanha não recebe de novo, para poder retomar um envio).
- Quem pediu para parar (ActivationOptOut, link no rodapé) nunca recebe: é pedido da pessoa, não "tática".
- As campanhas antigas (Recado Importante e "Ração com a foto do pet") aparecem como histórico, com o que já saiu.
- O dono pode remover (arquivar) qualquer campanha da lista e criar outra. Os registros de envio ficam guardados.

Só o administrador master acessa (get_current_admin). Nenhum dado de tutor é alterado.
"""
from __future__ import annotations

import logging
import threading
from datetime import datetime, timezone
from html import escape
from time import sleep as _sleep
from typing import Literal, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Column, DateTime, String, Text, func

from ..db import Base, SessionLocal, engine
from ..pets.models import Pet
from ..user_auth.models import User
from .activation_campaign_router import (
    CAMPAIGN_EMAIL_FOTO, CAMPAIGN_EMAIL_FOTO_CTL, CAMPAIGN_EMAIL_RACAO, CAMPAIGN_EMAIL_RACAO_CTL, EMAIL_RACAO_SUBJECT,
    ActivationCampaignContact, opted_out_ids, unsubscribe_url,
)
from .analytics.permissions_bi import has_any_push
from .analytics.queries import _feeding_configured_pet_ids
from .deps import get_current_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/email-campaigns", tags=["Admin E-mails"])

SEGMENTS = {
    "todos": "Todos com e-mail",
    "sem_pet": "Sem pet cadastrado",
    "sem_racao": "Tem pet sem ração cadastrada",
    "sem_push": "Sem notificação ativa",
    "sem_foto": "Pet sem foto",
}
# Parada de segurança: se o provedor recusar vários envios seguidos, para e mostra o erro (dá para retomar depois).
STOP_AFTER_FAILURES = 10
PAUSE_SECONDS = 0.3


class EmailCampaign(Base):
    __tablename__ = "email_campaigns"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(120), nullable=False)
    subject = Column(String(200), nullable=False)
    body = Column(Text, nullable=False, default="")
    template = Column(String(12), nullable=False, default="custom")   # custom | recado | foto (os dois últimos = histórico)
    status = Column(String(12), nullable=False, default="active")     # active | archived
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


Base.metadata.create_all(bind=engine, tables=[EmailCampaign.__table__])

_state: dict[str, dict] = {}   # id -> {phase, sent, failed, total, error}
_lock = threading.Lock()


def _tag(c_id: str) -> str:
    """Valor gravado em ActivationCampaignContact.campaign (coluna de 40 caracteres)."""
    return f"ec_{c_id[:30]}"


def _ensure_legacy(db) -> None:
    have = {t for (t,) in db.query(EmailCampaign.template).filter(EmailCampaign.template.in_(["recado", "foto"])).all()}
    if "recado" not in have:
        db.add(EmailCampaign(name="Recado Importante (ração)", subject=EMAIL_RACAO_SUBJECT, template="recado",
                             created_at=datetime(2026, 10, 15, tzinfo=timezone.utc)))
    if "foto" not in have:
        db.add(EmailCampaign(name="Ração com a foto do pet", subject="Com o nome do tutor e a foto do pet", template="foto",
                             created_at=datetime(2026, 10, 17, tzinfo=timezone.utc)))
    db.commit()


def _legacy_prefix(template: str) -> tuple[str, str]:
    return (CAMPAIGN_EMAIL_FOTO, CAMPAIGN_EMAIL_FOTO_CTL) if template == "foto" else (CAMPAIGN_EMAIL_RACAO, CAMPAIGN_EMAIL_RACAO_CTL)


def _stats(db, c: EmailCampaign) -> dict:
    q = db.query(func.count(ActivationCampaignContact.id), func.max(ActivationCampaignContact.sent_at))
    if c.template in ("recado", "foto"):
        sent_p, ctl_p = _legacy_prefix(c.template)
        sent, last = q.filter(ActivationCampaignContact.campaign.startswith(sent_p + "__", autoescape=True)).one()
        ctl = db.query(func.count(ActivationCampaignContact.id)).filter(
            ActivationCampaignContact.campaign.startswith(ctl_p + "__", autoescape=True)).scalar() or 0
        return {"sent": int(sent or 0), "control": int(ctl), "last_sent_at": last.isoformat() if last else None}
    sent, last = q.filter(ActivationCampaignContact.campaign == _tag(c.id)).one()
    return {"sent": int(sent or 0), "control": 0, "last_sent_at": last.isoformat() if last else None}


# ── Conteúdo ────────────────────────────────────────────────────────────────

def _first(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0]


def _pets_phrase(names: list[str]) -> str:
    names = [n for n in names if n]
    if not names:
        return "seu pet"
    return names[0] if len(names) == 1 else ", ".join(names[:-1]) + " e " + names[-1]


def _fill(text: str, name: Optional[str], pet_names: list[str]) -> str:
    return (text.replace("{nome}", _first(name) or "").replace("{pets}", _pets_phrase(pet_names)).replace("  ", " "))


def render_email(c: EmailCampaign, name: Optional[str], pet_names: list[str], user_id: str) -> tuple[str, str, str]:
    """(assunto, texto, html). Marcadores aceitos: {nome} e {pets}. Rodapé com o link para parar de receber."""
    subject = _fill(c.subject, name, pet_names).strip()
    body = _fill(c.body, name, pet_names).strip()
    unsub = unsubscribe_url(user_id)
    paragraphs = [p.strip() for p in body.split("\n\n") if p.strip()]
    html_body = "".join(f'<p style="margin:0 0 16px;font-size:16px;line-height:1.55;color:#1e293b">{escape(p).replace(chr(10), "<br>")}</p>'
                        for p in paragraphs)
    html = (
        '<div style="background:#f1f5f9;padding:24px 12px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'
        '<div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden">'
        '<div style="background:#0056D2;padding:18px 24px"><span style="color:#fff;font-size:20px;font-weight:800;letter-spacing:.5px">PETMOL</span></div>'
        f'<div style="padding:24px">{html_body}</div>'
        '<div style="padding:0 24px 22px;font-size:12px;color:#94a3b8">'
        f'Não quer mais receber estes e-mails? <a href="{escape(unsub)}" style="color:#94a3b8">Parar de receber</a>.</div>'
        "</div></div>"
    )
    text = f"{body}\n\n--\nPara parar de receber: {unsub}"
    return subject, text, html


# ── Público ─────────────────────────────────────────────────────────────────

def audience(db, segment: str, only_new_for: Optional[str] = None) -> list[dict]:
    """Quem tem e-mail válido e não pediu para parar. Sem limite semanal. `only_new_for`: pula quem já recebeu essa campanha."""
    pets_by_user: dict[str, list[tuple[str, Optional[str], Optional[str]]]] = {}
    for uid, pid, nm, ph in db.query(Pet.user_id, Pet.id, Pet.name, Pet.photo).order_by(Pet.created_at.asc()).all():
        pets_by_user.setdefault(str(uid), []).append((str(pid), nm, ph))
    blocked = opted_out_ids(db)
    already = set()
    if only_new_for:
        already = {str(u) for (u,) in db.query(ActivationCampaignContact.user_id)
                   .filter(ActivationCampaignContact.campaign == only_new_for).all()}
    feeding_ids = _feeding_configured_pet_ids(db) if segment == "sem_racao" else set()
    pushable = ({str(u) for (u,) in db.query(User.id).filter(has_any_push(User.id)).all()} if segment == "sem_push" else set())
    out: list[dict] = []
    for uid, name, email in db.query(User.id, User.name, User.email).all():
        uid = str(uid)
        if uid in blocked or uid in already or not email or "@" not in email or email.lower().endswith("@petmol.guest"):
            continue
        pets = pets_by_user.get(uid, [])
        if segment == "sem_pet" and pets:
            continue
        if segment == "sem_racao" and (not pets or all(pid in feeding_ids for pid, _n, _p in pets)):
            continue
        if segment == "sem_push" and uid in pushable:
            continue
        if segment == "sem_foto" and not any(not ph for _pid, _n, ph in pets):
            continue
        out.append({"user_id": uid, "name": name, "email": email.strip(),
                    "pet_names": [n for _pid, n, _p in pets if n]})
    return out


# ── Endpoints ───────────────────────────────────────────────────────────────

class CampaignIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    subject: str = Field(min_length=2, max_length=200)
    body: str = Field(min_length=5, max_length=6000)


class AudienceIn(BaseModel):
    kind: Literal["all", "count", "test"] = "all"
    count: Optional[int] = Field(default=None, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def _count(self):
        if self.kind == "count" and not self.count:
            raise ValueError("Informe quantas pessoas devem receber.")
        return self


class SendIn(BaseModel):
    segment: Literal["todos", "sem_pet", "sem_racao", "sem_push", "sem_foto"] = "todos"
    audience: AudienceIn = AudienceIn()
    confirm_count: Optional[int] = None


def _get(db, c_id: str) -> EmailCampaign:
    c = db.query(EmailCampaign).filter(EmailCampaign.id == c_id, EmailCampaign.status == "active").first()
    if not c:
        raise HTTPException(404, "Campanha não encontrada.")
    return c


def _plan(db, c: EmailCampaign, payload: SendIn, admin_user) -> list[dict]:
    if payload.audience.kind == "test":
        pets = [n for (n,) in db.query(Pet.name).filter(Pet.user_id == admin_user.id).all() if n]
        return [{"user_id": str(admin_user.id), "name": admin_user.name, "email": admin_user.email, "pet_names": pets}]
    import random
    targets = audience(db, payload.segment, _tag(c.id))
    if payload.audience.kind == "count" and payload.audience.count and payload.audience.count < len(targets):
        targets = random.sample(targets, payload.audience.count)
    return targets


@router.get("")
def list_campaigns(current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        _ensure_legacy(db)
        rows = db.query(EmailCampaign).filter(EmailCampaign.status == "active").order_by(EmailCampaign.created_at.desc()).all()
        return {
            "segments": SEGMENTS,
            "campaigns": [{
                "id": c.id, "name": c.name, "subject": c.subject, "body": c.body, "template": c.template,
                "created_at": c.created_at.isoformat() if c.created_at else None,
                "state": _state.get(c.id), **_stats(db, c),
            } for c in rows],
        }
    finally:
        db.close()


@router.post("")
def create_campaign(payload: CampaignIn, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        c = EmailCampaign(name=payload.name.strip(), subject=payload.subject.strip(), body=payload.body.strip(), template="custom")
        db.add(c)
        db.commit()
        return {"id": c.id}
    finally:
        db.close()


@router.put("/{c_id}")
def update_campaign(c_id: str, payload: CampaignIn, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        c = _get(db, c_id)
        if c.template != "custom":
            raise HTTPException(409, "Campanha antiga: só histórico. Crie uma nova.")
        c.name, c.subject, c.body = payload.name.strip(), payload.subject.strip(), payload.body.strip()
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.delete("/{c_id}")
def remove_campaign(c_id: str, current=Depends(get_current_admin)):
    """Tira da lista (arquiva). O registro de quem recebeu fica guardado."""
    db = SessionLocal()
    try:
        c = _get(db, c_id)
        if (_state.get(c.id) or {}).get("phase") == "running":
            raise HTTPException(409, "Esta campanha está sendo enviada agora.")
        c.status = "archived"
        db.commit()
        return {"ok": True}
    finally:
        db.close()


@router.post("/{c_id}/preview")
def preview(c_id: str, payload: SendIn, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        c = _get(db, c_id)
        targets = _plan(db, c, payload, current[0])
        ex = next((t for t in targets if t["pet_names"]), targets[0] if targets else None)
        sample = None
        if ex and c.template == "custom":
            subject, text, _html = render_email(c, ex["name"], ex["pet_names"], ex["user_id"])
            sample = {"subject": subject, "text": text.split("\n\n--\n")[0]}
        total_all = len(audience(db, payload.segment)) if payload.audience.kind != "test" else len(targets)
        return {"will_send": len(targets), "audience_total": total_all, "already_received": total_all - len(targets) if payload.audience.kind == "all" else 0,
                "sample": sample}
    finally:
        db.close()


@router.post("/{c_id}/test")
def send_test(c_id: str, current=Depends(get_current_admin)):
    from ..mailer import send_mail
    admin = current[0]
    if not getattr(admin, "email", None):
        raise HTTPException(400, "O administrador logado não tem e-mail.")
    db = SessionLocal()
    try:
        c = _get(db, c_id)
        if c.template != "custom":
            raise HTTPException(409, "Campanha antiga: só histórico.")
        pets = [n for (n,) in db.query(Pet.name).filter(Pet.user_id == admin.id).all() if n]
        subject, text, html = render_email(c, admin.name, pets, str(admin.id))
    finally:
        db.close()
    if not send_mail(to=admin.email, subject=subject, body_text=text, body_html=html):
        raise HTTPException(502, "O envio falhou (veja o log do servidor).")
    return {"sent_to": admin.email, "subject": subject}


@router.post("/{c_id}/send")
def send(c_id: str, payload: SendIn, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        c = _get(db, c_id)
        if c.template != "custom":
            raise HTTPException(409, "Campanha antiga: só histórico. Crie uma nova.")
        with _lock:
            if any((s or {}).get("phase") == "running" for s in _state.values()):
                raise HTTPException(409, "Já existe um envio de e-mail em andamento. Espere terminar.")
        targets = _plan(db, c, payload, current[0])
        if not targets:
            raise HTTPException(422, "Ninguém receberia este e-mail agora.")
        if payload.audience.kind != "test" and payload.confirm_count != len(targets):
            raise HTTPException(409, f"O número mudou: agora são {len(targets)} pessoas. Confira e confirme de novo.")
        record = payload.audience.kind != "test"
        with _lock:
            _state[c.id] = {"phase": "running", "sent": 0, "failed": 0, "total": len(targets), "error": None}
        snapshot = EmailCampaign(id=c.id, name=c.name, subject=c.subject, body=c.body, template=c.template)
    finally:
        db.close()
    threading.Thread(target=_run, args=(snapshot, targets, record), daemon=True).start()
    return {"started": True, "total": len(targets)}


def _run(c: EmailCampaign, targets: list[dict], record: bool) -> None:
    from ..mailer import send_mail
    db = SessionLocal()
    sent = failed = streak = 0
    error: Optional[str] = None
    try:
        for t in targets:
            try:
                subject, text, html = render_email(c, t["name"], t["pet_names"], t["user_id"])
                ok = send_mail(to=t["email"], subject=subject, body_text=text, body_html=html)
            except Exception:  # noqa: BLE001 — um e-mail com problema não derruba os outros
                logger.exception("email_campaign %s: falha para %s", c.id, t["user_id"])
                ok = False
            if ok:
                sent += 1
                streak = 0
                if record:
                    db.add(ActivationCampaignContact(campaign=_tag(c.id), user_id=t["user_id"]))
                    db.commit()
            else:
                failed += 1
                streak += 1
                if streak >= STOP_AFTER_FAILURES:
                    error = (f"O provedor recusou {STOP_AFTER_FAILURES} envios seguidos. Parei para não perder e-mails: "
                             "envie de novo mais tarde e só quem faltou receberá.")
                    break
            with _lock:
                _state[c.id] = {"phase": "running", "sent": sent, "failed": failed, "total": len(targets), "error": None}
            _sleep(PAUSE_SECONDS)
    except Exception as exc:  # noqa: BLE001
        logger.exception("email_campaign %s falhou", c.id)
        error = str(exc)
    finally:
        db.close()
        with _lock:
            _state[c.id] = {"phase": "error" if error else "done", "sent": sent, "failed": failed, "total": len(targets), "error": error}

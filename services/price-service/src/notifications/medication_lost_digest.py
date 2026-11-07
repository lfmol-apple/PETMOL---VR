"""Resumo diário (9h de Brasília) dos avisos de remédio que NÃO chegaram aos tutores.

Antes: um e-mail ao dono por lembrete perdido (enchia a caixa). Agora cada aviso perdido só é
GRAVADO (MedicationLostNotice audience "admin", email_ok=False = pendente) e este job manda UM
e-mail com tudo que está pendente. Sem pendências, não manda nada. Se o envio falhar, as linhas
continuam pendentes e entram no resumo do dia seguinte (nada se perde)."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

logger = logging.getLogger(__name__)
_BR = ZoneInfo("America/Sao_Paulo")
_MAX_AGE = timedelta(days=3)  # não ressuscita avisos antigos que o envio imediato já tratou


def _fmt(dt) -> str:
    if not dt:
        return "?"
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_BR).strftime("%d/%m %H:%M")


def send_medication_lost_digest() -> bool:
    """Devolve True se mandou o resumo (ou se não havia nada a mandar)."""
    from ..config import get_settings
    from ..db import SessionLocal
    from ..mailer import send_mail
    from ..user_auth.models import User
    from . import MedicationLostNotice, Pet

    db = SessionLocal()
    try:
        since = datetime.now(timezone.utc) - _MAX_AGE
        pending = (
            db.query(MedicationLostNotice)
            .filter(MedicationLostNotice.audience == "admin", MedicationLostNotice.email_ok == False,  # noqa: E712
                    MedicationLostNotice.created_at >= since)
            .order_by(MedicationLostNotice.remind_at.asc())
            .all()
        )
        if not pending:
            return True

        lines = []
        for n in pending:
            pet = db.query(Pet).filter(Pet.id == n.pet_id).first() if n.pet_id else None
            tutor = db.query(User).filter(User.id == n.user_id).first() if n.user_id else None
            tn = (
                db.query(MedicationLostNotice)
                .filter(MedicationLostNotice.audience == "tutor", MedicationLostNotice.user_id == n.user_id,
                        MedicationLostNotice.pet_id == n.pet_id, MedicationLostNotice.remind_at == n.remind_at)
                .order_by(MedicationLostNotice.created_at.desc())
                .first()
            )
            if tn is None:
                tutor_status = "e-mail ao tutor: NÃO enviado (tutor sem e-mail?)"
            elif tn.email_ok:
                tutor_status = "e-mail ao tutor: enviado"
            else:
                tutor_status = "e-mail ao tutor: FALHOU (avisar o tutor por outro meio)"
            lines.append(
                f"• {getattr(pet, 'name', '?')} — {n.medications or 'medicação'}\n"
                f"  previsto {_fmt(n.remind_at)} (Brasília) · motivo: {n.reason or '?'}\n"
                f"  tutor: {(tutor.email if tutor else '?')} · {tutor_status}"
            )

        total = len(pending)
        body = (
            f"⚠️ {total} aviso{'s' if total != 1 else ''} de remédio não entregue{'s' if total != 1 else ''} "
            "pelo app (desde o último resumo)\n\n" + "\n\n".join(lines) +
            "\n\nO tutor recebe o aviso por e-mail. Quando o motivo é \"sem destino ativo\", o aparelho dele "
            "não tem notificação ativa; quando é \"falha de envio\", verifique o push (token nativo/assinatura)."
        )
        ok = send_mail(to=get_settings().admin_master_email,
                       subject=f"PETMOL — resumo diário: {total} aviso{'s' if total != 1 else ''} de remédio não entregue{'s' if total != 1 else ''}",
                       body_text=body)
        if ok:
            for n in pending:
                n.email_ok = True  # "já entrou num resumo enviado"
            db.commit()
        return bool(ok)
    except Exception as exc:
        logger.warning(f"resumo diário de remédio não entregue falhou: {exc}")
        db.rollback()
        return False
    finally:
        db.close()

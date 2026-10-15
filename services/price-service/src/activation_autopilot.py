"""Piloto automático de ativação: a escada ração → notificação, sem ser chato.

Roda uma vez por dia (11h, horário de Brasília) e só age dentro destas regras — todas juntas:
- **Uma mensagem por pessoa por semana**, de qualquer campanha (manual ou automática).
- **Teto por dia** (padrão 30 mensagens no total); o resto espera o dia seguinte.
- **Só entre 10h e 19h** de Brasília.
- **Para quando a pessoa cumpre a etapa** (cadastrou a ração / ligou a notificação) e quem pediu para
  não receber (link no e-mail) nunca entra.
- **Ração:** no máximo 2 toques por pessoa, o segundo só depois de 14 dias. Quem tem push recebe SÓ o push
  (o e-mail fica para quem não tem aparelho). **Notificação (segunda chance):** 1 e-mail por pessoa.
- A Loja não tem campanha: quando a pessoa cadastra a ração e liga os avisos, o lembrete "Hora de comprar
  ração" já é automático — a compra é consequência, não propaganda.

Desliga-se no painel (Dashboard 2) ou com ACTIVATION_AUTOPILOT_ENABLED=false. Cada envio fica registrado
(ActivationCampaignContact) e aparece no boletim da manhã.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from time import sleep as _sleep
from typing import Any, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func

from .admin import activation_campaign_router as ac
from .config import get_settings
from .db import SessionLocal
from .mailer import send_mail
from .notifications import push_to_user
from .user_auth.models import User

logger = logging.getLogger(__name__)
_BR = ZoneInfo("America/Sao_Paulo")
SEND_FROM_HOUR, SEND_UNTIL_HOUR = 10, 19
FOOD_MAX_TOUCHES = 2
FOOD_SECOND_TOUCH_AFTER_DAYS = 14
EMAIL_BATCH, EMAIL_PAUSE_SECONDS = 10, 180


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    return dt if dt is None or dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def run_autopilot(*, now: Optional[datetime] = None, dry_run: bool = False, ignore_hours: bool = False) -> dict[str, Any]:
    db = SessionLocal()
    try:
        if not ac.autopilot_enabled(db):
            return {"skipped": "desligado"}
        now = (now or datetime.now(_BR)).astimezone(_BR)
        if not ignore_hours and not (SEND_FROM_HOUR <= now.hour < SEND_UNTIL_HOUR):
            return {"skipped": "fora do horário (10h às 19h)"}

        cap = int(get_settings().activation_autopilot_daily_cap)
        day_start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
        used = (db.query(func.count(ac.ActivationCampaignContact.id))
                .filter(ac.ActivationCampaignContact.sent_at >= day_start,
                        ac.ActivationCampaignContact.campaign.in_([ac.CAMPAIGN_FOOD, ac.CAMPAIGN_PUSH_SECOND])).scalar() or 0)
        budget = max(cap - int(used), 0)
        result: dict[str, Any] = {"budget": budget, "cap": cap, "used_today": int(used), "dry_run": dry_run,
                                  "food_push": 0, "food_email": 0, "push_second_email": 0}
        if budget == 0:
            result["skipped"] = "teto do dia atingido"
            return result

        capped = ac._recent_any_contact(db, 7)           # 1 mensagem por pessoa por semana
        food_rows = (db.query(ac.ActivationCampaignContact.user_id, func.count(), func.max(ac.ActivationCampaignContact.sent_at))
                     .filter(ac.ActivationCampaignContact.campaign == ac.CAMPAIGN_FOOD)
                     .group_by(ac.ActivationCampaignContact.user_id).all())
        touches = {str(u): (int(n), _aware(last)) for u, n, last in food_rows}
        second_after = now.astimezone(timezone.utc) - timedelta(days=FOOD_SECOND_TOUCH_AFTER_DAYS)

        def food_ok(t: dict) -> bool:
            n, last = touches.get(t["user_id"], (0, None))
            return n == 0 or (n < FOOD_MAX_TOUCHES and last is not None and last <= second_after)

        food = [t for t in ac._target_users(db) if t["user_id"] not in capped and food_ok(t)]
        food.sort(key=lambda t: not t["has_push"])         # quem tem push primeiro (aviso, não e-mail)
        picked_ids = {t["user_id"] for t in food[:budget]}
        food = food[:budget]
        second, _ = ac._target_users_push_second(db)
        second = [t for t in second if t["user_id"] not in picked_ids][: max(budget - len(food), 0)]
        result["planned"] = {"food": len(food), "push_second": len(second)}
        if dry_run:
            return result

        emails_sent = 0
        consecutive_fail = 0
        blocked = False

        def _pause_if_needed() -> None:
            nonlocal emails_sent
            emails_sent += 1
            if emails_sent % EMAIL_BATCH == 0:
                _sleep(EMAIL_PAUSE_SECONDS)       # a hospedagem rejeita e-mail em rajada (451)

        for t in food:
            try:
                if t["has_push"]:
                    if push_to_user(t["user_id"], ac._push_payload(t["pet_names"], t.get("first_pet_id"))) > 0:
                        result["food_push"] += 1
                        db.add(ac.ActivationCampaignContact(campaign=ac.CAMPAIGN_FOOD, user_id=t["user_id"]))
                        db.commit()
                    continue
                user = db.query(User).filter(User.id == t["user_id"]).first()
                if not user or not user.email:
                    continue
                if blocked:
                    continue
                subject, body = ac._email_copy(user.name, t["pet_names"], t["user_id"])
                if send_mail(to=user.email, subject=subject, body_text=body):
                    result["food_email"] += 1
                    consecutive_fail = 0
                    db.add(ac.ActivationCampaignContact(campaign=ac.CAMPAIGN_FOOD, user_id=t["user_id"]))
                    db.commit()
                else:
                    consecutive_fail += 1
                    blocked = consecutive_fail >= ac.EMAIL_BLOCK_AFTER_FAILURES
                _pause_if_needed()
            except Exception:  # um destinatário falhar nunca derruba o lote
                logger.exception("[autopilot] falha na ração para %s", t["user_id"])
                db.rollback()
        for t in second:
            if blocked:
                break
            try:
                subject, body_text, body_html = ac._email_copy_push_second(t["name"], t["pet_names"], t["user_id"])
                if send_mail(to=t["email"], subject=subject, body_text=body_text, body_html=body_html):
                    result["push_second_email"] += 1
                    consecutive_fail = 0
                    db.add(ac.ActivationCampaignContact(campaign=ac.CAMPAIGN_PUSH_SECOND, user_id=t["user_id"]))
                    db.commit()
                else:
                    consecutive_fail += 1
                    blocked = consecutive_fail >= ac.EMAIL_BLOCK_AFTER_FAILURES
                _pause_if_needed()
            except Exception:
                logger.exception("[autopilot] falha na notificação para %s", t["user_id"])
                db.rollback()
        result["email_blocked"] = blocked
        logger.info("[autopilot] %s", result)
        return result
    finally:
        db.close()

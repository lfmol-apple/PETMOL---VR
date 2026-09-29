"""
Campanha de ativação — "escada" definida pelo dono (28/09/2026): Alimentação
primeiro (fonte de renda), depois Notificação, Localização e por fim os
demais controles essenciais (vacina, antiparasitário...). Este router cobre
só o primeiro degrau — Alimentação.

Disparo único e manual (não é job recorrente): quem tem pet mas nunca
cadastrou alimentação recebe push (se tiver algum dispositivo ativo) e
e-mail; quem não tem nenhum dispositivo ativo recebe só e-mail. Reaproveita
a MESMA definição de segmento do painel /admin/dashboard#pessoas
(`_feeding_configured_pet_ids` + `has_any_push`) — os números batem com o
que o dono já vê lá.

Autenticação: token do domínio de COMUNICAÇÃO (COMMS_OPS_TRIGGER_TOKEN) —
nunca a chave admin read-only (isto manda e-mail/push de verdade), e nunca
o token de comércio/Shopee (domínio diferente: aquele mexe em preço/oferta
de loja parceira, este manda mensagem pra pessoa real — reusar um pro outro
foi o achado real de 28/09/2026 que motivou separar por domínio):
  - POST /food-activation/run    → COMMS_OPS_TRIGGER_TOKEN (envia e-mail/
                                    push de verdade quando dry_run=false).
  - GET  /food-activation/status → chave admin read-only.
"""
from __future__ import annotations

import hmac
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel

from ..config import get_settings
from ..db import SessionLocal
from ..mailer import send_mail
from ..notifications import push_to_user
from ..pets.models import Pet
from ..user_auth.models import User
from .analytics.permissions_bi import has_any_push
from .analytics.queries import _feeding_configured_pet_ids
from .deps import get_current_admin_or_readonly_key

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/campaigns", tags=["Admin Campaigns"])

STATE: dict = {"phase": "idle", "started_at": None, "finished_at": None, "result": None, "error": None}
_lock = threading.Lock()


class RunRequest(BaseModel):
    dry_run: bool = True


def _authorize(x_sync_token: Optional[str]) -> None:
    token = get_settings().comms_ops_trigger_token
    if not token or not x_sync_token or not hmac.compare_digest(x_sync_token, token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token inválido")


def _target_users(db) -> list[dict]:
    """Tutores com pelo menos 1 pet e NENHUM pet com alimentação configurada
    — mesmo critério do filtro `has_feeding=no` do painel de Pessoas."""
    feeding_pet_ids = _feeding_configured_pet_ids(db)
    rows = db.query(Pet.user_id, Pet.id, Pet.name).all()
    pets_by_user: dict[str, list[tuple[str, Optional[str]]]] = {}
    for user_id, pet_id, pet_name in rows:
        pets_by_user.setdefault(str(user_id), []).append((str(pet_id), pet_name))

    out: list[dict] = []
    for user_id, pets in pets_by_user.items():
        missing = [name for (pid, name) in pets if pid not in feeding_pet_ids]
        # Só entra na campanha quem não tem NENHUM pet com alimentação —
        # quem já configurou pelo menos 1 não é alvo deste degrau.
        if len(missing) != len(pets):
            continue
        out.append({"user_id": user_id, "pet_names": [n for n in missing if n]})

    user_ids = [u["user_id"] for u in out]
    pushable = set()
    if user_ids:
        pushable = {
            uid for (uid,) in db.query(User.id).filter(
                User.id.in_(user_ids), has_any_push(User.id)
            ).all()
        }
    for u in out:
        u["has_push"] = u["user_id"] in {str(x) for x in pushable}
    return out


def _pet_phrase(pet_names: list[str]) -> str:
    names = [n for n in pet_names if n]
    if not names:
        return "seu pet"
    if len(names) == 1:
        return names[0]
    return " e ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 2 else f"{names[0]} e {names[1]}"


def _email_copy(name: Optional[str], pet_names: list[str]) -> tuple[str, str]:
    saudacao = f"Oi {name.split(' ')[0]}" if name else "Oi"
    pet = _pet_phrase(pet_names)
    subject = "Ainda falta cadastrar a ração do seu pet no PETMOL"
    body = (
        f"{saudacao}, vimos que {pet} ainda não tem a ração cadastrada no PETMOL. "
        "Assim que você registra o pacote, o app acompanha o consumo sozinho e avisa "
        'antes de acabar — sem depender da memória. Leva 1 minuto: abra o app e toque '
        'em "Alimentação".'
    )
    return subject, body


def _push_payload(pet_names: list[str]) -> dict:
    pet = _pet_phrase(pet_names)
    return {
        "title": f"🍽️ Cadastre a ração de {pet}",
        "body": "Nunca mais fique sem saber quando vai acabar. Leva 1 minuto.",
        "tag": "activation-food",
        "data": {"url": "/home"},
    }


def _run(dry_run: bool) -> None:
    db = SessionLocal()
    try:
        targets = _target_users(db)
        with_push = [t for t in targets if t["has_push"]]
        email_only = [t for t in targets if not t["has_push"]]

        result = {
            "total": len(targets),
            "push_and_email": len(with_push),
            "email_only": len(email_only),
            "dry_run": dry_run,
        }

        if not dry_run:
            sent_push = sent_email = failed_email = 0
            for t in targets:
                user = db.query(User).filter(User.id == t["user_id"]).first()
                if not user or not user.email:
                    continue
                subject, body = _email_copy(user.name, t["pet_names"])
                if send_mail(to=user.email, subject=subject, body_text=body):
                    sent_email += 1
                else:
                    failed_email += 1
                if t["has_push"]:
                    ok = push_to_user(t["user_id"], _push_payload(t["pet_names"]))
                    if ok > 0:
                        sent_push += 1
            result.update(sent_push=sent_push, sent_email=sent_email, failed_email=failed_email)

        with _lock:
            STATE.update(phase="done", result=result, error=None,
                         finished_at=datetime.now(timezone.utc).isoformat())
        logger.info("[activation_campaign food] %s", result)
    except Exception as exc:  # noqa: BLE001
        logger.exception("[activation_campaign food] falhou")
        with _lock:
            STATE.update(phase="error", error=str(exc), finished_at=datetime.now(timezone.utc).isoformat())
    finally:
        db.close()


@router.post("/food-activation/run")
def run_food_activation(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    with _lock:
        if STATE["phase"] == "running":
            raise HTTPException(status_code=409, detail="campanha já em andamento")
        STATE.update(phase="running", started_at=datetime.now(timezone.utc).isoformat(),
                     finished_at=None, result=None, error=None)
    threading.Thread(target=_run, args=(payload.dry_run,), daemon=True).start()
    return {"started": True, "dry_run": payload.dry_run}


@router.get("/food-activation/status")
def food_activation_status(current=Depends(get_current_admin_or_readonly_key)):
    return STATE

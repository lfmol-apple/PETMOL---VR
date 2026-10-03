"""
Campanha de ativação — "escada" definida pelo dono (28/09/2026): Alimentação
primeiro (fonte de renda), depois Notificação, Localização e por fim os
demais controles essenciais (vacina, antiparasitário...). Degrau 1
(Alimentação) está aqui desde 28/09; degrau 2 (Push + Localização, 02/10)
foi adicionado depois que o painel de Permissões mostrou 63%/68% dos
tutores sem cada um.

Disparo único e manual (não é job recorrente) nos dois degraus.

Alimentação: quem tem pet mas nunca cadastrou alimentação recebe push (se
tiver algum dispositivo ativo) e e-mail; quem não tem nenhum dispositivo
ativo recebe só e-mail. Reaproveita a MESMA definição de segmento do painel
/admin/dashboard#pessoas (`_feeding_configured_pet_ids` + `has_any_push`).

Push + Localização: alcança especificamente quem os pedidos CONTEXTUAIS em
tela (Pet Sumido/Vacina/Ração) NUNCA alcançam — quem baixou o app e não
abre com frequência. Só entra quem está sem push E sem localização E não
é "active"/"recent" (não abriu nos últimos 14 dias — ver `_activity_status`
em `analytics/queries.py`); quem ainda usa o app regularmente vai ver o
pedido em tela na próxima vez que abrir uma dessas telas, então mandar
e-mail pra esse grupo também seria redundante. Só e-mail (por definição,
quem não tem push nenhum dispositivo ativo pra receber push).

Autenticação: token do domínio de COMUNICAÇÃO (COMMS_OPS_TRIGGER_TOKEN) —
nunca a chave admin read-only (isto manda e-mail/push de verdade), e nunca
o token de comércio/Shopee (domínio diferente: aquele mexe em preço/oferta
de loja parceira, este manda mensagem pra pessoa real — reusar um pro outro
foi o achado real de 28/09/2026 que motivou separar por domínio):
  - POST /food-activation/run             → COMMS_OPS_TRIGGER_TOKEN
  - GET  /food-activation/status          → chave admin read-only
  - POST /push-location-activation/run    → COMMS_OPS_TRIGGER_TOKEN
  - GET  /push-location-activation/status → chave admin read-only
  (envia e-mail/push de verdade só quando dry_run=false.)
"""
from __future__ import annotations

import hmac
import logging
import threading
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func

from ..analytics.models import AnalyticsProductEvent
from ..config import get_settings
from ..db import SessionLocal
from ..mailer import send_mail
from ..notifications import push_to_user
from ..pets.models import Pet
from ..user_auth.models import User
from .analytics.permissions_bi import _aware, has_any_push, shares_location
from .analytics.queries import _activity_status, _feeding_configured_pet_ids
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


# ── Degrau 2 — Push + Localização (02/10/2026) ───────────────────────────────

STATE_PUSH_LOCATION: dict = {"phase": "idle", "started_at": None, "finished_at": None, "result": None, "error": None}
_lock_push_location = threading.Lock()


def _target_users_push_location(db) -> list[dict]:
    """Sem push ativo E sem localização compartilhada E não "active"/"recent"
    (não abriu o app nos últimos 14 dias, ou nunca apareceu em analytics) —
    quem ainda abre o app regularmente já é alcançado pelos pedidos
    contextuais em tela (Pet Sumido/Vacina/Ração), então mandar e-mail pra
    esse grupo também seria redundante. Só e-mail: por definição ninguém
    aqui tem dispositivo de push ativo."""
    now = datetime.now(timezone.utc)
    candidates = (
        db.query(User.id, User.name, User.email)
        .filter(~has_any_push(User.id), ~shares_location())
        .all()
    )
    ids = [str(u.id) for u in candidates]
    last_seen = dict(
        db.query(AnalyticsProductEvent.user_id, func.max(AnalyticsProductEvent.received_at))
        .filter(AnalyticsProductEvent.user_id.in_(ids or ["__none__"]))
        .group_by(AnalyticsProductEvent.user_id)
        .all()
    )
    pet_names_by_user: dict[str, list[str]] = {}
    if ids:
        for user_id, pet_name in db.query(Pet.user_id, Pet.name).filter(Pet.user_id.in_(ids)).all():
            pet_names_by_user.setdefault(str(user_id), []).append(pet_name)

    out: list[dict] = []
    for user_id, name, email in candidates:
        if not email:
            continue
        status_ = _activity_status(_aware(last_seen.get(str(user_id))), now)
        if status_ in ("active", "recent"):
            continue
        out.append({
            "user_id": str(user_id), "name": name, "email": email,
            "pet_names": pet_names_by_user.get(str(user_id), []),
            "activity_status": status_,
        })
    return out


def _email_copy_push_location(name: Optional[str], pet_names: list[str]) -> tuple[str, str]:
    saudacao = f"Oi {name.split(' ')[0]}" if name else "Oi"
    pet = _pet_phrase(pet_names) if pet_names else "seu pet"
    subject = f"{pet} conta só com você pra lembrar disso"
    body = (
        f"{saudacao}. {pet} não tem como checar sozinho(a) se uma vacina está vencendo, se "
        "a ração vai acabar, ou pedir ajuda se um dia se perder por aí — isso depende "
        "inteiramente de alguém lembrar por ele(a). Hoje essa parte do cuidado está "
        "desligada na sua conta: as notificações e a localização do PETMOL ainda não foram "
        f"ativadas, e sem elas {pet} fica sem essa rede de proteção bem quando mais precisar "
        'dela. Leva 10 segundos pra religar isso: abra o app, toque no seu perfil e em '
        '"Ativar notificações".'
    )
    return subject, body


def _run_push_location(dry_run: bool) -> None:
    db = SessionLocal()
    try:
        targets = _target_users_push_location(db)
        result = {"total": len(targets), "dry_run": dry_run}
        if not dry_run:
            sent_email = failed_email = 0
            for t in targets:
                subject, body = _email_copy_push_location(t["name"], t["pet_names"])
                if send_mail(to=t["email"], subject=subject, body_text=body):
                    sent_email += 1
                else:
                    failed_email += 1
            result.update(sent_email=sent_email, failed_email=failed_email)

        with _lock_push_location:
            STATE_PUSH_LOCATION.update(phase="done", result=result, error=None,
                                       finished_at=datetime.now(timezone.utc).isoformat())
        logger.info("[activation_campaign push_location] %s", result)
    except Exception as exc:  # noqa: BLE001
        logger.exception("[activation_campaign push_location] falhou")
        with _lock_push_location:
            STATE_PUSH_LOCATION.update(phase="error", error=str(exc),
                                       finished_at=datetime.now(timezone.utc).isoformat())
    finally:
        db.close()


@router.post("/push-location-activation/run")
def run_push_location_activation(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    with _lock_push_location:
        if STATE_PUSH_LOCATION["phase"] == "running":
            raise HTTPException(status_code=409, detail="campanha já em andamento")
        STATE_PUSH_LOCATION.update(phase="running", started_at=datetime.now(timezone.utc).isoformat(),
                                   finished_at=None, result=None, error=None)
    threading.Thread(target=_run_push_location, args=(payload.dry_run,), daemon=True).start()
    return {"started": True, "dry_run": payload.dry_run}


@router.get("/push-location-activation/status")
def push_location_activation_status(current=Depends(get_current_admin_or_readonly_key)):
    return STATE_PUSH_LOCATION

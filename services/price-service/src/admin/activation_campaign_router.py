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
from time import sleep as _sleep
import uuid
from html import escape
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, func

from ..analytics.models import AnalyticsProductEvent
from ..config import get_settings
from ..db import Base, SessionLocal
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


class ActivationCampaignContact(Base):
    """Registro DURÁVEL de quem foi contactado por qual campanha de
    ativação, e quando — único jeito de medir conversão depois (comparando
    o estado de push/localização na hora do envio, que por definição do
    segmento era "nenhum dos dois", com o estado atual). Só grava envio
    real (dry_run=False); um dry-run não contacta ninguém de verdade."""
    __tablename__ = "activation_campaign_contacts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    campaign = Column(String(40), nullable=False, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


CAMPAIGN_PUSH_LOCATION = "push_location"


class RunRequest(BaseModel):
    dry_run: bool = True
    # Achado real 03/10/2026: a hospedagem (Hostinger) rejeita envio em
    # rajada com "451 4.7.1 Ratelimit hostinger_out_ratelimit exceeded" —
    # manda devagar, em lotes com pausa entre eles. Valores conservadores
    # por padrão; ajustável por request se o limite real se mostrar maior.
    batch_size: int = 10
    batch_pause_seconds: int = 180


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
    """Sem push ativo — ponto. Alcance máximo por decisão do dono
    (03/10/2026): os mesmos que o painel de Permissões conta como "sem
    nenhum push" (ex: 191 de 340) devem receber, não importa se já
    compartilham localização nem há quanto tempo não abrem o app — essa
    campanha deixou de ser sobre quem os pedidos contextuais em tela nunca
    alcançam, e passou a ser sobre quem nunca ligou push, independente do
    resto. `_run_push_location` filtra depois quem já recebeu antes
    (ActivationCampaignContact), pra um segundo disparo não repetir gente."""
    now = datetime.now(timezone.utc)
    candidates = (
        db.query(User.id, User.name, User.email)
        .filter(~has_any_push(User.id))
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
        seen = _aware(last_seen.get(str(user_id)))
        out.append({
            "user_id": str(user_id), "name": name, "email": email,
            "pet_names": pet_names_by_user.get(str(user_id), []),
            "activity_status": _activity_status(seen, now),
        })
    return out


def _email_copy_push_location(name: Optional[str], pet_names: list[str]) -> tuple[str, str, str]:
    """Texto final escrito pelo dono (03/10/2026) — retorna (subject,
    body_text, body_html); o HTML existe só pra renderizar o negrito/emoji
    do texto original em clientes de e-mail de verdade, o texto puro é
    idêntico em conteúdo (fallback de quem não renderiza HTML).

    Concordância verbal (03/10/2026): quem tem mais de um pet cadastrado
    (ex: "Mel e Rex") precisa de verbo no plural — "não sabem", "têm",
    "se percam" — nunca a forma no singular copiada pra cada pet."""
    saudacao_tutor = name.split(" ")[0] if name else ""
    saudacao = f"Oi, {saudacao_tutor}!" if saudacao_tutor else "Oi!"
    nomes = [n for n in pet_names if n]
    plural = len(nomes) > 1
    pet = _pet_phrase(pet_names) if nomes else "seu pet"
    nao_sabe = "não sabem" if plural else "não sabe"
    tem = "têm" if plural else "tem"
    perca = "se percam" if plural else "se perca"
    subject = f"{pet} já {tem} o seu carinho. Agora falta ativar as notificações"

    body_text = (
        f"{saudacao}\n\n"
        f"{pet} {nao_sabe} conferir a data da próxima vacina nem avisar que a ração "
        f"está acabando. Mas {tem} você para cuidar de tudo isso — e foi para ajudar "
        "nesse cuidado que criamos o PETMOL.\n\n"
        "O app é gratuito, sem anúncios. E sabemos como é chato receber notificações o "
        "tempo todo só para comprar alguma coisa. Também não gostamos disso.\n\n"
        "Pedimos que você ative as notificações para que os avisos importantes cheguem "
        "na hora certa: o lembrete de uma vacina, a previsão de quando a ração vai "
        f"acabar ou uma informação de que alguém avistou {pet}, caso um dia {perca}.\n\n"
        "Com as notificações desativadas, você pode deixar de receber um aviso "
        "justamente quando mais precisar.\n\n"
        'Leva só 10 segundos: abra o PETMOL, toque no seu perfil e depois em "Ativar '
        'notificações".\n\n'
        f"{pet} já {tem} o mais importante: o seu carinho. Deixe o PETMOL ajudar você a "
        "cuidar dos detalhes.\n\n"
        "Equipe PETMOL"
    )

    pet_html = escape(pet)
    saudacao_html = escape(saudacao)
    body_html = (
        '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;max-width:480px">'
        f"<p>{saudacao_html}</p>"
        f"<p>{pet_html} {nao_sabe} conferir a data da próxima vacina nem avisar que a "
        f"ração está acabando. Mas {tem} você para cuidar de tudo isso — e foi para "
        "ajudar nesse cuidado que criamos o PETMOL.</p>"
        "<p>O app é gratuito, sem anúncios. E sabemos como é chato receber notificações "
        "o tempo todo só para comprar alguma coisa. Também não gostamos disso.</p>"
        "<p><strong>Pedimos que você ative as notificações para que os avisos "
        "importantes cheguem na hora certa:</strong> o lembrete de uma vacina, a "
        "previsão de quando a ração vai acabar ou uma informação de que alguém avistou "
        f"{pet_html}, caso um dia {perca}.</p>"
        "<p>Com as notificações desativadas, você pode deixar de receber um aviso "
        "justamente quando mais precisar.</p>"
        '<p><strong>Leva só 10 segundos: abra o PETMOL, toque no seu perfil e depois em '
        '"Ativar notificações".</strong></p>'
        f"<p>{pet_html} já {tem} o mais importante: o seu carinho. Deixe o PETMOL "
        "ajudar você a cuidar dos detalhes. 💛</p>"
        "<p>Equipe PETMOL</p>"
        "</div>"
    )
    return subject, body_text, body_html


def _run_push_location(dry_run: bool, batch_size: int = 10, batch_pause_seconds: int = 180) -> None:
    db = SessionLocal()
    try:
        targets = _target_users_push_location(db)
        # Quem já recebeu essa campanha antes (envio real anterior) não
        # recebe de novo — sem isso, alargar o segmento e disparar outra vez
        # reenviaria pra quem já foi contactado.
        already_contacted = {
            str(uid) for (uid,) in db.query(ActivationCampaignContact.user_id)
            .filter(ActivationCampaignContact.campaign == CAMPAIGN_PUSH_LOCATION).all()
        }
        targets = [t for t in targets if t["user_id"] not in already_contacted]
        result = {"total": len(targets), "dry_run": dry_run}
        if not dry_run:
            sent_email = failed_email = 0
            for i, t in enumerate(targets):
                subject, body_text, body_html = _email_copy_push_location(t["name"], t["pet_names"])
                if send_mail(to=t["email"], subject=subject, body_text=body_text, body_html=body_html):
                    sent_email += 1
                    db.add(ActivationCampaignContact(campaign=CAMPAIGN_PUSH_LOCATION, user_id=t["user_id"]))
                    # Grava na hora — um lote longo (lento de propósito) pode
                    # atravessar um restart/deploy no meio; sem commit
                    # incremental, quem já recebeu nesse meio-tempo perderia
                    # o registro e tomaria o e-mail de novo depois.
                    db.commit()
                else:
                    failed_email += 1
                with _lock_push_location:
                    STATE_PUSH_LOCATION["result"] = {
                        **result, "sent_email": sent_email, "failed_email": failed_email,
                        "progress": f"{i + 1}/{len(targets)}",
                    }
                is_last = (i + 1) == len(targets)
                if not is_last and (i + 1) % batch_size == 0:
                    _sleep(batch_pause_seconds)
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
    threading.Thread(
        target=_run_push_location,
        args=(payload.dry_run, payload.batch_size, payload.batch_pause_seconds),
        daemon=True,
    ).start()
    return {"started": True, "dry_run": payload.dry_run, "batch_size": payload.batch_size, "batch_pause_seconds": payload.batch_pause_seconds}


@router.get("/push-location-activation/status")
def push_location_activation_status(current=Depends(get_current_admin_or_readonly_key)):
    return STATE_PUSH_LOCATION


@router.get("/push-location-activation/conversion")
def push_location_activation_conversion(current=Depends(get_current_admin_or_readonly_key)):
    """Quantos de quem recebeu o e-mail de verdade (ActivationCampaignContact,
    só grava em envio real) JÁ ativaram push e/ou localização desde então —
    por definição do segmento, ninguém contactado tinha nenhum dos dois na
    hora do envio, então qualquer estado atual positivo é conversão."""
    db = SessionLocal()
    try:
        contacted = (
            db.query(ActivationCampaignContact.user_id, func.min(ActivationCampaignContact.sent_at))
            .filter(ActivationCampaignContact.campaign == CAMPAIGN_PUSH_LOCATION)
            .group_by(ActivationCampaignContact.user_id)
            .all()
        )
        if not contacted:
            return {
                "campaign": CAMPAIGN_PUSH_LOCATION, "contacted_total": 0,
                "converted_push": 0, "converted_location": 0, "converted_either": 0,
                "last_contacted_at": None,
            }
        user_ids = [str(uid) for uid, _ in contacted]
        last_contacted_at = max(sent_at for _, sent_at in contacted)
        converted_push_ids = {
            str(uid) for (uid,) in db.query(User.id).filter(User.id.in_(user_ids), has_any_push(User.id)).all()
        }
        converted_location_ids = {
            str(uid) for (uid,) in db.query(User.id).filter(User.id.in_(user_ids), shares_location()).all()
        }
        return {
            "campaign": CAMPAIGN_PUSH_LOCATION,
            "contacted_total": len(user_ids),
            "converted_push": len(converted_push_ids),
            "converted_location": len(converted_location_ids),
            "converted_either": len(converted_push_ids | converted_location_ids),
            "last_contacted_at": last_contacted_at.isoformat() if last_contacted_at else None,
        }
    finally:
        db.close()


class PreviewEmailRequest(BaseModel):
    to: str
    tutor_name: Optional[str] = None
    pet_names: list[str] = []


@router.post("/push-location-activation/preview")
def push_location_activation_preview(
    payload: PreviewEmailRequest,
    x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token"),
):
    """Manda o e-mail REAL deste degrau pra um endereço qualquer (ex: o
    próprio dono), sem entrar na lógica de segmento nem no registro de
    conversão — só pra conferir como chega de verdade na caixa de entrada.
    Mesmo token de escrita da campanha (nunca um disparo "de graça")."""
    _authorize(x_sync_token)
    subject, body_text, body_html = _email_copy_push_location(payload.tutor_name, payload.pet_names)
    ok = send_mail(to=payload.to, subject=subject, body_text=body_text, body_html=body_html)
    return {"sent": ok, "to": payload.to, "subject": subject}

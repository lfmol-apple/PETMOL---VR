"""
Campanha de ativação — "escada" definida pelo dono (28/09/2026): Alimentação
primeiro (fonte de renda), depois Notificação, Localização e por fim os
demais controles essenciais (vacina, antiparasitário...). Degrau 1
(Alimentação) está aqui desde 28/09; degrau 2 (Push + Localização, 02/10)
foi adicionado depois que o painel de Permissões mostrou 63%/68% dos
tutores sem cada um.

Disparo único e manual (não é job recorrente) nos dois degraus.
Alimentação (15/10/2026): o disparo de 28/09 não foi registrado; a partir de agora cada envio real
é gravado (campanha "food") e quem recebeu há menos de `skip_contacted_days` (7) não recebe de novo,
com envio em lotes (limite de e-mail da hospedagem) e push que abre direto a tela de Alimentação.

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

from fastapi import APIRouter, Depends, Form, Header, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, func

from ..analytics.models import AnalyticsProductEvent
from ..config import get_settings
from ..db import Base, SessionLocal
from ..notifications import push_to_user
from ..pets.models import Pet
from ..user_auth.models import User
from .analytics.permissions_bi import _aware, has_any_push, shares_location
from .analytics.queries import _activity_status, _feeding_configured_pet_ids
from .deps import get_current_admin, get_current_admin_or_readonly_key

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


class ActivationOptOut(Base):
    """Quem pediu para não receber mais lembretes de ativação (link no rodapé dos e-mails). Vale para a
    campanha manual e para o piloto automático — nenhum dos dois envia para esta lista."""
    __tablename__ = "activation_opt_out"

    user_id = Column(String(36), primary_key=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class ActivationSetting(Base):
    """Interruptores editáveis pelo painel (sem reiniciar a API). Hoje: autopilot_enabled."""
    __tablename__ = "activation_settings"

    key = Column(String(40), primary_key=True)
    value = Column(String(40), nullable=False)
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


def autopilot_enabled(db) -> bool:
    """O painel manda; sem registro, vale o padrão do ambiente (ACTIVATION_AUTOPILOT_ENABLED)."""
    row = db.query(ActivationSetting).filter(ActivationSetting.key == "autopilot_enabled").first()
    if row is not None:
        return row.value == "1"
    return bool(get_settings().activation_autopilot_enabled)


def opted_out_ids(db) -> set[str]:
    return {str(u) for (u,) in db.query(ActivationOptOut.user_id).all()}


def unsubscribe_token(user_id: str) -> str:
    import hashlib
    import hmac as _hmac
    key = (get_settings().jwt_secret or "").encode()
    return _hmac.new(key, f"activation-optout:{user_id}".encode(), hashlib.sha256).hexdigest()[:32]


def unsubscribe_url(user_id: str) -> str:
    base = get_settings().frontend_url.rstrip("/")
    return f"{base}/api/v1/unsubscribe-reminders?u={user_id}&t={unsubscribe_token(user_id)}"


CAMPAIGN_PUSH_LOCATION = "push_location"
CAMPAIGN_FOOD = "food"
# Depois de N falhas SEGUIDAS de e-mail (ex.: 451 Ratelimit da hospedagem) o envio para de tentar e-mail.
EMAIL_BLOCK_AFTER_FAILURES = 3
CAMPAIGN_PUSH_SECOND = "push_second_chance"
CAMPAIGN_FOOD_HOLDOUT = "food_holdout"  # grupo de controle: elegível, NÃO recebeu mensagem


class RunRequest(BaseModel):
    dry_run: bool = True
    # Achado real 03/10/2026: a hospedagem (Hostinger) rejeita envio em
    # rajada com "451 4.7.1 Ratelimit hostinger_out_ratelimit exceeded" —
    # manda devagar, em lotes com pausa entre eles. Valores conservadores
    # por padrão; ajustável por request se o limite real se mostrar maior.
    batch_size: int = 10
    batch_pause_seconds: int = 180
    # Quem recebeu a campanha de Alimentação (envio real registrado) há menos de
    # N dias não recebe de novo. 0 desliga. Só enxerga envios feitos a partir de
    # agora: o disparo de 28/09 não foi registrado (decisão original de disparo único).
    skip_contacted_days: int = 7
    # % de elegíveis que NÃO recebem (grupo de controle, escolhido de forma fixa pelo id) — é o que
    # separa o efeito da campanha do que aconteceria sozinho. 0 = manda pra todos.
    holdout_pct: int = 0


def _authorize(x_sync_token: Optional[str]) -> None:
    token = get_settings().comms_ops_trigger_token
    if not token or not x_sync_token or not hmac.compare_digest(x_sync_token, token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="token inválido")


def _target_users(db) -> list[dict]:
    """Tutores com pelo menos 1 pet e NENHUM pet com alimentação configurada
    — mesmo critério do filtro `has_feeding=no` do painel de Pessoas."""
    feeding_pet_ids = _feeding_configured_pet_ids(db)
    rows = db.query(Pet.user_id, Pet.id, Pet.name).order_by(Pet.created_at.asc()).all()
    pets_by_user: dict[str, list[tuple[str, Optional[str]]]] = {}
    for user_id, pet_id, pet_name in rows:
        pets_by_user.setdefault(str(user_id), []).append((str(pet_id), pet_name))

    out: list[dict] = []
    blocked = opted_out_ids(db)
    for user_id, pets in pets_by_user.items():
        if user_id in blocked:
            continue
        missing = [name for (pid, name) in pets if pid not in feeding_pet_ids]
        # Só entra na campanha quem não tem NENHUM pet com alimentação —
        # quem já configurou pelo menos 1 não é alvo deste degrau.
        if len(missing) != len(pets):
            continue
        out.append({"user_id": user_id, "pet_names": [n for n in missing if n],
                    "first_pet_id": pets[0][0] if pets else None})

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


def _footer(user_id: Optional[str]) -> str:
    return (f"\n\nPara PARAR de receber estes lembretes, abra o link abaixo e confirme "
            f"(se quiser continuar recebendo, ignore): {unsubscribe_url(user_id)}") if user_id else ""


def _email_copy(name: Optional[str], pet_names: list[str], user_id: Optional[str] = None) -> tuple[str, str]:
    nomes = [n for n in pet_names if n]
    plural = len(nomes) > 1
    saudacao = f"Oi {name.split(' ')[0]}" if name else "Oi"
    pet = _pet_phrase(pet_names)
    # concordância: "Vianna e Vanda ainda não têm", nunca "não tem" no plural
    tem = "têm" if plural else "tem"
    subject = "Ainda falta cadastrar a ração do seu pet no PETMOL"
    body = (
        f"{saudacao}, vimos que {pet} ainda não {tem} a ração cadastrada no PETMOL. "
        "Assim que você registra o pacote, o app acompanha o consumo sozinho e avisa "
        'antes de acabar — sem depender da memória. Leva 1 minuto: abra o app e toque '
        'em "Alimentação". E não se esqueça, ative as notificações!'
    ) + _footer(user_id)
    return subject, body


def _push_title(pet_names: list[str]) -> str:
    """"Mel confia em você" — verbo concorda com quantos pets (1 → confia; 2+ → confiam)."""
    names = [n for n in pet_names if n]
    if not names:
        return "Seu pet confia em você 🐾"
    if len(names) == 1:
        return f"{names[0]} confia em você 🐾"
    if len(names) == 2:
        return f"{names[0]} e {names[1]} confiam em você 🐾"
    return "Seus pets confiam em você 🐾"


def _push_payload(pet_names: list[str], pet_id: Optional[str] = None) -> dict:
    # Texto escolhido pelo dono (15/10/2026). Verdade simples: o app AVISA antes de acabar.
    url = f"/home?modal=food&petId={pet_id}" if pet_id else "/home"
    return {
        "title": _push_title(pet_names),
        "body": "Cadastre a ração e a gente avisa antes de acabar. Leva 1 minuto.",
        "tag": "activation-food",
        # Toque abre direto a tela de Alimentação do pet (mesmo deep link dos lembretes de ração).
        "data": {"url": url},
    }


def _recently_contacted_food(db, days: int) -> set[str]:
    if days <= 0:
        return set()
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return {
        str(uid) for (uid,) in db.query(ActivationCampaignContact.user_id)
        .filter(ActivationCampaignContact.campaign == CAMPAIGN_FOOD,
                ActivationCampaignContact.sent_at >= cutoff).all()
    }


def _in_holdout(user_id: str, pct: int) -> bool:
    import hashlib
    return pct > 0 and int(hashlib.md5(user_id.encode()).hexdigest()[:8], 16) % 100 < pct


def _run(dry_run: bool, batch_size: int = 10, batch_pause_seconds: int = 180,
         skip_contacted_days: int = 7, holdout_pct: int = 0) -> None:
    """Ração: SÓ push (decisão do dono, 16/10/2026 — nenhum e-mail de campanha sai mais)."""
    db = SessionLocal()
    try:
        targets = _target_users(db)
        recent = _recently_contacted_food(db, skip_contacted_days)
        skipped_recent = [t for t in targets if t["user_id"] in recent]
        targets = [t for t in targets if t["user_id"] not in recent]
        holdout = [t for t in targets if _in_holdout(t["user_id"], holdout_pct)]
        targets = [t for t in targets if t not in holdout]
        with_push = [t for t in targets if t["has_push"]]
        without_push = [t for t in targets if not t["has_push"]]

        result = {
            "total": len(with_push),
            "sem_aviso_ignorados": len(without_push),
            "skipped_recent": len(skipped_recent),
            "holdout": len(holdout),
            "dry_run": dry_run,
        }

        if not dry_run:
            for t in holdout:   # controle: registrado, sem mensagem
                db.add(ActivationCampaignContact(campaign=CAMPAIGN_FOOD_HOLDOUT, user_id=t["user_id"]))
            db.commit()
            sent_push = 0
            for i, t in enumerate(with_push):
                ok = push_to_user(t["user_id"], _push_payload(t["pet_names"], t.get("first_pet_id")))
                if ok > 0:
                    sent_push += 1
                    # registro durável, na hora (evita repetir se a API reiniciar no meio)
                    db.add(ActivationCampaignContact(campaign=CAMPAIGN_FOOD, user_id=t["user_id"]))
                    db.commit()
                with _lock:
                    STATE["result"] = {**result, "sent_push": sent_push, "progress": f"{i + 1}/{len(with_push)}"}
            result.update(sent_push=sent_push)

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
    threading.Thread(
        target=_run, args=(payload.dry_run, payload.batch_size, payload.batch_pause_seconds,
              payload.skip_contacted_days, payload.holdout_pct),
        daemon=True,
    ).start()
    return {"started": True, "dry_run": payload.dry_run, "batch_size": payload.batch_size,
            "batch_pause_seconds": payload.batch_pause_seconds, "skip_contacted_days": payload.skip_contacted_days,
            "holdout_pct": payload.holdout_pct}


@router.get("/food-activation/status")
def food_activation_status(current=Depends(get_current_admin_or_readonly_key)):
    return STATE


@router.get("/food-activation/preview")
def food_activation_preview(skip_contacted_days: int = 7, current=Depends(get_current_admin_or_readonly_key)):
    """Quantos receberiam AGORA (nada é enviado): mesmo segmento e mesma regra
    de "já contactado" do disparo, para o painel mostrar o tamanho antes."""
    db = SessionLocal()
    try:
        targets = _target_users(db)
        recent = _recently_contacted_food(db, skip_contacted_days)
        eligible = [t for t in targets if t["user_id"] not in recent]
        return {
            "campaign": CAMPAIGN_FOOD,
            "eligible": sum(1 for t in eligible if t["has_push"]),   # só push
            "without_push": sum(1 for t in eligible if not t["has_push"]),
            "skipped_recent": len(targets) - len(eligible),
            "skip_contacted_days": skip_contacted_days,
        }
    finally:
        db.close()


@router.get("/food-activation/results")
def food_activation_results(window_days: int = 7, current=Depends(get_current_admin_or_readonly_key)):
    """Quanto a campanha de Alimentação surtiu efeito.

    - `contacted`/`holdout`: quem recebeu e quem ficou de controle (se houve).
    - `converted_window`: cadastrou a ração DEPOIS do envio e em até `window_days` dias.
    - `converted_total`: tem ração hoje (por definição do segmento, ninguém tinha).
    - `series`: quantos tutores cadastraram a PRIMEIRA ração por dia, a partir de 14 dias antes do
      primeiro envio — mostra o antes e o depois sem depender de controle.
    Sem controle (holdout), "efeito" = depois menos o ritmo de antes; com controle, a diferença de
    taxa entre os dois grupos é a leitura mais limpa."""
    from datetime import timedelta
    from zoneinfo import ZoneInfo
    from ..health.models import FeedingPlan

    db = SessionLocal()
    try:
        rows = (
            db.query(ActivationCampaignContact.user_id, ActivationCampaignContact.campaign,
                     func.min(ActivationCampaignContact.sent_at))
            .filter(ActivationCampaignContact.campaign.in_([CAMPAIGN_FOOD, CAMPAIGN_FOOD_HOLDOUT]))
            .group_by(ActivationCampaignContact.user_id, ActivationCampaignContact.campaign).all()
        )
        if not rows:
            return {"campaign": CAMPAIGN_FOOD, "contacted": 0, "holdout": 0, "first_sent_at": None,
                    "window_days": window_days, "series": []}

        feeding_ids = _feeding_configured_pet_ids(db)
        first_feeding: dict[str, datetime] = {}
        for uid, created in (
            db.query(Pet.user_id, func.min(FeedingPlan.created_at))
            .join(FeedingPlan, FeedingPlan.pet_id == Pet.id)
            .filter(Pet.id.in_(feeding_ids or {"__none__"}), FeedingPlan.deleted_at.is_(None))
            .group_by(Pet.user_id).all()
        ):
            first_feeding[str(uid)] = _aware(created)

        def _group(campaign: str) -> dict:
            members = [(str(u), _aware(t)) for u, c, t in rows if c == campaign]
            total = len(members)
            now_has = sum(1 for u, _ in members if u in first_feeding)
            in_window = sum(
                1 for u, sent in members
                if u in first_feeding and sent <= first_feeding[u] <= sent + timedelta(days=window_days)
            )
            return {"total": total, "converted_total": now_has, "converted_window": in_window,
                    "rate_window": round(in_window / total, 4) if total else None}

        treated, control = _group(CAMPAIGN_FOOD), _group(CAMPAIGN_FOOD_HOLDOUT)
        first_sent = min(_aware(t) for _, c, t in rows if c == CAMPAIGN_FOOD) if treated["total"] else None

        br = ZoneInfo("America/Sao_Paulo")
        series = []
        if first_sent:
            start = (first_sent - timedelta(days=14)).astimezone(br).date()
            by_day: dict = {}
            for created in first_feeding.values():
                d = created.astimezone(br).date()
                if d >= start:
                    by_day[d] = by_day.get(d, 0) + 1
            day, today = start, datetime.now(br).date()
            while day <= today:
                series.append({"date": day.isoformat(), "first_feeding": by_day.get(day, 0)})
                day += timedelta(days=1)
            send_day = first_sent.astimezone(br).date()
            before = [p["first_feeding"] for p in series if p["date"] < send_day.isoformat()]
            after = [p["first_feeding"] for p in series if p["date"] >= send_day.isoformat()]
        else:
            before = after = []
        avg = lambda xs: round(sum(xs) / len(xs), 2) if xs else None  # noqa: E731
        lift = None
        if control["total"] and treated["rate_window"] is not None and control["rate_window"] is not None:
            lift = round(treated["rate_window"] - control["rate_window"], 4)
        return {
            "campaign": CAMPAIGN_FOOD, "window_days": window_days,
            "first_sent_at": first_sent.isoformat() if first_sent else None,
            "contacted": treated, "holdout": control, "lift_vs_holdout": lift,
            "daily_avg_before": avg(before), "daily_avg_after": avg(after),
            "series": series,
            "notes": [
                "Só cobre envios registrados a partir do disparo de 15/10; o de 28/09 não foi registrado.",
                "Sem grupo de controle, o antes/depois mistura o efeito da campanha com qualquer outra "
                "mudança do período. Com poucos contactados, diferenças pequenas não provam nada.",
            ],
        }
    finally:
        db.close()


@router.get("/food-activation/conversion")
def food_activation_conversion(current=Depends(get_current_admin_or_readonly_key)):
    """De quem recebeu a campanha de Alimentação (envio real registrado), quantos
    já têm alimentação cadastrada. Por definição do segmento, ninguém contactado
    tinha — qualquer alimentação atual é conversão. Só cobre envios registrados."""
    db = SessionLocal()
    try:
        contacted = (
            db.query(ActivationCampaignContact.user_id, func.min(ActivationCampaignContact.sent_at))
            .filter(ActivationCampaignContact.campaign == CAMPAIGN_FOOD)
            .group_by(ActivationCampaignContact.user_id).all()
        )
        if not contacted:
            return {"campaign": CAMPAIGN_FOOD, "contacted_total": 0, "converted": 0, "last_contacted_at": None}
        user_ids = [str(uid) for uid, _ in contacted]
        feeding_ids = _feeding_configured_pet_ids(db)
        converted = {
            str(uid) for (uid,) in db.query(Pet.user_id)
            .filter(Pet.user_id.in_(user_ids), Pet.id.in_(feeding_ids or {"__none__"})).distinct().all()
        }
        last = max(sent_at for _, sent_at in contacted)
        return {"campaign": CAMPAIGN_FOOD, "contacted_total": len(user_ids), "converted": len(converted),
                "last_contacted_at": last.isoformat() if last else None}
    finally:
        db.close()


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
    blocked = opted_out_ids(db)
    for user_id, name, email in candidates:
        if not email or str(user_id) in blocked:
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


EMAIL_CAMPAIGNS_OFF = "Campanha por e-mail desativada (decisão do dono, 16/10/2026). Só push."


@router.post("/push-location-activation/run")
def run_push_location_activation(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    raise HTTPException(status_code=410, detail=EMAIL_CAMPAIGNS_OFF)


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
    _authorize(x_sync_token)
    raise HTTPException(status_code=410, detail=EMAIL_CAMPAIGNS_OFF)


# ── Etapa 2 da escada — Notificação, segunda chance (15/10/2026) ─────────────
# Para quem AINDA está sem push depois da etapa 1 (ração) e do e-mail de 02-03/10. Texto novo, só e-mail
# (por definição, quem não tem push não tem aparelho para receber push). Regras: nenhuma pessoa recebe
# mais de 1 mensagem de ativação por semana (qualquer campanha), quem já recebeu esta não recebe de novo
# e conta com menos de 2 dias não entra (ainda está no cadastro).

STATE_PUSH_SECOND: dict = {"phase": "idle", "started_at": None, "finished_at": None, "result": None, "error": None}
_lock_push_second = threading.Lock()


def _email_copy_push_second(name: Optional[str], pet_names: list[str], user_id: Optional[str] = None) -> tuple[str, str, str]:
    saudacao_tutor = name.split(" ")[0] if name else ""
    saudacao = f"Oi, {saudacao_tutor}!" if saudacao_tutor else "Oi!"
    nomes = [n for n in pet_names if n]
    pet = _pet_phrase(pet_names) if nomes else "seu pet"
    sumir = "sumirem" if len(nomes) > 1 else "sumir"
    subject = f"Falta um toque para o PETMOL cuidar de {pet} com você"
    body_text = (
        f"{saudacao}\n\n"
        f"Quando a ração de {pet} estiver acabando ou uma vacina vencer, o PETMOL só consegue te avisar se as "
        "notificações estiverem ligadas. Hoje elas estão desligadas.\n\n"
        f"É grátis e sem anúncios: só os avisos que importam — vacina, ração e, se um dia {pet} {sumir}, o alerta "
        "da região.\n\n"
        'Leva 10 segundos: abra o PETMOL, toque no seu perfil e depois em "Ativar notificações".\n\n'
        "Equipe PETMOL"
    ) + _footer(user_id)
    pet_html = escape(pet)
    opt = (f'<p style="font-size:12px;color:#9ca3af">Para <strong>parar</strong> de receber estes lembretes, '
           f'<a href="{escape(unsubscribe_url(user_id))}">abra este link e confirme</a> '
           f'(se quiser continuar recebendo, ignore).</p>') if user_id else ""
    body_html = (
        '<div style="font-family:Arial,sans-serif;font-size:15px;color:#1f2937;line-height:1.6;max-width:480px">'
        f"<p>{escape(saudacao)}</p>"
        f"<p>Quando a ração de {pet_html} estiver acabando ou uma vacina vencer, o PETMOL só consegue te avisar se as "
        "notificações estiverem ligadas. <strong>Hoje elas estão desligadas.</strong></p>"
        f"<p>É grátis e sem anúncios: só os avisos que importam — vacina, ração e, se um dia {pet_html} {sumir}, o alerta da região.</p>"
        '<p><strong>Leva 10 segundos: abra o PETMOL, toque no seu perfil e depois em "Ativar notificações".</strong></p>'
        "<p>Equipe PETMOL</p>" + opt + "</div>"
    )
    return subject, body_text, body_html


def _recent_any_contact(db, days: int) -> set[str]:
    from datetime import timedelta
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    return {str(u) for (u,) in db.query(ActivationCampaignContact.user_id)
            .filter(ActivationCampaignContact.sent_at >= cutoff).all()}


def _target_users_push_second(db, weekly_cap_days: int = 7, min_account_days: int = 2) -> tuple[list[dict], dict]:
    from datetime import timedelta
    candidates = _target_users_push_location(db)       # sem push ativo, com e-mail
    created = dict(db.query(User.id, User.created_at).filter(
        User.id.in_([c["user_id"] for c in candidates] or ["__none__"])).all())
    already = {str(u) for (u,) in db.query(ActivationCampaignContact.user_id)
               .filter(ActivationCampaignContact.campaign == CAMPAIGN_PUSH_SECOND).all()}
    capped = _recent_any_contact(db, weekly_cap_days)
    min_created = datetime.now(timezone.utc) - timedelta(days=min_account_days)
    out, skipped = [], {"already": 0, "weekly_cap": 0, "too_new": 0}
    for c in candidates:
        uid = c["user_id"]
        made = _aware(created.get(uid))
        if uid in already:
            skipped["already"] += 1
        elif uid in capped:
            skipped["weekly_cap"] += 1
        elif made and made > min_created:
            skipped["too_new"] += 1
        else:
            out.append(c)
    return out, skipped


@router.post("/push-second-chance/run")
def run_push_second(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _authorize(x_sync_token)
    raise HTTPException(status_code=410, detail=EMAIL_CAMPAIGNS_OFF)


@router.get("/push-second-chance/status")
def push_second_status(current=Depends(get_current_admin_or_readonly_key)):
    return STATE_PUSH_SECOND


@router.get("/push-second-chance/preview")
def push_second_preview(current=Depends(get_current_admin_or_readonly_key)):
    """Quantos receberiam AGORA (nada é enviado) e por que os demais ficam de fora."""
    db = SessionLocal()
    try:
        targets, skipped = _target_users_push_second(db)
        return {"campaign": CAMPAIGN_PUSH_SECOND, "eligible": len(targets), "skipped": skipped}
    finally:
        db.close()


@router.get("/push-second-chance/conversion")
def push_second_conversion(current=Depends(get_current_admin_or_readonly_key)):
    db = SessionLocal()
    try:
        contacted = (db.query(ActivationCampaignContact.user_id, func.min(ActivationCampaignContact.sent_at))
                     .filter(ActivationCampaignContact.campaign == CAMPAIGN_PUSH_SECOND)
                     .group_by(ActivationCampaignContact.user_id).all())
        if not contacted:
            return {"campaign": CAMPAIGN_PUSH_SECOND, "contacted_total": 0, "converted_push": 0, "last_contacted_at": None}
        ids = [str(u) for u, _ in contacted]
        converted = {str(u) for (u,) in db.query(User.id).filter(User.id.in_(ids), has_any_push(User.id)).all()}
        return {"campaign": CAMPAIGN_PUSH_SECOND, "contacted_total": len(ids), "converted_push": len(converted),
                "last_contacted_at": max(t for _, t in contacted).isoformat()}
    finally:
        db.close()


public_router = APIRouter(prefix="/v1", tags=["Activation Opt-out"])


def _optout_page(title: str, body: str) -> str:
    """Página simples, legível no celular, com botões grandes."""
    return (
        "<!doctype html><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{escape(title)}</title>"
        "<body style='font-family:Arial,sans-serif;max-width:440px;margin:10vh auto;padding:0 20px;text-align:center;color:#111827'>"
        f"<h2 style='margin-bottom:8px'>{escape(title)}</h2>{body}"
        "<p style='color:#9ca3af;font-size:12px;margin-top:28px'>PETMOL</p></body>"
    )


def _optout_button(label: str, action: str, u: str, t: str, *, primary: bool) -> str:
    color = "background:#dc2626;color:#fff;border:0" if primary else "background:#fff;color:#374151;border:1px solid #d1d5db"
    return (
        f"<form method='post' action='/api/v1/unsubscribe-reminders' style='margin:10px 0'>"
        f"<input type='hidden' name='u' value='{escape(u)}'><input type='hidden' name='t' value='{escape(t)}'>"
        f"<input type='hidden' name='action' value='{action}'>"
        f"<button type='submit' style='width:100%;padding:16px;border-radius:12px;font-size:17px;font-weight:700;{color}'>{escape(label)}</button>"
        "</form>"
    )


@public_router.get("/unsubscribe-reminders")
def unsubscribe_reminders_page(u: str, t: str):
    """Abrir o link do rodapé NÃO descadastra: mostra uma tela para confirmar (e, se a pessoa já parou, para voltar
    a receber). Antes, o toque descadastrava na hora — gente clicava sem entender o link e saía sem querer
    (relato do dono, 15/10/2026), e programas de segurança de e-mail que "abrem" links também descadastravam.
    Assinado (HMAC): não dá para mexer na conta de outra pessoa adivinhando o id."""
    from fastapi.responses import HTMLResponse
    if not hmac.compare_digest(t, unsubscribe_token(u)):
        raise HTTPException(status_code=400, detail="link inválido")
    db = SessionLocal()
    try:
        stopped = db.query(ActivationOptOut).filter(ActivationOptOut.user_id == u).first() is not None
    finally:
        db.close()
    if stopped:
        body = (
            "<p>Você <strong>não está recebendo</strong> os lembretes do PETMOL por e-mail e aviso.</p>"
            "<p>Foi sem querer? Dá para voltar a receber agora.</p>"
            + _optout_button("Voltar a receber os lembretes", "resume", u, t, primary=False)
        )
        return HTMLResponse(_optout_page("Lembretes pausados", body))
    body = (
        "<p>Quer <strong>parar de receber</strong> os lembretes do PETMOL (como o aviso para cadastrar a ração)?</p>"
        "<p style='color:#6b7280;font-size:14px'>Os avisos do app, como vacina e ração, continuam funcionando se você os mantiver ligados.</p>"
        + _optout_button("Sim, parar de receber", "stop", u, t, primary=True)
        + "<p style='margin-top:18px'><a href='https://www.petmol.com.br' style='color:#2563eb;font-size:16px'>Não, quero continuar recebendo</a></p>"
    )
    return HTMLResponse(_optout_page("Parar de receber lembretes?", body))


@public_router.post("/unsubscribe-reminders")
def unsubscribe_reminders_action(u: str = Form(...), t: str = Form(...), action: str = Form(...)):
    from fastapi.responses import HTMLResponse
    if not hmac.compare_digest(t, unsubscribe_token(u)) or action not in ("stop", "resume"):
        raise HTTPException(status_code=400, detail="link inválido")
    db = SessionLocal()
    try:
        row = db.query(ActivationOptOut).filter(ActivationOptOut.user_id == u).first()
        if action == "stop" and row is None:
            db.add(ActivationOptOut(user_id=u))
            db.commit()
        elif action == "resume" and row is not None:
            db.delete(row)
            db.commit()
    finally:
        db.close()
    if action == "stop":
        body = (
            "<p>Você não vai mais receber estes lembretes do PETMOL.</p>"
            "<p>Foi sem querer? Dá para voltar a receber:</p>"
            + _optout_button("Voltar a receber os lembretes", "resume", u, t, primary=False)
        )
        return HTMLResponse(_optout_page("Pronto, pausamos os lembretes", body))
    return HTMLResponse(_optout_page("Pronto, voltamos a enviar", "<p>Você continua recebendo os lembretes do PETMOL.</p>"))


# ── Painel (Dashboard 2): o dono dispara e acompanha com o login de admin, sem token ──────────────
# Mesma lógica dos disparos por token, mas autenticada pela sessão do admin master (get_current_admin).

panel_router = APIRouter(prefix="/v1/admin/campaigns/panel", tags=["Admin Campaigns Panel"])


class PanelRun(BaseModel):
    dry_run: bool = True


@panel_router.get("/summary")
def panel_summary(current=Depends(get_current_admin)):
    from datetime import timedelta
    db = SessionLocal()
    try:
        food_targets = _target_users(db)
        recent = _recently_contacted_food(db, 7)
        food_eligible = [t for t in food_targets if t["user_id"] not in recent]
        since = datetime.now(timezone.utc) - timedelta(hours=24)
        last24 = {c: int(n) for c, n in db.query(ActivationCampaignContact.campaign, func.count())
                  .filter(ActivationCampaignContact.sent_at >= since).group_by(ActivationCampaignContact.campaign).all()}
        return {
            # só push: quem não tem aviso ativo não entra mais (nenhum e-mail de campanha)
            "food": {"eligible": sum(1 for t in food_eligible if t["has_push"]),
                     "without_push": sum(1 for t in food_eligible if not t["has_push"]),
                     "skipped_recent": len(food_targets) - len(food_eligible), "state": STATE},
            "autopilot": {"enabled": autopilot_enabled(db), "daily_cap": get_settings().activation_autopilot_daily_cap,
                          "last24h": last24, "opted_out": len(opted_out_ids(db))},
        }
    finally:
        db.close()


@panel_router.post("/food/run")
def panel_run_food(payload: PanelRun, current=Depends(get_current_admin)):
    with _lock:
        if STATE["phase"] == "running":
            raise HTTPException(status_code=409, detail="campanha já em andamento")
        STATE.update(phase="running", started_at=datetime.now(timezone.utc).isoformat(),
                     finished_at=None, result=None, error=None)
    threading.Thread(target=_run, args=(payload.dry_run, 10, 180, 7, 0), daemon=True).start()
    return {"started": True, "dry_run": payload.dry_run}


@panel_router.post("/push-second/run")
def panel_run_push_second(payload: PanelRun, current=Depends(get_current_admin)):
    raise HTTPException(status_code=410, detail=EMAIL_CAMPAIGNS_OFF)


class AutopilotToggle(BaseModel):
    enabled: bool


@panel_router.post("/autopilot")
def panel_autopilot(payload: AutopilotToggle, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        row = db.query(ActivationSetting).filter(ActivationSetting.key == "autopilot_enabled").first()
        if row is None:
            row = ActivationSetting(key="autopilot_enabled", value="1" if payload.enabled else "0")
            db.add(row)
        else:
            row.value = "1" if payload.enabled else "0"
            row.updated_at = datetime.now(timezone.utc)
        db.commit()
        logger.info("[activation_autopilot] %s por %s", "LIGADO" if payload.enabled else "DESLIGADO", current[0].id)
        return {"enabled": payload.enabled}
    finally:
        db.close()

"""
Push Notifications — sistema simples de lembretes push para PETMOL.

Fluxo: usuário define lembrete no sheet → POST /notifications/reminders →
scheduler (1 min) detecta remind_at <= now → envia push via VAPID.
"""
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from pywebpush import webpush, WebPushException
from sqlalchemy import Boolean, Column, DateTime, Float, Integer, String, Text, UniqueConstraint

from ..db import Base, SessionLocal, engine
from ..user_auth.deps import get_current_user
from ..config import get_settings
from ..family.models import FamilyGroup, FamilyMember
from ..pets.access import get_accessible_pet_or_404
from ..pets.caretaker_models import PetCaretaker
from ..pets.models import Pet

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ── Push send helper ─────────────────────────────────────────────────────────

def _normalize_subscription(sub: dict) -> dict:
    """Convert flat subscription (old format) to nested keys format (Web Push standard)."""
    if "keys" not in sub and ("p256dh" in sub or "auth" in sub):
        return {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub.get("p256dh", ""),
                "auth": sub.get("auth", ""),
            },
        }
    return sub


def _send_push(subscription: dict, payload: dict) -> tuple:
    """Returns (ok: bool, sub_invalid: bool). sub_invalid=True means subscription should be removed."""
    settings = get_settings()
    try:
        webpush(
            subscription_info=_normalize_subscription(subscription),
            data=json.dumps(payload),
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": settings.vapid_claims_email},
        )
        return True, False
    except WebPushException as e:
        status = getattr(e.response, "status_code", None) if e.response else None
        if status in (404, 410):
            logger.warning(f"Subscription expirada/removida ({status}) — será descartada. Body: {getattr(e.response, 'text', '')[:200]}")
            return False, True
        else:
            logger.warning(f"WebPushException ({status}): {e}")
            return False, False
    except Exception as e:
        logger.error(f"_send_push error: {e}")
        return False, False


# ── Reminder model ───────────────────────────────────────────────────────────

_MAX_RETRY = 5

class Reminder(Base):
    __tablename__ = "reminders"

    id          = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id     = Column(String(36), nullable=False, index=True)
    pet_id      = Column(String(36), nullable=True, index=True)
    type        = Column(String(50), nullable=False)
    title       = Column(String(255), nullable=False)
    body        = Column(Text, nullable=True)
    url         = Column(Text, nullable=True)
    remind_at   = Column(DateTime(timezone=True), nullable=False, index=True)
    sent        = Column(Boolean, default=False, nullable=False)
    retry_count = Column(Integer, default=0, nullable=False)
    created_at  = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class PushSubscription(Base):
    """Web Push subscription — uma linha por dispositivo/navegador.

    Substituiu o arquivo shared/persistent/push_subscriptions.json (single-
    device por usuário, sujeito a race condition em escritas concorrentes —
    dois POST /subscribe simultâneos podiam colidir no rename do .tmp e
    devolver 500). (user_id, endpoint) é a chave natural de dispositivo: o
    endpoint do Web Push já é único por registro de push do navegador, então
    isso já dá suporte a múltiplos dispositivos por tutor de graça.
    """
    __tablename__ = "push_subscriptions"
    __table_args__ = (UniqueConstraint("user_id", "endpoint", name="uq_push_subscriptions_user_endpoint"),)

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = Column(String(36), nullable=False, index=True)
    endpoint     = Column(Text, nullable=False)
    p256dh       = Column(Text, nullable=False)
    auth         = Column(Text, nullable=False)
    lat          = Column(Float, nullable=True)
    lng          = Column(Float, nullable=True)
    device_id    = Column(String(64), nullable=True)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    disabled_at  = Column(DateTime(timezone=True), nullable=True, index=True)


class NativePushToken(Base):
    """Token de push nativo (FCM/APNs) — dispositivo Android/iOS via o shell
    Capacitor, DISTINTO de PushSubscription (Web Push, endpoint/p256dh/auth).

    Web Push não funciona de forma confiável dentro do WebView nativo do
    Capacitor — daí esta tabela separada em vez de forçar o token nativo nos
    campos de Web Push (que são NOT NULL e não fazem sentido pra esse caso).

    IMPORTANTE: esta tabela só REGISTRA o token — o envio de fato (via
    Firebase Cloud Messaging / Apple Push Notification service) ainda
    depende de credenciais externas que não existem neste ambiente ainda
    (projeto Firebase + google-services.json pro Android; certificado/chave
    APNs + capability no Xcode pro iOS). Ver docs/MOBILE_RELEASE_CHECKLIST.md
    para o que falta exatamente e quem precisa fazer o quê.
    """
    __tablename__ = "native_push_tokens"
    __table_args__ = (UniqueConstraint("user_id", "token", name="uq_native_push_tokens_user_token"),)

    id           = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id      = Column(String(36), nullable=False, index=True)
    platform     = Column(String(10), nullable=False)  # "ios" | "android"
    token        = Column(Text, nullable=False)
    created_at   = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_seen_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    disabled_at  = Column(DateTime(timezone=True), nullable=True, index=True)


# Cria as tabelas se não existirem
Base.metadata.create_all(bind=engine, tables=[Reminder.__table__, PushSubscription.__table__, NativePushToken.__table__])


# ── Compat shims (missing_pets/__init__.py e family/utils.py importam estas
# duas funções diretamente, no formato antigo {user_id: {endpoint, keys, lat,
# lng}} de um dispositivo por usuário). Reescrever esses dois módulos pra
# multi-dispositivo fica pra depois — aqui só troca o armazenamento por baixo
# (Postgres em vez do JSON), sem quebrar quem já chama essas funções. Os
# endpoints /subscribe, /unsubscribe, /test e o scheduler abaixo JÁ usam
# PushSubscription diretamente e já suportam múltiplos dispositivos. ─────────

def _load_subscriptions() -> dict:
    db = SessionLocal()
    try:
        rows = (
            db.query(PushSubscription)
            .filter(PushSubscription.disabled_at.is_(None))
            .order_by(PushSubscription.last_seen_at.desc())
            .all()
        )
        result: dict = {}
        for r in rows:
            if r.user_id in result:
                continue  # já tem o dispositivo mais recente deste usuário
            entry = {"endpoint": r.endpoint, "keys": {"p256dh": r.p256dh, "auth": r.auth}}
            if r.lat is not None:
                entry["lat"] = r.lat
            if r.lng is not None:
                entry["lng"] = r.lng
            result[r.user_id] = entry
        return result
    finally:
        db.close()


def _save_subscriptions(subs: dict) -> None:
    """`subs` é tratado como autoritativo: qualquer dispositivo ativo cujo
    user_id não esteja mais em `subs` é desativado. Os chamadores atuais só
    fazem pop() antes de chamar isso (nunca adicionam), então na prática só
    desativa."""
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        active = db.query(PushSubscription).filter(PushSubscription.disabled_at.is_(None)).all()
        for row in active:
            if row.user_id not in subs:
                row.disabled_at = now
        db.commit()
    finally:
        db.close()


# ── Deep link builder ────────────────────────────────────────────────────────

_TYPE_TO_MODAL = {
    "food":       ("food",      None),
    "medication": ("medication", None),
    "vaccine":    ("vaccines",  None),
    "dewormer":   ("parasites", "dewormer"),
    "flea":       ("parasites", "flea_tick"),
    "collar":     ("parasites", "collar"),
    "grooming":   ("grooming",  None),
}


def _build_deep_link(reminder_type: str, pet_id: Optional[str]) -> str:
    modal, subtype = _TYPE_TO_MODAL.get(reminder_type, ("home", None))
    if modal == "home":
        return "/home"
    params = f"modal={modal}"
    if pet_id:
        params += f"&petId={pet_id}"
    if subtype:
        params += f"&subtype={subtype}"
    return f"/home?{params}"


_TYPE_CONFIG: dict = {
    # ── Produtos: lembrete para COMPRAR ──
    "food": {
        "action_label": "🛒 Comprar ração",
        "action_id": "buy",
        "fallback_body": "Hora de comprar ração. O estoque está acabando!",
    },
    "dewormer": {
        "action_label": "🛒 Comprar vermífugo",
        "action_id": "buy",
        "fallback_body": "Hora de comprar o vermífugo para o seu pet.",
    },
    "flea": {
        "action_label": "🛒 Comprar antipulgas",
        "action_id": "buy",
        "fallback_body": "Hora de comprar o antipulgas para o seu pet.",
    },
    "collar": {
        "action_label": "🛒 Comprar coleira",
        "action_id": "buy",
        "fallback_body": "Hora de comprar a coleira antipulgas para o seu pet.",
    },
    # ── Serviços/ações: lembrete para FAZER ──
    "medication": {
        "action_label": "✅ Registrar dose",
        "action_id": "register",
        "fallback_body": "Hora de dar o medicamento para o seu pet. Toque para registrar a dose.",
    },
    "vaccine": {
        "action_label": "📅 Agendar consulta",
        "action_id": "view",
        "fallback_body": "Hora de levar ao veterinário para a vacina. Agende a consulta!",
    },
    "grooming": {
        "action_label": "📅 Agendar serviço",
        "action_id": "view",
        "fallback_body": "Hora de agendar o banho e/ou tosa no pet shop.",
    },
}


# ── Scheduler job ────────────────────────────────────────────────────────────

def send_due_reminders() -> None:
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        due = (
            db.query(Reminder)
            .filter(Reminder.sent == False, Reminder.remind_at <= now)
            .all()
        )
        if not due:
            return

        # Uma query só pra todas as subscriptions ativas, reaproveitada por
        # todos os reminders deste batch (mesmo padrão de antes, só que lendo
        # de push_subscriptions em vez do JSON) — evita N+1.
        active_subs = (
            db.query(PushSubscription)
            .filter(PushSubscription.disabled_at.is_(None))
            .all()
        )
        subs_by_user: dict = {}
        for s in active_subs:
            subs_by_user.setdefault(s.user_id, []).append(s)
        invalid_sub_ids: set = set()

        # Dedup: para cada (user_id, pet_id, type, remind_at), enviar apenas uma vez
        # e marcar todos os duplicados como enviados (evita push duplo por dados herdados)
        seen: set = set()

        for reminder in due:
            dedup_key = (reminder.user_id, reminder.pet_id or "", reminder.type, reminder.remind_at)
            is_duplicate = dedup_key in seen
            seen.add(dedup_key)

            if is_duplicate:
                logger.info(f"Reminder {reminder.id}: duplicado suprimido — marcado como enviado")
                reminder.sent = True
                continue

            recipient_ids = {str(reminder.user_id)}
            if reminder.pet_id:
                pet = db.query(Pet).filter(Pet.id == reminder.pet_id).first()
                if pet:
                    recipient_ids.add(str(pet.user_id))
                    caretakers = db.query(PetCaretaker).filter(PetCaretaker.pet_id == reminder.pet_id).all()
                    recipient_ids.update(str(c.user_id) for c in caretakers)
                    family_members = (
                        db.query(FamilyMember)
                        .join(FamilyGroup, FamilyGroup.id == FamilyMember.group_id)
                        .filter(FamilyGroup.owner_id == str(pet.user_id))
                        .all()
                    )
                    recipient_ids.update(str(m.user_id) for m in family_members)

            recipient_subs = [
                (uid, sub_row)
                for uid in recipient_ids
                for sub_row in subs_by_user.get(uid, [])
            ]
            if not recipient_subs:
                logger.info(f"Reminder {reminder.id}: sem subscriptions para o pet/user — consumindo")
                if is_duplicate:
                    logger.info(f"Reminder {reminder.id}: duplicado suprimido — marcado como enviado")
                reminder.sent = True
                continue

            deep_url = _build_deep_link(reminder.type, reminder.pet_id)
            cfg = _TYPE_CONFIG.get(reminder.type, {})
            body = reminder.body or cfg.get("fallback_body", "Toque para ver detalhes no PETMOL.")

            # Se o lembrete tem URL customizada (ex: wa.me), usá-la como destino principal
            custom_url = reminder.url
            is_whatsapp = custom_url and custom_url.startswith("https://wa.me")
            main_url = custom_url if custom_url else deep_url

            if is_whatsapp:
                action_label = "📱 Agendar no WhatsApp"
                action_id = "whatsapp"
            else:
                action_label = cfg.get("action_label", "Abrir PETMOL")
                action_id = cfg.get("action_id", "open")

            payload = {
                "title": reminder.title,
                "body": body,
                "icon": cfg.get("icon", "/icons/icon-192x192.png"),
                "badge": cfg.get("badge", "/icons/badge-mono.png"),
                "tag": f"petmol-{reminder.type}-{reminder.pet_id or 'x'}",
                "renotify": True,
                "requireInteraction": True,
                "vibrate": [300, 150, 300, 150, 300],
                "actions": [
                    {"action": action_id, "title": action_label},
                    {"action": "dismiss", "title": "Dispensar"},
                ],
                "data": {
                    "url": main_url,
                    "action_urls": {
                        action_id: main_url,
                        "dismiss": "/home",
                    },
                    "pet_id": reminder.pet_id or "",
                    "type": reminder.type,
                },
            }
            ok_count = 0
            hard_fail = False
            for recipient_id, sub_row in recipient_subs:
                sub_dict = {"endpoint": sub_row.endpoint, "keys": {"p256dh": sub_row.p256dh, "auth": sub_row.auth}}
                ok, sub_invalid = _send_push(sub_dict, payload)
                logger.info(
                    f"Reminder {reminder.id} ({reminder.type}) user={recipient_id}: "
                    f"push={'ok' if ok else 'falhou'} retries={reminder.retry_count}"
                )
                if ok:
                    ok_count += 1
                elif sub_invalid:
                    invalid_sub_ids.add(sub_row.id)
                else:
                    hard_fail = True

            if ok_count > 0 or not hard_fail:
                reminder.sent = True
            else:
                reminder.retry_count = (reminder.retry_count or 0) + 1
                if reminder.retry_count >= _MAX_RETRY:
                    logger.warning(f"Reminder {reminder.id}: desistindo após {_MAX_RETRY} tentativas")
                    reminder.sent = True

        if invalid_sub_ids:
            now2 = datetime.now(timezone.utc)
            db.query(PushSubscription).filter(PushSubscription.id.in_(invalid_sub_ids)).update(
                {"disabled_at": now2}, synchronize_session=False,
            )
        db.commit()

    except Exception as e:
        logger.error(f"send_due_reminders error: {e}")
        db.rollback()
    finally:
        db.close()


# ── Schemas ──────────────────────────────────────────────────────────────────

class SubscribeRequest(BaseModel):
    subscription: dict
    lat: Optional[float] = None
    lng: Optional[float] = None


class UnsubscribeRequest(BaseModel):
    # Endpoint do dispositivo a desativar. None (corpo vazio, cliente antigo
    # em cache) desativa TODOS os dispositivos do usuário — mesmo
    # comportamento que o arquivo JSON tinha antes (só suportava um
    # dispositivo por usuário de qualquer forma).
    endpoint: Optional[str] = None


class RegisterNativeDeviceRequest(BaseModel):
    platform: str  # "ios" | "android"
    token: str


class UnregisterNativeDeviceRequest(BaseModel):
    token: Optional[str] = None


class ReminderIn(BaseModel):
    pet_id:    Optional[str] = None
    type:      str
    title:     str
    body:      Optional[str] = None
    url:       Optional[str] = None
    remind_at: str  # ISO 8601


class ReminderOut(BaseModel):
    id:         str
    pet_id:     Optional[str]
    type:       str
    title:      str
    body:       Optional[str]
    remind_at:  str
    sent:       bool
    created_at: str

    class Config:
        from_attributes = True


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/vapid-public-key")
def get_vapid_public_key():
    settings = get_settings()
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
def subscribe(body: SubscribeRequest, current_user=Depends(get_current_user)):
    sub_data = _normalize_subscription(body.subscription)
    endpoint = sub_data.get("endpoint")
    keys = sub_data.get("keys") or {}
    if not endpoint or not keys.get("p256dh") or not keys.get("auth"):
        raise HTTPException(status_code=400, detail="subscription incompleta (endpoint/keys)")

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        user_id = str(current_user.id)
        existing = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == user_id, PushSubscription.endpoint == endpoint)
            .first()
        )
        if existing:
            existing.p256dh = keys["p256dh"]
            existing.auth = keys["auth"]
            existing.lat = body.lat
            existing.lng = body.lng
            existing.last_seen_at = now
            existing.disabled_at = None
        else:
            db.add(PushSubscription(
                user_id=user_id, endpoint=endpoint,
                p256dh=keys["p256dh"], auth=keys["auth"],
                lat=body.lat, lng=body.lng,
                created_at=now, last_seen_at=now,
            ))
        db.commit()
        return {"status": "subscribed"}
    finally:
        db.close()


@router.delete("/subscribe")
def unsubscribe(body: Optional[UnsubscribeRequest] = None, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        q = db.query(PushSubscription).filter(PushSubscription.user_id == str(current_user.id))
        if body and body.endpoint:
            q = q.filter(PushSubscription.endpoint == body.endpoint)
        q.update({"disabled_at": now}, synchronize_session=False)
        db.commit()
        return {"status": "unsubscribed"}
    finally:
        db.close()


@router.post("/native-device")
def register_native_device(body: RegisterNativeDeviceRequest, current_user=Depends(get_current_user)):
    """Registra/atualiza o token de push nativo (FCM/APNs) do dispositivo
    atual. Não envia notificação nenhuma sozinho — só guarda o token para
    quando o envio nativo estiver disponível (ver NativePushToken). Nunca
    loga o valor do token, só metadados (plataforma, contagem)."""
    if body.platform not in ("ios", "android"):
        raise HTTPException(status_code=400, detail="platform deve ser 'ios' ou 'android'")
    if not body.token or not body.token.strip():
        raise HTTPException(status_code=400, detail="token vazio")

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        user_id = str(current_user.id)
        existing = (
            db.query(NativePushToken)
            .filter(NativePushToken.user_id == user_id, NativePushToken.token == body.token)
            .first()
        )
        if existing:
            existing.platform = body.platform
            existing.last_seen_at = now
            existing.disabled_at = None
        else:
            db.add(NativePushToken(
                user_id=user_id, platform=body.platform, token=body.token,
                created_at=now, last_seen_at=now,
            ))
        db.commit()
        return {"status": "registered"}
    finally:
        db.close()


@router.delete("/native-device")
def unregister_native_device(body: Optional[UnregisterNativeDeviceRequest] = None, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        q = db.query(NativePushToken).filter(NativePushToken.user_id == str(current_user.id))
        if body and body.token:
            q = q.filter(NativePushToken.token == body.token)
        q.update({"disabled_at": now}, synchronize_session=False)
        db.commit()
        return {"status": "unregistered"}
    finally:
        db.close()


@router.post("/test")
def test_push(current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        subs = (
            db.query(PushSubscription)
            .filter(PushSubscription.user_id == str(current_user.id), PushSubscription.disabled_at.is_(None))
            .all()
        )
        if not subs:
            raise HTTPException(status_code=404, detail="Sem subscription registrada para este usuário")
        any_ok = False
        for s in subs:
            ok, _ = _send_push(
                {"endpoint": s.endpoint, "keys": {"p256dh": s.p256dh, "auth": s.auth}},
                {"title": "🐾 Teste PETMOL", "body": "Push funcionando!", "tag": "test"},
            )
            any_ok = any_ok or ok
        if not any_ok:
            raise HTTPException(status_code=502, detail="Falha ao enviar push")
        return {"status": "sent"}
    finally:
        db.close()


@router.get("/reminders", response_model=List[ReminderOut])
def list_reminders(current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        rows = (
            db.query(Reminder)
            .filter(Reminder.user_id == str(current_user.id), Reminder.sent == False)
            .order_by(Reminder.remind_at)
            .all()
        )
        return [
            ReminderOut(
                id=r.id, pet_id=r.pet_id, type=r.type, title=r.title, body=r.body,
                remind_at=r.remind_at.isoformat(), sent=r.sent,
                created_at=r.created_at.isoformat(),
            )
            for r in rows
        ]
    finally:
        db.close()


@router.post("/reminders", response_model=ReminderOut)
def create_reminder(body: ReminderIn, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        if body.pet_id:
            get_accessible_pet_or_404(db, str(current_user.id), body.pet_id)
        remind_at = datetime.fromisoformat(body.remind_at.replace("Z", "+00:00"))
        r = Reminder(
            user_id=str(current_user.id),
            pet_id=body.pet_id,
            type=body.type,
            title=body.title,
            body=body.body,
            url=body.url,
            remind_at=remind_at,
        )
        db.add(r)
        db.commit()
        db.refresh(r)
        return ReminderOut(
            id=r.id, pet_id=r.pet_id, type=r.type, title=r.title, body=r.body,
            remind_at=r.remind_at.isoformat(), sent=r.sent,
            created_at=r.created_at.isoformat(),
        )
    finally:
        db.close()


@router.delete("/reminders/{reminder_id}")
def delete_reminder(reminder_id: str, current_user=Depends(get_current_user)):
    db = SessionLocal()
    try:
        r = db.query(Reminder).filter(
            Reminder.id == reminder_id,
            Reminder.user_id == str(current_user.id),
        ).first()
        if not r:
            raise HTTPException(status_code=404, detail="Lembrete não encontrado")
        db.delete(r)
        db.commit()
        return {"status": "deleted"}
    finally:
        db.close()

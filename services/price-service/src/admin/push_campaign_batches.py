"""Campanhas push — ETAPA 3: reserva segura de destinatários, lotes e idempotência.

REGRA DE OURO: o mesmo tutor nunca é selecionado duas vezes na mesma campanha. A garantia final é do BANCO
(`UNIQUE(campaign_id, user_id)`); o código só decide QUEM entra. Campanhas diferentes podem alcançar o mesmo tutor.

FLUXO DE UM LOTE
  1. PRÉVIA  (`preview_batch`): recalcula os filtros no servidor (`resolve_audience`, a MESMA função da contagem) e devolve quantos estão
     disponíveis, quantos já foram usados e quantos o lote reservaria (`will_reserve`). Devolve um TOKEN assinado (HMAC, 10 min) que amarra:
     campanha · conteúdo (hash) · filtros (hash) · quantidade pedida · público disponível (impressão digital dos ids) · quantidade do lote · admin.
  2. RESERVA (`reserve_batch`), tudo numa transação com a campanha TRAVADA (`SELECT … FOR UPDATE` no Postgres + trava em processo):
       a. chave de idempotência repetida ⇒ devolve o lote que já existe (não reserva nada) — vale antes e depois do token;
       b. token inválido/expirado/de outra campanha/outro conteúdo/outros filtros/outra quantidade/outro admin ⇒ 409, nada é reservado;
       c. recalcula o público; se mudou desde a prévia ⇒ 409 `audience_changed` (nova prévia). NUNCA reserva um lote menor sem que a
          prévia tenha mostrado essa quantidade e a pessoa a tenha confirmado (`confirm_count` precisa ser igual a `will_reserve`);
       d. sorteia no servidor (semente = chave de idempotência + campanha ⇒ reprodutível) e insere com `ON CONFLICT DO NOTHING RETURNING`:
          se o banco devolver menos linhas que o lote ⇒ desfaz TUDO (`reservation_conflict`), jamais encolhe em silêncio;
       e. fixa o conteúdo da campanha (`content_locked_at`) e confirma. SÓ DEPOIS disso qualquer envio é possível.
  3. EXECUÇÃO (`execute_batch`): para cada pedaço, marca os destinatários `reserved → sending` e CONFIRMA a transação ANTES de chamar o provedor
     (registro de intenção). Resultado: `accepted` (algum aparelho aceitou), `failed` (nenhum aceitou) ou `uncertain` (exceção/timeout/queda).
     "Aceito" NÃO é "entregue". Ninguém é substituído e nada é reenviado automaticamente (nem `failed`, nem `uncertain`).
  4. RECUPERAÇÃO (`recover_batch`, `recover_orphans_on_startup`): SÓ reclassifica — `sending → uncertain` e lote `interrupted`. Nunca chama o
     provedor. Quem nunca foi tentado continua `reserved`; a pessoa escolhe, com confirmação digitada: `resume` (envia só os nunca tentados)
     ou `release` (devolve os nunca tentados ao público). `uncertain` e `failed` nunca voltam a ser tentados.

EXECUÇÃO EM THREAD (como o envio avulso): não cria serviço novo. Se o processo cair, o estado está no banco; a recuperação é explícita e segura.
Alternativas (ver relatório): fila/worker dedicado (novo serviço) ou tarefa agendada (novo job); ficam para depois, se o volume pedir.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import random
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import and_, delete, exists, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.exc import IntegrityError

from ..config import get_settings
from ..db import SessionLocal
from ..notifications import push_to_user
from ..user_auth.models import User
from . import broadcast_router as br
from . import push_audience as pa
from .activation_campaign_router import opted_out_ids
from .deps import get_current_admin
from .push_campaigns import (
    RECIPIENT_STATES, AudienceFilter, PushCampaign, PushCampaignRecipient, compute_content_hash, push_campaigns_enabled,
    require_push_campaigns,
)

logger = logging.getLogger(__name__)

PREVIEW_TTL_SECONDS = 600
STALE_AFTER = timedelta(minutes=5)       # lote "sending" sem nenhuma atividade por tanto tempo é SUSPEITO de interrompido
EXEC_CHUNK = 1                            # 1 destinatário por vez: a parada é conferida entre CADA destinatário (nada fica "em envio" à toa)
EXEC_PAUSE_SECONDS = 0.02
DEFAULT_MAX_BATCH = 50
BATCH_ACTIVE_PHASES = ("reserved", "sending")       # EXECUÇÃO ativa (thread rodando ou prestes a rodar): usada por parada, recuperação e partida
# Quem BLOQUEIA nova reserva, prévia que autorize reserva e encerramento: execução ativa OU lote `interrupted` que ainda tem destinatários
# nunca tentados esperando decisão (continuar/devolver). `interrupted` sem pendentes (só aceitos/falhos/incertos) não tem o que decidir e não bloqueia.
KEY_RE = re.compile(r"^[A-Za-z0-9_-]{16,64}$")

# Endpoints e gancho de partida DESTE módulo (atrás da flag; só administradores). O núcleo do app só registra o router.
router = APIRouter(prefix="/v1/admin/push-campaigns", tags=["Admin Push Campaigns"], dependencies=[Depends(require_push_campaigns)])

# Provedor e agendamento são "ganchos" de módulo: os testes os trocam por provedores FALSOS (nenhum teste envia push real).
send_push: Callable = push_to_user


def max_batch_limit() -> int:
    """Teto de destinatários por lote (env PUSH_CAMPAIGNS_MAX_BATCH; padrão 50). Valor inválido ou < 1 cai no padrão conservador."""
    try:
        v = int(getattr(get_settings(), "push_campaigns_max_batch", DEFAULT_MAX_BATCH))
    except (TypeError, ValueError):
        return DEFAULT_MAX_BATCH
    return v if v >= 1 else DEFAULT_MAX_BATCH


def _limit_error_for_request(n: int, limit: int) -> BatchError:
    return BatchError("batch_limit_exceeded", f"O limite por lote é {limit} tutor(es) e você pediu {n}. Reduza a quantidade para até {limit}: o sistema não divide o pedido em vários lotes nem o reduz sozinho.",
                      status=422, limit=limit, requested=n)


def _limit_error_for_all(n: int, limit: int) -> BatchError:
    return BatchError("batch_limit_exceeded", f"Há {n} tutor(es) disponíveis, acima do limite de {limit} por lote (\"todos os disponíveis\" também respeita o limite). Escolha uma quantidade de até {limit}.",
                      status=422, limit=limit, requested=n)


def spawn(fn: Callable, *args) -> None:
    threading.Thread(target=fn, args=args, daemon=True).start()


class BatchError(Exception):
    def __init__(self, code: str, message: str, status: int = 409, **extra):
        super().__init__(message)
        self.code, self.message, self.status, self.extra = code, message, status, extra

    def detail(self) -> dict:
        return {"code": self.code, "message": self.message, **self.extra}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


# ── Trava em processo (soma-se ao SELECT … FOR UPDATE do Postgres; é o que serializa no SQLite dos testes) ──────────

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _campaign_lock(campaign_id: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(campaign_id, threading.Lock())


def _lock_campaign_row(db, campaign_id: str) -> Optional[PushCampaign]:
    return db.execute(select(PushCampaign).where(PushCampaign.id == campaign_id).with_for_update()).scalar_one_or_none()


# ── Token de prévia assinado ─────────────────────────────────────────────────

def _signing_key() -> bytes:
    secret = get_settings().jwt_secret or ""
    if not secret:
        raise BatchError("signing_key_missing", "Chave de assinatura não configurada.", status=503)
    return hashlib.sha256(("push-campaign-preview:" + secret).encode()).digest()


def audience_digest(user_ids) -> str:
    return hashlib.sha256("\n".join(sorted(user_ids)).encode()).hexdigest()


def sign_preview_token(claims: dict) -> str:
    body = base64.urlsafe_b64encode(json.dumps(claims, sort_keys=True, separators=(",", ":")).encode()).rstrip(b"=")
    return body.decode() + "." + hmac.new(_signing_key(), body, hashlib.sha256).hexdigest()


def verify_preview_token(token: str, now: datetime) -> dict:
    try:
        body, sig = token.rsplit(".", 1)
        expected = hmac.new(_signing_key(), body.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig, expected):
            raise ValueError("assinatura")
        claims = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
    except BatchError:
        raise
    except Exception:
        raise BatchError("invalid_token", "Prévia inválida. Faça uma nova prévia.")
    if not isinstance(claims, dict) or claims.get("exp", 0) < now.timestamp():
        raise BatchError("token_expired", "A prévia expirou. Faça uma nova prévia.")
    return claims


def _requested_spec(requested: Optional[int], all_available: bool):
    if all_available == (requested is not None):
        raise BatchError("invalid_request", "Informe a quantidade do lote OU 'todos os disponíveis' (não os dois).", status=422)
    return "all" if all_available else int(requested)


# ── Campanha ─────────────────────────────────────────────────────────────────

def _campaign_or_404(db, campaign_id: str) -> PushCampaign:
    c = db.get(PushCampaign, campaign_id)
    if c is None:
        raise BatchError("campaign_not_found", "Campanha não encontrada.", status=404)
    return c


def create_campaign(db, *, name: str, message: str, title: Optional[str], goal: Optional[str], destination: Optional[str],
                    product_url: Optional[str], product_title: Optional[str], created_by: Optional[str]) -> PushCampaign:
    """Valida o conteúdo com as MESMAS regras do envio avulso (`BroadcastIn`): link só de lojas conhecidas, nome do produto conferido, etc.
    O link do produto é guardado exatamente como foi colado (parâmetros de afiliado intactos)."""
    try:
        bi = br.BroadcastIn(message=message, title=title, goal=goal, destination=destination or None,
                            product_url=product_url, product_title=product_title)
    except ValidationError as exc:
        raise BatchError("invalid_content", "; ".join(e["msg"].replace("Value error, ", "") for e in exc.errors()), status=422)
    name = (name or "").strip()
    if not 3 <= len(name) <= 120:
        raise BatchError("invalid_content", "O nome da campanha precisa ter de 3 a 120 caracteres.", status=422)
    dest = bi.destination or (br._GOAL.get(bi.goal or "") or {}).get("open") or "home"
    c = PushCampaign(name=name, title=(bi.title or None), message=bi.message.strip(), goal=bi.goal, destination=dest,
                     product_url=bi.product_url, product_title=bi.product_title, created_by=created_by, status="draft",
                     content_hash=compute_content_hash(bi.title, bi.message, dest, bi.goal, bi.product_url, bi.product_title))
    db.add(c)
    db.commit()
    return c


def _state_counts(db, **where) -> dict[str, int]:
    q = db.query(PushCampaignRecipient.state, func.count()).group_by(PushCampaignRecipient.state)
    for col, val in where.items():
        q = q.filter(getattr(PushCampaignRecipient, col) == val)
    counts = {s: 0 for s in RECIPIENT_STATES}
    counts.update({s: n for s, n in q.all()})
    return counts


def _last_activity(db, batch) -> datetime:
    row = db.query(func.max(PushCampaignRecipient.attempted_at), func.max(PushCampaignRecipient.finished_at)).filter(
        PushCampaignRecipient.batch_id == batch.id).one()
    stamps = [_aware(x) for x in row if x is not None] + [_aware(batch.created_at) or _utcnow()]
    return max(stamps)


def _stored_filters(batch) -> Optional[dict]:
    """Os filtros EXATOS usados na reserva (retrato já guardado no lote). Só leitura: nunca é reescrito."""
    try:
        return json.loads(batch.filters_json) if batch.filters_json else None
    except ValueError:
        return None


def _stop_pending_vals(requested, ack) -> bool:
    return requested is not None and (ack is None or ack < requested)


def _stop_info(batch) -> dict:
    """Estados da parada: none · requested (pedida, o envio em andamento ainda termina) · acknowledged (reconhecida: lote interrompido,
    nada novo é reivindicado) · finished_before_stop (o lote acabou antes de a parada valer)."""
    req, ack = batch.stop_requested_at, batch.stop_ack_at
    if req is None:
        state = "none"
    elif _stop_pending_vals(req, ack):
        state = "requested" if batch.phase in BATCH_ACTIVE_PHASES else "acknowledged"
    elif batch.phase == "interrupted":
        state = "acknowledged"
    elif batch.phase == "done":
        state = "finished_before_stop"
    else:
        state = "none"                                    # parada antiga já resolvida e o lote foi retomado
    return {"state": state, "requested_at": _aware(req).isoformat() if req else None, "acknowledged_at": _aware(ack).isoformat() if ack else None}


def serialize_batch(db, batch, *, now: Optional[datetime] = None) -> dict:
    now = now or _utcnow()
    counts = _state_counts(db, batch_id=batch.id)
    suspect = batch.phase in BATCH_ACTIVE_PHASES and (now - _last_activity(db, batch)) > STALE_AFTER
    return {
        "id": batch.id, "campaign_id": batch.campaign_id, "batch_no": batch.batch_no, "phase": batch.phase,
        "created_at": _aware(batch.created_at).isoformat() if batch.created_at else None,
        "requested": batch.requested_n if batch.audience_kind == "count" else "all", "reserved": batch.reserved_n,
        "filters_hash": batch.filters_hash, "filters": _stored_filters(batch), "stop": _stop_info(batch), "counts": counts, "interrupted_suspected": bool(suspect),
        "accepted_note": "'Aceito' = o provedor (APNs/FCM/Web Push) aceitou o envio. Não é confirmação de entrega ao celular.",
        "metrics": br.broadcast_metrics(db, batch),
    }


def serialize_campaign(db, c: PushCampaign) -> dict:
    batches = db.query(br.AdminBroadcast).filter(br.AdminBroadcast.campaign_id == c.id).order_by(br.AdminBroadcast.batch_no.asc()).all()
    return {
        "id": c.id, "name": c.name, "status": c.status, "created_at": _aware(c.created_at).isoformat() if c.created_at else None,
        "content_locked": c.content_locked_at is not None, "content_hash": c.content_hash, "max_batch": max_batch_limit(),
        "content": {"title": c.title, "message": c.message, "goal": c.goal, "destination": c.destination,
                    "product_url": c.product_url, "product_title": c.product_title},
        "used_total": sum(_state_counts(db, campaign_id=c.id).values()), "counts": _state_counts(db, campaign_id=c.id),
        "batches": [serialize_batch(db, b) for b in batches],
    }


# ── Prévia ───────────────────────────────────────────────────────────────────

def preview_batch(db, campaign_id: str, flt: AudienceFilter, *, requested: Optional[int], all_available: bool, admin_id: str,
                  now: Optional[datetime] = None) -> dict:
    now = now or _utcnow()
    spec = _requested_spec(requested, all_available)
    limit = max_batch_limit()
    if spec != "all" and int(spec) > limit:
        raise _limit_error_for_request(int(spec), limit)
    c = _campaign_or_404(db, campaign_id)
    if c.status == "closed":
        raise BatchError("campaign_closed", "A campanha está encerrada.")
    counts = pa.compute_audience(db, flt, campaign_id=campaign_id, batch_size=requested, all_available=all_available, now=now)
    res = pa.resolve_audience(db, flt, now=now)
    used = {str(u) for (u,) in db.query(PushCampaignRecipient.user_id).filter(PushCampaignRecipient.campaign_id == campaign_id).all()}
    available = sorted(res.reachable - used)
    will = len(available) if all_available else min(requested or 0, len(available))
    if will > limit:                                                    # "todos os disponíveis" acima do teto: recusa (nunca reduz em silêncio)
        raise _limit_error_for_all(will, limit)
    running = _blocking_batch(db, campaign_id)
    out = {
        "campaign_id": campaign_id, "counts": counts, "available": len(available), "will_reserve": will,
        "smaller_than_requested": bool(not all_available and requested and will < requested),
        "can_reserve": will > 0 and running is None, "blocking_batch": ({"id": running[0], "batch_no": running[1], "phase": running[2]} if running else None),
        "content": {"title": c.title, "message": c.message, "destination": c.destination, "product_url": c.product_url,
                    "product_title": c.product_title},
        "max_batch": limit, "next_batch_no": (db.query(func.max(br.AdminBroadcast.batch_no)).filter(br.AdminBroadcast.campaign_id == campaign_id).scalar() or 0) + 1,
        "confirmation": f"Para confirmar, digite {will}." if will else None, "token": None, "expires_at": None,
    }
    if out["can_reserve"]:                                    # com lote bloqueante NENHUMA prévia que autorize reserva é emitida
        exp = now + timedelta(seconds=PREVIEW_TTL_SECONDS)
        out["token"] = sign_preview_token({"c": campaign_id, "h": c.content_hash, "f": flt.filters_hash(), "r": spec, "a": len(available),
                                           "d": audience_digest(available), "w": will, "u": str(admin_id), "exp": int(exp.timestamp())})
        out["expires_at"] = exp.isoformat()
    return out


# ── Reserva ──────────────────────────────────────────────────────────────────

def _existing_by_key(db, key: str):
    return db.query(br.AdminBroadcast).filter(br.AdminBroadcast.idempotency_key == key).first()


def _same_request(batch, campaign_id: str, flt: AudienceFilter, spec) -> bool:
    if batch.campaign_id != campaign_id or batch.filters_hash != flt.filters_hash():
        return False
    return batch.audience_kind == "all" if spec == "all" else (batch.audience_kind == "count" and batch.requested_n == spec)


def _replay_or_conflict(db, key, campaign_id, flt, spec) -> Optional[dict]:
    existing = _existing_by_key(db, key)
    if existing is None:
        return None
    if not _same_request(existing, campaign_id, flt, spec):
        raise BatchError("idempotency_key_reused", "Esta chave de idempotência já foi usada em outra operação.")
    return {"batch": serialize_batch(db, existing), "idempotent_replay": True, "started": False}


def _insert_recipients(db, campaign_id: str, batch_id: str, user_ids: list[str], now: datetime) -> set[str]:
    ins = pg_insert if db.get_bind().dialect.name == "postgresql" else sqlite_insert
    got: set[str] = set()
    user_ids = sorted(user_ids)          # ordem de inserção SEMPRE igual: duas transações nunca travam o índice em ordens opostas (deadlock)
    for i in range(0, len(user_ids), 500):
        rows = [dict(id=str(uuid.uuid4()), campaign_id=campaign_id, user_id=u, batch_id=batch_id, state="reserved", reserved_at=now,
                     accepted_devices=0) for u in user_ids[i:i + 500]]
        stmt = ins(PushCampaignRecipient).values(rows).on_conflict_do_nothing(index_elements=["campaign_id", "user_id"]) \
            .returning(PushCampaignRecipient.user_id)
        got |= {str(r[0]) for r in db.execute(stmt)}
    return got


def reserve_batch(session_factory, campaign_id: str, flt: AudienceFilter, *, requested: Optional[int], all_available: bool,
                  idempotency_key: str, admin_id: str, token: str, confirm_count: int, now: Optional[datetime] = None) -> dict:
    """Reserva os destinatários do lote (NÃO envia). Devolve {"batch": …, "idempotent_replay": bool, "started": False}.
    Quem chama dispara a execução DEPOIS (`start_batch`) — a reserva já está confirmada no banco."""
    now = now or _utcnow()
    spec = _requested_spec(requested, all_available)
    limit = max_batch_limit()
    if not KEY_RE.match(idempotency_key or ""):
        raise BatchError("invalid_request", "Chave de idempotência inválida (16 a 64 letras, números, '-' ou '_').", status=422)
    with session_factory() as db:
        replay = _replay_or_conflict(db, idempotency_key, campaign_id, flt, spec)      # 1) clique repetido: devolve o que já existe
        if replay:
            return replay
        if spec != "all" and int(spec) > limit:                                          # teto por lote (a repetição idempotente acima não é afetada)
            raise _limit_error_for_request(int(spec), limit)
        claims = verify_preview_token(token or "", now)                                  # 2) prévia assinada e atual
        if (claims.get("c"), claims.get("f"), claims.get("r"), claims.get("u")) != (campaign_id, flt.filters_hash(), spec, str(admin_id)):
            raise BatchError("preview_stale", "A prévia não corresponde a esta campanha, filtros, quantidade ou administrador. Faça uma nova prévia.")
        with _campaign_lock(campaign_id):                                                # 3) campanha travada
            try:
                c = _lock_campaign_row(db, campaign_id)
                if c is None:
                    raise BatchError("campaign_not_found", "Campanha não encontrada.", status=404)
                if c.status == "closed":
                    raise BatchError("campaign_closed", "A campanha está encerrada.")
                if claims.get("h") != c.content_hash:
                    raise BatchError("preview_stale", "O conteúdo da campanha mudou desde a prévia. Faça uma nova prévia.")
                replay = _replay_or_conflict(db, idempotency_key, campaign_id, flt, spec)   # outra requisição pode ter vencido a corrida
                if replay:
                    db.rollback()
                    return replay
                blk = _blocking_batch(db, campaign_id)
                if blk:
                    raise _blocking_error(blk, "reservar outro lote")
                used = {str(u) for (u,) in db.query(PushCampaignRecipient.user_id).filter(PushCampaignRecipient.campaign_id == campaign_id).all()}
                available = sorted(pa.resolve_audience(db, flt, now=now).reachable - used)           # MESMA semântica da contagem
                if audience_digest(available) != claims.get("d") or len(available) != claims.get("a"):
                    raise BatchError("audience_changed", "O público disponível mudou desde a prévia. Faça uma nova prévia.",
                                     available_now=len(available))
                will = len(available) if spec == "all" else min(int(spec), len(available))
                if will != claims.get("w"):
                    raise BatchError("audience_changed", "A quantidade do lote mudou desde a prévia. Faça uma nova prévia.", available_now=len(available))
                if will > limit:                                                         # confere de novo na RESERVA (a API direta não contorna o teto)
                    raise (_limit_error_for_all(will, limit) if spec == "all" else _limit_error_for_request(will, limit))
                if will == 0:
                    raise BatchError("no_one_available", "Ninguém está disponível para este lote.", status=422)
                if confirm_count != will:
                    raise BatchError("bad_confirmation", f"Confirmação incorreta: o lote reservará {will} tutores.", will_reserve=will)
                seed = int(hashlib.sha256(f"{idempotency_key}:{campaign_id}".encode()).hexdigest(), 16)
                picked = available if will == len(available) else random.Random(seed).sample(available, will)
                batch_no = (db.query(func.max(br.AdminBroadcast.batch_no)).filter(br.AdminBroadcast.campaign_id == campaign_id).scalar() or 0) + 1
                batch = br.AdminBroadcast(
                    id=str(uuid.uuid4()), created_by=str(admin_id), message=c.message, segment="todos",
                    audience_kind="all" if spec == "all" else "count", audience_requested=None if spec == "all" else int(spec), goal=c.goal,
                    recipients_total=will, delivered_total=0, phase="reserved", link_url=c.product_url, link_title=c.product_title,
                    campaign_id=campaign_id, batch_no=batch_no, idempotency_key=idempotency_key, filters_json=flt.canonical_json(),
                    filters_hash=flt.filters_hash(), requested_n=None if spec == "all" else int(spec), reserved_n=will)
                db.add(batch)
                db.flush()
                inserted = _insert_recipients(db, campaign_id, batch.id, picked, now)
                if inserted != set(picked):                                                 # o banco recusou alguém: NUNCA encolhe em silêncio
                    raise BatchError("reservation_conflict", "Conflito ao reservar destinatários. Nada foi reservado; faça uma nova prévia.")
                if c.content_locked_at is None:
                    c.content_locked_at = now                                               # conteúdo comercial fixo a partir daqui
                c.status = "active"
                db.commit()                                                                  # 4) a reserva está DURÁVEL antes de qualquer envio
                return {"batch": serialize_batch(db, batch), "idempotent_replay": False, "started": False}
            except IntegrityError:
                db.rollback()
                replay = _replay_or_conflict(db, idempotency_key, campaign_id, flt, spec)
                if replay:
                    return replay
                raise BatchError("reservation_conflict", "Conflito ao reservar o lote. Nada foi reservado; faça uma nova prévia.")
            except BaseException:
                db.rollback()
                raise


# ── Execução (registro de intenção antes do provedor) ────────────────────────

def _claim_chunk(db, batch_id: str, n: int) -> list[tuple[str, str]]:
    """reserved → sending, de forma atômica e CONFIRMADA antes de qualquer chamada ao provedor. Devolve (id, user_id) só de quem
    ESTE executor realmente reivindicou (dois executores nunca recebem o mesmo destinatário)."""
    # Duas etapas de propósito: `UPDATE … WHERE id IN (SELECT … LIMIT n FOR UPDATE SKIP LOCKED)` pode atualizar MAIS de n linhas no Postgres
    # (o planejador reexecuta a subconsulta). Aqui os ids são travados e lidos primeiro; o UPDATE só mexe nesses ids E só se ainda
    # estiverem 'reserved' — quem foi reivindicado por outro executor nunca volta no RETURNING.
    q = select(PushCampaignRecipient.id).where(PushCampaignRecipient.batch_id == batch_id, PushCampaignRecipient.state == "reserved") \
        .order_by(PushCampaignRecipient.id).limit(n)
    if db.get_bind().dialect.name == "postgresql":
        q = q.with_for_update(skip_locked=True)
    ids = [r[0] for r in db.execute(q)]
    if not ids:
        db.commit()
        return []
    stmt = update(PushCampaignRecipient).where(PushCampaignRecipient.id.in_(ids), PushCampaignRecipient.state == "reserved") \
        .values(state="sending", attempted_at=_utcnow()).returning(PushCampaignRecipient.id, PushCampaignRecipient.user_id)
    rows = [(str(r[0]), str(r[1])) for r in db.execute(stmt)]
    db.commit()
    return rows


def _finish(db, rec_id: str, state: str, devices: int = 0, error: Optional[str] = None) -> bool:
    """Fecha a tentativa. Também corrige um 'uncertain' causado só por uma recuperação precoce (o resultado real chegou depois)."""
    r = db.execute(update(PushCampaignRecipient).where(PushCampaignRecipient.id == rec_id, PushCampaignRecipient.state.in_(("sending", "uncertain")))
                   .values(state=state, finished_at=_utcnow(), accepted_devices=devices, error_code=error))
    db.commit()
    return bool(r.rowcount)


def _finalize_if_done(db, batch_id: str) -> None:
    counts = _state_counts(db, batch_id=batch_id)
    if counts["reserved"] == 0 and counts["sending"] == 0:
        db.execute(update(br.AdminBroadcast).where(br.AdminBroadcast.id == batch_id).values(
            phase="done", delivered_total=counts["accepted"], recipients_total=sum(counts.values()), finished_at=_utcnow()))
        db.execute(update(br.AdminBroadcast).where(br.AdminBroadcast.id == batch_id, br.AdminBroadcast.stop_requested_at.is_not(None),
                                                   or_(br.AdminBroadcast.stop_ack_at.is_(None), br.AdminBroadcast.stop_ack_at < br.AdminBroadcast.stop_requested_at))
                   .values(stop_ack_at=_utcnow()))                    # o lote acabou antes da parada valer: não fica "pendente" para sempre
        db.commit()


def _blocking_batch(db, campaign_id: str):
    """Primeiro lote da campanha que impede novas reservas/encerramento (ver BLOCKING acima); None se nada bloqueia."""
    awaiting = exists().where(PushCampaignRecipient.batch_id == br.AdminBroadcast.id, PushCampaignRecipient.state == "reserved")
    return db.query(br.AdminBroadcast.id, br.AdminBroadcast.batch_no, br.AdminBroadcast.phase).filter(
        br.AdminBroadcast.campaign_id == campaign_id,
        or_(br.AdminBroadcast.phase.in_(BATCH_ACTIVE_PHASES), and_(br.AdminBroadcast.phase == "interrupted", awaiting))).order_by(br.AdminBroadcast.batch_no).first()


def _blocking_error(blk, what: str) -> BatchError:
    """`what`: 'reservar outro lote' / 'encerrar a campanha'."""
    if blk[2] == "interrupted":
        return BatchError("batch_awaiting_decision", f"O lote {blk[1]} está interrompido e aguarda sua decisão (continuar só os nunca tentados ou devolvê-los ao público) "
                                                     f"antes de {what}.", batch_id=blk[0], batch_no=blk[1])
    return BatchError("batch_in_progress", f"O lote {blk[1]} desta campanha está em andamento. Conclua ou pare o envio antes de {what}.", batch_id=blk[0], batch_no=blk[1])


def _stop_pending(db, batch_id: str) -> bool:
    """Lê do banco (sempre fresco) se há pedido de parada pendente para o lote."""
    row = db.execute(select(br.AdminBroadcast.stop_requested_at, br.AdminBroadcast.stop_ack_at).where(br.AdminBroadcast.id == batch_id)).first()
    db.rollback()                                                 # encerra a leitura: a próxima consulta enxerga o que outros confirmaram
    return bool(row) and _stop_pending_vals(row[0], row[1])


def _unclaim(db, rec_ids: list[str]) -> None:
    """Devolve a `reserved` quem foi reivindicado mas COMPROVADAMENTE não tentado (o provedor só é chamado depois da conferência da parada,
    na mesma thread). Nunca mexe em quem já foi para o provedor."""
    if rec_ids:
        db.execute(update(PushCampaignRecipient).where(PushCampaignRecipient.id.in_(rec_ids), PushCampaignRecipient.state == "sending")
                   .values(state="reserved", attempted_at=None))
        db.commit()


def _acknowledge_stop(db, batch_id: str) -> None:
    """Reconhece a parada: nada novo será reivindicado. Lote vira `interrupted` (as regras de recuperação existentes decidem o resto)
    ou `done` se não sobrou ninguém."""
    counts = _state_counts(db, batch_id=batch_id)
    if counts["reserved"] == 0 and counts["sending"] == 0:
        _finalize_if_done(db, batch_id)
        return
    db.execute(update(br.AdminBroadcast).where(br.AdminBroadcast.id == batch_id, br.AdminBroadcast.phase == "sending")
               .values(phase="interrupted", stop_ack_at=_utcnow()))
    db.commit()
    logger.warning("push-campaign batch %s: parada reconhecida (reservados=%s, aceitos=%s, incertos=%s)", batch_id, counts["reserved"], counts["accepted"], counts["uncertain"])


def execute_batch(session_factory, batch_id: str, *, chunk: int = EXEC_CHUNK, pause: Optional[float] = None) -> None:
    """Envia SÓ os destinatários `reserved` do lote. `Exception` do provedor ⇒ `uncertain`. Uma queda do processo (BaseException/kill) deixa
    `sending` no banco, que a recuperação reclassifica como `uncertain` — nunca reenvia.
    PARADA: antes de reivindicar e antes de CADA chamada ao provedor, consulta o pedido persistido no banco. Se pendente, devolve a `reserved`
    quem foi reivindicado e ainda não tentado, reconhece a parada e termina. Uma chamada já em andamento NÃO é cancelada: o resultado dela
    (aceito/falha/incerto) é registrado normalmente antes de a parada valer."""
    pause = EXEC_PAUSE_SECONDS if pause is None else pause
    with session_factory() as db:
        batch = db.get(br.AdminBroadcast, batch_id)
        if batch is None or batch.campaign_id is None:
            return
        campaign = db.get(PushCampaign, batch.campaign_id)
        c_message, c_title, c_destination, c_url = campaign.message, campaign.title, campaign.destination, campaign.product_url   # fixos: lidos uma vez
        db.execute(update(br.AdminBroadcast).where(br.AdminBroadcast.id == batch_id, br.AdminBroadcast.phase.in_(("reserved", "interrupted")))
                   .values(phase="sending"))
        db.commit()
        try:
            while True:
                if _stop_pending(db, batch_id):
                    _acknowledge_stop(db, batch_id)
                    return
                claimed = _claim_chunk(db, batch_id, chunk)
                if not claimed:
                    break
                uids = {u for _, u in claimed}
                names = {str(i): n for i, n in db.query(User.id, User.name).filter(User.id.in_(uids)).all()}
                pets = br._pets_by_user(db, uids)
                blocked = {str(u) for u in opted_out_ids(db)}
                for idx, (rec_id, uid) in enumerate(claimed):
                    if _stop_pending(db, batch_id):                                         # entre os destinatários: ninguém novo vai ao provedor
                        _unclaim(db, [r for r, _ in claimed[idx:]])
                        _acknowledge_stop(db, batch_id)
                        return
                    if uid in blocked:                                                       # pediu para parar DEPOIS da reserva: não envia
                        _finish(db, rec_id, "failed", 0, "opted_out_after_reservation")
                        continue
                    title, body = br.personalize(c_message, names.get(uid), [n for _, n in pets.get(uid, []) if n], c_title)
                    payload = br._push_payload(batch_id, title, body, c_destination, c_url)
                    try:
                        devices = int(send_push(uid, payload) or 0)
                    except Exception as exc:                                                 # timeout/rede/qualquer exceção: pode ter sido enviado
                        _finish(db, rec_id, "uncertain", 0, type(exc).__name__[:40])
                        continue
                    ok = devices > 0
                    if _finish(db, rec_id, "accepted" if ok else "failed", devices, None if ok else "no_device_accepted"):
                        db.add(br.AdminBroadcastRecipient(broadcast_id=batch_id, user_id=uid, delivered=ok, title=title, body=body))
                        db.commit()
                if pause:
                    time.sleep(pause)
            _finalize_if_done(db, batch_id)
        except Exception as exc:                                                             # falha do próprio executor (não do provedor)
            logger.error("push-campaign batch %s: executor falhou: %s", batch_id, exc)
            db.rollback()
            db.execute(update(br.AdminBroadcast).where(br.AdminBroadcast.id == batch_id, br.AdminBroadcast.phase == "sending").values(phase="interrupted"))
            db.commit()


def start_batch(session_factory, batch_id: str) -> None:
    spawn(execute_batch, session_factory, batch_id)


# ── Recuperação (NUNCA envia) ────────────────────────────────────────────────

def recover_batch(session_factory, batch_id: str, *, only_if_stale: bool = False, now: Optional[datetime] = None) -> dict:
    """Reclassifica: `sending → uncertain` ('interrupted') e marca o lote 'interrupted'. Não chama o provedor, não escolhe ninguém."""
    now = now or _utcnow()
    with session_factory() as db:
        batch = db.get(br.AdminBroadcast, batch_id)
        if batch is None or batch.campaign_id is None:
            raise BatchError("batch_not_found", "Lote não encontrado.", status=404)
        with _campaign_lock(batch.campaign_id):
            _lock_campaign_row(db, batch.campaign_id)
            db.refresh(batch)
            if batch.phase not in BATCH_ACTIVE_PHASES:
                db.rollback()
                return {"batch": serialize_batch(db, batch), "reclassified": 0}
            if only_if_stale and (now - _last_activity(db, batch)) <= STALE_AFTER:
                db.rollback()
                return {"batch": serialize_batch(db, batch), "reclassified": 0}
            n = db.execute(update(PushCampaignRecipient).where(PushCampaignRecipient.batch_id == batch_id, PushCampaignRecipient.state == "sending")
                           .values(state="uncertain", error_code="interrupted", finished_at=now)).rowcount
            left = db.query(func.count()).filter(PushCampaignRecipient.batch_id == batch_id, PushCampaignRecipient.state == "reserved").scalar()
            batch.phase = "interrupted" if left else "done"
            if _stop_pending_vals(batch.stop_requested_at, batch.stop_ack_at):
                batch.stop_ack_at = now                       # a API reiniciou com parada pendente: reconhecida aqui (não pára a retomada depois)
            if not left:
                counts = _state_counts(db, batch_id=batch_id)
                batch.delivered_total, batch.finished_at = counts["accepted"], now
            db.commit()
            return {"batch": serialize_batch(db, batch), "reclassified": int(n)}


def recover_orphans_on_startup(session_factory=None) -> int:
    """Ao iniciar o serviço, nenhuma thread de lote sobrevive: lotes 'reserved'/'sending' são reclassificados (sem enviar nada).
    Só roda com a flag ligada."""
    if not push_campaigns_enabled():
        return 0
    session_factory = session_factory or SessionLocal
    with session_factory() as db:
        ids = [str(i) for (i,) in db.query(br.AdminBroadcast.id).filter(br.AdminBroadcast.campaign_id.is_not(None),
                                                                      br.AdminBroadcast.phase.in_(BATCH_ACTIVE_PHASES)).all()]
    for i in ids:
        recover_batch(session_factory, i)
    return len(ids)


@router.on_event("startup")
def _recover_on_startup() -> None:
    """Gancho DESTE módulo (nada no núcleo do app): ao iniciar o serviço, reclassifica lotes órfãos. Só atua com a flag ligada;
    qualquer erro aqui é registrado e NUNCA impede o serviço de subir."""
    try:
        n = recover_orphans_on_startup()
        if n:
            logger.warning("campanhas push: %s lote(s) interrompido(s) reclassificado(s) na partida (nada foi reenviado)", n)
    except Exception as exc:
        logger.error("campanhas push: recuperação na partida falhou (não crítico): %s", exc)


def _interrupted_batch(db, batch_id: str):
    batch = db.get(br.AdminBroadcast, batch_id)
    if batch is None or batch.campaign_id is None:
        raise BatchError("batch_not_found", "Lote não encontrado.", status=404)
    return batch


def request_stop(session_factory, batch_id: str, admin_id: str, now: Optional[datetime] = None) -> dict:
    """Registra (no banco) o pedido de PARADA de um lote em andamento. Idempotente: vários cliques/administradores ao mesmo tempo geram UM pedido
    e todos recebem sucesso. Não cancela a chamada ao provedor em curso; quem já foi aceito continua registrado; nada é reenviado."""
    now = now or _utcnow()
    with session_factory() as db:
        batch = db.get(br.AdminBroadcast, batch_id)
        if batch is None or batch.campaign_id is None:
            raise BatchError("batch_not_found", "Lote não encontrado.", status=404)
        with _campaign_lock(batch.campaign_id):
            _lock_campaign_row(db, batch.campaign_id)
            db.refresh(batch)
            if batch.phase in BATCH_ACTIVE_PHASES:
                if _stop_pending_vals(batch.stop_requested_at, batch.stop_ack_at):
                    db.rollback()
                    return {"batch": serialize_batch(db, batch), "already_requested": True}
                batch.stop_requested_at, batch.stop_requested_by = now, str(admin_id)
                db.commit()
                logger.warning("push-campaign batch %s: parada solicitada pelo administrador %s", batch_id, admin_id)
                return {"batch": serialize_batch(db, batch), "already_requested": False}
            if batch.phase == "interrupted" and batch.stop_requested_at is not None and not _stop_pending_vals(batch.stop_requested_at, batch.stop_ack_at):
                db.rollback()
                return {"batch": serialize_batch(db, batch), "already_requested": True, "already_stopped": True}
            db.rollback()
            raise BatchError("batch_not_running", "Este lote não está em envio (já terminou ou já estava interrompido).", status=409)


def resume_batch(session_factory, batch_id: str, confirm_count: int) -> dict:
    """Envia SOMENTE quem nunca foi tentado (`reserved`) de um lote 'interrupted', com confirmação do número. `uncertain`/`failed` não entram."""
    with session_factory() as db:
        batch = _interrupted_batch(db, batch_id)
        with _campaign_lock(batch.campaign_id):
            _lock_campaign_row(db, batch.campaign_id)
            db.refresh(batch)
            if batch.phase != "interrupted":
                raise BatchError("batch_not_interrupted", "Só um lote interrompido pode ser retomado.")
            left = db.query(func.count()).filter(PushCampaignRecipient.batch_id == batch_id, PushCampaignRecipient.state == "reserved").scalar()
            if left == 0 or confirm_count != left:
                raise BatchError("bad_confirmation", f"Restam {left} tutores nunca tentados. Confirme esse número.", remaining=left)
            limit = max_batch_limit()
            if left > limit:                                                                  # continuação também respeita o teto
                raise BatchError("batch_limit_exceeded", f"Restam {left} tutores nunca tentados, acima do limite de {limit} por lote. Devolva-os ao público "
                                                         f"ou aumente o limite no servidor antes de continuar.", status=422, limit=limit, remaining=left)
            batch.phase = "sending"
            db.commit()
            return {"batch": serialize_batch(db, batch), "remaining": int(left)}


def release_batch(session_factory, batch_id: str, confirm_count: int) -> dict:
    """Devolve ao público quem nunca foi tentado (`reserved`) de um lote 'interrupted'. Quem foi tentado (accepted/failed/uncertain) FICA
    registrado para sempre: não volta a ser selecionado."""
    with session_factory() as db:
        batch = _interrupted_batch(db, batch_id)
        with _campaign_lock(batch.campaign_id):
            _lock_campaign_row(db, batch.campaign_id)
            db.refresh(batch)
            if batch.phase != "interrupted":
                raise BatchError("batch_not_interrupted", "Só um lote interrompido pode ter reservas devolvidas.")
            left = db.query(func.count()).filter(PushCampaignRecipient.batch_id == batch_id, PushCampaignRecipient.state == "reserved").scalar()
            if left == 0 or confirm_count != left:
                raise BatchError("bad_confirmation", f"Restam {left} tutores nunca tentados. Confirme esse número.", remaining=left)
            db.execute(delete(PushCampaignRecipient).where(PushCampaignRecipient.batch_id == batch_id, PushCampaignRecipient.state == "reserved"))
            batch.reserved_n = (batch.reserved_n or 0) - int(left)
            batch.phase = "done"
            counts = _state_counts(db, batch_id=batch_id)
            batch.recipients_total, batch.delivered_total, batch.finished_at = sum(counts.values()), counts["accepted"], _utcnow()
            db.commit()
            return {"batch": serialize_batch(db, batch), "released": int(left)}


def close_campaign(session_factory, campaign_id: str) -> dict:
    with session_factory() as db:
        with _campaign_lock(campaign_id):
            c = _lock_campaign_row(db, campaign_id)
            if c is None:
                raise BatchError("campaign_not_found", "Campanha não encontrada.", status=404)
            blk = _blocking_batch(db, campaign_id)
            if blk:
                raise _blocking_error(blk, "encerrar a campanha")
            c.status, c.closed_at = "closed", _utcnow()
            db.commit()
            return serialize_campaign(db, c)


# ── Endpoints (atrás da flag; só administradores) ────────────────────────────



class CampaignIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    message: str = Field(min_length=1, max_length=240)
    title: Optional[str] = Field(default=None, max_length=80)
    goal: Optional[str] = Field(default=None, max_length=20)
    destination: Optional[str] = Field(default=None, max_length=12)
    product_url: Optional[str] = Field(default=None, max_length=700)
    product_title: Optional[str] = Field(default=None, max_length=160)


class PreviewIn(BaseModel):
    filter: AudienceFilter = Field(default_factory=AudienceFilter)
    batch_size: Optional[int] = Field(default=None, ge=1, le=1_000_000)
    all_available: bool = False


class ReserveIn(PreviewIn):
    preview_token: str = Field(min_length=10, max_length=4000)
    confirm_count: int = Field(ge=0, le=1_000_000)
    idempotency_key: str = Field(min_length=1, max_length=80)


class ConfirmIn(BaseModel):
    confirm_count: int = Field(ge=0, le=1_000_000)


def _http(exc: BatchError) -> HTTPException:
    return HTTPException(status_code=exc.status, detail=exc.detail())


@router.post("/campaigns")
def api_create_campaign(payload: CampaignIn, current=Depends(get_current_admin)):
    try:
        with SessionLocal() as db:
            return serialize_campaign(db, create_campaign(db, created_by=str(current[0].id), **payload.model_dump()))
    except BatchError as exc:
        raise _http(exc)


@router.get("/campaigns")
def api_list_campaigns(current=Depends(get_current_admin)):
    with SessionLocal() as db:
        rows = db.query(PushCampaign).order_by(PushCampaign.created_at.desc()).limit(100).all()
        return {"campaigns": [{"id": c.id, "name": c.name, "status": c.status, "content_locked": c.content_locked_at is not None,
                               "created_at": _aware(c.created_at).isoformat() if c.created_at else None,
                               "counts": _state_counts(db, campaign_id=c.id)} for c in rows]}


@router.get("/campaigns/{campaign_id}")
def api_get_campaign(campaign_id: str, current=Depends(get_current_admin)):
    with SessionLocal() as db:
        try:
            return serialize_campaign(db, _campaign_or_404(db, campaign_id))
        except BatchError as exc:
            raise _http(exc)


@router.post("/campaigns/{campaign_id}/close")
def api_close_campaign(campaign_id: str, current=Depends(get_current_admin)):
    try:
        return close_campaign(SessionLocal, campaign_id)
    except BatchError as exc:
        raise _http(exc)


@router.post("/campaigns/{campaign_id}/batches/preview")
def api_preview(campaign_id: str, payload: PreviewIn, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        return preview_batch(db, campaign_id, payload.filter, requested=payload.batch_size, all_available=payload.all_available,
                             admin_id=str(current[0].id))
    except BatchError as exc:
        raise _http(exc)
    except pa.FilterError as exc:
        raise HTTPException(status_code=422, detail={"code": "invalid_filter", "message": str(exc)})
    except pa.AudienceTooLarge as exc:
        raise HTTPException(status_code=503, detail={"code": "audience_too_large", "message": str(exc)})
    finally:
        db.rollback()
        db.close()


@router.post("/campaigns/{campaign_id}/batches")
def api_reserve(campaign_id: str, payload: ReserveIn, current=Depends(get_current_admin)):
    try:
        out = reserve_batch(SessionLocal, campaign_id, payload.filter, requested=payload.batch_size, all_available=payload.all_available,
                            idempotency_key=payload.idempotency_key, admin_id=str(current[0].id), token=payload.preview_token,
                            confirm_count=payload.confirm_count)
    except BatchError as exc:
        raise _http(exc)
    except pa.FilterError as exc:
        raise HTTPException(status_code=422, detail={"code": "invalid_filter", "message": str(exc)})
    except pa.AudienceTooLarge as exc:
        raise HTTPException(status_code=503, detail={"code": "audience_too_large", "message": str(exc)})
    if not out["idempotent_replay"]:
        start_batch(SessionLocal, out["batch"]["id"])                   # a reserva já está confirmada no banco; só agora o envio começa
        out["started"] = True
    return out


@router.get("/batches/{batch_id}")
def api_get_batch(batch_id: str, current=Depends(get_current_admin)):
    with SessionLocal() as db:
        try:
            return serialize_batch(db, _interrupted_batch(db, batch_id))
        except BatchError as exc:
            raise _http(exc)


class StopIn(BaseModel):
    confirm: bool = False


@router.post("/batches/{batch_id}/stop")
def api_stop(batch_id: str, payload: StopIn, current=Depends(get_current_admin)):
    if payload.confirm is not True:
        raise HTTPException(status_code=422, detail={"code": "confirmation_required", "message": "Confirme explicitamente que quer parar o envio."})
    try:
        return request_stop(SessionLocal, batch_id, str(current[0].id))
    except BatchError as exc:
        raise _http(exc)


@router.post("/batches/{batch_id}/recover")
def api_recover(batch_id: str, current=Depends(get_current_admin)):
    try:
        return recover_batch(SessionLocal, batch_id)
    except BatchError as exc:
        raise _http(exc)


@router.post("/batches/{batch_id}/resume")
def api_resume(batch_id: str, payload: ConfirmIn, current=Depends(get_current_admin)):
    try:
        out = resume_batch(SessionLocal, batch_id, payload.confirm_count)
    except BatchError as exc:
        raise _http(exc)
    start_batch(SessionLocal, batch_id)
    return out


@router.post("/batches/{batch_id}/release")
def api_release(batch_id: str, payload: ConfirmIn, current=Depends(get_current_admin)):
    try:
        return release_batch(SessionLocal, batch_id, payload.confirm_count)
    except BatchError as exc:
        raise _http(exc)

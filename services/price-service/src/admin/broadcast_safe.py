"""Envio avulso SEGURO (usado pela aba Gratuito): estado persistido por destinatário, sem reenvio automático.

POR QUE EXISTE (auditoria de 21/11/2026): o envio avulso gravava os destinatários em lotes de 10 DEPOIS de chamar o provedor. Um reinício no
meio do envio perdia o registro de quem já tinha recebido; a retomada reenviava a essas pessoas e a barra ficava presa em "enviando".

COMO FUNCIONA (mesma máquina de estados do motor de campanhas em lotes — `push_campaign_batches` —, sem trazer o motor inteiro):
  reserved ──(claim atômico, COMMIT)──▶ sending ──▶ accepted | failed | uncertain
  reserved ──(janela de silêncio fechada)──▶ pending_quiet ──(janela abre + confirmação)──▶ reserved
  reserved | pending_quiet ──(descartar, com confirmação)──▶ released
  1. CRIAÇÃO: o envio e TODAS as linhas de destinatário (`reserved`) nascem na MESMA transação, sob trava (processo + `pg_advisory_xact_lock`). Há um envio
     aberto por vez; o índice único parcial (broadcast_id, user_id) é a garantia final de "uma linha por pessoa por envio".
  2. EXECUÇÃO: por destinatário, `UPDATE … SET state='sending' WHERE state='reserved'` (claim atômico) e COMMIT *antes* de chamar o provedor
     (registro de intenção). Duas execuções simultâneas não pegam a mesma pessoa: só uma vê rowcount=1. Depois: `accepted` (algum aparelho aceitou),
     `failed` (nenhum aceitou — resposta definitiva) ou `uncertain` (exceção, timeout ou queda: não sabemos).
     "Aceito pelo provedor" NÃO é "entregue no aparelho".
  3. RECUPERAÇÃO (`recover_stale`, na partida, ao abrir a barra e ao tentar novo envio): envio sem sinal de vida há STALE_AFTER vira `interrupted` e
     `sending → uncertain`. NUNCA chama o provedor. Quem nunca foi tentado continua `reserved`: o administrador escolhe CONTINUAR (envia só esses) ou
     DESCARTAR (`released`), sempre com a contagem digitada. `accepted`, `failed` e `uncertain` nunca são tentados de novo por nenhum mecanismo automático.
  4. REENVIO MANUAL: é um NOVO envio (`is_resend=1`), pedido com `include_already` + `resend_confirmed`. Nunca reaproveita linhas de outro envio.
  5. SILÊNCIO 22h–8h no horário LOCAL do destinatário, quando conhecido (fuso do aparelho, vindo dos eventos do app). Fuso desconhecido: janela
     conservadora que vale em QUALQUER fuso do Brasil (UTC−5 a UTC−2) = 13:00–24:00 UTC = 10h–21h em Brasília. Quem cai no silêncio fica
     `pending_quiet` (nada é descartado) com `not_before` = próxima abertura; o administrador libera com confirmação (não há disparo automático).
     O TESTE ("só eu") não segue a janela.
"""
from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout
from datetime import datetime, time as dtime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from sqlalchemy import func, text, update

from ..analytics.models import AnalyticsProductEvent
from ..db import SessionLocal
from ..pets.models import Pet
from ..user_auth.models import User

logger = logging.getLogger(__name__)

# Metas protegidas contra repetição acidental e janela de silêncio (hoje: a notificação do atalho "Continue com o PETMOL gratuito").
PROTECTED_GOALS = frozenset({"atalho"})

S_RESERVED, S_SENDING, S_ACCEPTED, S_FAILED, S_UNCERTAIN, S_PENDING_QUIET, S_RELEASED = (
    "reserved", "sending", "accepted", "failed", "uncertain", "pending_quiet", "released")
# Quem JÁ foi tratado por um envio (não entra de novo por padrão): aceito, incerto, em curso ou ainda reservado/aguardando.
HANDLED_STATES = (S_ACCEPTED, S_UNCERTAIN, S_SENDING, S_RESERVED, S_PENDING_QUIET)

QUIET_START_HOUR = 22          # silêncio a partir das 22h…
QUIET_END_HOUR = 8             # …até as 8h (local)
UNKNOWN_TZ_OPEN_UTC = (13, 24)  # fuso desconhecido: só entre 13:00 e 24:00 UTC (= 10h–21h Brasília; vale de UTC−5 a UTC−2)
STALE_AFTER = timedelta(minutes=5)
LEGACY_STALE_AFTER = timedelta(minutes=30)
PROVIDER_TIMEOUT_SECONDS = 25.0
PAUSE_SECONDS = 0.02

_CREATE_LOCK = threading.Lock()
_RUNNING: set[str] = set()
_RUN_LOCK = threading.Lock()
_POOL = ThreadPoolExecutor(max_workers=4, thread_name_prefix="broadcast-provider")


class SafeError(Exception):
    def __init__(self, code: str, message: str, status: int = 409, **extra):
        super().__init__(message)
        self.code, self.message, self.status, self.extra = code, message, status, extra

    def detail(self) -> dict:
        return {"code": self.code, "message": self.message, **self.extra}


def _now() -> datetime:
    """Gancho: os testes trocam o relógio."""
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _br():
    from . import broadcast_router as br   # import tardio: broadcast_router importa este módulo
    return br


# ── Janela de silêncio ───────────────────────────────────────────────────────

_TZ_CACHE: dict[str, Optional[ZoneInfo]] = {}


def valid_tz(name: Optional[str]) -> Optional[ZoneInfo]:
    name = (name or "").strip()
    if not name or name.lower() == "unknown" or len(name) > 64:
        return None
    if name not in _TZ_CACHE:
        try:
            _TZ_CACHE[name] = ZoneInfo(name)
        except Exception:  # noqa: BLE001 — nome inválido/ausente no tzdata
            _TZ_CACHE[name] = None
    return _TZ_CACHE[name]


def window_status(now_utc: datetime, tz_name: Optional[str]) -> tuple[bool, Optional[datetime]]:
    """(pode enviar agora?, próxima abertura em UTC). Fuso conhecido: 8h ≤ hora local < 22h. Desconhecido: janela conservadora em UTC."""
    now_utc = _aware(now_utc)
    zone = valid_tz(tz_name)
    if zone is not None:
        local = now_utc.astimezone(zone)
        if QUIET_END_HOUR <= local.hour < QUIET_START_HOUR:
            return True, None
        day = local.date() if local.hour < QUIET_END_HOUR else local.date() + timedelta(days=1)
        return False, datetime.combine(day, dtime(QUIET_END_HOUR), tzinfo=zone).astimezone(timezone.utc)
    lo, hi = UNKNOWN_TZ_OPEN_UTC
    if lo <= now_utc.hour < hi:
        return True, None
    day = now_utc.date() if now_utc.hour < lo else now_utc.date() + timedelta(days=1)
    return False, datetime.combine(day, dtime(lo), tzinfo=timezone.utc)


def resolve_timezones(db, user_ids) -> dict[str, tuple[Optional[str], str]]:
    """uid → (fuso IANA, base). Base 'device' = último fuso informado pelo aparelho nos eventos do app; 'unknown' = sem fuso confiável."""
    ids = list(user_ids)
    best: dict[str, tuple[datetime, str]] = {}
    for i in range(0, len(ids), 500):
        part = ids[i:i + 500]
        rows = (db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.timezone, func.max(AnalyticsProductEvent.received_at))
                .filter(AnalyticsProductEvent.user_id.in_(part), AnalyticsProductEvent.timezone.isnot(None))
                .group_by(AnalyticsProductEvent.user_id, AnalyticsProductEvent.timezone).all())
        for uid, tz, at in rows:
            if valid_tz(tz) is None:
                continue
            at = _aware(at) or datetime.min.replace(tzinfo=timezone.utc)
            if str(uid) not in best or at > best[str(uid)][0]:
                best[str(uid)] = (at, tz.strip())
    return {uid: ((best[uid][1], "device") if uid in best else (None, "unknown")) for uid in ids}


def quiet_split(db, targets: list[dict], now: Optional[datetime] = None) -> dict:
    """Prévia: quantos poderiam receber agora e quantos ficariam pendentes (e a partir de quando)."""
    now = now or _now()
    tzmap = resolve_timezones(db, [t["user_id"] for t in targets])
    send_now = pending = unknown = 0
    earliest: Optional[datetime] = None
    for t in targets:
        tz, basis = tzmap[t["user_id"]]
        unknown += 1 if basis == "unknown" else 0
        ok, nxt = window_status(now, tz)
        if ok:
            send_now += 1
        else:
            pending += 1
            earliest = nxt if earliest is None or nxt < earliest else earliest
    return {"applies": True, "send_now": send_now, "pending": pending, "unknown_tz": unknown,
            "next_open": earliest.isoformat() if earliest else None,
            "rule": "Silêncio das 22h às 8h no horário do aparelho; sem fuso conhecido, só entre 10h e 21h de Brasília."}


# ── Contagens e estado ───────────────────────────────────────────────────────

def count_states(db, broadcast_id: str) -> dict[str, int]:
    R = _br().AdminBroadcastRecipient
    out = {s: 0 for s in (S_RESERVED, S_SENDING, S_ACCEPTED, S_FAILED, S_UNCERTAIN, S_PENDING_QUIET, S_RELEASED)}
    legacy = 0
    for state, n in db.query(R.state, func.count(R.id)).filter(R.broadcast_id == broadcast_id).group_by(R.state).all():
        if state is None:
            legacy += int(n)
        else:
            out[state] = int(n)
    out["legacy"] = legacy
    return out


def received_goal_ids(db, goal: str) -> dict[str, set[str]]:
    """Quem já foi tratado por um envio REAL desta meta (o teste não conta), por categoria. Linhas antigas (sem estado) valem por `delivered`."""
    br = _br()
    B, R = br.AdminBroadcast, br.AdminBroadcastRecipient
    ids = [str(i) for (i,) in db.query(B.id).filter(B.goal == goal, B.audience_kind != "test").all()]
    out: dict[str, set[str]] = {"accepted": set(), "uncertain": set(), "in_progress": set()}
    for i in range(0, len(ids), 500):
        for uid, state, delivered in db.query(R.user_id, R.state, R.delivered).filter(R.broadcast_id.in_(ids[i:i + 500])).all():
            u = str(uid)
            if state == S_ACCEPTED or (state is None and delivered):
                out["accepted"].add(u)
            elif state == S_UNCERTAIN:
                out["uncertain"].add(u)
            elif state in (S_SENDING, S_RESERVED, S_PENDING_QUIET):
                out["in_progress"].add(u)
    return out


def handled_ids(db, goal: str) -> set[str]:
    g = received_goal_ids(db, goal)
    return g["accepted"] | g["uncertain"] | g["in_progress"]


def finalize(db, b) -> None:
    """Recalcula fase e totais do envio a partir das LINHAS (a fonte da verdade)."""
    c = count_states(db, b.id)
    total = sum(v for k, v in c.items() if k != "legacy")
    if total == 0:
        return
    if c[S_RESERVED] + c[S_SENDING] > 0:
        phase = "sending"
    elif c[S_PENDING_QUIET] > 0:
        phase = "waiting"
    else:
        phase = "done"
    b.recipients_total = total
    b.delivered_total = c[S_ACCEPTED]
    b.phase = phase
    b.finished_at = _now() if phase == "done" else None


def _is_running(broadcast_id: str) -> bool:
    with _RUN_LOCK:
        return broadcast_id in _RUNNING


# ── Criação (sob trava) ──────────────────────────────────────────────────────

def serialize_creation(db) -> None:
    """Uma criação por vez: trava de processo (feita por quem chama) + advisory lock do Postgres dentro da transação."""
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(:k)"), {"k": 7_340_211})


def creation_lock() -> threading.Lock:
    return _CREATE_LOCK


def open_broadcast(db, *, only_running: bool = False):
    """Envio avulso ABERTO (em andamento, interrompido com pendentes ou aguardando horário): só um por vez.
    `only_running`: o TESTE "só eu" só é barrado por um envio realmente em andamento, não por um parado/aguardando o horário."""
    br = _br()
    B = br.AdminBroadcast
    phases = ("sending",) if only_running else ("sending", "interrupted", "waiting")
    for b in db.query(B).filter(B.campaign_id.is_(None), B.phase.in_(phases)).order_by(B.created_at.desc()).all():
        c = count_states(db, b.id)
        if c["legacy"] and not (c[S_RESERVED] + c[S_SENDING] + c[S_PENDING_QUIET]):
            if b.phase == "sending":
                return b                      # envio antigo (sem linhas de estado) ainda dentro do prazo (recover_stale já tratou os vencidos)
            continue
        if c[S_RESERVED] + c[S_SENDING] + c[S_PENDING_QUIET] > 0:
            return b
    return None


def create_ledger(db, b, targets: list[dict], *, quiet: bool) -> None:
    br = _br()
    tzmap = resolve_timezones(db, [t["user_id"] for t in targets]) if quiet else {}
    for t in targets:
        tz, basis = tzmap.get(t["user_id"], (None, "off"))
        db.add(br.AdminBroadcastRecipient(broadcast_id=b.id, user_id=t["user_id"], state=S_RESERVED, attempts=0, delivered=False,
                                          tz_name=tz, tz_basis=basis))


# ── Execução ─────────────────────────────────────────────────────────────────

def _call_provider(user_id: str, payload: dict) -> bool:
    """Chama o provedor com TIMEOUT. True = algum aparelho aceitou; False = nenhum aceitou (definitivo); exceção/timeout = incerto (quem chama decide)."""
    fn = _br().push_to_user                 # lido na hora: os testes trocam o provedor
    fut = _POOL.submit(fn, user_id, payload)
    return (fut.result(timeout=PROVIDER_TIMEOUT_SECONDS) or 0) > 0


def run_broadcast(broadcast_id: str, session_factory=None) -> None:
    """Executa (ou continua) UM envio: só linhas `reserved`. Duas execuções simultâneas nunca enviam à mesma pessoa (claim atômico por linha)."""
    sf = session_factory or SessionLocal
    with _RUN_LOCK:
        if broadcast_id in _RUNNING:
            return
        _RUNNING.add(broadcast_id)
    try:
        _run(sf, broadcast_id)
    except Exception as exc:  # noqa: BLE001 — o estado já está no banco; a recuperação reclassifica
        logger.error("broadcast %s: execução falhou (%s): reclassificando sem reenviar", broadcast_id, exc)
        try:
            recover_broadcast(sf, broadcast_id)
        except Exception:  # noqa: BLE001
            logger.exception("broadcast %s: recuperação após falha também falhou", broadcast_id)
    finally:
        with _RUN_LOCK:
            _RUNNING.discard(broadcast_id)


def _run(sf, broadcast_id: str) -> None:
    br = _br()
    B, R = br.AdminBroadcast, br.AdminBroadcastRecipient
    with sf() as db:
        b = db.get(B, broadcast_id)
        if b is None:
            return
        message, title_tpl, destination, product_url, quiet = b.message, b.title_tpl, b.destination or "home", b.link_url, bool(b.respect_quiet)
        rows = db.query(R.id, R.user_id, R.tz_name).filter(R.broadcast_id == broadcast_id, R.state == S_RESERVED).order_by(R.id).all()
        uids = {str(u) for _, u, _ in rows}
        names = {str(i): n for i, n in db.query(User.id, User.name).filter(User.id.in_(uids or {"__none__"})).all()}
        pets = br._pets_by_user(db, uids)
        pet_names = {u: [n for _, n in plist if n] for u, plist in pets.items()}
    with sf() as db:
        for rid, uid, tz_name in rows:
            uid = str(uid)
            now = _now()
            if quiet:
                ok_window, nxt = window_status(now, tz_name)
                if not ok_window:
                    db.execute(update(R).where(R.id == rid, R.state == S_RESERVED).values(state=S_PENDING_QUIET, not_before=nxt,
                                                                                          detail="silêncio 22h–8h (aguardando a janela)"))
                    db.commit()
                    continue
            claimed = db.execute(update(R).where(R.id == rid, R.state == S_RESERVED).values(
                state=S_SENDING, attempts=func.coalesce(R.attempts, 0) + 1, attempted_at=now)).rowcount
            db.execute(update(B).where(B.id == broadcast_id).values(heartbeat_at=now))
            db.commit()                                   # INTENÇÃO registrada ANTES de falar com o provedor
            if claimed != 1:
                continue                                  # outra execução pegou esta pessoa: nunca duas vezes
            title, body = br.personalize(message, names.get(uid), pet_names.get(uid, []), title_tpl)
            detail = None
            try:
                accepted = _call_provider(uid, br._push_payload(broadcast_id, title, body, destination, product_url))
                state = S_ACCEPTED if accepted else S_FAILED
                detail = None if accepted else "nenhum aparelho aceitou"
            except FutureTimeout:
                state, detail = S_UNCERTAIN, f"sem resposta do provedor em {int(PROVIDER_TIMEOUT_SECONDS)}s"
            except Exception as exc:  # noqa: BLE001 — um tutor com problema nunca derruba os outros
                state, detail = S_UNCERTAIN, f"erro do provedor: {type(exc).__name__}"
            db.execute(update(R).where(R.id == rid, R.state == S_SENDING).values(
                state=state, delivered=(state == S_ACCEPTED), finished_at=_now(), sent_at=now, detail=detail, title=title, body=body))
            db.commit()
            time.sleep(PAUSE_SECONDS)
        b = db.get(B, broadcast_id)
        if b is not None:
            finalize(db, b)
            db.commit()


# ── Recuperação (nunca chama o provedor) ─────────────────────────────────────

def recover_broadcast(sf, broadcast_id: str) -> int:
    """`sending → uncertain` e fase recalculada ('interrupted' se ainda há quem nunca foi tentado). Só reclassifica."""
    br = _br()
    B, R = br.AdminBroadcast, br.AdminBroadcastRecipient
    with sf() as db:
        n = db.execute(update(R).where(R.broadcast_id == broadcast_id, R.state == S_SENDING).values(
            state=S_UNCERTAIN, finished_at=_now(), detail="interrompido antes da resposta do provedor (não será reenviado)")).rowcount
        b = db.get(B, broadcast_id)
        if b is not None:
            finalize(db, b)
            if b.phase == "sending":                       # sobrou gente nunca tentada, mas ninguém está executando
                b.phase = "interrupted"
            db.commit()
        return int(n or 0)


def recover_stale(sf=None, now: Optional[datetime] = None) -> int:
    """Envios avulsos sem sinal de vida (e sem thread nesta instância) são reclassificados. Seguro de chamar a qualquer momento."""
    sf = sf or SessionLocal
    now = now or _now()
    br = _br()
    B = br.AdminBroadcast
    with sf() as db:
        cand = [(str(b.id), _aware(b.heartbeat_at) or _aware(b.created_at), _aware(b.created_at))
                for b in db.query(B).filter(B.campaign_id.is_(None), B.phase == "sending").all()]
    n = 0
    for bid, beat, created in cand:
        if _is_running(bid):
            continue
        with sf() as db:
            c = count_states(db, bid)
        if sum(v for k, v in c.items() if k != "legacy") == 0:           # envio antigo, sem linhas de estado
            if created and created < now - LEGACY_STALE_AFTER:
                with sf() as db:
                    b = db.get(B, bid)
                    if b is not None and b.phase == "sending":
                        b.phase = "interrupted"
                        db.commit()
                        n += 1
            continue
        if beat and beat < now - STALE_AFTER:
            recover_broadcast(sf, bid)
            n += 1
    return n


# ── Continuar / descartar (explícitos, com contagem digitada) ────────────────

def _assert_idle(sf, broadcast_id: str):
    br = _br()
    with sf() as db:
        b = db.get(br.AdminBroadcast, broadcast_id)
        if b is None or b.campaign_id is not None:
            raise SafeError("broadcast_not_found", "Envio não encontrado.", status=404)
        if _is_running(broadcast_id) or b.phase == "sending":
            raise SafeError("broadcast_running", "Este envio ainda está em andamento. Espere terminar ou ficar interrompido (cerca de 5 minutos sem atividade).")
        return b.respect_quiet


def prepare_resume(sf, broadcast_id: str, confirm_count: int, now: Optional[datetime] = None) -> int:
    """Marca como `reserved` os pendentes cuja janela JÁ abriu e confere a contagem. NÃO envia: quem chama dispara `run_broadcast`."""
    now = now or _now()
    recover_stale(sf, now)
    quiet = _assert_idle(sf, broadcast_id)
    br = _br()
    B, R = br.AdminBroadcast, br.AdminBroadcastRecipient
    with sf() as db:
        if quiet:
            for rid, tz in db.query(R.id, R.tz_name).filter(R.broadcast_id == broadcast_id, R.state == S_PENDING_QUIET).all():
                if window_status(now, tz)[0]:
                    db.execute(update(R).where(R.id == rid, R.state == S_PENDING_QUIET).values(state=S_RESERVED, not_before=None))
        n = int(db.query(func.count(R.id)).filter(R.broadcast_id == broadcast_id, R.state == S_RESERVED).scalar() or 0)
        if n == 0:
            db.rollback()
            raise SafeError("nothing_to_resume", "Não há ninguém a continuar agora (os pendentes ainda estão dentro do horário de silêncio, ou todos já foram tratados).", status=422)
        if confirm_count != n:
            db.rollback()
            raise SafeError("count_changed", f"O número mudou: agora são {n} pessoas a continuar. Confira e confirme de novo.", n=n)
        db.execute(update(B).where(B.id == broadcast_id).values(phase="sending", heartbeat_at=now, finished_at=None))
        db.commit()
        return n


def release(sf, broadcast_id: str, confirm_count: int, now: Optional[datetime] = None) -> int:
    """Descarta (sem enviar) quem nunca foi tentado: `released`. Não apaga nada; quem ficou `released` pode entrar em um novo envio."""
    now = now or _now()
    recover_stale(sf, now)
    _assert_idle(sf, broadcast_id)
    br = _br()
    B, R = br.AdminBroadcast, br.AdminBroadcastRecipient
    with sf() as db:
        n = int(db.query(func.count(R.id)).filter(R.broadcast_id == broadcast_id, R.state.in_((S_RESERVED, S_PENDING_QUIET))).scalar() or 0)
        if n == 0:
            raise SafeError("nothing_to_release", "Não há pendentes para descartar.", status=422)
        if confirm_count != n:
            raise SafeError("count_changed", f"O número mudou: agora são {n} pendentes. Confira e confirme de novo.", n=n)
        db.execute(update(R).where(R.broadcast_id == broadcast_id, R.state.in_((S_RESERVED, S_PENDING_QUIET))).values(
            state=S_RELEASED, finished_at=now, detail="descartado pelo administrador (nunca foi tentado)"))
        b = db.get(B, broadcast_id)
        finalize(db, b)
        db.commit()
        return n


# ── Progresso (números reais, do banco) ──────────────────────────────────────

def progress(sf, goal: str, now: Optional[datetime] = None) -> dict:
    now = now or _now()
    recover_stale(sf, now)                       # a barra nunca fica presa em "enviando" depois de uma queda
    br = _br()
    B, R = br.AdminBroadcast, br.AdminBroadcastRecipient
    with sf() as db:
        b = (db.query(B).filter(B.goal == goal, B.audience_kind != "test", B.campaign_id.is_(None)).order_by(B.created_at.desc()).first())
        if b is None:
            return {"found": False}
        c = count_states(db, b.id)
        nxt = db.query(func.min(R.not_before)).filter(R.broadcast_id == b.id, R.state == S_PENDING_QUIET).scalar()
        due_quiet = 0
        if b.respect_quiet:
            for (tz,) in db.query(R.tz_name).filter(R.broadcast_id == b.id, R.state == S_PENDING_QUIET).all():
                due_quiet += 1 if window_status(now, tz)[0] else 0
        legacy = c["legacy"] > 0 and sum(v for k, v in c.items() if k != "legacy") == 0
        if legacy:                                # envio anterior a esta correção: só existe o registro "aceito ou não"
            attempted = c["legacy"]
            accepted = int(db.query(func.count(R.id)).filter(R.broadcast_id == b.id, R.delivered.is_(True)).scalar() or 0)
            c = {**c, S_ACCEPTED: accepted, S_FAILED: attempted - accepted,
                 S_RESERVED: max(0, int(b.recipients_total or 0) - attempted) if b.phase == "sending" else 0}
        total = int(b.recipients_total or 0) if legacy else sum(v for k, v in c.items() if k != "legacy")
        processed = c[S_ACCEPTED] + c[S_FAILED] + c[S_UNCERTAIN]
        return {
            "found": True, "id": b.id, "phase": b.phase, "is_resend": bool(b.is_resend), "legacy": legacy,
            "created_at": b.created_at.isoformat() if b.created_at else None,
            "finished_at": b.finished_at.isoformat() if b.finished_at else None,
            "total": total, "processed": processed, "accepted": c[S_ACCEPTED], "failed": c[S_FAILED], "uncertain": c[S_UNCERTAIN],
            "queued": c[S_RESERVED], "in_flight": c[S_SENDING], "quiet_pending": c[S_PENDING_QUIET], "released": c[S_RELEASED],
            "quiet_next_open": _aware(nxt).isoformat() if nxt else None, "quiet_due_now": due_quiet,
            "can_resume": b.phase in ("interrupted", "waiting") and (c[S_RESERVED] + due_quiet) > 0,
            "can_release": b.phase in ("interrupted", "waiting") and (c[S_RESERVED] + c[S_PENDING_QUIET]) > 0,
        }

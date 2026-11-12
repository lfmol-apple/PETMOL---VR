"""Notificação personalizada (push) enviada pelo dono em /admin/hoje e /admin/dashboard2.

O dono escreve só a MENSAGEM PRINCIPAL; o sistema se dirige ao tutor e aos pets dele sozinho:
título "Leonardo, uma novidade para Baby e Mel" + corpo = a mensagem. Dá para usar {tutor} e {pets}
dentro da mensagem se quiser a posição exata.

Público (escolha do dono): todos · uma quantidade qualquer (sorteio) · só eu (teste). Segmento opcional
(todos / sem ração / sem localização). Só push (decisão de 16/10/2026: nada de e-mail em campanha).
Regras de segurança: só quem tem push ativo, ninguém que pediu para parar, no máximo 1 mensagem por
pessoa por semana (conta o envio manual e as campanhas de ativação), contagem confirmada antes de enviar
e um envio por vez.

ÊXITO = o tutor FAZER ALGO NO APP depois do envio (janela de 24h), medido nos eventos do próprio app:
  entregue → tocou na notificação → abriu o app → fez alguma ação → atingiu a META da mensagem
(a META é escolhida pelo dono: "Esta notificação vai incentivar o usuário a…" — cadastrar pet/foto/ração/vacina/
parasitas/medicação/banho e tosa, ativar localização, assistir ao Tutorial, ir à loja parceira, ou só abrir o app).
Cada meta é medida no banco (o item foi CRIADO depois do envio) e/ou nos eventos do app.
"""
from __future__ import annotations

import logging
import random
import re
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text, func, or_

from ..analytics.models import AnalyticsProductEvent
from ..config import admin_allowed_emails, get_settings
from ..events.models import Event
from ..health.models import FeedingPlan
from ..db import Base, SessionLocal
from ..notifications import push_to_user
from ..pets.grooming_models import GroomingRecord
from ..pets.models import Pet
from ..pets.parasite_models import ParasiteControlRecord
from ..pets.vaccine_models import VaccineRecord
from ..user_auth.models import User
from .activation_campaign_router import ActivationCampaignContact, opted_out_ids
from .analytics.permissions_bi import has_any_push, shares_location
from .analytics.queries import _feeding_configured_pet_ids
from .deps import get_current_admin
from .product_link import ProductLinkError, fetch_product_info, validate_product_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/broadcast", tags=["Admin Broadcast"])

WEEKLY_CAP_DAYS = 7
RESULT_WINDOW = timedelta(hours=24)
SEGMENTS = ("todos", "sem_racao", "sem_gps", "sem_foto", "sem_pet")
SEGMENT_LABELS = {
    "todos": "Todos com notificação ativa",
    "sem_racao": "Tem pet e ainda não cadastrou a ração",
    "sem_gps": "Não compartilha a localização",
    "sem_foto": "Tem pet sem foto",
    "sem_pet": "Ainda não cadastrou nenhum pet",
}

# Eventos "passivos": só abrir/ver tela não conta como "fez algo no app".
_PASSIVE_EVENTS = {
    "app_open", "session_start", "screen_view", "auth_screen_shown", "push_sync_degraded",
    "broadcast_opened", "push_opened",
}
_OPEN_EVENTS = {"app_open", "session_start"}
_SHOP_EVENTS = {"partner_clicked", "shop_partner_store_click", "shop_reorder_click", "open_offer",
                "food_buy_clicked", "food_restock_clicked", "food_partner_selected"}

# Catálogo "Esta notificação vai incentivar o usuário a…": cada meta traz o público certo, uma mensagem
# sugerida, o motivo e COMO o êxito é medido (events = eventos do app; state = item criado no banco).
GOAL_CATALOG: list[dict] = [
    {"key": "pet", "title": '{tutor}, cadastre seu pet em 1 minuto', "group": "Cadastro", "label": "Cadastrar o pet", "segment": "sem_pet", "state": "pet",
     "events": {"pet_created", "first_pet_created"},
     "message": "Vacina, ração e remédio num lugar só. Toque para começar.",
     "why": "Sem pet cadastrado a pessoa não usa nada do app. É o primeiro degrau do funil.",
     "success": "Cadastrou um pet em 24h."},
    {"key": "foto", "title": '{tutor}, falta a foto de {pets}', "group": "Cadastro", "label": "Cadastrar a foto do pet", "segment": "sem_foto", "state": "foto",
     "events": set(),
     "message": "Coloque a foto no PETMOL: fica mais bonito e, se um dia sumir, ajuda a achar.",
     "why": "A foto torna o app pessoal e é essencial para o alerta de Pet Sumido.",
     "success": "Adicionou/atualizou a foto do pet em 24h."},
    {"key": "racao", "title": '{tutor}, a ração de {pets} vai acabar?', "group": "Alimentação", "label": "Cadastrar a ração", "segment": "sem_racao", "state": "racao",
     "events": {"food_cycle_created", "onboarding_food_completed"},
     "message": "Cadastre a ração e o PETMOL avisa antes de acabar. Leva 1 minuto.",
     "why": "Ração é o degrau que mais gera uso recorrente e compra. Vai só para quem tem pet e ainda não cadastrou.",
     "success": "Cadastrou a ração em 24h."},
    {"key": "compra_racao", "title": '{tutor}, ração de {pets} com oferta', "group": "Alimentação", "label": "Comprar a ração (ir à loja parceira)", "segment": "todos",
     "state": None, "events": _SHOP_EVENTS,
     "message": "Veja as ofertas da Loja do PETMOL antes que a ração acabe.",
     "why": "Leva o tutor à compra no momento em que ele precisa. Mede o clique na loja (a venda em si a loja informa).",
     "success": "Tocou em uma oferta/loja parceira em 24h."},
    {"key": "vacina", "title": '{tutor}, a vacina de {pets} está em dia?', "group": "Saúde", "label": "Cadastrar a vacina / carteirinha", "segment": "todos", "state": "vacina", "care": "vaccines",
     "events": {"vaccine_record_created", "onboarding_vaccine_completed"},
     "message": "Tire uma foto da carteirinha: o PETMOL lê e avisa a próxima dose.",
     "why": "A leitura da carteirinha é o recurso mais diferenciado e cria lembretes que trazem a pessoa de volta.",
     "success": "Cadastrou uma vacina em 24h."},
    {"key": "parasitas", "title": '{tutor}, vermífugo de {pets} em dia?', "group": "Saúde", "label": "Registrar vermífugo ou antipulgas", "segment": "todos",
     "state": "parasita", "care": "vaccines",
     "events": {"worm_control_created", "flea_control_created", "collar_created", "onboarding_parasite_completed",
                "onboarding_dewormer_completed"},
     "message": "Registre no PETMOL e a gente lembra a próxima dose.",
     "why": "Vermífugo e antipulgas se repetem todo mês: lembrete certo e compra recorrente.",
     "success": "Registrou vermífugo/antipulgas/coleira em 24h."},
    {"key": "medicacao", "title": '{tutor}, não esqueça o remédio de {pets}', "group": "Saúde", "label": "Cadastrar uma medicação", "segment": "todos", "state": "medicacao",
     "events": {"medication_created"},
     "message": "Cadastre no PETMOL e receba o aviso na hora certa de cada dose.",
     "why": "Medicação é o lembrete de maior valor (o tutor não quer esquecer uma dose).",
     "success": "Cadastrou uma medicação em 24h."},
    {"key": "banho", "title": '{tutor}, banho e tosa de {pets}', "group": "Saúde", "label": "Registrar banho e tosa", "segment": "todos", "state": "banho", "care": "grooming",
     "events": set(),
     "message": "Marque no PETMOL e a gente avisa quando estiver na hora do próximo.",
     "why": "Banho e tosa é um hábito frequente e simples de registrar.",
     "success": "Registrou banho/tosa em 24h."},
    {"key": "tutorial", "title": '{tutor}, aprenda a usar o PETMOL em 1 minuto', "group": "Engajamento", "label": "Assistir ao Tutorial", "segment": "todos", "state": None,
     "events": {"howto_video_opened"},
     "message": "Toque em Tutorial na tela inicial e veja os vídeos.",
     "why": "O botão Tutorial ensina ração, vacinas, cuidados e Pet Sumido. Quem entende o app usa mais.",
     "success": "Abriu um vídeo do Tutorial em 24h."},
    {"key": "gps", "title": '{tutor}, ative a localização', "group": "Segurança", "label": "Ativar a localização", "segment": "sem_gps", "state": "gps",
     "events": set(),
     "message": "Se um pet sumir perto de você, você é avisado na hora.",
     "why": "Sem localização o alerta de Pet Sumido não alcança a pessoa.",
     "success": "Passou a compartilhar a localização em 24h."},
    {"key": "cupom", "title": '{tutor}, 10% OFF na Petz para {pets}', "group": "Compras", "label": "Usar o cupom da Petz", "segment": "todos", "state": None,
     "events": _SHOP_EVENTS,
     "message": "Use o cupom PETMOL nas lojas Petz e veja as ofertas da Loja do PETMOL antes que a ração acabe.",
     "why": "Monetização direta pela parceria. É promoção: use com moderação (a Apple pede que o tutor possa recusar ofertas).",
     "success": "Tocou em uma oferta/loja parceira em 24h."},
    {"key": "promocao_loja", "title": '{tutor}, promoção nas lojas', "group": "Compras", "label": "Ver a promoção das lojas (ir à Loja)", "segment": "todos", "state": None,
     "events": _SHOP_EVENTS,
     "message": "Tem promoção nas lojas parceiras. Veja na Loja do PETMOL o que {pets} pode precisar.",
     "why": "Avisa o tutor de uma campanha real das lojas (11.11, Black Friday…), a partir do Radar de promoções. É promoção: use com moderação.",
     "success": "Tocou em uma oferta/loja parceira em 24h."},
    {"key": "link_produto", "title": '{tutor}, olha este produto para {pets}', "group": "Compras", "label": "Abrir um produto (link direto da loja)", "segment": "todos",
     "state": None, "events": {"broadcast_product_opened"},
     "message": "Toque para ver o produto direto na loja.",
     "why": "Leva o tutor direto à página do produto que você escolheu (promoção, lançamento, oferta). É promoção: use com moderação.",
     "success": "Abriu o produto da loja em 24h."},
    {"key": "abrir", "title": '{tutor}, novidade para {pets}', "group": "Engajamento", "label": "Só abrir o app (lembrar que o PETMOL existe)", "segment": "todos",
     "state": None, "events": set(),
     "message": "Toque para ver o que há de novo no PETMOL.",
     "why": "Reativação simples de quem sumiu. Mede quem abriu o app.",
     "success": "Abriu o app em 24h."},
]
# Para onde o toque na notificação leva (deep link da Home, `?modal=`). "loja" = Loja do Pet (as lojas parceiras).
DESTINATIONS = {
    "home": "Tela inicial",
    "loja": "Lojas (Loja do Pet)",
    "food": "Ração",
    "vaccines": "Vacinas",
    "parasites": "Vermífugo e antipulgas",
    "medication": "Medicação",
    "grooming": "Banho e tosa",
    "produto": "O produto do link (direto na loja)",
}
_GOAL_OPEN = {"compra_racao": "loja", "cupom": "loja", "promocao_loja": "loja", "racao": "food", "vacina": "vaccines",
              "parasitas": "parasites", "medicacao": "medication", "banho": "grooming", "link_produto": "produto"}
for _g in GOAL_CATALOG:
    _g["open"] = _GOAL_OPEN.get(_g["key"], "home")
GOALS = tuple(g["key"] for g in GOAL_CATALOG)
_GOAL = {g["key"]: g for g in GOAL_CATALOG}


# ── Tabelas (criadas por Base.metadata.create_all no start; sem migração) ────

class AdminBroadcast(Base):
    __tablename__ = "admin_broadcasts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    created_by = Column(String(36), nullable=True)
    message = Column(Text, nullable=False)
    segment = Column(String(20), nullable=False, default="todos")
    audience_kind = Column(String(10), nullable=False)          # all | count | test
    audience_requested = Column(Integer, nullable=True)
    goal = Column(String(20), nullable=True)
    recipients_total = Column(Integer, nullable=False, default=0)
    delivered_total = Column(Integer, nullable=False, default=0)
    phase = Column(String(12), nullable=False, default="sending")  # sending | done | error
    finished_at = Column(DateTime(timezone=True), nullable=True)
    link_url = Column(Text, nullable=True)       # push de produto: o link colado pelo dono (o toque abre direto na loja)
    link_title = Column(Text, nullable=True)     # nome do produto conferido pelo dono


class AdminBroadcastRecipient(Base):
    __tablename__ = "admin_broadcast_recipients"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    broadcast_id = Column(String(36), nullable=False, index=True)
    user_id = Column(String(36), nullable=False, index=True)
    sent_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)
    delivered = Column(Boolean, nullable=False, default=False)   # push aceito por pelo menos 1 aparelho
    title = Column(Text, nullable=True)
    body = Column(Text, nullable=True)


# ── Personalização (pura, testável) ──────────────────────────────────────────

def first_name(name: Optional[str]) -> str:
    return (name or "").strip().split(" ")[0]


def pets_phrase(pet_names: list[str]) -> str:
    """'Baby' · 'Baby e Mel' · 'Baby, Mel e Rex' · 'Baby, Mel, Rex e mais 2' · 'seu pet' (sem nome)."""
    names = [n.strip() for n in pet_names if n and n.strip()]
    if not names:
        return "seu pet"
    if len(names) == 1:
        return names[0]
    if len(names) <= 3:
        return ", ".join(names[:-1]) + " e " + names[-1]
    return ", ".join(names[:3]) + f" e mais {len(names) - 3}"


def _cap_first(text: str) -> str:
    text = text.strip()
    return text[:1].upper() + text[1:] if text else text


DEFAULT_TITLE = "{tutor}, uma novidade para {pets}"


def _render_title(template: str, tutor: str, pets: str) -> str:
    t = template.replace("{pets}", pets)
    if tutor:
        t = t.replace("{tutor}", tutor)
    else:   # sem nome do tutor: some o "{tutor}," / "{tutor}:" e o resto continua fazendo sentido
        t = re.sub(r"\{tutor\}[,:]?\s*", "", t)
    t = t.strip()
    t = t[:1].upper() + t[1:]
    return t[:63].rstrip(", ") + "…" if len(t) > 65 else t


def personalize(message: str, tutor_name: Optional[str], pet_names: list[str],
                title_template: Optional[str] = None) -> tuple[str, str]:
    """(título, corpo). O título leva tutor + pets (padrão "{tutor}, uma novidade para {pets}"; o dono pode trocar
    por uma frase de gancho com {tutor}/{pets}). {tutor}/{pets} na mensagem também são trocados."""
    tutor = first_name(tutor_name)
    pets = pets_phrase(pet_names)
    body = message.strip().replace("{tutor}", tutor or "você").replace("{pets}", pets)
    if title_template and title_template.strip():
        title = _render_title(title_template.strip(), tutor, pets)
    else:
        title_pets = pets if any((n or "").strip() for n in pet_names) else "o seu pet"
        title = _render_title(DEFAULT_TITLE, tutor, title_pets)
    return title, _cap_first(body)


# ── Espécie ──────────────────────────────────────────────────────────────────
# Espelho de apps/web/src/lib/speciesCare.ts (ver docs/ESPECIES.md): vacina e antiparasitário são protocolos de
# CÃO e GATO (espécie ausente = cão, pets antigos); Banho e Tosa não se aplica a peixe, pássaro e hamster.
# Uma notificação de um cuidado que NÃO se aplica ao bicho tira a credibilidade do app — por isso é filtrada.
_NO_BATH_SPECIES = {"fish", "bird", "hamster"}


def species_applies(species: Optional[str], care: Optional[str]) -> bool:
    if care is None:
        return True
    sp = (species or "dog").strip().lower()
    if care == "vaccines":
        return sp in ("dog", "cat")
    if care == "grooming":
        return sp not in _NO_BATH_SPECIES
    return True


# ── Público ──────────────────────────────────────────────────────────────────

def _recent_contacted(db, days: int = WEEKLY_CAP_DAYS) -> set[str]:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    out = {str(u) for (u,) in db.query(ActivationCampaignContact.user_id)
           .filter(ActivationCampaignContact.sent_at >= cutoff).all()}
    test_ids = {str(i) for (i,) in db.query(AdminBroadcast.id).filter(AdminBroadcast.audience_kind == "test").all()}
    q = db.query(AdminBroadcastRecipient.user_id, AdminBroadcastRecipient.broadcast_id).filter(
        AdminBroadcastRecipient.delivered.is_(True), AdminBroadcastRecipient.sent_at >= cutoff)
    out |= {str(u) for (u, b) in q.all() if str(b) not in test_ids}   # o teste "só eu" não gasta a cota
    return out


def _pets_by_user(db, user_ids: Optional[set[str]] = None) -> dict[str, list[tuple[str, str]]]:
    q = db.query(Pet.user_id, Pet.id, Pet.name).order_by(Pet.created_at.asc())
    if user_ids is not None:
        q = q.filter(Pet.user_id.in_(user_ids or {"__none__"}))
    out: dict[str, list[tuple[str, str]]] = {}
    for uid, pid, pname in q.all():
        out.setdefault(str(uid), []).append((str(pid), pname or ""))
    return out


def eligible_users(db, segment: str, ignore_weekly_cap: bool = False, care: Optional[str] = None) -> tuple[list[dict], dict]:
    """Quem receberia agora. Devolve (lista, contagens do que ficou de fora).

    `ignore_weekly_cap` (decisão do dono, 08/11/2026): deixa enviar a qualquer momento, também a quem já
    recebeu mensagem nos últimos 7 dias. Quem pediu para parar (opt-out) NUNCA é incluído."""
    rows = db.query(User.id, User.name).filter(has_any_push(User.id)).all()
    users = {str(uid): name for uid, name in rows}
    skipped = {"opt_out": 0, "weekly_cap": 0, "segment": 0}

    blocked = opted_out_ids(db)
    capped = set() if ignore_weekly_cap else _recent_contacted(db)
    pets = _pets_by_user(db, set(users))
    if care:
        # Só os pets a quem o cuidado se aplica (ex.: vacina não vale para coelho). Quem não tem nenhum fica de fora
        # e a mensagem cita só os pets certos.
        species_of = {str(pid): sp for pid, sp in db.query(Pet.id, Pet.species).filter(Pet.user_id.in_(set(users) or {"__none__"})).all()}
        pets = {uid: [(pid, nm) for pid, nm in plist if species_applies(species_of.get(pid), care)] for uid, plist in pets.items()}
    feeding_pets = _feeding_configured_pet_ids(db) if segment == "sem_racao" else set()
    gps_users = {str(u) for (u,) in db.query(User.id).filter(shares_location()).all()} if segment == "sem_gps" else set()
    no_photo_users = {str(u) for (u,) in db.query(Pet.user_id).filter(or_(Pet.photo.is_(None), Pet.photo == "")).distinct().all()} \
        if segment == "sem_foto" else set()

    out: list[dict] = []
    for uid, name in users.items():
        if uid in blocked:
            skipped["opt_out"] += 1
            continue
        if uid in capped:
            skipped["weekly_cap"] += 1
            continue
        user_pets = pets.get(uid, [])
        if care and not user_pets:
            skipped["segment"] += 1
            continue
        if segment == "sem_racao" and (not user_pets or any(pid in feeding_pets for pid, _ in user_pets)):
            skipped["segment"] += 1
            continue
        if segment == "sem_gps" and uid in gps_users:
            skipped["segment"] += 1
            continue
        if segment == "sem_foto" and uid not in no_photo_users:
            skipped["segment"] += 1
            continue
        if segment == "sem_pet" and user_pets:
            skipped["segment"] += 1
            continue
        out.append({"user_id": uid, "name": name, "pet_names": [n for _, n in user_pets if n]})
    return out, skipped


def _admin_target(db, admin_user_id: str) -> list[dict]:
    """Teste: as contas de administrador (o dono, o Henrique e a VEP Consórcio), cada uma com os próprios pets
    (teste fiel do que o tutor vê). Quem pediu o teste sempre entra; contas que ainda não existem são ignoradas."""
    emails = admin_allowed_emails(get_settings())
    users = {str(u.id): u for u in db.query(User).filter(func.lower(User.email).in_(emails)).all()} if emails else {}
    me = db.query(User).filter(User.id == admin_user_id).first()
    if me:
        users.setdefault(str(me.id), me)
    pets = _pets_by_user(db, set(users))
    # quem pediu primeiro, depois as outras contas
    ordered = sorted(users.values(), key=lambda u: (str(u.id) != str(admin_user_id), (u.name or "").lower()))
    return [{"user_id": str(u.id), "name": u.name, "pet_names": [n for _, n in pets.get(str(u.id), []) if n]} for u in ordered]


def _test_accounts_info(db, targets: list[dict]) -> list[dict]:
    """Para o painel: quem receberia o teste e se tem notificação ativa (sem ela o teste não chega)."""
    ids = {t["user_id"] for t in targets}
    with_push = {str(u) for (u,) in db.query(User.id).filter(User.id.in_(ids or {"__none__"}), has_any_push(User.id)).all()}
    return [{"name": first_name(t.get("name")) or "Conta sem nome", "has_push": t["user_id"] in with_push} for t in targets]


def _select_targets(db, segment: str, kind: str, count: Optional[int], admin_user_id: str,
                    ignore_weekly_cap: bool = False, care: Optional[str] = None) -> tuple[list[dict], dict]:
    if kind == "test":
        return _admin_target(db, admin_user_id), {"opt_out": 0, "weekly_cap": 0, "segment": 0}
    targets, skipped = eligible_users(db, segment, ignore_weekly_cap, care)
    if kind == "count" and count is not None and count < len(targets):
        targets = random.sample(targets, count)
    return targets, skipped


# ── Envio ────────────────────────────────────────────────────────────────────

def _spawn(fn, *args) -> None:
    """Roda em segundo plano (a API responde na hora). Os testes trocam por execução direta."""
    threading.Thread(target=fn, args=args, daemon=True).start()


def _push_payload(broadcast_id: str, title: str, body: str, destination: str = "home", product_url: Optional[str] = None) -> dict:
    # O toque abre a tela escolhida (Lojas, Ração...) e o app avisa "tocou na notificação" (b=<id>)
    # para medirmos o êxito. Destino "produto": a Home abre o link do produto DIRETO na loja (?produto=<link>).
    if destination == "produto" and product_url:
        url = f"/home?produto={quote(product_url, safe='')}&b={broadcast_id}"
    else:
        modal = f"modal={destination}&" if destination and destination not in ("home", "produto") else ""
        url = f"/home?{modal}b={broadcast_id}"
    return {
        "title": title,
        "body": body,
        "tag": f"broadcast-{broadcast_id}",
        "data": {"url": url},
    }


def _run_send(broadcast_id: str, message: str, targets: list[dict], title_template: Optional[str] = None,
              destination: str = "home", product_url: Optional[str] = None) -> None:
    db = SessionLocal()
    delivered = 0
    try:
        for i, t in enumerate(targets):
            try:
                title, body = personalize(message, t.get("name"), t.get("pet_names") or [], title_template)
                ok = push_to_user(t["user_id"], _push_payload(broadcast_id, title, body, destination, product_url)) > 0
            except Exception as exc:  # um tutor com problema nunca derruba o envio dos outros
                logger.warning("broadcast %s: falha para %s: %s", broadcast_id, t.get("user_id"), exc)
                title, body, ok = None, None, False
            delivered += 1 if ok else 0
            db.add(AdminBroadcastRecipient(broadcast_id=broadcast_id, user_id=t["user_id"],
                                           delivered=ok, title=title, body=body))
            if (i + 1) % 20 == 0:
                db.commit()
                time.sleep(0.2)
        row = db.query(AdminBroadcast).filter(AdminBroadcast.id == broadcast_id).first()
        if row:
            row.recipients_total = len(targets)
            row.delivered_total = delivered
            row.phase = "done"
            row.finished_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        logger.error("broadcast %s falhou: %s", broadcast_id, exc)
        db.rollback()
        row = db.query(AdminBroadcast).filter(AdminBroadcast.id == broadcast_id).first()
        if row:
            row.phase = "error"
            row.delivered_total = delivered
            row.finished_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


# ── Êxito: o tutor fez algo no app? ──────────────────────────────────────────

def _chunks(items: list, n: int = 500):
    for i in range(0, len(items), n):
        yield items[i:i + n]


def _state_hits(db, state: Optional[str], user_ids: set[str], start: datetime, end: datetime) -> set[str]:
    """Quem FEZ a ação medida pelo banco: o item foi criado/atualizado depois do envio (janela de 24h)."""
    if not state or not user_ids:
        return set()
    ids = list(user_ids)
    hits: set[str] = set()
    if state == "gps":
        for part in _chunks(ids):
            hits |= {str(u) for (u,) in db.query(User.id).filter(
                User.id.in_(part), shares_location(),
                User.location_updated_at >= start, User.location_updated_at <= end).all()}
        return hits
    if state == "medicacao":
        for part in _chunks(ids):
            hits |= {str(u) for (u,) in db.query(Event.user_id).filter(
                Event.user_id.in_(part), Event.type.in_(("medication", "medicacao")), Event.deleted_at.is_(None),
                Event.created_at >= start, Event.created_at <= end).all()}
        return hits
    if state in ("pet", "foto"):
        q_extra = [Pet.created_at >= start, Pet.created_at <= end] if state == "pet" else [
            Pet.updated_at >= start, Pet.updated_at <= end, Pet.photo.is_not(None), Pet.photo != ""]
        for part in _chunks(ids):
            hits |= {str(u) for (u,) in db.query(Pet.user_id).filter(Pet.user_id.in_(part), *q_extra).all()}
        return hits
    tables = {"racao": FeedingPlan, "vacina": VaccineRecord, "parasita": ParasiteControlRecord, "banho": GroomingRecord}
    model = tables.get(state)
    if model is None:
        return hits
    owner = {pid: uid for pid, uid in ((str(p), str(u)) for p, u in db.query(Pet.id, Pet.user_id).filter(
        Pet.user_id.in_(ids[:50000])).all())}
    pet_ids = list(owner)
    extra = [model.deleted_at.is_(None)] if hasattr(model, "deleted_at") else []
    for part in _chunks(pet_ids):
        for (pid,) in db.query(model.pet_id).filter(model.pet_id.in_(part), model.created_at >= start,
                                                      model.created_at <= end, *extra).all():
            if str(pid) in owner:
                hits.add(owner[str(pid)])
    return hits


def broadcast_metrics(db, b: AdminBroadcast) -> dict:
    created = b.created_at if b.created_at.tzinfo else b.created_at.replace(tzinfo=timezone.utc)
    window_end = created + RESULT_WINDOW
    delivered_ids = {
        str(u) for (u,) in db.query(AdminBroadcastRecipient.user_id).filter(
            AdminBroadcastRecipient.broadcast_id == b.id, AdminBroadcastRecipient.delivered.is_(True)).all()
    }
    goal = _GOAL.get(b.goal or "")
    tapped: set[str] = set()
    opened: set[str] = set()
    acted: set[str] = set()
    goal_hit: set[str] = set()
    if delivered_ids:
        goal_events = goal["events"] if goal else set()
        for part in _chunks(list(delivered_ids)):
            events = db.query(AnalyticsProductEvent.user_id, AnalyticsProductEvent.event_name,
                              AnalyticsProductEvent.properties_json).filter(
                AnalyticsProductEvent.user_id.in_(part),
                AnalyticsProductEvent.received_at >= created,
                AnalyticsProductEvent.received_at <= window_end).all()
            for uid, name, props in events:
                uid = str(uid)
                if name == "broadcast_opened" and props and str(b.id) in props:
                    tapped.add(uid)
                if name in _OPEN_EVENTS:
                    opened.add(uid)
                if name not in _PASSIVE_EVENTS:
                    acted.add(uid)
                if name in goal_events:
                    goal_hit.add(uid)
        if goal:
            # 2s de folga: alguns bancos gravam created_at com precisão de segundo
            goal_hit |= _state_hits(db, goal.get("state"), delivered_ids, created - timedelta(seconds=2), window_end)
    acted |= goal_hit
    opened |= tapped | acted   # quem tocou ou agiu obviamente abriu o app
    if b.goal == "abrir":
        goal_hit = set(opened)
    now = datetime.now(timezone.utc)
    return {
        "delivered": len(delivered_ids),
        "tapped": len(tapped),
        "opened": len(opened),
        "acted": len(acted),
        "goal_hit": len(goal_hit) if goal else None,
        "goal_label": goal["label"] if goal else None,
        "window_closed": now >= window_end,
        "window_ends_at": window_end.isoformat(),
    }


def _serialize(db, b: AdminBroadcast) -> dict:
    return {
        "id": b.id,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "message": b.message,
        "segment": b.segment,
        "audience_kind": b.audience_kind,
        "audience_requested": b.audience_requested,
        "goal": b.goal,
        "recipients_total": b.recipients_total,
        "delivered_total": b.delivered_total,
        "phase": b.phase,
        "product": {"title": b.link_title, "url": b.link_url} if b.link_url else None,
        "metrics": broadcast_metrics(db, b),
    }


# ── Endpoints ────────────────────────────────────────────────────────────────

class AudienceIn(BaseModel):
    kind: Literal["all", "count", "test"] = "all"
    count: Optional[int] = Field(default=None, ge=1, le=1_000_000)

    @model_validator(mode="after")
    def _count_required(self):
        if self.kind == "count" and not self.count:
            raise ValueError("Informe quantas pessoas devem receber.")
        return self


class BroadcastIn(BaseModel):
    message: str = Field(min_length=3, max_length=240)
    segment: Literal["todos", "sem_racao", "sem_gps", "sem_foto", "sem_pet"] = "todos"
    audience: AudienceIn = AudienceIn()
    title: Optional[str] = Field(default=None, max_length=80)   # gancho do título; vazio = padrão
    destination: Optional[Literal["home", "loja", "food", "vaccines", "parasites", "medication", "grooming", "produto"]] = None
    # Push de produto: o link colado pelo dono (só lojas conhecidas) e o nome que ele conferiu. O toque abre o produto direto na loja.
    product_url: Optional[str] = Field(default=None, max_length=700)
    product_title: Optional[str] = Field(default=None, max_length=160)
    goal: Optional[str] = None   # chave do GOAL_CATALOG ("Esta notificação vai incentivar o usuário a…")
    # Decisão do dono (09/11/2026): o envio alcança SEMPRE todos com notificação ativa; sem limite semanal. Só opt-out fica de fora.
    ignore_weekly_cap: bool = True

    @model_validator(mode="after")
    def _goal_known(self):
        if self.goal is not None and self.goal not in GOALS:
            raise ValueError("Ação desconhecida.")
        if (self.product_url or "").strip():
            try:
                self.product_url = validate_product_url(self.product_url or "")
            except ProductLinkError as exc:
                raise ValueError(str(exc))
            if not (self.product_title or "").strip():
                raise ValueError("Confira o nome do produto antes de enviar.")
            self.product_title = self.product_title.strip()
            self.destination = "produto"
        else:
            self.product_url = None
            self.product_title = None
            if self.destination == "produto" or self.goal == "link_produto":
                raise ValueError("Cole o link do produto.")
        return self


class SendIn(BroadcastIn):
    confirm_count: int


def _plan(db, payload: BroadcastIn, admin_user_id: str) -> tuple[list[dict], dict, int]:
    care = (_GOAL.get(payload.goal or "") or {}).get("care")
    targets, skipped = _select_targets(db, payload.segment, payload.audience.kind, payload.audience.count,
                                       admin_user_id, payload.ignore_weekly_cap, care)
    return targets, skipped, len(targets)


def _audience_summary(db) -> dict:
    """Quem tem notificação ativa, por canal. "total" = pessoas com pelo menos um canal; opt_out já descontado em "reachable"."""
    from ..notifications import NativePushToken, PushSubscription
    web = {str(u) for (u,) in db.query(PushSubscription.user_id).filter(PushSubscription.disabled_at.is_(None)).distinct().all()}
    ios = {str(u) for (u,) in db.query(NativePushToken.user_id).filter(NativePushToken.disabled_at.is_(None), NativePushToken.platform == "ios").distinct().all()}
    android = {str(u) for (u,) in db.query(NativePushToken.user_id).filter(NativePushToken.disabled_at.is_(None), NativePushToken.platform == "android").distinct().all()}
    anyone = web | ios | android
    blocked = opted_out_ids(db)
    return {"total": len(anyone), "web": len(web), "ios": len(ios), "android": len(android),
            "opted_out": len(anyone & blocked), "reachable": len(anyone - blocked)}


@router.get("/segments")
def segments(current=Depends(get_current_admin)):
    """Quantos receberiam agora em cada segmento + o catálogo de metas ("vai incentivar o usuário a…")."""
    db = SessionLocal()
    try:
        counts = {}
        for seg in SEGMENTS:
            targets, skipped = eligible_users(db, seg, True)
            counts[seg] = {"label": SEGMENT_LABELS[seg], "eligible": len(targets), "skipped": skipped}
        # Metas de um cuidado que não vale para toda espécie (vacina, parasita, banho) contam só quem tem pet a quem se aplica.
        care_eligible: dict[tuple[str, str], int] = {}
        for g in GOAL_CATALOG:
            if g.get("care") and (g["segment"], g["care"]) not in care_eligible:
                care_eligible[(g["segment"], g["care"])] = len(eligible_users(db, g["segment"], True, care=g["care"])[0])
        goals = [
            {"key": g["key"], "group": g["group"], "label": g["label"], "segment": g["segment"], "title": g["title"], "open": g["open"],
             "message": g["message"], "why": g["why"], "success": g["success"],
             "eligible": care_eligible[(g["segment"], g["care"])] if g.get("care") else counts[g["segment"]]["eligible"]}
            for g in GOAL_CATALOG
        ]
        return {"segments": counts, "goals": goals, "destinations": DESTINATIONS, "weekly_cap_days": WEEKLY_CAP_DAYS,
                "audience": _audience_summary(db)}
    finally:
        db.close()


class LinkPreviewIn(BaseModel):
    url: str = Field(min_length=1, max_length=700)


@router.post("/link-preview")
def link_preview(payload: LinkPreviewIn, current=Depends(get_current_admin)):
    """Confere o link de produto: loja, nome lido do próprio link (quando a loja deixa) e imagem. Só lojas conhecidas, https."""
    try:
        info = fetch_product_info(payload.url)
    except ProductLinkError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return {k: info[k] for k in ("url", "store", "host", "final_host", "title", "image", "readable", "reason")}


@router.post("/preview")
def preview(payload: BroadcastIn, current=Depends(get_current_admin)):
    """Quantos vão receber e como a notificação chega (com nomes reais de um destinatário)."""
    admin_user = current[0]
    db = SessionLocal()
    try:
        targets, skipped, will_send = _plan(db, payload, str(admin_user.id))
        sample = None
        if targets:
            ex = next((t for t in targets if t.get("pet_names")), targets[0])
            title, body = personalize(payload.message, ex.get("name"), ex.get("pet_names") or [], payload.title)
            sample = {"title": title, "body": body}
        dest = payload.destination or (_GOAL.get(payload.goal or "") or {}).get("open") or "home"
        result = {"will_send": will_send, "skipped": skipped, "sample": sample, "destination": dest,
                  "destination_label": DESTINATIONS.get(dest, dest)}
        if payload.audience.kind == "test":
            result["test_accounts"] = _test_accounts_info(db, targets)
        if payload.product_url:
            result["product"] = {"title": payload.product_title, "url": payload.product_url}
        return result
    finally:
        db.close()


@router.post("/send")
def send(payload: SendIn, current=Depends(get_current_admin)):
    admin_user = current[0]
    db = SessionLocal()
    try:
        running_since = datetime.now(timezone.utc) - timedelta(minutes=30)
        if db.query(AdminBroadcast.id).filter(AdminBroadcast.phase == "sending",
                                              AdminBroadcast.created_at >= running_since).first():
            raise HTTPException(status_code=409, detail="Já existe um envio em andamento. Espere terminar.")
        targets, _skipped, will_send = _plan(db, payload, str(admin_user.id))
        if will_send == 0:
            raise HTTPException(status_code=422, detail="Ninguém receberia esta mensagem agora.")
        if payload.confirm_count != will_send:
            raise HTTPException(status_code=409,
                                detail=f"O número mudou: agora são {will_send} pessoas. Confira e confirme de novo.")
        b = AdminBroadcast(
            created_by=str(admin_user.id), message=payload.message.strip(), segment=payload.segment,
            audience_kind=payload.audience.kind, audience_requested=payload.audience.count, goal=payload.goal,
            recipients_total=will_send, phase="sending", link_url=payload.product_url, link_title=payload.product_title)
        db.add(b)
        db.commit()
        broadcast_id = b.id
        destination = payload.destination or (_GOAL.get(payload.goal or "") or {}).get("open") or "home"
    finally:
        db.close()
    _spawn(_run_send, broadcast_id, payload.message.strip(), targets, payload.title, destination, payload.product_url)
    return {"id": broadcast_id, "will_send": will_send, "phase": "sending"}


@router.get("/history")
def history(limit: int = 20, current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        rows = db.query(AdminBroadcast).order_by(AdminBroadcast.created_at.desc()).limit(max(1, min(limit, 100))).all()
        return {"items": [_serialize(db, b) for b in rows]}
    finally:
        db.close()

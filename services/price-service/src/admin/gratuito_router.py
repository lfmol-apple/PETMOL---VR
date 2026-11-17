"""Aba "Gratuito": medição da campanha "Mantenha o PETMOL gratuito" (dono, 17/11/2026).

Congela os números de HOJE (as mesmas definições da aba Desempenho: downloads, cadastros, pet, ração, notificação ativa, e a
localização GPS) junto com a LISTA de pessoas de cada item. Depois dos envios, mostra para cada item o antes e o agora,
em números absolutos e em percentual, e quantas pessoas passaram a ter (entre as que não tinham no congelamento).

Honestidade da medida (sem grupo de controle, decisão do dono): isto mostra o que se MOVIMENTOU depois do início, não o que o
e-mail ou a notificação CAUSOU. Cadastros novos e movimento natural também entram. Por isso o painel separa "passaram a ter
(quem já era da base)" de "já entraram com" (cadastros novos) e mostra quem deixou de ter.

Somente leitura, exceto o congelamento (uma vez; trocar exige confirmação explícita e fica registrado).
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import Column, DateTime, String, Text, func

from ..db import Base, SessionLocal, engine
from ..health.models import FeedingPlan
from ..notifications import NativePushToken, PushSubscription
from ..pets.models import Pet
from ..user_auth.models import User
from .analytics.filters import AnalyticsFilters
from .analytics.growth_bi import _installs, _signup_users
from .analytics.permissions_bi import shares_location
from .activation_campaign_router import opted_out_ids
from .email_campaigns import EmailCampaign, _ensure_gratuito, _state, _stats, _tag
from .analytics.queries import _feeding_configured_pet_ids
from .deps import get_current_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/admin/gratuito", tags=["Admin Gratuito"])

ITEMS = ("cadastros", "pets", "alimentacao", "notificacoes", "localizacao")
LABELS = {
    "downloads": "Downloads", "cadastros": "Pessoas cadastradas", "pets": "Pet cadastrado", "alimentacao": "Ração cadastrada",
    "notificacoes": "Notificação ativa", "localizacao": "Localização ativa",
}


class GratuitoBaseline(Base):
    __tablename__ = "gratuito_baselines"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid4()))
    taken_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    taken_by = Column(String(120), nullable=True)
    payload = Column(Text, nullable=False)          # {"downloads": n, "sets": {item: [user_id, ...]}}
    replaced_at = Column(DateTime(timezone=True), nullable=True)   # preenchido quando um congelamento novo o substitui (fica o registro)


Base.metadata.create_all(bind=engine, tables=[GratuitoBaseline.__table__])


def _sets(db) -> dict[str, set[str]]:
    """Conjuntos de pessoas por item, com as MESMAS definições da aba Desempenho (conta real, sem visitante)."""
    real = ~User.email.like("%@petmol.guest")
    cad = {str(u) for u in _signup_users(db, AnalyticsFilters(since=None, until=None, platform=None))}
    pets = {str(u) for (u,) in db.query(Pet.user_id).join(User, User.id == Pet.user_id).filter(real).distinct().all()}
    foods: set[str] = set()
    ok_pets = _feeding_configured_pet_ids(db)
    if ok_pets:
        for (u,) in (db.query(Pet.user_id).join(FeedingPlan, FeedingPlan.pet_id == Pet.id).join(User, User.id == Pet.user_id)
                     .filter(real, FeedingPlan.deleted_at.is_(None), FeedingPlan.pet_id.in_(ok_pets)).distinct().all()):
            foods.add(str(u))
    push: set[str] = set()
    for model in (PushSubscription, NativePushToken):
        for (u,) in (db.query(model.user_id).join(User, User.id == model.user_id)
                     .filter(real, model.disabled_at.is_(None)).distinct().all()):
            push.add(str(u))
    loc = {str(u) for (u,) in db.query(User.id).filter(real, shares_location()).all()}   # mesma definição do painel de Push
    return {"cadastros": cad, "pets": pets, "alimentacao": foods, "notificacoes": push, "localizacao": loc}


def _of(name: Optional[str], sex: Optional[str]) -> Optional[str]:
    """'do Baby' / 'da Mel' / 'de Ted' (sexo desconhecido); sem nome → None."""
    n = (name or "").strip()
    if not n:
        return None
    return f"do {n}" if sex == "male" else f"da {n}" if sex == "female" else f"de {n}"


def _progress_for(uid: str, pets: list[tuple[str, Optional[str], Optional[str]]], feeding: set[str], push: set[str], loc: set[str]) -> tuple[dict, Optional[str]]:
    """(progresso real da conta, "do Baby"). O pet citado é o primeiro SEM ração (ou o primeiro, se todos têm)."""
    has_food = any(pid in feeding for pid, _n, _s in pets)
    pick = next(((n, sx) for pid, n, sx in pets if pid not in feeding), None) or ((pets[0][1], pets[0][2]) if pets else (None, None))
    return ({"pet": bool(pets), "food": has_food, "push": uid in push, "location": uid in loc}, _of(*pick) if pets else None)


def gratuito_targets(db, group: str, only_user: Optional[str] = None) -> list[dict]:
    """Quem recebe o e-mail "gratuito" (um modelo só; o conteúdo vem de `progress`):
    - dia0: quem a notificação NÃO alcança (sem notificação ativa) — sempre falta algo;
    - dia3: quem tem notificação ativa e ainda falta pet, ração ou localização (2º contato).
    Sempre fora: quem pediu para parar de receber, visitante e e-mail inválido. `only_user` monta o alvo de UMA conta (teste do dono)."""
    feeding = _feeding_configured_pet_ids(db)
    push: set[str] = set()
    for model in (PushSubscription, NativePushToken):
        push |= {str(u) for (u,) in db.query(model.user_id).filter(model.disabled_at.is_(None)).distinct().all()}
    loc = {str(u) for (u,) in db.query(User.id).filter(shares_location()).all()}
    pets: dict[str, list[tuple[str, Optional[str], Optional[str]]]] = {}
    for uid, pid, nm, sx in db.query(Pet.user_id, Pet.id, Pet.name, Pet.sex).order_by(Pet.created_at.asc()).all():
        pets.setdefault(str(uid), []).append((str(pid), nm, sx))
    blocked = opted_out_ids(db)
    q = db.query(User.id, User.name, User.email)
    if only_user:
        q = q.filter(User.id == only_user)
    out: list[dict] = []
    for uid, name, email in q.all():
        uid = str(uid)
        if not only_user and (uid in blocked or not email or "@" not in email or email.lower().endswith("@petmol.guest")):
            continue
        prog, pet_of = _progress_for(uid, pets.get(uid, []), feeding, push, loc)
        missing = not all(prog.values())
        if not only_user:
            if group == "dia0" and prog["push"]:
                continue
            if group == "dia3" and (not prog["push"] or not missing):
                continue
            if group not in ("dia0", "dia3"):
                continue
        out.append({"user_id": uid, "name": name, "email": (email or "").strip(), "pet_names": [n for _p, n, _s in pets.get(uid, []) if n],
                    "progress": prog, "pet_of": pet_of})
    return out


def _downloads(db) -> int:
    return len(_installs(db, AnalyticsFilters(since=None, until=None, platform=None)))


def _pct(a: int, b: int) -> Optional[float]:
    return round(100.0 * a / b, 1) if b else None


def situations(sets: dict[str, set[str]]) -> list[dict]:
    """Quadro "quem recebe o quê": cada cadastrado cai em UMA linha (as linhas somam os cadastrados)."""
    cad, pets, food, push, loc = (sets[k] for k in ("cadastros", "pets", "alimentacao", "notificacoes", "localizacao"))
    rows = {"sem_pet_sem_push": 0, "sem_pet_com_push": 0, "pet_sem_racao_sem_push": 0, "pet_sem_racao_com_push": 0,
            "racao_sem_push": 0, "racao_push_sem_loc": 0, "tudo": 0}
    for u in cad:
        p, f, n, l = u in pets, u in food, u in push, u in loc
        if not p:
            rows["sem_pet_com_push" if n else "sem_pet_sem_push"] += 1
        elif not f:
            rows["pet_sem_racao_com_push" if n else "pet_sem_racao_sem_push"] += 1
        elif not n:
            rows["racao_sem_push"] += 1
        elif not l:
            rows["racao_push_sem_loc"] += 1
        else:
            rows["tudo"] += 1
    meta = [
        ("sem_pet_sem_push", "Sem pet, sem notificação", "Não", "E-mail"), ("sem_pet_com_push", "Sem pet, com notificação", "Sim", "E-mail 2º contato"),
        ("pet_sem_racao_sem_push", "Tem pet, sem ração, sem notificação", "Não", "E-mail"), ("pet_sem_racao_com_push", "Tem pet, sem ração, com notificação", "Sim", "E-mail 2º contato"),
        ("racao_sem_push", "Tem ração, sem notificação", "Não", "E-mail"), ("racao_push_sem_loc", "Tem ração e notificação, sem localização", "Sim", "E-mail 2º contato"),
        ("tudo", "Tem tudo", "Não", "Ninguém"),
    ]
    return [{"key": k, "label": lab, "people": rows[k], "push": push_ch, "email": mail} for k, lab, push_ch, mail in meta]


def _card(key: str, base_sets: dict[str, set[str]], now_sets: dict[str, set[str]], base_dl: int, now_dl: int) -> dict:
    if key == "downloads":
        return {"key": key, "label": LABELS[key], "before": {"abs": base_dl, "pct": None}, "now": {"abs": now_dl, "pct": None},
                "delta_abs": now_dl - base_dl, "delta_pp": None, "moved": None, "moved_pct": None, "new_with": None, "lost": None, "denominator": None}
    b, n = base_sets[key], now_sets[key]
    if key == "cadastros":
        new = len(n - b)       # a base dos percentuais não tem percentual (decisão do dono: downloads não entram em nenhum %)
        return {"key": key, "label": LABELS[key], "before": {"abs": len(b), "pct": None}, "now": {"abs": len(n), "pct": None},
                "delta_abs": len(n) - len(b), "delta_pp": None, "moved": new, "moved_pct": None, "new_with": None,
                "lost": len(b - n), "denominator": "base dos percentuais"}
    base_cad, now_cad = base_sets["cadastros"], now_sets["cadastros"]
    before_pct, now_pct = _pct(len(b), len(base_cad)), _pct(len(n), len(now_cad))
    lacking = base_cad - b
    moved = len(lacking & n)                       # já eram da base, não tinham e passaram a ter
    return {"key": key, "label": LABELS[key], "before": {"abs": len(b), "pct": before_pct}, "now": {"abs": len(n), "pct": now_pct},
            "delta_abs": len(n) - len(b), "delta_pp": None if before_pct is None or now_pct is None else round(now_pct - before_pct, 1),
            "moved": moved, "moved_pct": _pct(moved, len(lacking)), "new_with": len(n - base_cad), "lost": len(b - n),
            "denominator": "das pessoas cadastradas"}


@router.get("/summary")
def summary(current=Depends(get_current_admin)):
    db = SessionLocal()
    try:
        now_sets, now_dl = _sets(db), _downloads(db)
        row = db.query(GratuitoBaseline).filter(GratuitoBaseline.replaced_at.is_(None)).order_by(GratuitoBaseline.taken_at.desc()).first()
        _ensure_gratuito(db)
        camp = db.query(EmailCampaign).filter(EmailCampaign.template == "gratuito", EmailCampaign.status == "active").first()
        email_block = None
        if camp:
            st = _stats(db, camp)
            email_block = {"campaign_id": camp.id, "subject": camp.subject, "sent": st["sent"], "last_sent_at": st["last_sent_at"],
                           "tracking": st.get("tracking"), "state": _state.get(camp.id), "tag": _tag(camp.id)}
        out: dict = {
            "baseline": None,
            "now": {"downloads": now_dl, **{k: len(now_sets[k]) for k in ITEMS}},
            "situations": situations(now_sets),
            "email": email_block,
            "email_groups": {"dia0": len(gratuito_targets(db, "dia0")), "dia3": len(gratuito_targets(db, "dia3"))},
        }
        if not row:
            return out
        payload = json.loads(row.payload)
        base_sets = {k: set(payload["sets"].get(k, [])) for k in ITEMS}
        base_dl = int(payload.get("downloads", 0))
        out["baseline"] = {"taken_at": row.taken_at.isoformat(), "taken_by": row.taken_by,
                           "values": {"downloads": base_dl, **{k: len(base_sets[k]) for k in ITEMS}}}
        out["cards"] = [_card(k, base_sets, now_sets, base_dl, now_dl) for k in ("downloads", *ITEMS)]
        return out
    finally:
        db.close()


class BaselineIn(BaseModel):
    replace: bool = False


@router.post("/baseline")
def freeze_baseline(payload: BaselineIn = BaselineIn(), current=Depends(get_current_admin)):
    """Congela os números de agora. Só uma vez: trocar exige `replace=true` (o anterior fica guardado, marcado como substituído)."""
    db = SessionLocal()
    try:
        existing = db.query(GratuitoBaseline).filter(GratuitoBaseline.replaced_at.is_(None)).first()
        if existing and not payload.replace:
            raise HTTPException(409, "Os números já foram congelados. Para recomeçar a medição, confirme a troca.")
        sets, downloads = _sets(db), _downloads(db)
        admin = current[0]
        now = datetime.now(timezone.utc)
        if existing:
            existing.replaced_at = now
        db.add(GratuitoBaseline(taken_at=now, taken_by=getattr(admin, "email", None),
                                payload=json.dumps({"downloads": downloads, "sets": {k: sorted(sets[k]) for k in ITEMS}})))
        db.commit()
        return {"ok": True, "taken_at": now.isoformat(), "values": {"downloads": downloads, **{k: len(sets[k]) for k in ITEMS}}}
    finally:
        db.close()

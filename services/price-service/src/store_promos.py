"""Radar de promoções das lojas parceiras.

O PETMOL "fica ligado" nas promoções: a lista vive no banco (editável pelo dono em /admin/hoje, sem deploy) e uma
tarefa diária (9h de Brasília) AVISA O DONO — por push — na véspera e no dia de cada campanha. O aviso leva ao painel
de envio já preenchido; quem decide e dispara a notificação aos tutores é o dono (nada sai sozinho para os tutores).
O app lê a mesma lista (`GET /commerce/promos`) para mostrar o chip da promoção no card de cada loja.

REGRA DE CREDIBILIDADE: só entra promoção verificada, com data. O campo `source` guarda onde foi verificada.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from datetime import date, datetime, timedelta, timezone
from typing import Optional
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import Column, Date, DateTime, String, func
from sqlalchemy.orm import Session

from .admin.deps import get_current_admin
from .db import Base, SessionLocal, engine, get_db

logger = logging.getLogger(__name__)

MERCHANTS = ("petz", "mercadolivre", "cobasi", "amazon", "shopee")
_MERCHANT_NAME = {"petz": "Petz", "mercadolivre": "Mercado Livre", "cobasi": "Cobasi", "amazon": "Amazon", "shopee": "Shopee"}
LEAD_DAYS = 7          # a campanha entra no radar do app 7 dias antes de começar
_BRT = ZoneInfo("America/Sao_Paulo")


class StorePromoRow(Base):
    __tablename__ = "store_promos"

    id = Column(String(64), primary_key=True)
    merchants = Column(String(120), nullable=False)      # ids separados por vírgula
    name = Column(String(40), nullable=False)
    detail = Column(String(240), nullable=False, default="")
    starts_on = Column(Date, nullable=False)
    ends_on = Column(Date, nullable=False)
    source = Column(String(300), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


Base.metadata.create_all(bind=engine, tables=[StorePromoRow.__table__])

# Campanhas verificadas em 08/11/2026 (fontes públicas). Só entram na PRIMEIRA vez (tabela vazia).
_SEED = [
    ("11-11-2026", ["shopee", "mercadolivre"], "11.11", "Mega liquidação do 11.11 com cupons e frete grátis em itens selecionados.",
     date(2026, 11, 11), date(2026, 11, 11),
     "https://www.gazetasp.com.br/economia/shopee-mercado-livre-e-magalu-adiantam-black-friday-de-27-de-novembro-para-o-dia-11-com-r-125-milhoes-em-cupons/"),
    ("black-week-2026", list(MERCHANTS), "Black Week", "Semana da Black Friday: confira as ofertas na loja.",
     date(2026, 11, 23), date(2026, 11, 26), "https://centraldovarejo.com.br/black-friday-2026-data-faturamento-e-preparacao-do-varejo/"),
    ("black-friday-2026", list(MERCHANTS), "Black Friday", "Black Friday 2026: confira as ofertas na loja.",
     date(2026, 11, 27), date(2026, 11, 29), "https://www.gazetadopovo.com.br/economia/quando-e-a-black-friday-2026-veja-data/"),
    ("cyber-monday-2026", list(MERCHANTS), "Cyber Monday", "Cyber Monday 2026: confira as ofertas na loja.",
     date(2026, 11, 30), date(2026, 11, 30), "https://centraldovarejo.com.br/black-friday-2026-data-faturamento-e-preparacao-do-varejo/"),
]


def ensure_seed(db: Session) -> int:
    if db.query(StorePromoRow.id).first() is not None:
        return 0
    for pid, merchants, name, detail, start, end, source in _SEED:
        db.add(StorePromoRow(id=pid, merchants=",".join(merchants), name=name, detail=detail,
                             starts_on=start, ends_on=end, source=source))
    db.commit()
    return len(_SEED)


def today_brt() -> date:
    return datetime.now(_BRT).date()


def _slug(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:40] or "promo"


def merchant_names(row: StorePromoRow) -> str:
    ids = [m for m in row.merchants.split(",") if m]
    names = [_MERCHANT_NAME.get(m, m) for m in ids]
    if len(names) == len(MERCHANTS):
        return "todas as lojas"
    return " e ".join([", ".join(names[:-1]), names[-1]]) if len(names) > 1 else (names[0] if names else "")


def serialize(row: StorePromoRow) -> dict:
    return {
        "id": row.id,
        "merchants": [m for m in row.merchants.split(",") if m],
        "name": row.name,
        "detail": row.detail or "",
        "startsOn": row.starts_on.isoformat(),
        "endsOn": row.ends_on.isoformat(),
        "source": row.source or "",
    }


# ── Público: o app lê para mostrar o chip em cada card ────────────────────────
public_router = APIRouter(prefix="/commerce", tags=["Promoções"])


@public_router.get("/promos")
def list_current_promos(db: Session = Depends(get_db)):
    """Campanhas no ar ou que começam em até 7 dias (o app calcula o texto do chip)."""
    ensure_seed(db)
    today = today_brt()
    rows = (db.query(StorePromoRow)
            .filter(StorePromoRow.ends_on >= today, StorePromoRow.starts_on <= today + timedelta(days=LEAD_DAYS))
            .order_by(StorePromoRow.starts_on.asc()).all())
    return {"today": today.isoformat(), "promos": [serialize(r) for r in rows]}


# ── Admin: o dono (ou o assistente) cadastra/edita sem deploy ─────────────────
admin_router = APIRouter(prefix="/v1/admin/store-promos", tags=["Admin Promoções"])


class PromoIn(BaseModel):
    name: str = Field(min_length=2, max_length=40)
    merchants: list[str] = Field(min_length=1)
    detail: str = Field(default="", max_length=240)
    starts_on: date
    ends_on: date
    source: Optional[str] = Field(default=None, max_length=300)

    @model_validator(mode="after")
    def _ok(self):
        bad = [m for m in self.merchants if m not in MERCHANTS]
        if bad:
            raise ValueError(f"Loja desconhecida: {', '.join(bad)}.")
        if self.ends_on < self.starts_on:
            raise ValueError("O fim da promoção não pode ser antes do início.")
        return self


@admin_router.get("")
def admin_list(db: Session = Depends(get_db), current=Depends(get_current_admin)):
    ensure_seed(db)
    rows = db.query(StorePromoRow).order_by(StorePromoRow.starts_on.desc()).all()
    return {"promos": [serialize(r) | {"merchantsLabel": merchant_names(r)} for r in rows]}


@admin_router.get("/{promo_id}")
def admin_get(promo_id: str, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    row = db.query(StorePromoRow).filter(StorePromoRow.id == promo_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada")
    return serialize(row) | {"merchantsLabel": merchant_names(row), "message": suggested_message(row)}


@admin_router.post("", status_code=status.HTTP_201_CREATED)
def admin_create(payload: PromoIn, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    base = f"{_slug(payload.name)}-{payload.starts_on.isoformat()}"
    pid, n = base, 2
    while db.query(StorePromoRow.id).filter(StorePromoRow.id == pid).first():
        pid, n = f"{base}-{n}", n + 1
    row = StorePromoRow(id=pid, merchants=",".join(payload.merchants), name=payload.name.strip(),
                        detail=payload.detail.strip(), starts_on=payload.starts_on, ends_on=payload.ends_on,
                        source=(payload.source or "").strip() or None)
    db.add(row)
    db.commit()
    return serialize(row)


@admin_router.delete("/{promo_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete(promo_id: str, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    row = db.query(StorePromoRow).filter(StorePromoRow.id == promo_id).first()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Promoção não encontrada")
    db.delete(row)
    db.commit()


def suggested_message(row: StorePromoRow) -> dict:
    """Texto sugerido para a notificação aos tutores (o dono revisa antes de enviar). Sempre leva à Loja do PETMOL."""
    lojas = merchant_names(row)
    onde = "nas lojas parceiras" if lojas == "todas as lojas" else f"em {lojas}"
    return {
        "goal": "promocao_loja",
        "title": f"{{tutor}}, {row.name} {onde}",
        "message": f"{row.name} chegou {onde}. Veja na Loja do PETMOL o que {{pets}} pode precisar.",
    }


# ── Vigia diária (9h de Brasília): avisa o DONO na véspera e no dia ───────────
def notify_owner_about_promos(today: Optional[date] = None) -> int:
    """Push para o dono (e parceiros do aviso de instalação) quando uma campanha começa amanhã ou hoje.
    Um aviso por (campanha, momento) — AdminEventLog impede repetir. Devolve quantos avisos enviou."""
    from .admin_alerts import AdminEventLog, _claim, _recipient_ids
    from .notifications import push_to_user

    today = today or today_brt()
    db = SessionLocal()
    sent = 0
    try:
        ensure_seed(db)
        rows = db.query(StorePromoRow).filter(StorePromoRow.starts_on.in_([today, today + timedelta(days=1)])).all()
        owners = _recipient_ids(db)
        for row in rows:
            moment = "d" if row.starts_on == today else "e"
            for oid in owners:
                if not _claim(db, oid, f"pr:{row.id[:30]}:{moment}"):
                    continue
                when = "hoje" if moment == "d" else "amanhã"
                try:
                    push_to_user(oid, {
                        "title": f"{row.name} {when} — {merchant_names(row)}",
                        "body": "Toque para preparar o aviso aos tutores. Nada é enviado sem você.",
                        "tag": f"petmol-promo-{row.id}",
                        "data": {"url": f"/admin?aba=push&promo={row.id}"},
                    })
                    sent += 1
                except Exception:
                    logger.exception("store_promos: falha ao avisar o dono sobre %s", row.id)
        return sent
    finally:
        db.close()

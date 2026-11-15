"""Produtos — produtos que o tutor usa no pet (qualquer tipo), num só mecanismo.

Sem tela por categoria: o tutor adiciona por busca/código de barras/nome livre; a
categoria é INFERIDA do nome. Se o produto é consumível e o tutor informou "dura X
dias", o app calcula quando acaba e leva ao "Ver onde comprar". Nada de arquivo do
tutor (a imagem, se houver, é a do catálogo, só uma URL).
"""
import unicodedata
from datetime import date, datetime, timedelta
from typing import List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, Session, mapped_column

from ..db import Base, get_db
from ..user_auth.deps import get_current_user
from ..user_auth.models import User
from .access import get_accessible_pet_or_404

MAX_ITEMS_PER_PET = 100
CATEGORIES = ("higiene", "alimentacao", "saude", "brinquedos", "passeio", "outros")

_KEYWORDS = {
    "higiene": ("shampoo", "condicionador", "gel dental", "creme dental", "pasta de dente", "escova", "hidratante",
                "patinha", "pata", "lenco", "lenço", "tapete", "areia", "granulado", "cortador", "alicate", "perfume",
                "colonia", "colônia", "desodorante", "limpa", "otologico", "otológico", "sabonete", "pente", "rasqueadeira"),
    "alimentacao": ("racao", "ração", "petisco", "sache", "sachê", "snack", "bifinho", "osso", "suplemento alimentar", "biscoito"),
    "saude": ("vermifugo", "vermífugo", "antipulgas", "carrapato", "coleira antipulgas", "vitamina", "suplemento",
              "remedio", "remédio", "pomada", "colirio", "colírio", "antibiotico", "antibiótico"),
    "brinquedos": ("brinquedo", "bolinha", "mordedor", "pelucia", "pelúcia", "arranhador", "corda", "frisbee", "bola"),
    "passeio": ("coleira", "guia", "peitoral", "focinheira", "caixa de transporte", "bebedouro", "comedouro", "roupa", "capa"),
}
_ORDER = ("saude", "alimentacao", "higiene", "brinquedos", "passeio")


def _norm(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s.lower()) if unicodedata.category(c) != "Mn")


def infer_category(name: str) -> str:
    n = _norm(name or "")
    for cat in _ORDER:
        if any(_norm(k) in n for k in _KEYWORDS[cat]):
            return cat
    return "outros"


class CabinetItem(Base):
    __tablename__ = "pet_cabinet_items"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=lambda: str(uuid4()))
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    brand: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    category: Mapped[str] = mapped_column(String(20), nullable=False, default="outros")
    gtin: Mapped[Optional[str]] = mapped_column(String(14), nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    duration_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)   # "dura cerca de X dias"
    started_on: Mapped[Optional[date]] = mapped_column(Date, nullable=True)        # começou a usar a unidade atual
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class CabinetItemIn(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    brand: Optional[str] = Field(default=None, max_length=80)
    category: Optional[str] = None   # se vazio, é inferida do nome
    gtin: Optional[str] = Field(default=None, pattern=r"^\d{8,14}$")
    image_url: Optional[str] = Field(default=None, max_length=500)
    duration_days: Optional[int] = Field(default=None, ge=1, le=36500)   # 36500 = 'dura muito tempo' (sem aviso)
    started_on: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=300)


class CabinetItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=160)
    category: Optional[str] = None
    duration_days: Optional[int] = Field(default=None, ge=1, le=36500)   # 36500 = 'dura muito tempo' (sem aviso)
    started_on: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=300)
    clear_duration: bool = False   # "não sei quanto dura": apaga o prazo
    restarted_today: bool = False  # "troquei por uma nova": reinicia a contagem


class CabinetItemOut(BaseModel):
    id: str
    pet_id: str
    name: str
    brand: Optional[str] = None
    category: str
    gtin: Optional[str] = None
    image_url: Optional[str] = None
    duration_days: Optional[int] = None
    started_on: Optional[date] = None
    ends_on: Optional[date] = None      # calculado
    days_left: Optional[int] = None     # calculado; negativo = já passou
    notes: Optional[str] = None


def _out(it: CabinetItem) -> CabinetItemOut:
    ends = days_left = None
    if it.duration_days and it.started_on:
        ends = it.started_on + timedelta(days=it.duration_days)
        days_left = (ends - date.today()).days
    return CabinetItemOut(
        id=it.id, pet_id=it.pet_id, name=it.name, brand=it.brand, category=it.category, gtin=it.gtin,
        image_url=it.image_url, duration_days=it.duration_days, started_on=it.started_on, ends_on=ends,
        days_left=days_left, notes=it.notes,
    )


def _valid_category(c: Optional[str]) -> Optional[str]:
    if c is None:
        return None
    if c not in CATEGORIES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Categoria inválida.")
    return c


router = APIRouter(prefix="/pets/{pet_id}/cabinet", tags=["Produtos"])


@router.get("", response_model=List[CabinetItemOut])
def list_items(pet_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    rows = db.query(CabinetItem).filter(CabinetItem.pet_id == pet_id).order_by(CabinetItem.created_at.desc()).all()
    return [_out(r) for r in rows]


@router.post("", response_model=CabinetItemOut, status_code=status.HTTP_201_CREATED)
def add_item(pet_id: str, payload: CabinetItemIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    name = payload.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Informe o nome do produto.")
    if db.query(CabinetItem).filter(CabinetItem.pet_id == pet_id).count() >= MAX_ITEMS_PER_PET:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Limite de produtos no armário atingido.")
    dup = db.query(CabinetItem).filter(CabinetItem.pet_id == pet_id)
    dup = dup.filter(CabinetItem.gtin == payload.gtin) if payload.gtin else dup.filter(func.lower(CabinetItem.name) == name.lower())
    existing = dup.first()
    if existing:
        return _out(existing)
    started = payload.started_on or (date.today() if payload.duration_days else None)
    item = CabinetItem(
        pet_id=pet_id, name=name, brand=(payload.brand or None), gtin=payload.gtin, image_url=payload.image_url,
        category=_valid_category(payload.category) or infer_category(f"{name} {payload.brand or ''}"),
        duration_days=payload.duration_days, started_on=started, notes=payload.notes,
    )
    db.add(item); db.commit(); db.refresh(item)
    return _out(item)


@router.patch("/{item_id}", response_model=CabinetItemOut)
def update_item(pet_id: str, item_id: str, payload: CabinetItemUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    item = db.query(CabinetItem).filter(CabinetItem.id == item_id, CabinetItem.pet_id == pet_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")
    data = payload.model_dump(exclude_unset=True)
    if "category" in data:
        item.category = _valid_category(data["category"]) or item.category
    for f in ("name", "notes", "started_on"):
        if f in data and data[f] is not None:
            setattr(item, f, data[f].strip() if isinstance(data[f], str) else data[f])
    if data.get("duration_days"):
        item.duration_days = data["duration_days"]
        item.started_on = item.started_on or date.today()
    if payload.clear_duration:
        item.duration_days = None
        item.started_on = None
    if payload.restarted_today and item.duration_days:
        item.started_on = date.today()
    db.commit(); db.refresh(item)
    return _out(item)


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(pet_id: str, item_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    get_accessible_pet_or_404(db, user.id, pet_id)
    item = db.query(CabinetItem).filter(CabinetItem.id == item_id, CabinetItem.pet_id == pet_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Produto não encontrado.")
    db.delete(item); db.commit()

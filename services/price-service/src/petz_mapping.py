"""
Aprendizado de mapeamento Petz por produto — camada de DISCOVERY/LEARNING,
separada da camada comercial (ProductAffiliateLink, ver affiliate_links.py).

Princípio: produto PETMOL (GTIN) → candidato Petz → confirmação humana →
reuso automático por qualquer tutor depois. Aprendido uma vez, vale
sempre — ver docs/AFFILIATES.md §Petz.

PetzProductMapping é INTENCIONALMENTE separado de ProductAffiliateLink:
guarda estado de DESCOBERTA (status, confiança, variante, query de busca)
e a página real do produto na Petz. O modelo comercial Petz atual é
Loja Parceira + cupom PETTMOL; não existe affiliate_product_url
individual por produto. ProductAffiliateLink(merchant="petz") permanece
apenas como extensão futura se a Petz fornecer um deep-link oficial por
produto, mas não é pré-requisito para o caminho "Ver na Petz".

Nenhuma função aqui faz scraping/crawler/chamada de rede à Petz —
suggest_petz_candidate só gera uma QUERY de busca (texto), nunca busca
nem confirma nada sozinha; confirmação é sempre um ato humano explícito
via confirm_petz_mapping (ver admin/petz_router.py).
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, func, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .petz_link_validator import validate_petz_product_url

MATCH_STATUSES = (
    "unknown",
    "candidate",
    "ambiguous",
    "confirmed",
    "affiliate_pending",
    "affiliate_ready",
    "rejected",
)

# Status legado reservado para uma futura oferta Petz com preço
# comparável. Hoje o caminho real de produto confirmado usa
# DIRECT_LINK_ELIGIBLE_STATUSES + /commerce/petz-direct-link.
PUBLISHABLE_MATCH_STATUSES = frozenset({"affiliate_ready"})

# Status que já provam PRODUTO correto — suficiente pra oferecer "Ver na
# Petz" com direct_product_url + cupom PETTMOL (ver GET
# /commerce/petz-direct-link em main.py).
# "ambiguous"/"candidate"/"rejected"/"unknown" nunca entram aqui — produto
# ainda não confirmado por um humano.
DIRECT_LINK_ELIGIBLE_STATUSES = frozenset({"confirmed", "affiliate_pending", "affiliate_ready"})


class PetzProductMapping(Base):
    """Uma linha por produto PETMOL (products_catalog.id) — aprendida uma
    vez, reutilizada por todos os tutores depois (ver docstring do
    módulo). NUNCA duplica o catálogo PETMOL; product_id é sempre a
    identidade canônica (GTIN, via products_catalog.barcode_normalized)."""

    __tablename__ = "petz_product_mappings"
    __table_args__ = (UniqueConstraint("product_id", name="uq_petz_product_mappings_product"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products_catalog.id"), nullable=False, index=True)
    petz_product_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    product_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    search_query: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    match_status: Mapped[str] = mapped_column(String(24), nullable=False, default="unknown", index=True)
    match_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    variant_label: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    variant_weight_kg: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


def get_mapping(db: Session, product_id: int) -> Optional[PetzProductMapping]:
    return db.scalar(select(PetzProductMapping).where(PetzProductMapping.product_id == product_id))


def get_petz_learning_status(db: Session, product_id: int) -> str:
    """Status atual do aprendizado pra este produto — 'unknown' se nunca
    foi tentado nenhum passo (nem sugestão de candidato)."""
    mapping = get_mapping(db, product_id)
    return mapping.match_status if mapping else "unknown"


def build_petz_search_query(
    *,
    gtin: Optional[str] = None,
    brand: Optional[str] = None,
    name: Optional[str] = None,
    weight_kg: Optional[float] = None,
) -> Optional[str]:
    """Gera uma QUERY de busca (nunca um resultado) — prioridade: GTIN
    exato > marca+nome+peso > nome normalizado. Não executa nenhuma
    busca/scraping; só monta o texto que um humano (ou uma futura
    integração comprovada) usaria pra procurar o produto na Petz."""
    gtin_clean = "".join(ch for ch in (gtin or "") if ch.isdigit())
    if gtin_clean:
        return gtin_clean

    parts = [p.strip() for p in (brand, name) if p and p.strip()]
    if weight_kg:
        weight_str = f"{weight_kg:g}".replace(".", ",")
        parts.append(f"{weight_str} kg")
    query = " ".join(parts).strip()
    return query or None


def suggest_petz_candidate(
    db: Session,
    product_id: int,
    *,
    gtin: Optional[str] = None,
    brand: Optional[str] = None,
    name: Optional[str] = None,
    weight_kg: Optional[float] = None,
) -> PetzProductMapping:
    """Registra/atualiza a query de busca sugerida pra este produto, com
    status 'candidate' se ainda não havia mapping. NUNCA busca/confirma
    nada sozinho — só prepara o candidato pra revisão humana."""
    query = build_petz_search_query(gtin=gtin, brand=brand, name=name, weight_kg=weight_kg)
    mapping = get_mapping(db, product_id)
    if mapping is None:
        mapping = PetzProductMapping(product_id=product_id, match_status="candidate", search_query=query)
        db.add(mapping)
    elif mapping.match_status == "unknown":
        mapping.match_status = "candidate"
        mapping.search_query = query
    elif not mapping.search_query:
        # Já tem histórico (ambiguous/confirmed/rejected/etc.) — nunca
        # regride o status, só preenche a query se ainda estava vazia.
        mapping.search_query = query
    db.commit()
    db.refresh(mapping)
    return mapping


def confirm_petz_mapping(
    db: Session,
    product_id: int,
    *,
    petz_product_id: str,
    product_url: str,
    variant_label: Optional[str] = None,
    variant_weight_kg: Optional[float] = None,
    match_confidence: Optional[float] = None,
) -> PetzProductMapping:
    """Confirmação humana explícita do PRODUTO — único caminho que move
    um mapping pra 'confirmed'. NUNCA chamado automaticamente por
    similaridade de texto e NUNCA cria affiliate_product_url individual:
    o modelo comercial Petz Partner é tratado separadamente via
    partner_store_url + coupon_code."""
    clean_product_url = validate_petz_product_url(product_url)
    mapping = get_mapping(db, product_id)
    if mapping is None:
        mapping = PetzProductMapping(product_id=product_id)
        db.add(mapping)

    mapping.petz_product_id = petz_product_id.strip()
    mapping.product_url = clean_product_url
    mapping.variant_label = variant_label
    mapping.variant_weight_kg = variant_weight_kg
    mapping.match_confidence = match_confidence
    mapping.match_status = "confirmed"
    mapping.rejection_reason = None
    mapping.last_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(mapping)
    return mapping


def reject_petz_candidate(db: Session, product_id: int, *, reason: Optional[str] = None) -> PetzProductMapping:
    """Rejeita um candidato (ou marca 'sem match' um produto nunca
    tentado) — nunca apaga o histórico, só registra o motivo."""
    mapping = get_mapping(db, product_id)
    if mapping is None:
        mapping = PetzProductMapping(product_id=product_id)
        db.add(mapping)
    mapping.match_status = "rejected"
    mapping.rejection_reason = reason
    mapping.last_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(mapping)
    return mapping


def mark_ambiguous(db: Session, product_id: int, *, reason: Optional[str] = None) -> PetzProductMapping:
    """Marca explicitamente como ambíguo (mais de um candidato plausível,
    nenhum claramente correto) — nunca publica sozinho (ver
    PUBLISHABLE_MATCH_STATUSES)."""
    mapping = get_mapping(db, product_id)
    if mapping is None:
        mapping = PetzProductMapping(product_id=product_id)
        db.add(mapping)
    mapping.match_status = "ambiguous"
    mapping.rejection_reason = reason
    db.commit()
    db.refresh(mapping)
    return mapping


def coverage_stats(db: Session) -> dict:
    """Métricas simples de cobertura — total conhecido por status. Um
    GROUP BY simples, sem paginação/filtro pesado."""
    rows = db.execute(
        select(PetzProductMapping.match_status, func.count(PetzProductMapping.id)).group_by(PetzProductMapping.match_status)
    ).all()
    counts = {status: 0 for status in MATCH_STATUSES}
    for status, count in rows:
        counts[status] = count
    counts["total"] = sum(counts.values())
    return counts

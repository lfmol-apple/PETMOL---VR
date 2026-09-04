"""Relatório de cobertura: produtos que aparecem na Cobasi e NÃO têm
oferta Shopee validada. Regenerado ao fim de cada job noturno de sync
(ver admin/shopee_sync_router.py) e consumível pela tela admin
(admin/shopee_coverage_router.py) pra normalização manual.

Uma linha por GTIN. `status`:
  open        — precisa de ação (aparece na tela)
  cobasi_only — o admin marcou "não tem na Shopee mesmo" — não incomoda mais
  resolved    — passou a ter Shopee validada (automático) ou o admin
                cadastrou um link

`reason` (por que não tem Shopee):
  never_searched       — nunca foi buscado
  no_confident_match   — buscado, nenhum anúncio passou na identidade
  only_conflicting     — só há anúncios de variante errada (conflito)
  has_unverified_offer — tem oferta legada sem título, não servida no modo estrito
  api_error            — a última busca deu erro na API da Shopee
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean, Column, DateTime, Float, Integer, String, Text, select, text,
)
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import MarketplaceOffer
from .db import Base, engine
from .product_catalog_lookup import ProductCatalog

logger = logging.getLogger(__name__)

_VALIDATED = ("EXACT", "HIGH_CONFIDENCE")

REASON_SUGGESTION = {
    "never_searched": "Aguardar a fila noturna ou usar 'Re-tentar agora'.",
    "no_confident_match": "Cadastrar um link Shopee na mão (o anúncio certo existe mas o matcher não confirma), ou marcar como só-Cobasi.",
    "only_conflicting": "Só há anúncios de variante errada. Cadastrar o link certo na mão ou marcar como só-Cobasi.",
    "has_unverified_offer": "Existe oferta legada sem título. Re-tentar pra enriquecer, ou cadastrar o link certo.",
    "api_error": "Erro transitório da Shopee. Re-tentar agora.",
}


class ShopeeCoverageGap(Base):
    __tablename__ = "shopee_coverage_gaps"

    id = Column(Integer, primary_key=True, autoincrement=True)
    gtin = Column(String(20), nullable=False, unique=True, index=True)
    product_id = Column(Integer, nullable=True, index=True)
    product_name = Column(Text, nullable=True)
    category = Column(String(64), nullable=True, index=True)
    cobasi_price = Column(Float, nullable=True)
    cobasi_title = Column(Text, nullable=True)
    reason = Column(String(32), nullable=False, index=True)
    reason_detail = Column(Text, nullable=True)
    suggestion = Column(Text, nullable=True)
    seen_by_tutor = Column(Boolean, nullable=False, default=False, index=True)
    discovery_attempts = Column(Integer, nullable=False, default=0)
    status = Column(String(16), nullable=False, default="open", index=True)
    resolved_note = Column(Text, nullable=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    first_seen_at = Column(DateTime(timezone=True), nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=False)


Base.metadata.create_all(bind=engine, tables=[ShopeeCoverageGap.__table__])


def _tutor_gtins(db: Session) -> set[str]:
    out: set[str] = set()
    try:
        for (g,) in db.execute(text(
            "select distinct barcode_normalized from product_scan_events where barcode_normalized is not null"
        )).all():
            if g:
                out.add(str(g))
        for (ij,) in db.execute(text(
            "select items_json from feeding_plans where enabled and deleted_at is null and items_json is not null"
        )).all():
            try:
                import json as _json
                for it in _json.loads(ij):
                    bc = (it or {}).get("barcode")
                    if bc:
                        out.add(str(bc))
            except Exception:
                pass
    except Exception as exc:  # noqa: BLE001
        logger.warning("[coverage_gaps] _tutor_gtins falhou: %s", exc)
    return out


def _classify(db: Session, product: ProductCatalog) -> tuple[str, Optional[str], int]:
    """(reason, detail, discovery_attempts) pra um produto sem Shopee validada."""
    gtin = product.barcode_normalized
    offers = list(db.scalars(
        select(MarketplaceOffer).where(
            MarketplaceOffer.product_id == product.id,
            MarketplaceOffer.merchant == "shopee",
        )
    ))
    active = [o for o in offers if o.active]
    if any((o.match_decision or "").upper() == "CONFLICT" for o in offers) and not active:
        return "only_conflicting", "todos os anúncios Shopee encontrados são de variante errada", 0
    if any((o.match_decision is None) for o in active):
        return "has_unverified_offer", "existe oferta Shopee legada sem título/decisão", 0

    attempt = db.execute(text(
        "select last_result, attempts from shopee_discovery_attempts where gtin = :g"
    ), {"g": gtin}).fetchone()
    if attempt is None:
        return "never_searched", None, 0
    last_result, attempts = attempt[0], int(attempt[1] or 0)
    if last_result == "api_error":
        return "api_error", "última busca deu erro na API da Shopee", attempts
    if last_result == "no_match":
        return "no_confident_match", "buscado, nenhum anúncio passou na validação de identidade", attempts
    # last_result == "matched" mas sem oferta validada ativa → provavelmente
    # foi desativada por conflito/ausência depois
    return "no_confident_match", "casou antes mas a oferta não está mais válida", attempts


def rebuild_shopee_coverage_gaps(db: Session, *, limit: Optional[int] = None) -> dict:
    """Reconstrói a tabela. Retorna resumo. Idempotente."""
    now = datetime.now(timezone.utc)
    tutor = _tutor_gtins(db)

    # produtos com feed Cobasi ativo e SEM oferta Shopee validada ativa
    rows = db.execute(text(f"""
        select p.id, p.barcode_normalized,
               coalesce(p.canonical_name, p.name) as name, p.category
        from products_catalog p
        join affiliate_feed_offers f
          on f.gtin = p.barcode_normalized and f.merchant = 'cobasi'
          and f.active and f.in_stock and f.title is not null
        where p.barcode_normalized is not null
          and not exists (
            select 1 from marketplace_offers o
            where o.product_id = p.id and o.merchant = 'shopee' and o.active
              and o.match_decision in ('EXACT','HIGH_CONFIDENCE')
          )
        group by p.id, p.barcode_normalized, name, p.category
        {f'limit {int(limit)}' if limit else ''}
    """)).fetchall()

    seen_gtins: set[str] = set()
    created = updated = 0
    by_reason: dict[str, int] = {}

    for pid, gtin, name, category in rows:
        seen_gtins.add(gtin)
        product = db.get(ProductCatalog, pid)
        reason, detail, attempts = _classify(db, product)
        by_reason[reason] = by_reason.get(reason, 0) + 1

        feed = db.scalars(
            select(AffiliateFeedOffer).where(
                AffiliateFeedOffer.gtin == gtin, AffiliateFeedOffer.merchant == "cobasi",
                AffiliateFeedOffer.active.is_(True),
            ).limit(1)
        ).first()

        gap = db.scalars(select(ShopeeCoverageGap).where(ShopeeCoverageGap.gtin == gtin)).first()
        if gap is None:
            gap = ShopeeCoverageGap(gtin=gtin, first_seen_at=now, status="open")
            db.add(gap)
            created += 1
        elif gap.status == "resolved":
            # regrediu (tinha, perdeu) — reabre
            gap.status = "open"
            gap.resolved_note = None
            gap.resolved_at = None
            updated += 1
        else:
            updated += 1

        gap.product_id = pid
        gap.product_name = name
        gap.category = category
        gap.cobasi_price = getattr(feed, "price", None)
        gap.cobasi_title = getattr(feed, "title", None)
        gap.reason = reason
        gap.reason_detail = detail
        gap.suggestion = REASON_SUGGESTION.get(reason)
        gap.seen_by_tutor = gtin in tutor
        gap.discovery_attempts = attempts
        gap.last_seen_at = now
        # 'cobasi_only' setado pelo admin sobrevive ao rebuild

    # gaps que não apareceram mais (ganharam Shopee) → resolved automático,
    # menos os que o admin marcou cobasi_only (esses ficam)
    resolved_auto = 0
    for gap in db.scalars(select(ShopeeCoverageGap).where(ShopeeCoverageGap.status == "open")):
        if gap.gtin not in seen_gtins:
            gap.status = "resolved"
            gap.resolved_note = "passou a ter oferta Shopee validada"
            gap.resolved_at = now
            resolved_auto += 1

    db.commit()
    summary = {
        "total_open": _count(db, "open"),
        "cobasi_only": _count(db, "cobasi_only"),
        "created": created, "updated": updated, "resolved_auto": resolved_auto,
        "by_reason": by_reason,
        "at": now.isoformat(),
    }
    logger.info("[coverage_gaps] %s", summary)
    return summary


def _count(db: Session, status: str) -> int:
    return db.execute(text(
        "select count(*) from shopee_coverage_gaps where status = :s"
    ), {"s": status}).scalar() or 0

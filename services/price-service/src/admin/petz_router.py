"""Admin — Petz: aprendizado de mapeamento produto↔Petz por produto (ver
petz_mapping.py). Endpoints simples, mesmo padrão de
admin/affiliate_links_router.py — sem painel administrativo completo.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..affiliate_links import ProductAffiliateLink
from ..db import get_db
from ..petz_link_validator import InvalidPetzAffiliateUrlError, validate_petz_affiliate_url
from ..petz_mapping import (
    PetzProductMapping,
    confirm_petz_mapping,
    coverage_stats,
    get_mapping,
    reject_petz_candidate,
    suggest_petz_candidate,
)
from ..product_catalog_lookup import ProductCatalog, normalize_gtin
from .deps import get_current_admin, get_current_admin_or_readonly_key
from .schemas import (
    DeletedOut,
    PetzCoverageOut,
    PetzMappingConfirmRequest,
    PetzMappingOut,
    PetzMappingRejectRequest,
    PetzMappingSuggestOut,
    PetzSetAffiliateLinkRequest,
)

router = APIRouter(prefix="/v1/admin/petz", tags=["Admin Petz"])

# match_status que já passaram por confirmação de PRODUTO — só a partir
# daqui um link afiliado pode ser vinculado (ver set_affiliate_link).
_CONFIRMABLE_FOR_AFFILIATE = ("confirmed", "affiliate_pending", "affiliate_ready")


def _resolve_product(db: Session, gtin: str) -> ProductCatalog:
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized:
        raise HTTPException(status_code=400, detail="GTIN inválido")
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        raise HTTPException(status_code=404, detail=f"Produto com GTIN {gtin_normalized} não encontrado em products_catalog")
    return product


def _to_out(mapping: Optional[PetzProductMapping], gtin: str) -> PetzMappingOut:
    if mapping is None:
        return PetzMappingOut(gtin=gtin, match_status="unknown")
    return PetzMappingOut(
        id=mapping.id,
        product_id=mapping.product_id,
        gtin=gtin,
        petz_product_id=mapping.petz_product_id,
        product_url=mapping.product_url,
        search_query=mapping.search_query,
        match_status=mapping.match_status,
        match_confidence=mapping.match_confidence,
        variant_label=mapping.variant_label,
        variant_weight_kg=mapping.variant_weight_kg,
        rejection_reason=mapping.rejection_reason,
        last_verified_at=mapping.last_verified_at,
        created_at=mapping.created_at,
        updated_at=mapping.updated_at,
    )


@router.get("/coverage", response_model=PetzCoverageOut)
def get_coverage(db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    return PetzCoverageOut(**coverage_stats(db))


@router.get("/products/{gtin}/status", response_model=PetzMappingOut)
def get_status(gtin: str, db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    product = _resolve_product(db, gtin)
    mapping = get_mapping(db, product.id)
    return _to_out(mapping, product.barcode_normalized)


@router.get("/products/{gtin}/suggest", response_model=PetzMappingSuggestOut)
def get_suggestion(gtin: str, db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    """Gera/atualiza a query de busca sugerida — NUNCA busca na Petz, só
    monta o texto pra um humano pesquisar manualmente (ver
    petz_mapping.build_petz_search_query)."""
    product = _resolve_product(db, gtin)
    mapping = suggest_petz_candidate(
        db, product.id, gtin=product.barcode_normalized, brand=product.brand, name=product.name,
    )
    return PetzMappingSuggestOut(
        gtin=product.barcode_normalized,
        search_query=mapping.search_query,
        current_status=mapping.match_status,
    )


@router.post("/products/{gtin}/confirm", response_model=PetzMappingOut)
def confirm(
    gtin: str,
    payload: PetzMappingConfirmRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    """Confirmação humana do PRODUTO (petz_product_id + URL direta +
    variante) — não vincula link afiliado nem publica oferta sozinho."""
    product = _resolve_product(db, gtin)
    try:
        validate_petz_affiliate_url(payload.product_url)
    except InvalidPetzAffiliateUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    mapping = confirm_petz_mapping(
        db,
        product.id,
        petz_product_id=payload.petz_product_id,
        product_url=payload.product_url,
        variant_label=payload.variant_label,
        variant_weight_kg=payload.variant_weight_kg,
        match_confidence=payload.match_confidence,
    )
    return _to_out(mapping, product.barcode_normalized)


@router.post("/products/{gtin}/reject", response_model=PetzMappingOut)
def reject(
    gtin: str,
    payload: PetzMappingRejectRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    product = _resolve_product(db, gtin)
    mapping = reject_petz_candidate(db, product.id, reason=payload.reason)
    return _to_out(mapping, product.barcode_normalized)


@router.post("/products/{gtin}/affiliate-link", response_model=PetzMappingOut)
def set_affiliate_link(
    gtin: str,
    payload: PetzSetAffiliateLinkRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    """Promove um mapping já confirmado pra 'affiliate_ready' — cria/
    atualiza o ProductAffiliateLink(merchant="petz") real. Único caminho
    que faz a Petz de fato aparecer no CommerceEngine (ver
    petz_provider.py). Exige match_status já confirmado — nunca vincula
    link afiliado a um produto ainda não confirmado."""
    product = _resolve_product(db, gtin)
    mapping = get_mapping(db, product.id)
    if mapping is None or mapping.match_status not in _CONFIRMABLE_FOR_AFFILIATE:
        raise HTTPException(
            status_code=409,
            detail="Produto precisa estar com match_status=confirmed antes de vincular link afiliado",
        )

    try:
        validate_petz_affiliate_url(payload.affiliate_product_url)
    except InvalidPetzAffiliateUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    link = db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product.id,
            ProductAffiliateLink.merchant == "petz",
        )
    )
    if link is None:
        link = ProductAffiliateLink(
            product_id=product.id,
            merchant="petz",
            affiliate_product_url=payload.affiliate_product_url,
            direct_product_url=mapping.product_url,
            affiliate_program="petz_partner",
            active=True,
        )
        db.add(link)
    else:
        link.affiliate_product_url = payload.affiliate_product_url
        link.direct_product_url = mapping.product_url
        link.affiliate_program = "petz_partner"
        link.active = True
    link.verified_at = datetime.now(timezone.utc)

    mapping.match_status = "affiliate_ready"
    mapping.last_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(mapping)
    return _to_out(mapping, product.barcode_normalized)


@router.delete("/products/{gtin}/affiliate-link", response_model=DeletedOut)
def remove_affiliate_link(gtin: str, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    """Remove o link afiliado (ex: comissão nunca comprovada por venda
    real) — o mapping de produto (confirmed) permanece, só a
    monetização é desfeita, voltando o produto a 'confirmed'."""
    product = _resolve_product(db, gtin)
    link = db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product.id,
            ProductAffiliateLink.merchant == "petz",
        )
    )
    if link:
        db.delete(link)

    mapping = get_mapping(db, product.id)
    if mapping and mapping.match_status == "affiliate_ready":
        mapping.match_status = "confirmed"

    db.commit()
    return DeletedOut()

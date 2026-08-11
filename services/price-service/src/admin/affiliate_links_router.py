"""Admin CRUD para links afiliados por produto/GTIN — cadastro manual
enquanto não há API oficial da rede (ex: painel Cobasi MAIS) para gerar
deep links automaticamente. Ver docs/AFFILIATES.md.
"""
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..affiliate_links import InvalidAffiliateUrlError, ProductAffiliateLink, validate_affiliate_url
from ..db import get_db
from ..product_catalog_lookup import ProductCatalog, normalize_gtin
from .deps import get_current_admin, get_current_admin_or_readonly_key
from .schemas import (
    AffiliateLinkCreateRequest,
    AffiliateLinkDetailOut,
    AffiliateLinkOut,
    AffiliateLinkUpdateRequest,
    AffiliateLinksListOut,
    DeletedOut,
)

router = APIRouter(prefix="/v1/admin/affiliate-links", tags=["Admin Affiliate Links"])


def _to_out(link: ProductAffiliateLink, gtin: str) -> AffiliateLinkOut:
    return AffiliateLinkOut(
        id=link.id,
        product_id=link.product_id,
        gtin=gtin,
        merchant=link.merchant,
        affiliate_product_url=link.affiliate_product_url,
        direct_product_url=link.direct_product_url,
        affiliate_program=link.affiliate_program,
        active=link.active,
        verified_at=link.verified_at,
        created_at=link.created_at,
        updated_at=link.updated_at,
    )


@router.get("", response_model=AffiliateLinksListOut)
def list_affiliate_links(
    gtin: Optional[str] = Query(default=None),
    merchant: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    query = select(ProductAffiliateLink, ProductCatalog.barcode_normalized).join(
        ProductCatalog, ProductCatalog.id == ProductAffiliateLink.product_id
    )
    if gtin:
        query = query.where(ProductCatalog.barcode_normalized == normalize_gtin(gtin))
    if merchant:
        query = query.where(ProductAffiliateLink.merchant == merchant.lower().strip())

    rows = db.execute(query).all()
    return AffiliateLinksListOut(data=[_to_out(link, gtin_value) for link, gtin_value in rows])


@router.post("", response_model=AffiliateLinkDetailOut, status_code=201)
def create_affiliate_link(
    payload: AffiliateLinkCreateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    gtin_normalized = normalize_gtin(payload.gtin)
    if not gtin_normalized:
        raise HTTPException(status_code=400, detail="GTIN inválido")

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        raise HTTPException(
            status_code=404,
            detail=f"Produto com GTIN {gtin_normalized} não encontrado em products_catalog — "
            "escaneie/cadastre o produto antes de vincular o link afiliado.",
        )

    merchant = payload.merchant.strip().lower()
    if not merchant:
        raise HTTPException(status_code=400, detail="merchant é obrigatório")

    try:
        validate_affiliate_url(payload.affiliate_product_url)
        if payload.direct_product_url:
            validate_affiliate_url(payload.direct_product_url)
    except InvalidAffiliateUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    existing = db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product.id,
            ProductAffiliateLink.merchant == merchant,
        )
    )
    if existing:
        raise HTTPException(
            status_code=409,
            detail=f"Já existe link para GTIN {gtin_normalized} + {merchant} (id={existing.id}) — use PATCH para atualizar",
        )

    link = ProductAffiliateLink(
        product_id=product.id,
        merchant=merchant,
        affiliate_product_url=payload.affiliate_product_url,
        direct_product_url=payload.direct_product_url,
        affiliate_program=payload.affiliate_program,
        active=payload.active,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return AffiliateLinkDetailOut(data=_to_out(link, gtin_normalized))


@router.patch("/{link_id}", response_model=AffiliateLinkDetailOut)
def update_affiliate_link(
    link_id: int,
    payload: AffiliateLinkUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    link = db.get(ProductAffiliateLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link não encontrado")

    if payload.affiliate_product_url is not None:
        try:
            validate_affiliate_url(payload.affiliate_product_url)
        except InvalidAffiliateUrlError as exc:
            raise HTTPException(status_code=400, detail=str(exc))
        link.affiliate_product_url = payload.affiliate_product_url

    if payload.direct_product_url is not None:
        if payload.direct_product_url:
            try:
                validate_affiliate_url(payload.direct_product_url)
            except InvalidAffiliateUrlError as exc:
                raise HTTPException(status_code=400, detail=str(exc))
        link.direct_product_url = payload.direct_product_url or None

    if payload.affiliate_program is not None:
        link.affiliate_program = payload.affiliate_program

    if payload.active is not None:
        link.active = payload.active

    if payload.verified is True:
        link.verified_at = datetime.now(timezone.utc)
    elif payload.verified is False:
        link.verified_at = None

    db.commit()
    db.refresh(link)

    product = db.get(ProductCatalog, link.product_id)
    return AffiliateLinkDetailOut(data=_to_out(link, product.barcode_normalized if product else ""))


@router.delete("/{link_id}", response_model=DeletedOut)
def delete_affiliate_link(
    link_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    link = db.get(ProductAffiliateLink, link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Link não encontrado")
    db.delete(link)
    db.commit()
    return DeletedOut()

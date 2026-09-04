"""Admin CRUD para MarketplaceOffer — link oficial de marketplace por
produto/GTIN (Shopee hoje). NUNCA gera/reescreve o link: só aceita o que
o Portal do Afiliado da rede realmente emitiu, validado por um allowlist
de domínio próprio de cada merchant (ver shopee_link_validator.py) — uma
URL rejeitada aqui nunca chega a ser cadastrada, mesmo por admin.
"""
from datetime import datetime, timezone
from typing import Callable, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..affiliate_links import MarketplaceOffer
from ..db import get_db
from ..mercadolivre_link_validator import InvalidMercadoLivreAffiliateUrlError, validate_mercadolivre_affiliate_url
from ..product_catalog_lookup import ProductCatalog, normalize_gtin
from ..shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_manual_shopee_affiliate_url
from .deps import get_current_admin, get_current_admin_or_readonly_key
from .schemas import (
    DeletedOut,
    MarketplaceOfferCreateRequest,
    MarketplaceOfferDetailOut,
    MarketplaceOfferOut,
    MarketplaceOfferUpdateRequest,
    MarketplaceOffersListOut,
)

router = APIRouter(prefix="/v1/admin/marketplace-offers", tags=["Admin Marketplace Offers"])

# Um validador por merchant marketplace conhecido — cadastro de um
# merchant sem validador aqui é rejeitado explicitamente (nunca aceita
# "qualquer https://" só porque não temos allowlist pronta ainda).
_LINK_VALIDATORS: dict[str, Callable[[str], str]] = {
    # Manual/admin CRUD — nunca chamado pelo sync automático (esse grava
    # direto via SQLAlchemy) — por isso usa a validação mais rigorosa, que
    # exige prova de rastreio da nossa conta, não só o domínio.
    "shopee": validate_manual_shopee_affiliate_url,
    "mercadolivre": validate_mercadolivre_affiliate_url,
}


def _validate_url_for_merchant(merchant: str, url: str) -> None:
    validator = _LINK_VALIDATORS.get(merchant)
    if validator is None:
        raise HTTPException(status_code=400, detail=f"Sem validador de link oficial para merchant={merchant!r}")
    try:
        validator(url)
    except (InvalidShopeeAffiliateUrlError, InvalidMercadoLivreAffiliateUrlError) as exc:
        raise HTTPException(status_code=400, detail=str(exc))


def _to_out(offer: MarketplaceOffer, gtin: str) -> MarketplaceOfferOut:
    return MarketplaceOfferOut(
        id=offer.id,
        product_id=offer.product_id,
        gtin=gtin,
        merchant=offer.merchant,
        affiliate_url=offer.affiliate_url,
        direct_url=offer.direct_url,
        seller_name=offer.seller_name,
        external_listing_id=offer.external_listing_id,
        price=offer.price,
        is_available=offer.is_available,
        active=offer.active,
        verified_at=offer.verified_at,
        created_at=offer.created_at,
        updated_at=offer.updated_at,
    )


@router.get("", response_model=MarketplaceOffersListOut)
def list_marketplace_offers(
    gtin: Optional[str] = Query(default=None),
    merchant: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    query = select(MarketplaceOffer, ProductCatalog.barcode_normalized).join(
        ProductCatalog, ProductCatalog.id == MarketplaceOffer.product_id
    )
    if gtin:
        query = query.where(ProductCatalog.barcode_normalized == normalize_gtin(gtin))
    if merchant:
        query = query.where(MarketplaceOffer.merchant == merchant.lower().strip())

    rows = db.execute(query).all()
    return MarketplaceOffersListOut(data=[_to_out(offer, gtin_value) for offer, gtin_value in rows])


@router.post("", response_model=MarketplaceOfferDetailOut, status_code=201)
def create_marketplace_offer(
    payload: MarketplaceOfferCreateRequest,
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
            "escaneie/cadastre o produto antes de vincular a oferta de marketplace.",
        )

    merchant = payload.merchant.strip().lower()
    if not merchant:
        raise HTTPException(status_code=400, detail="merchant é obrigatório")

    _validate_url_for_merchant(merchant, payload.affiliate_url)

    offer = MarketplaceOffer(
        product_id=product.id,
        merchant=merchant,
        affiliate_url=payload.affiliate_url,
        direct_url=payload.direct_url,
        seller_name=payload.seller_name,
        external_listing_id=payload.external_listing_id,
        price=payload.price,
        is_available=payload.is_available,
        active=payload.active,
    )
    db.add(offer)
    db.commit()
    db.refresh(offer)
    return MarketplaceOfferDetailOut(data=_to_out(offer, gtin_normalized))


@router.patch("/{offer_id}", response_model=MarketplaceOfferDetailOut)
def update_marketplace_offer(
    offer_id: int,
    payload: MarketplaceOfferUpdateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    offer = db.get(MarketplaceOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Oferta não encontrada")

    if payload.affiliate_url is not None:
        _validate_url_for_merchant(offer.merchant, payload.affiliate_url)
        offer.affiliate_url = payload.affiliate_url

    if payload.direct_url is not None:
        offer.direct_url = payload.direct_url or None
    if payload.seller_name is not None:
        offer.seller_name = payload.seller_name
    if payload.external_listing_id is not None:
        offer.external_listing_id = payload.external_listing_id
    if payload.price is not None:
        offer.price = payload.price
    if payload.is_available is not None:
        offer.is_available = payload.is_available
    if payload.active is not None:
        offer.active = payload.active

    if payload.verified is True:
        offer.verified_at = datetime.now(timezone.utc)
    elif payload.verified is False:
        offer.verified_at = None

    db.commit()
    db.refresh(offer)

    product = db.get(ProductCatalog, offer.product_id)
    return MarketplaceOfferDetailOut(data=_to_out(offer, product.barcode_normalized if product else ""))


@router.delete("/{offer_id}", response_model=DeletedOut)
def delete_marketplace_offer(
    offer_id: int,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    offer = db.get(MarketplaceOffer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Oferta não encontrada")
    db.delete(offer)
    db.commit()
    return DeletedOut()

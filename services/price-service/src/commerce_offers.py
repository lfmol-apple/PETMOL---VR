"""
Oferta comercial monetizável para "Comprar novamente" (Loja do/da Pet).

Construído sobre CommerceEngine (commerce_provider.py) + CobasiProvider
(cobasi_provider.py) — discovery dinâmico (preço real via API pública VTEX
da Cobasi) sempre roda primeiro; ProductAffiliateLink é uma estratégia de
MONETIZAÇÃO (hoje a única real), não uma pré-condição para buscar o
produto. Ver docs/AFFILIATES.md.

resolve_cobasi_product_offer segue existindo como wrapper de
compatibilidade em torno do engine (mesma assinatura/formato de sempre) —
GET /commerce/product-offer não muda. GET /commerce/offers (novo, multi-
provider, lista ordenada por preço) é o caminho recomendado para código
novo; usa a mesma build_default_engine().

Adicionar um provider novo (Amazon/Shopee/ML/Petz, quando aprovados) é
só acrescentar em build_default_engine() — nenhuma tela precisa saber
quantos providers existem.
"""
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from .cobasi_provider import CobasiProvider
from .commerce_provider import CommerceEngine, CommerceProvider, MonetizedOffer, ProductContext


class ProductOfferResult(BaseModel):
    found: bool
    merchant: str = "cobasi"
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    url: Optional[str] = None
    link_type: Optional[str] = None  # "affiliate_product" | "direct" (dev only)


class CommerceOfferOut(BaseModel):
    merchant: str
    url: str
    link_type: str
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None


_NOT_FOUND = ProductOfferResult(found=False)


def build_default_engine(db: Session) -> CommerceEngine:
    """Lista central de providers ativos. Novo provider = uma linha aqui."""
    providers: list[CommerceProvider] = [CobasiProvider(db)]
    return CommerceEngine(providers)


def _to_result(offer: MonetizedOffer) -> ProductOfferResult:
    return ProductOfferResult(
        found=True,
        merchant=offer.merchant,
        product_name=offer.product_name,
        brand=offer.brand,
        price=offer.price,
        list_price=offer.list_price,
        is_available=offer.is_available,
        url=offer.url,
        link_type=offer.link_type,
    )


async def resolve_cobasi_product_offer(
    db: Session,
    query: Optional[str] = None,
    target_weight_kg: Optional[float] = None,
    *,
    gtin: Optional[str] = None,
    product_id: Optional[int] = None,
) -> ProductOfferResult:
    offers = await get_commerce_offers(db, query, target_weight_kg, gtin=gtin, product_id=product_id)
    if not offers:
        return _NOT_FOUND
    return _to_result(offers[0])


async def get_commerce_offers(
    db: Session,
    query: Optional[str] = None,
    target_weight_kg: Optional[float] = None,
    *,
    gtin: Optional[str] = None,
    product_id: Optional[int] = None,
    name: Optional[str] = None,
    brand: Optional[str] = None,
) -> list[MonetizedOffer]:
    """`query`/`target_weight_kg` continuam funcionando exatamente como
    antes (compatibilidade). `gtin`/`product_id`/`name`/`brand` são novos
    e opcionais — quando o frontend souber o GTIN do produto (ex: já
    escaneado), passar aqui é o caminho preferido pra providers
    estruturados (ex: AwinFeedProvider, que só resolve por GTIN exato,
    nunca por texto). Providers de busca textual (Cobasi/VTEX hoje)
    continuam usando `query`."""
    engine = build_default_engine(db)
    context = ProductContext(
        query=query,
        weight_kg=target_weight_kg,
        gtin=gtin,
        product_id=product_id,
        name=name,
        brand=brand,
    )
    return await engine.get_offers(context)

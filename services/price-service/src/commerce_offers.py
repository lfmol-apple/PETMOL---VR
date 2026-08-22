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

from .awin_advertisers import AWIN_ADVERTISERS, is_awin_merchant_registrable
from .awin_feed_provider import AwinFeedProvider
from .cobasi_provider import CobasiProvider
from .commerce_provider import CommerceEngine, CommerceProvider, MonetizedOffer, ProductContext
from .marketplace_offer_provider import MarketplaceOfferProvider

# Merchants marketplace conhecidos (Shopee hoje) — sempre registrados,
# nunca condicionado a settings aqui: is_marketplace_merchant_publicly_servable()
# é revalidada dentro de find_offer()/monetize() a cada chamada (defesa em
# profundidade, mesmo padrão do AwinFeedProvider) — sem custo de rede
# nenhum em registrar sem uso (só lê Postgres local quando de fato chamado).
_MARKETPLACE_MERCHANTS = ("shopee",)


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
    """Lista central de providers ativos — usada por TODO endpoint
    público (/commerce/offers, /commerce/awin-search). Novo provider
    MANUAL (Amazon/Shopee/ML/Petz direto, quando aprovados — sem feed
    estruturado) = uma linha aqui.

    Providers Awin (feed estruturado) são genéricos — um AwinFeedProvider
    por merchant em is_awin_merchant_registrable(), que combina o master
    gate global (config.awin_enabled/awin_shadow_mode) com o status
    técnico de cada merchant (awin_advertisers.py) E o mecanismo de teste
    por GTIN único (config.awin_test_gtin — ver docs/AFFILIATES.md §7).
    "Registrável" é mais permissivo que "publicamente liberado" de
    propósito: com awin_test_gtin configurado, o provider precisa
    existir pra poder resolver JUSTO aquele produto, mesmo com
    awin_enabled=False pro resto do catálogo — cada chamada de
    find_offer()/monetize() revalida por conta própria se é o GTIN de
    teste ou se o merchant está publicamente liberado de verdade (defesa
    em profundidade — ver awin_feed_provider.py). Sem nenhum dos dois
    (caso comum), NENHUM AwinFeedProvider é registrado. Zee Dog já entra
    por esse caminho genérico; quando Petz/Zee Now forem aprovados e
    sincronizados, entram sem editar este arquivo (só awin_advertisers.py
    muda).

    merchant_routes.MERCHANT_ROUTE_POLICIES["cobasi"] decide qual rota
    vence quando mais de um provider resolver a mesma oferta — trocar
    isso exige validar comissão real antes (ver docs/AFFILIATES.md).

    Providers de marketplace (Shopee hoje) seguem o mesmo padrão dos
    Awin: sempre registrados, gate real (config.shopee_affiliate_enabled)
    checado dentro de MarketplaceOfferProvider a cada chamada — nunca
    aparecem em produção sem a flag ligada, mesmo que MarketplaceOffer
    tenha linhas cadastradas (ver marketplace_offer_provider.py).

    Amazon MVP (link de busca com tag, sem preço/API estruturada) NÃO
    entra aqui — CommerceEngine descarta qualquer oferta sem preço, então
    não há o que "descobrir"; o mecanismo real vive inteiramente no
    frontend (amazonAffiliate.ts + homeShoppingPartners.ts), não neste
    engine de comparação de preço."""
    # Awin primeiro, CobasiProvider (MAIS) depois: CobasiProvider.should_run()
    # decide se vale a pena rodar com base em ofertas Awin já resolvidas
    # nesta mesma chamada (ver cobasi_provider.py) — só funciona se Awin já
    # tiver rodado antes dele na lista.
    providers: list[CommerceProvider] = []
    for merchant in AWIN_ADVERTISERS:
        if is_awin_merchant_registrable(merchant):
            providers.append(AwinFeedProvider(db, merchant))
    providers.append(CobasiProvider(db))
    for merchant in _MARKETPLACE_MERCHANTS:
        providers.append(MarketplaceOfferProvider(db, merchant))
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

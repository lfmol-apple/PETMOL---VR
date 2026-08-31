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

Adicionar um provider novo (Shopee/ML/Petz, quando aprovados) é
só acrescentar em build_default_engine() — nenhuma tela precisa saber
quantos providers existem.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from .awin_advertisers import AWIN_SELLABLE_MERCHANTS, AWIN_ADVERTISERS, is_awin_merchant_registrable
from .awin_feed_provider import AwinFeedProvider
from .cobasi_provider import CobasiProvider
from .commerce_provider import CommerceEngine, CommerceProvider, MonetizedOffer, ProductContext
from .marketplace_offer_provider import MarketplaceOfferProvider
from .mercadolivre_commerce_provider import MercadoLivreCommerceProvider, is_mercadolivre_commerce_publicly_servable
from .petz_provider import PetzProvider

# Merchants marketplace conhecidos (Shopee, Mercado Livre) — sempre
# registrados, nunca condicionado a settings aqui:
# is_marketplace_merchant_publicly_servable() é revalidada dentro de
# find_offer()/monetize() a cada chamada (defesa em profundidade, mesmo
# padrão do AwinFeedProvider) — sem custo de rede nenhum em registrar sem
# uso (só lê Postgres local quando de fato chamado). Mercado Livre fica
# invisível até mercadolivre_affiliate_enabled=true (hoje false — sem
# links cadastrados ainda, ver docs/AFFILIATES.md).
_MARKETPLACE_MERCHANTS = ("shopee", "mercadolivre")


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
    image_url: Optional[str] = None
    price_checked_at: Optional[datetime] = None
    price_is_stale: bool = False


_NOT_FOUND = ProductOfferResult(found=False)


def _normalize_species(value: Optional[str]) -> Optional[str]:
    """Normaliza pt-BR/en para o vocabulário interno ("dog"|"cat"). Qualquer
    outra coisa vira None (sem gate de espécie, não um gate errado)."""
    v = (value or "").strip().lower()
    if v in ("dog", "cão", "cao", "cachorro", "caes", "cães", "canino"):
        return "dog"
    if v in ("cat", "gato", "felino", "gata"):
        return "cat"
    return None


def build_default_engine(db: Session) -> CommerceEngine:
    """Lista central de providers ativos — usada por TODO endpoint
    público (/commerce/offers, /commerce/awin-search). Novo provider
    MANUAL (Shopee/ML/Petz direto, quando aprovados — sem feed
    estruturado) = uma linha aqui.

    Providers Awin (feed estruturado) são genéricos, mas só são
    registrados no engine público de compra quando o merchant também está
    em AWIN_SELLABLE_MERCHANTS — hoje sempre vazio: decisão de produto em
    29/08/2026, PETMOL nunca monetiza via Awin, pra nenhum merchant (ver
    docstring de AWIN_SELLABLE_MERCHANTS em awin_advertisers.py). O feed
    Awin de qualquer merchant (Cobasi incluída) continua alimentando
    busca por nome/foto/preço (AWIN_PUBLIC_COMMERCE_MERCHANTS, endpoint
    /commerce/awin-search) e enriquecimento interno de catálogo/GTIN —
    só não gera mais o link de "Comprar".

    Para merchants vendáveis, is_awin_merchant_registrable() combina o
    master gate global (config.awin_enabled/awin_shadow_mode) com o status
    técnico de cada merchant (awin_advertisers.py) E o mecanismo de teste
    por GTIN único (config.awin_test_gtin — ver docs/AFFILIATES.md §7).
    "Registrável" é mais permissivo que "publicamente liberado" de
    propósito: com awin_test_gtin configurado, o provider precisa
    existir pra poder resolver JUSTO aquele produto, mesmo com
    awin_enabled=False pro resto do catálogo — cada chamada de
    find_offer()/monetize() revalida por conta própria se é o GTIN de
    teste ou se o merchant está publicamente liberado de verdade (defesa
    em profundidade — ver awin_feed_provider.py). Sem nenhum dos dois
    (caso comum), NENHUM AwinFeedProvider é registrado.

    merchant_routes.MERCHANT_ROUTE_POLICIES["cobasi"] existe pra decidir
    qual rota vence SE mais de um provider algum dia resolver a mesma
    oferta pro mesmo merchant — hoje, com AWIN_SELLABLE_MERCHANTS vazio,
    só CobasiProvider (rota "mais") produz oferta pra Cobasi, então não há
    disputa de fato. Mantido como circuit breaker documentado, não como
    lógica ativa.

    Providers de marketplace (Shopee hoje) seguem o mesmo padrão dos
    Awin: sempre registrados, gate real (config.shopee_affiliate_enabled)
    checado dentro de MarketplaceOfferProvider a cada chamada — nunca
    aparecem em produção sem a flag ligada, mesmo que MarketplaceOffer
    tenha linhas cadastradas (ver marketplace_offer_provider.py).

    Amazon está desativada desde 22/08/2026 e não entra aqui. Qualquer
    reativação futura exige novo provider oficial e nova tag aprovada.

    Petz (petz_provider.py) segue um padrão próprio, nem Awin nem
    marketplace: aprendizado por produto via ProductAffiliateLink,
    confirmado manualmente em admin/petz_router.py (ver
    docs/AFFILIATES.md §Petz). Sempre registrado; sem fonte de preço
    confirmada, nunca produz oferta pública hoje."""
    # AWIN_SELLABLE_MERCHANTS está vazio por decisão de produto (Awin nunca
    # monetiza) — este loop fica registrado como o "circuit breaker" pra
    # religar um merchant específico como vendável via Awin no futuro,
    # sem precisar reescrever a lógica. CobasiProvider (rota "mais") é
    # quem efetivamente monetiza Cobasi hoje.
    providers: list[CommerceProvider] = []
    for merchant in AWIN_ADVERTISERS:
        if merchant not in AWIN_SELLABLE_MERCHANTS:
            continue
        if is_awin_merchant_registrable(merchant):
            providers.append(AwinFeedProvider(db, merchant))
    providers.append(CobasiProvider(db))
    if is_mercadolivre_commerce_publicly_servable():
        providers.append(MercadoLivreCommerceProvider())
    for merchant in _MARKETPLACE_MERCHANTS:
        providers.append(MarketplaceOfferProvider(db, merchant))
    # Petz (aprendizado por produto, ver petz_provider.py/petz_mapping.py):
    # sempre registrado, gate real (config.petz_affiliate_enabled) checado
    # dentro do provider a cada chamada — hoje nunca produz oferta pública
    # de qualquer forma, porque não existe fonte de preço Petz confirmada
    # (ver docstring de petz_provider.py).
    providers.append(PetzProvider(db))
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
    species: Optional[str] = None,
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
        species=_normalize_species(species),
    )
    return await engine.get_offers(context)

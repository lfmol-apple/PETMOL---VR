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
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .awin_advertisers import AWIN_SELLABLE_MERCHANTS, AWIN_ADVERTISERS, is_awin_merchant_registrable
from .awin_feed_provider import AwinFeedProvider
from .cobasi_provider import CobasiProvider
from .commerce_provider import CommerceEngine, CommerceProvider, MonetizedOffer, ProductContext
from .marketplace_offer_provider import MarketplaceOfferProvider
from .mercadolivre_commerce_provider import MercadoLivreCommerceProvider, is_mercadolivre_commerce_publicly_servable
from .petz_provider import PetzProvider
from .product_identity import MerchantCandidate, ProductIdentity, evaluate_identity
from .product_catalog_lookup import ProductCatalog, normalize_gtin

# Merchants marketplace conhecidos (Shopee, Mercado Livre) — sempre
# registrados, nunca condicionado a settings aqui:
# is_marketplace_merchant_publicly_servable() é revalidada dentro de
# find_offer()/monetize() a cada chamada (defesa em profundidade, mesmo
# padrão do AwinFeedProvider) — sem custo de rede nenhum em registrar sem
# uso (só lê Postgres local quando de fato chamado). Mercado Livre fica
# invisível até mercadolivre_affiliate_enabled=true (hoje false — sem
# links cadastrados ainda, ver docs/AFFILIATES.md).
_MARKETPLACE_MERCHANTS = ("shopee", "mercadolivre")

# Quanto get_commerce_offers_with_status espera pelo enriquecimento sob
# demanda (ver _ensure_enriched_within) antes de devolver
# status="enrichment_pending" em vez de travar a resposta. Módulo-level
# (em vez de literal inline) só pra testes conseguirem encurtar isso e
# simular "enriquecimento mais lento que o prazo" sem sleeps longos de
# verdade — produção sempre usa o valor real abaixo.
ENRICHMENT_WAIT_TIMEOUT_SECONDS = 2.5


class ProductOfferResult(BaseModel):
    found: bool
    merchant: str = "cobasi"
    canonical_product_id: Optional[int] = None
    canonical_gtin: Optional[str] = None
    canonical_name: Optional[str] = None
    canonical_brand: Optional[str] = None
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
    canonical_product_id: Optional[int] = None
    canonical_gtin: Optional[str] = None
    canonical_name: Optional[str] = None
    canonical_brand: Optional[str] = None
    canonical_image_url: Optional[str] = None
    product_name: Optional[str] = None
    brand: Optional[str] = None
    price: Optional[float] = None
    list_price: Optional[float] = None
    is_available: Optional[bool] = None
    image_url: Optional[str] = None
    price_checked_at: Optional[datetime] = None
    price_is_stale: bool = False
    merchant_product_name: Optional[str] = None
    match_decision: Optional[str] = None
    match_confidence: Optional[float] = None
    match_reasons: Optional[list[str]] = None
    match_attributes: Optional[list[dict[str, Any]]] = None
    origin_gtin: Optional[str] = None
    origin_product_name: Optional[str] = None
    sku_group_id: Optional[str] = None
    sku_group_basis: Optional[str] = None
    sku_group_confidence: Optional[float] = None


_NOT_FOUND = ProductOfferResult(found=False)


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
        canonical_product_id=offer.canonical_product_id,
        canonical_gtin=offer.canonical_gtin,
        canonical_name=offer.canonical_name,
        canonical_brand=offer.canonical_brand,
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


# Uma tarefa de enriquecimento em voo por produto, por worker — reusada por
# chamadas concorrentes/retries pro MESMO produto enquanto a 1ª ainda não
# terminou, em vez de disparar uma thread duplicada fazendo o mesmo
# trabalho. `asyncio.shield` é essencial: sem ele, o `wait_for` de uma
# chamada que desiste no timeout cancelaria a tarefa e uma chamada
# seguinte que tentasse reaproveitá-la via `await` receberia
# CancelledError em vez do resultado real (a thread em si continuaria
# rodando de qualquer forma — só o bookkeeping do asyncio seria afetado).
_enrichment_tasks: dict[int, "asyncio.Task[None]"] = {}


async def _ensure_enriched_within(product_id: int, timeout: float) -> bool:
    """True = produto enriquecido dentro do prazo (dado atualizado pronto
    pra uso nesta mesma chamada). False = ainda não — a tarefa continua
    rodando em segundo plano (nunca cancelada) e persiste no banco quando
    terminar, então uma chamada seguinte (retry do frontend ou nova
    requisição) sempre encontra o produto já enriquecido."""
    task = _enrichment_tasks.get(product_id)
    if task is None or task.done():
        task = asyncio.ensure_future(asyncio.to_thread(_enrich_catalog_blocking, product_id))
        _enrichment_tasks[product_id] = task
    try:
        await asyncio.wait_for(asyncio.shield(task), timeout=timeout)
        return True
    except Exception:  # noqa: BLE001 — TimeoutError ou qualquer falha do enriquecimento
        return False
    finally:
        if task.done():
            _enrichment_tasks.pop(product_id, None)


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
    """Compatibilidade: mesma assinatura/retorno de sempre (lista de
    ofertas), usada por toda a suíte de testes e por resolve_cobasi_product_offer.
    Quem precisa saber se a lista vazia é "sem oferta mesmo" ou "identidade
    ainda em preparo" (ver get_commerce_offers_with_status) usa a variante
    abaixo — hoje só a rota HTTP /commerce/offers."""
    offers, _status = await get_commerce_offers_with_status(
        db, query, target_weight_kg, gtin=gtin, product_id=product_id, name=name, brand=brand,
    )
    return offers


async def get_commerce_offers_with_status(
    db: Session,
    query: Optional[str] = None,
    target_weight_kg: Optional[float] = None,
    *,
    gtin: Optional[str] = None,
    product_id: Optional[int] = None,
    name: Optional[str] = None,
    brand: Optional[str] = None,
) -> tuple[list[MonetizedOffer], str]:
    """`query`/`target_weight_kg` continuam funcionando exatamente como
    antes (compatibilidade). `gtin`/`product_id`/`name`/`brand` são novos
    e opcionais — quando o frontend souber o GTIN do produto (ex: já
    escaneado), passar aqui é o caminho preferido pra providers
    estruturados (ex: AwinFeedProvider, que só resolve por GTIN exato,
    nunca por texto). Providers de busca textual (Cobasi/VTEX hoje)
    continuam usando `query`.

    Retorna (offers, status). status="enrichment_pending" SÓ quando o
    produto nunca foi enriquecido e o enriquecimento não terminou a tempo
    desta chamada — nesse caso `offers` pode vir vazia sem que isso
    signifique "produto sem oferta". Em qualquer outro caso, status="ready"
    e a lista (vazia ou não) é definitiva. Ver BUG 11/09/2026 abaixo."""
    product = _resolve_catalog_product(db, gtin=gtin, product_id=product_id)
    status = "ready"
    if product is not None and getattr(product, "identity_enriched_at", None) is None and product.barcode_normalized:
        # Enriquecimento sob demanda SÓ pra produto nunca enriquecido, e
        # fora do event loop (merge_product_catalog_identity é síncrono e
        # pesado — bloqueava o worker, ver incidente 2026-09-01).
        #
        # BUG ENCONTRADO 11/09/2026: a versão anterior deste código
        # (PR #358) limitava a espera a 2.5s, mas ao estourar o prazo
        # devolvia silenciosamente uma lista vazia — indistinguível de
        # "este produto não tem oferta" pro frontend, que tratava isso
        # como resposta definitiva e nunca tentava de novo. O
        # enriquecimento terminava sozinho pouco depois e gravava no
        # banco, mas ninguém voltava a perguntar: 1ª chamada pra um
        # produto novo sempre vinha vazia pro usuário; só reabrindo o
        # app (nova consulta, produto já enriquecido) o preço aparecia.
        # Fix: quando o prazo estoura, sinaliza status="enrichment_pending"
        # em vez de fingir que "ready, sem oferta" — a rota HTTP devolve
        # isso ao frontend, que faz um retry curto e automático (ver
        # useCommerceOffers.ts) até o enriquecimento (que continua rodando
        # em segundo plano, nunca cancelado) terminar — tudo na MESMA
        # abertura do app, sem exigir fechar/reabrir.
        enriched_in_time = await _ensure_enriched_within(product.id, timeout=ENRICHMENT_WAIT_TIMEOUT_SECONDS)
        if enriched_in_time:
            db.expire(product)
            product = db.get(ProductCatalog, product.id) or product
        else:
            status = "enrichment_pending"
    canonical_gtin = normalize_gtin(product.barcode_normalized) if product else normalize_gtin(gtin or "")
    canonical_name = (product.canonical_name or product.name) if product else (name or query)
    canonical_brand = (product.canonical_brand or product.brand) if product else brand
    canonical_image_url = _resolve_canonical_image_url(db, product=product, gtin=canonical_gtin or gtin)
    engine = build_default_engine(db)
    context = ProductContext(
        query=query,
        weight_kg=target_weight_kg,
        gtin=canonical_gtin or gtin,
        product_id=product.id if product else product_id,
        name=canonical_name,
        brand=canonical_brand,
        species=product.species if product else None,
        category=product.category if product else None,
        canonical_name=canonical_name,
        canonical_brand=canonical_brand,
        canonical_image_url=canonical_image_url,
    )
    offers = await engine.get_offers(context)
    for o in offers:
        if o.origin_gtin is None:
            o.origin_gtin = o.canonical_gtin or canonical_gtin

    sibling_offers = await _sku_group_sibling_offers(
        db, engine, product,
        canonical_gtin=canonical_gtin, canonical_name=canonical_name,
        canonical_brand=canonical_brand, canonical_image_url=canonical_image_url,
        query=query, target_weight_kg=target_weight_kg, primary=offers,
    )
    if sibling_offers:
        offers = _merge_group_offers(offers, sibling_offers)
        offers.sort(key=lambda o: o.price if o.price is not None else float("inf"))
    return offers, status


def _merge_group_offers(primary: list, siblings: list) -> list:
    """Aditivo: a primária vence por merchant SE tiver preço fresco. Se a
    primária daquele merchant está sem preço/stale e a irmã tem preço
    fresco, a irmã substitui (mesmo produto físico, código irmão). Nunca
    reduz o total de opções."""
    fresh_primary = {o.merchant for o in primary if o.price is not None and not o.price_is_stale}
    kept_primary = [o for o in primary if o.merchant in fresh_primary]
    stale_primary = [o for o in primary if o.merchant not in fresh_primary]
    covered = set(fresh_primary)
    out = list(kept_primary)
    for o in siblings:
        if o.merchant in covered:
            continue
        if o.price is not None and not o.price_is_stale:
            out.append(o)
            covered.add(o.merchant)
    # merchants ainda sem oferta fresca: mantém a primária stale (fallback)
    for o in stale_primary:
        if o.merchant not in covered:
            out.append(o)
            covered.add(o.merchant)
    return out


async def _sku_group_sibling_offers(
    db: Session, engine, product: Optional[ProductCatalog], *,
    canonical_gtin: Optional[str], canonical_name: Optional[str],
    canonical_brand: Optional[str], canonical_image_url: Optional[str],
    query: Optional[str], target_weight_kg: Optional[float], primary: list,
) -> list:
    from .config import get_settings

    settings = get_settings()
    if not getattr(settings, "sku_grouping_enabled", True) or product is None or not canonical_gtin:
        return []
    # Custo: 1 chamada HTTP (Cobasi) por irmão. Só roda quando a primária
    # tem buraco de verdade — nenhuma oferta com preço fresco. "Uma loja
    # fresca e outra stale" não justifica o custo no caminho de request.
    if any(o.price is not None and not o.price_is_stale for o in primary):
        return []
    try:
        from .sku_grouping import resolve_sku_group_members
        from .product_identity import ProductIdentity, MerchantCandidate, evaluate_identity, IdentityDecision

        members = resolve_sku_group_members(db, canonical_gtin)[: settings.sku_grouping_max_siblings]
    except Exception:  # noqa: BLE001
        return []
    if not members:
        return []

    tutor_identity = ProductIdentity.from_catalog(product)
    out: list = []
    for m in members:
        sib = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == m.member_gtin))
        if sib is None:
            continue
        sib_ctx = ProductContext(
            query=query, weight_kg=target_weight_kg,
            gtin=sib.barcode_normalized, product_id=sib.id,
            name=sib.canonical_name or sib.name, brand=sib.canonical_brand or sib.brand,
            species=sib.species, category=sib.category,
            canonical_name=canonical_name, canonical_brand=canonical_brand,
            canonical_image_url=canonical_image_url,
        )
        try:
            sib_offers = await engine.get_offers(sib_ctx)
        except Exception:  # noqa: BLE001
            continue
        for o in sib_offers:
            # re-verificação em tempo de oferta: só descarta CONFLICT explícito
            title = o.merchant_product_name or ""
            if title:
                decision = evaluate_identity(
                    tutor_identity,
                    MerchantCandidate.build(merchant=o.merchant, title=title, gtin=None),
                ).decision
                if decision == IdentityDecision.CONFLICT:
                    continue
            o.origin_gtin = sib.barcode_normalized
            o.origin_product_name = sib.canonical_name or sib.name
            o.sku_group_id = m.group_key
            o.sku_group_basis = m.match_basis
            o.sku_group_confidence = m.confidence
            o.canonical_product_id = product.id
            o.canonical_gtin = canonical_gtin
            o.canonical_name = canonical_name
            o.canonical_brand = canonical_brand
            if canonical_image_url:
                o.canonical_image_url = canonical_image_url
            o.product_name = canonical_name or o.product_name
            o.match_reasons = [*(o.match_reasons or []), "SKU_GROUP_SIBLING"]
            out.append(o)
    return out


def _resolve_catalog_product(db: Session, *, gtin: Optional[str], product_id: Optional[int]) -> Optional[ProductCatalog]:
    if product_id is not None:
        product = db.get(ProductCatalog, product_id)
        if product is not None:
            return product
    gtin_normalized = normalize_gtin(gtin or "")
    if not gtin_normalized:
        return None
    return db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))


def _enrich_catalog_blocking(product_id: int) -> None:
    """Enriquecimento sob demanda pra produto NUNCA enriquecido. Roda em
    thread separada (asyncio.to_thread) com sessão própria — nunca no event
    loop, nunca na sessão da request. Best-effort."""
    from .catalog_enrichment import merge_product_catalog_identity
    from .db import SessionLocal

    with SessionLocal() as s:
        try:
            p = s.get(ProductCatalog, product_id)
            if p is None or not p.barcode_normalized or p.identity_enriched_at is not None:
                return
            merge_product_catalog_identity(s, p.barcode_normalized)
            s.commit()
        except Exception:  # noqa: BLE001
            s.rollback()


def _resolve_canonical_image_url(
    db: Session,
    *,
    product: Optional[ProductCatalog],
    gtin: Optional[str],
) -> Optional[str]:
    if product and product.thumbnail_url:
        return product.thumbnail_url

    gtin_normalized = normalize_gtin((product.barcode_normalized if product else None) or gtin or "")
    if gtin_normalized:
        exact = _feed_image_for_gtin(db, gtin_normalized)
        if exact:
            return exact

    if product is None:
        return None
    return _feed_image_for_identity(
        db,
        ProductIdentity.build(
            gtin=None,
            canonical_name=product.canonical_name or product.name,
            brand=product.canonical_brand or product.brand,
            species=product.species,
            category=product.category,
            weight_kg=product.weight_kg,
            volume_ml=product.volume_ml,
            length_cm=product.length_cm,
            pack_count=product.pack_count,
            animal_weight_range=(
                (product.animal_weight_min_kg, product.animal_weight_max_kg)
                if product.animal_weight_min_kg is not None and product.animal_weight_max_kg is not None
                else None
            ),
            breed_size=product.breed_size,
            breed=product.breed,
            image_url=None,
            evidence=("PRODUCT_CATALOG_IMAGE_FALLBACK",),
        ),
    )


def _feed_image_for_gtin(db: Session, gtin: str) -> Optional[str]:
    rows = list(db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.network == "awin",
            AffiliateFeedOffer.gtin == gtin,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.image_url.is_not(None),
        )
    ))
    if not rows:
        return None
    rows.sort(key=_feed_image_preference)
    return rows[0].image_url


def _feed_image_for_identity(db: Session, identity: ProductIdentity) -> Optional[str]:
    if not identity.canonical_name or not identity.brand:
        return None
    candidates = list(db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.network == "awin",
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.image_url.is_not(None),
            AffiliateFeedOffer.title.ilike(f"%{identity.brand}%"),
        ).limit(80)
    ))
    matches = []
    for row in candidates:
        result = evaluate_identity(
            identity,
            MerchantCandidate.build(
                merchant=row.merchant,
                title=row.title or "",
                gtin=row.gtin,
                brand=row.brand,
                category=row.category,
                price=row.price,
                external_id=row.external_product_id,
            ),
        )
        if result.accepted:
            matches.append(row)
    if not matches:
        return None
    matches.sort(key=_feed_image_preference)
    return matches[0].image_url


def _feed_image_preference(row: AffiliateFeedOffer) -> tuple[int, int, float]:
    merchant_rank = {"cobasi": 0, "zeenow": 1, "zeedog": 2}.get(row.merchant, 9)
    stock_rank = 0 if row.in_stock else 1
    price_rank = row.price if row.price is not None else float("inf")
    return merchant_rank, stock_rank, price_rank

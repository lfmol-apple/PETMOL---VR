"""
Cobertura de monetização por merchant — seção 19 da auditoria original,
corrigida em 25/08/2026 depois de um erro semântico real encontrado em
revisão do PR #69: o campo "monetized_products" contava
`PetzProductMapping` com `match_status` elegível como se fosse produto
MONETIZADO. Não é — "produto confirmado no catálogo Petz" (identidade)
e "comissão comprovada" (is_petz_publicly_servable()) são fatos
distintos por design (ver petz_provider.py). Chamar o primeiro de
"monetized" contradizia a própria regra que a auditoria existe pra
proteger.

Modelo corrigido — três contagens por merchant, nunca misturadas:
  - known_products: tamanho do catálogo PETMOL (products_catalog).
  - matched_products: identidade de produto confirmada NAQUELE
    merchant (só existe como conceito separado pra Petz — os outros
    merchants não têm uma etapa de "identidade confirmada sem link";
    lá, matched == commercially_linked pela própria natureza da
    tabela: uma linha em MarketplaceOffer/AffiliateFeedOffer com
    affiliate_url só existe quando alguém já colou um link real).
  - commercially_linked_products: existe um REGISTRO comercial real
    (link/feed/programa) pra aquele produto — mas isso ainda não
    significa que está sendo servido ao tutor agora (pode estar atrás
    de um master gate desligado).
  - publicly_servable_products: o que de fato pode aparecer pro tutor
    agora, respeitando TODOS os gates (master flags por merchant,
    shadow mode, etc.) — esta é a métrica que corresponde a
    "COMPROVADO" no vocabulário da auditoria (ver docs/AFFILIATES.md).
    coverage_percent é sempre sobre esta contagem, nunca sobre
    matched/linked sozinhos.

Petz especificamente (seção 12 da revisão): a monetização é GLOBAL por
cupom, não por produto — não existe "product_url individualmente
comercialmente comprovada". Por isso commercially_linked_products e
publicly_servable_products da Petz são sempre iguais entre si (ou os
matched_products inteiros, se is_petz_publicly_servable() for True; ou
zero, caso contrário) — nunca um número intermediário inventado por
mapping.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import MarketplaceOffer, ProductAffiliateLink
from .awin_advertisers import is_awin_merchant_publicly_servable
from .config import get_settings
from .marketplace_offer_provider import is_marketplace_merchant_publicly_servable
from .petz_mapping import DIRECT_LINK_ELIGIBLE_STATUSES, PetzProductMapping
from .petz_provider import is_petz_publicly_servable
from .product_catalog_lookup import ProductCatalog

_MARKETPLACE_MERCHANTS = ("shopee", "mercadolivre")
_AWIN_ONLY_RETAIL_MERCHANTS = ("zeenow", "zeedog")


@dataclass(frozen=True)
class MerchantCoverage:
    merchant: str
    known_products: int
    matched_products: int
    commercially_linked_products: int
    publicly_servable_products: int
    coverage_percent: Optional[float]
    pending_products: int


def _coverage(
    merchant: str,
    known_products: int,
    matched_products: int,
    commercially_linked_products: int,
    publicly_servable_products: int,
) -> MerchantCoverage:
    matched_products = min(matched_products, known_products)
    commercially_linked_products = min(commercially_linked_products, known_products)
    publicly_servable_products = min(publicly_servable_products, known_products)
    coverage_percent = (
        round(100 * publicly_servable_products / known_products, 1) if known_products else None
    )
    return MerchantCoverage(
        merchant=merchant,
        known_products=known_products,
        matched_products=matched_products,
        commercially_linked_products=commercially_linked_products,
        publicly_servable_products=publicly_servable_products,
        coverage_percent=coverage_percent,
        pending_products=known_products - publicly_servable_products,
    )


def _cobasi_cached_ids_query(active_only: bool = True):
    q = select(ProductAffiliateLink.product_id).where(ProductAffiliateLink.merchant == "cobasi")
    if active_only:
        q = q.where(ProductAffiliateLink.active.is_(True))
    return q


def _awin_matched_ids_query(merchant: str):
    return (
        select(ProductCatalog.id)
        .join(AffiliateFeedOffer, AffiliateFeedOffer.gtin == ProductCatalog.barcode_normalized)
        .where(
            AffiliateFeedOffer.merchant == merchant,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.affiliate_url.is_not(None),
        )
    )


def compute_monetization_coverage(db: Session) -> list[MerchantCoverage]:
    known_products = db.scalar(select(func.count(ProductCatalog.id))) or 0
    results: list[MerchantCoverage] = []

    # ── Petz ─────────────────────────────────────────────────────────
    # matched = identidade de produto confirmada (nunca depende do gate
    # comercial). commercially_linked/publicly_servable = tudo-ou-nada,
    # porque a comissão é um mecanismo global (cupom), não por produto.
    petz_matched = db.scalar(
        select(func.count(distinct(PetzProductMapping.product_id))).where(
            PetzProductMapping.match_status.in_(DIRECT_LINK_ELIGIBLE_STATUSES)
        )
    ) or 0
    petz_servable = petz_matched if is_petz_publicly_servable() else 0
    results.append(_coverage("petz", known_products, petz_matched, petz_servable, petz_servable))

    # ── Shopee / Mercado Livre ──────────────────────────────────────
    # Uma linha em MarketplaceOffer só existe quando um admin colou um
    # link oficial real (import_ml_offers.py / admin/marketplace_offers_router.py)
    # — matched e commercially_linked são o mesmo conjunto aqui.
    for merchant in _MARKETPLACE_MERCHANTS:
        linked = db.scalar(
            select(func.count(distinct(MarketplaceOffer.product_id))).where(
                MarketplaceOffer.merchant == merchant,
                MarketplaceOffer.active.is_(True),
            )
        ) or 0
        servable = linked if is_marketplace_merchant_publicly_servable(merchant) else 0
        results.append(_coverage(merchant, known_products, linked, linked, servable))

    # ── Cobasi ───────────────────────────────────────────────────────
    # Dois mecanismos independentes, cada um com seu próprio gate:
    # "cached" (ProductAffiliateLink, gated por cobasi_affiliate_mode)
    # e Awin (AffiliateFeedOffer, gated por is_awin_merchant_publicly_servable).
    # commercially_linked = união das duas fontes, sem depender de gate.
    # publicly_servable = união só das fontes cujo gate está aberto.
    cobasi_cached_ids = _cobasi_cached_ids_query()
    cobasi_awin_ids = _awin_matched_ids_query("cobasi")
    cobasi_linked = db.scalar(
        select(func.count(distinct(ProductCatalog.id))).where(
            ProductCatalog.id.in_(cobasi_cached_ids) | ProductCatalog.id.in_(cobasi_awin_ids)
        )
    ) or 0

    cobasi_mode_open = get_settings().cobasi_affiliate_mode != "disabled"
    cobasi_awin_open = is_awin_merchant_publicly_servable("cobasi")
    if cobasi_mode_open and cobasi_awin_open:
        cobasi_servable = cobasi_linked
    elif cobasi_mode_open:
        cobasi_servable = db.scalar(
            select(func.count(distinct(ProductCatalog.id))).where(ProductCatalog.id.in_(cobasi_cached_ids))
        ) or 0
    elif cobasi_awin_open:
        cobasi_servable = db.scalar(
            select(func.count(distinct(ProductCatalog.id))).where(ProductCatalog.id.in_(cobasi_awin_ids))
        ) or 0
    else:
        cobasi_servable = 0
    results.append(_coverage("cobasi", known_products, cobasi_linked, cobasi_linked, cobasi_servable))

    # ── Zee Now / Zee Dog (só Awin) ──────────────────────────────────
    for merchant in _AWIN_ONLY_RETAIL_MERCHANTS:
        linked = db.scalar(
            select(func.count(distinct(ProductCatalog.id))).select_from(ProductCatalog).where(
                ProductCatalog.id.in_(_awin_matched_ids_query(merchant))
            )
        ) or 0
        servable = linked if is_awin_merchant_publicly_servable(merchant) else 0
        results.append(_coverage(merchant, known_products, linked, linked, servable))

    return results

"""
Cobertura de monetização por merchant — seção 19 da auditoria de
monetização (25/08/2026, ver docs/AFFILIATES.md): responde "quantos dos
produtos que o PETMOL conhece já monetizam em cada loja, e quantos
faltam" (ex: "480 conhecidos, 120 já monetizam no ML, faltam 360").

Deliberadamente simples — uma consulta por merchant, sem framework novo.
"known_products" é sempre o tamanho do catálogo PETMOL (products_catalog);
"monetized_products" é a contagem de produtos com um registro de
monetização ativo daquele merchant, na tabela que de fato representa
monetização pra ele:
  - petz: PetzProductMapping com match_status "elegível a link direto"
    (mesmo critério de DIRECT_LINK_ELIGIBLE_STATUSES — não é a mesma
    coisa que "servível publicamente agora", que também depende do
    master gate is_petz_publicly_servable(); esta contagem é sobre dado
    cadastrado, não sobre o que está ligado hoje).
  - shopee / mercadolivre: MarketplaceOffer ativa.
  - cobasi / zeenow / zeedog (Awin): AffiliateFeedOffer ativa com GTIN
    batendo o catálogo — a Awin nunca tem uma linha "por produto PETMOL"
    cadastrada manualmente, o feed inteiro é a fonte.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from sqlalchemy import distinct, func, select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import MarketplaceOffer, ProductAffiliateLink
from .petz_mapping import DIRECT_LINK_ELIGIBLE_STATUSES, PetzProductMapping
from .product_catalog_lookup import ProductCatalog

_AWIN_RETAIL_MERCHANTS = ("cobasi", "zeenow", "zeedog")
_MARKETPLACE_MERCHANTS = ("shopee", "mercadolivre")


@dataclass(frozen=True)
class MerchantCoverage:
    merchant: str
    known_products: int
    monetized_products: int
    coverage_percent: Optional[float]
    unmonetized_products: int


def _coverage(merchant: str, known_products: int, monetized_products: int) -> MerchantCoverage:
    monetized_products = min(monetized_products, known_products)
    coverage_percent = round(100 * monetized_products / known_products, 1) if known_products else None
    return MerchantCoverage(
        merchant=merchant,
        known_products=known_products,
        monetized_products=monetized_products,
        coverage_percent=coverage_percent,
        unmonetized_products=known_products - monetized_products,
    )


def compute_monetization_coverage(db: Session) -> list[MerchantCoverage]:
    known_products = db.scalar(select(func.count(ProductCatalog.id))) or 0

    results: list[MerchantCoverage] = []

    petz_monetized = db.scalar(
        select(func.count(distinct(PetzProductMapping.product_id))).where(
            PetzProductMapping.match_status.in_(DIRECT_LINK_ELIGIBLE_STATUSES)
        )
    ) or 0
    results.append(_coverage("petz", known_products, petz_monetized))

    for merchant in _MARKETPLACE_MERCHANTS:
        monetized = db.scalar(
            select(func.count(distinct(MarketplaceOffer.product_id))).where(
                MarketplaceOffer.merchant == merchant,
                MarketplaceOffer.active.is_(True),
            )
        ) or 0
        results.append(_coverage(merchant, known_products, monetized))

    # Cobasi também tem a estratégia "cached" (ProductAffiliateLink),
    # independente do feed Awin — soma as duas fontes sem dupla-contagem
    # (um produto pode ter as duas, mas só conta uma vez).
    cobasi_cached_ids = select(ProductAffiliateLink.product_id).where(
        ProductAffiliateLink.merchant == "cobasi",
        ProductAffiliateLink.active.is_(True),
    )
    cobasi_awin_ids = (
        select(ProductCatalog.id)
        .join(AffiliateFeedOffer, AffiliateFeedOffer.gtin == ProductCatalog.barcode_normalized)
        .where(
            AffiliateFeedOffer.merchant == "cobasi",
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.affiliate_url.is_not(None),
        )
    )
    cobasi_monetized = db.scalar(
        select(func.count(distinct(ProductCatalog.id))).where(
            ProductCatalog.id.in_(cobasi_cached_ids) | ProductCatalog.id.in_(cobasi_awin_ids)
        )
    ) or 0
    results.append(_coverage("cobasi", known_products, cobasi_monetized))

    for merchant in ("zeenow", "zeedog"):
        monetized = db.scalar(
            select(func.count(distinct(ProductCatalog.id)))
            .join(AffiliateFeedOffer, AffiliateFeedOffer.gtin == ProductCatalog.barcode_normalized)
            .where(
                AffiliateFeedOffer.merchant == merchant,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.affiliate_url.is_not(None),
            )
        ) or 0
        results.append(_coverage(merchant, known_products, monetized))

    return results

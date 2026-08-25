"""
PetzProvider — implementação de CommerceProvider pra Petz.

Diferente de CobasiProvider (discovery dinâmico via API pública) e de
MarketplaceOfferProvider (Shopee, oferta de vendedor com preço
cacheado): a Petz não tem API/feed de preço confirmado hoje (ver
docs/AFFILIATES.md §Petz), então este provider NUNCA inventa preço — só
consulta um ProductAffiliateLink(merchant="petz") já confirmado (ver
petz_mapping.py + admin/petz_router.py). Sem preço real, find_offer()
sempre retorna price=None, e o CommerceEngine descarta a oferta antes
de chamar monetize() (ver commerce_provider.py) — mesma regra "sem
monetização real, não aparece" de todo o resto do CommerceEngine. Isso
é intencional, não um bug: enquanto não existir uma fonte de preço
Petz confiável, este provider nunca produz uma oferta pública.

Registrado sempre em commerce_offers.build_default_engine() (mesmo
padrão de MarketplaceOfferProvider) — is_petz_publicly_servable() é
revalidado a cada chamada de find_offer()/monetize() (defesa em
profundidade, mesmo padrão dos outros merchants), então ligar/desligar
petz_affiliate_enabled não exige tocar o CommerceEngine de novo.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import get_active_link
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .petz_link_validator import InvalidPetzAffiliateUrlError, validate_petz_affiliate_url
from .product_catalog_lookup import ProductCatalog, normalize_gtin

MERCHANT = "petz"


def is_petz_publicly_servable() -> bool:
    """Único ponto de decisão pra QUALQUER caminho público Petz — não só
    o CommerceEngine/PetzProvider, também GET /commerce/petz-direct-link
    (main.py) e qualquer outro que vier a existir. Mesmo papel de
    is_marketplace_merchant_publicly_servable/is_awin_merchant_publicly_servable,
    com uma condição a mais: exige as DUAS flags, não uma.

    petz_affiliate_enabled = rollout/kill-switch técnico.
    petz_coupon_attribution_verified = prova comercial separada — "o
    cupom PETTMOL realmente gera comissão" nunca foi validado com uma
    compra real (ver docs/PETZ_COMMISSION_VALIDATION.md). Produto
    confirmado no catálogo (petz_mapping.match_status) NUNCA é, sozinho,
    prova de monetização — são conceitos distintos por design."""
    settings = get_settings()
    return settings.petz_affiliate_enabled and settings.petz_coupon_attribution_verified


class PetzProvider:
    merchant = MERCHANT

    def __init__(self, db: Session):
        self._db = db

    def _resolve_product_id(self, context: ProductContext) -> Optional[int]:
        if context.product_id is not None:
            return context.product_id
        if context.gtin:
            gtin_normalized = normalize_gtin(context.gtin)
            if gtin_normalized:
                product = self._db.scalar(
                    select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
                )
                if product:
                    return product.id
        return None

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not is_petz_publicly_servable():
            return None

        product_id = self._resolve_product_id(context)
        if product_id is None:
            return None

        link = get_active_link(self._db, product_id, self.merchant)
        if link is None:
            return None

        product = self._db.get(ProductCatalog, product_id)
        return DiscoveredOffer(
            merchant=self.merchant,
            # price=None sempre — ver docstring do módulo. O
            # CommerceEngine descarta esta oferta automaticamente
            # (commerce_provider.py) sem precisar de gate extra aqui.
            price=None,
            direct_url=link.direct_product_url,
            image_url=product.thumbnail_url if product else None,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str, bool]]:
        # Nunca alcançado hoje na prática — CommerceEngine.get_offers()
        # já descarta a oferta por price=None antes de chamar monetize()
        # (ver find_offer() acima). Mantido correto pelo contrato de
        # CommerceProvider, pronto pro dia em que existir fonte de preço.
        if not is_petz_publicly_servable():
            return None

        product_id = self._resolve_product_id(context)
        if product_id is None:
            return None

        link = get_active_link(self._db, product_id, self.merchant)
        if link is None:
            return None

        # Revalida no momento do "clique" — defesa em profundidade,
        # mesmo padrão de marketplace_offer_provider.py. Nunca reescreve
        # a URL, só confirma que ainda é https + domínio oficial Petz.
        try:
            validate_petz_affiliate_url(link.affiliate_product_url)
        except InvalidPetzAffiliateUrlError:
            return None

        # is_manually_cached=True: link sempre cadastrado a partir de
        # confirmação humana (ver petz_mapping.py), nunca gerado por
        # template — mesma proteção que o link comprovado da Cobasi usa.
        return link.affiliate_product_url, "affiliate_product", "petz_partner", True

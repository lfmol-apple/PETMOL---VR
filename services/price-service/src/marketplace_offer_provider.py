"""
MarketplaceOfferProvider — implementação de CommerceProvider para
merchants tipo marketplace (Shopee hoje; Mercado Livre no mesmo formato
quando aprovado), lendo só MarketplaceOffer — nunca gera link, nunca
chama a rede do marketplace ao vivo, nunca scraping.

Diferente de AwinFeedProvider (sincroniza automaticamente via feed
externo em lote): aqui cada linha de MarketplaceOffer é cadastrada
manualmente por um admin, a partir do link oficial que o Portal do
Afiliado da rede emitiu (ver admin/marketplace_offers_router.py) — nunca
inventado/gerado por template. Um provider por merchant marketplace, não
um genérico "marketplace" — mesmo padrão de AwinFeedProvider(merchant).

CommerceEngine descarta qualquer DiscoveredOffer sem preço
(commerce_provider.py) — como nunca fazemos scraping de preço, uma
oferta só aparece quando o admin cadastrou um preço real junto do link;
sem isso, a oferta simplesmente não é visível por este caminho (não é um
bug, é a mesma regra "sem monetização real, não aparece" aplicada aqui).
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer, get_active_marketplace_offer
from .commerce_provider import DiscoveredOffer, ProductContext
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url

# Merchants marketplace conhecidos e seu validador de link oficial — só
# Shopee tem um hoje (Mercado Livre, quando aprovado, ganha o próprio
# validador aqui, nunca reaproveitando o da Shopee por semelhança).
_LINK_VALIDATORS = {
    "shopee": validate_shopee_affiliate_url,
}


def is_marketplace_merchant_publicly_servable(merchant: str) -> bool:
    """Único ponto de decisão pra 'este marketplace pode gerar uma oferta
    visível/clicável pro tutor agora' — mesmo papel de
    is_awin_merchant_publicly_servable, só que por enquanto cobre só
    Shopee (master gate config.shopee_affiliate_enabled). Consultado
    tanto no registro do provider (commerce_offers.py) quanto dentro de
    cada find_offer()/monetize() — defesa em profundidade, mesmo padrão
    do módulo Awin."""
    from .config import get_settings

    if merchant == "shopee":
        return get_settings().shopee_affiliate_enabled
    return False


class MarketplaceOfferProvider:
    """merchant ex: "shopee". Nunca "marketplace" genérico — Awin é rede,
    marketplace é um TIPO de merchant, cada um com suas próprias regras
    de compliance (ver docs/AFFILIATES.md)."""

    def __init__(self, db: Session, merchant: str):
        self.merchant = merchant
        self._db = db

    def _resolve_product_id(self, context: ProductContext) -> Optional[int]:
        if context.product_id is not None:
            return context.product_id
        if not context.gtin:
            return None
        gtin_normalized = normalize_gtin(context.gtin)
        if not gtin_normalized:
            return None
        product = self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
        )
        return product.id if product else None

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not is_marketplace_merchant_publicly_servable(self.merchant):
            return None

        product_id = self._resolve_product_id(context)
        if product_id is None:
            return None

        offer = get_active_marketplace_offer(self._db, product_id, self.merchant)
        if offer is None:
            return None

        return DiscoveredOffer(
            merchant=self.merchant,
            price=offer.price,
            is_available=offer.is_available,
            direct_url=offer.direct_url,
            external_id=str(offer.id),
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str, bool]]:
        if not is_marketplace_merchant_publicly_servable(self.merchant):
            return None
        if not offer.external_id:
            return None

        row = self._db.get(MarketplaceOffer, int(offer.external_id))
        if not row or not row.active:
            return None

        # Revalida domínio/esquema no momento do clique — defesa em
        # profundidade, não confia só na validação feita no cadastro
        # admin (ver marketplace_offers_router.py). Nunca reescreve a
        # URL, só confirma que ainda é https + domínio oficial.
        validator = _LINK_VALIDATORS.get(self.merchant)
        if validator:
            try:
                validator(row.affiliate_url)
            except InvalidShopeeAffiliateUrlError:
                return None

        # is_manually_cached=True: é sempre um link cadastrado manualmente
        # a partir do Portal do Afiliado, nunca gerado por template — mesma
        # proteção que o link comprovado da Cobasi usa (cobasi_provider.py).
        return row.affiliate_url, "affiliate_marketplace_offer", self.merchant, True

"""
PetzProvider — implementação de CommerceProvider pra Petz.

Diferente de CobasiProvider (discovery dinâmico via API pública) e de
MarketplaceOfferProvider (Shopee, oferta de vendedor com preço
cacheado): a Petz não tem API/feed de preço confirmado hoje (ver
docs/AFFILIATES.md §Petz), então este provider NUNCA inventa preço.
Ele reconhece um PetzProductMapping confirmado e retorna a página real
do produto como direct_url, sempre com price=None; o CommerceEngine
descarta essa oferta antes de chamar monetize() (ver
commerce_provider.py). A superfície pública "Ver na Petz" fica no
endpoint separado /commerce/petz-direct-link, que copia o cupom PETTMOL
e não depende de affiliate_product_url individual.

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

from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .petz_link_validator import InvalidPetzAffiliateUrlError, validate_petz_affiliate_url
from .petz_mapping import DIRECT_LINK_ELIGIBLE_STATUSES, get_mapping
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
    cupom PETTMOL realmente gera comissão" foi validado com uma compra
    real em 29/08/2026 (ver docs/PETZ_COMMISSION_VALIDATION.md), então
    esta flag passou a ser ligada explicitamente em produção. Produto
    confirmado no catálogo (petz_mapping.match_status) NUNCA é, sozinho,
    prova de monetização — continuam sendo conceitos distintos por
    design; o default no código continua False (defesa em profundidade,
    mesmo padrão de petz_affiliate_enabled) — produção ativava as duas
    explicitamente via env.

    mesmo padrão de petz_affiliate_enabled) — produção ativava as duas
    explicitamente via env.

    DESATIVADO 2026-08-30 (decisão de produto): a Petz não oferece deep
    link de produto pra parceiros, então "Ver na Petz" só levava o cliente
    à busca do site — e a própria página de busca da Petz tem bugs fora do
    nosso controle (o link da foto abre outro produto / o app). Sem
    cooperação da Petz não dá pra fazer melhor.

    Kill-switch: `petz_publicly_disabled` (default True) desliga tudo sem
    mexer no env do VPS. Pra REATIVAR: flip o default pra False em
    config.py (ou PETZ_PUBLICLY_DISABLED=false no env). Todo o resto do
    caminho Petz (ponte /go/petz, openPetzPartnerStore, busca curada,
    PETZ_CURATED_SEARCH) continua no lugar, dormente."""
    settings = get_settings()
    if settings.petz_publicly_disabled:
        return False
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

        mapping = get_mapping(self._db, product_id)
        if mapping is None or mapping.match_status not in DIRECT_LINK_ELIGIBLE_STATUSES:
            return None
        if not mapping.product_url:
            return None

        product = self._db.get(ProductCatalog, product_id)
        return DiscoveredOffer(
            merchant=self.merchant,
            # price=None sempre — ver docstring do módulo. O
            # CommerceEngine descarta esta oferta automaticamente
            # (commerce_provider.py) sem precisar de gate extra aqui.
            price=None,
            direct_url=mapping.product_url,
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

        mapping = get_mapping(self._db, product_id)
        if mapping is None or mapping.match_status not in DIRECT_LINK_ELIGIBLE_STATUSES:
            return None
        if not offer.direct_url:
            return None

        # Revalida no momento do "clique" — defesa em profundidade,
        # mesmo padrão de marketplace_offer_provider.py. Nunca reescreve,
        # concatena nem adiciona parâmetros: só confirma domínio oficial.
        try:
            validate_petz_affiliate_url(offer.direct_url)
        except InvalidPetzAffiliateUrlError:
            return None

        # Petz Partner usa storefront + cupom; a URL específica de produto
        # é direta e só deve aparecer em superfícies que copiam PETTMOL.
        return offer.direct_url, "affiliate_store", "petz_partner", True

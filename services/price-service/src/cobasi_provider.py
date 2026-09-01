"""
CobasiProvider — implementação de CommerceProvider para a Cobasi.

find_offer(): caminho rápido e confiável, SEM busca ao vivo na VTEX no
clique (era lenta e instável — abria devagar ou nem abria). Dois casos,
ambos instantâneos e sem preço da Cobasi ("Conferir preço na Cobasi"):
  1. GTIN com link MAIS já cadastrado (ProductAffiliateLink) → serve esse
     produto exato — o caminho comprovado da ração do Baby, agora para
     QUALQUER produto pré-cadastrado.
  2. Sem pré-cadastro → manda para a busca daquele produto na vitrine
     afiliada "Minha Loja" (minhaloja.cobasi.com.br/busca?q=...), com a
     UTM MAIS anexada em monetize(). Sempre resolve, atribuição MAIS.
Roda para QUALQUER produto, sem depender de link afiliado cadastrado
previamente (ver commerce_provider.py para o princípio geral). O preço ao
vivo da VTEX segue disponível fora do caminho do clique (commerce_pricing
.fetch_cobasi_price, usado por /commerce/product-price e /commerce/product
-candidates).

monetize(): um link cadastrado manualmente (ProductAffiliateLink) SEMPRE
tem prioridade, em qualquer modo != "disabled" — nunca abandona um link
já comprovado (ex: Baby/mais.app/IvUCAG) só porque o modo global mudou.
Sem link cadastrado, o modo decide o que fazer com o restante do catálogo:
  - "cached" — sem link, não monetiza (em prod) ou cai pra URL crua só
    em dev (nunca em produção; affiliate_only_commerce_enforced).
  - "utm" — sem link, gera URL com UTM dinamicamente (cobasi_utm.py).
    Padrão desde 29/08/2026 — confirmado manualmente via painel MAIS (ver
    cobasi_utm.py e config.py::cobasi_affiliate_mode). Único caminho real
    de monetização da Cobasi hoje: Awin nunca gera link de compra (ver
    AWIN_SELLABLE_MERCHANTS em awin_advertisers.py, sempre vazio).
  - "api" — reservado para API oficial futura. Não implementado.
  - "disabled" — Cobasi nunca monetiza, nem link cadastrado é usado; ver
    should_run() abaixo — o provider nem roda nesse modo. Como Awin
    também nunca monetiza, "disabled" significa Cobasi sem NENHUMA
    oferta de compra.

route retornado é sempre "mais" (link cadastrado ou UTM — ambos via
programa MAIS da Cobasi) — historicamente usado por commerce_provider.py
pra nunca mostrar Cobasi duas vezes quando AwinFeedProvider("cobasi")
também estava registrado (ver merchant_routes.py); com
AWIN_SELLABLE_MERCHANTS vazio isso não acontece mais na prática, mas o
dedupe continua correto/documentado se essa decisão for revisitada.
is_manually_cached=True SÓ no branch de link cadastrado (nunca em
UTM/dev fallback) — blinda essa oferta específica contra qualquer troca
de PREFERRED_ROUTE_BY_MERCHANT no dedupe do CommerceEngine (ver
_dedupe_by_merchant).

should_run(): motivo pra pular find_offer() por completo:
cobasi_affiliate_mode == "disabled" — curto-circuito incondicional.
Fora isso, o provider sempre roda: com AWIN_SELLABLE_MERCHANTS vazio não
existe mais uma oferta Awin concorrente pra evitar redundância contra
(ver preferred_route_for()/merchant_routes.py — preferred_route="mais"
faz should_run() retornar True direto, sem checar offers_so_far).
"""
from __future__ import annotations

from typing import Optional
from urllib.parse import quote

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import get_active_link
from .cobasi_utm import InvalidCobasiUrlError, build_cobasi_affiliate_url, to_minha_loja_url
from .commerce_provider import DiscoveredOffer, MonetizedOffer, ProductContext
from .config import Settings, get_settings
from .merchant_routes import preferred_route_for
from .product_catalog_lookup import ProductCatalog, normalize_gtin

_MINHA_LOJA_SEARCH_BASE = "https://minhaloja.cobasi.com.br/busca"


def _build_query(context: ProductContext) -> str:
    if context.query:
        return context.query
    return " ".join(p for p in (context.brand, context.name) if p).strip()


def _minha_loja_search_url(query: str) -> str:
    """URL de busca daquele produto na vitrine afiliada "Minha Loja". A UTM
    MAIS é anexada depois, em monetize() (build_cobasi_affiliate_url)."""
    return f"{_MINHA_LOJA_SEARCH_BASE}?q={quote(query, safe='')}"


class CobasiProvider:
    merchant = "cobasi"

    def __init__(self, db: Session):
        self._db = db

    def should_run(self, context: ProductContext, offers_so_far: list[MonetizedOffer]) -> bool:
        if get_settings().cobasi_affiliate_mode == "disabled":
            return False
        if preferred_route_for(self.merchant) != "awin":
            return True
        has_existing_offer = any(o.merchant == self.merchant for o in offers_so_far)
        if not has_existing_offer:
            return True
        if context.gtin and self._has_manual_link(context.gtin):
            return True
        return False

    def _has_manual_link(self, gtin: str) -> bool:
        gtin_normalized = normalize_gtin(gtin)
        if not gtin_normalized:
            return False
        product = self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
        )
        if product is None:
            return False
        return get_active_link(self._db, product.id, self.merchant) is not None

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        # Caminho rápido — nunca uma busca ao vivo na VTEX no clique (ver
        # docstring do módulo). Oferta sem preço de propósito
        # (allow_without_price=True): "Conferir preço na Cobasi".
        gtin_normalized = normalize_gtin(context.gtin) if context.gtin else None
        catalog = self._resolve_catalog_by_gtin(gtin_normalized)

        # 1) Produto pré-cadastrado com link MAIS → serve esse produto exato
        #    (monetize()/_lookup_cached_link resolve o link pelo GTIN).
        if catalog is not None and get_active_link(self._db, catalog.id, self.merchant) is not None:
            return DiscoveredOffer(
                merchant=self.merchant,
                product_name=catalog.name,
                brand=catalog.brand,
                price=None,
                is_available=True,
                direct_url=None,
                ean=gtin_normalized,
                allow_without_price=True,
            )

        # 2) Sem pré-cadastro → busca daquele produto na vitrine "Minha Loja".
        query = _build_query(context)
        if not query:
            return None
        return DiscoveredOffer(
            merchant=self.merchant,
            product_name=catalog.name if catalog is not None else None,
            brand=catalog.brand if catalog is not None else None,
            price=None,
            is_available=True,
            direct_url=_minha_loja_search_url(query),
            ean=gtin_normalized,
            allow_without_price=True,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str, bool]]:
        settings = get_settings()
        mode = settings.cobasi_affiliate_mode

        if mode == "disabled":
            return None

        # Link cadastrado manualmente sempre tem prioridade, em qualquer
        # modo != "disabled" — ver docstring do módulo. is_manually_cached=True
        # também blinda esta oferta no dedupe do CommerceEngine contra troca
        # de merchant_routes.PREFERRED_ROUTE_BY_MERCHANT (ex: quando a rota
        # da Cobasi for "awin" mas ESTE produto tem link manual comprovado).
        cached = self._lookup_cached_link(offer, context)
        if cached is not None:
            url, link_type = cached
            return url, link_type, "mais", True

        if mode == "cached":
            fallback = self._dev_fallback(offer, settings)
            if fallback is None:
                return None
            url, link_type = fallback
            return url, link_type, "mais"
        if mode == "utm":
            utm = self._monetize_utm(offer)
            if utm is None:
                return None
            url, link_type = utm
            return url, link_type, "mais"

        # "api" reservado — sem implementação oficial ainda.
        return None

    def _resolve_catalog_by_gtin(self, gtin_normalized: Optional[str]) -> Optional[ProductCatalog]:
        if not gtin_normalized:
            return None
        return self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
        )

    def _resolve_product_id(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[int]:
        if context.product_id is not None:
            return context.product_id
        gtin = offer.ean or context.gtin
        if not gtin:
            return None
        product = self._resolve_catalog_by_gtin(normalize_gtin(gtin))
        return product.id if product else None

    def _lookup_cached_link(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str]]:
        product_id = self._resolve_product_id(offer, context)
        if product_id is None:
            return None
        link = get_active_link(self._db, product_id, self.merchant)
        if not link:
            return None
        # Link cadastrado: shortlink MAIS (mais.app/...) já passa pela
        # atribuição; URL crua da Cobasi é reescrita para a vitrine
        # "Minha Loja" (minhaloja.cobasi.com.br) + UTM MAIS.
        return to_minha_loja_url(link.affiliate_product_url), "affiliate_product"

    def _dev_fallback(self, offer: DiscoveredOffer, settings: Settings) -> Optional[tuple[str, str]]:
        # Sem link cadastrado: em dev, cai pra URL crua da Cobasi só pra
        # não travar o teste local a cada query — nunca em produção (ver
        # affiliate_only_commerce_enforced / docs/AFFILIATES.md).
        if not settings.affiliate_only_commerce_enforced and offer.direct_url:
            return offer.direct_url, "direct"
        return None

    def _monetize_utm(self, offer: DiscoveredOffer) -> Optional[tuple[str, str]]:
        if not offer.direct_url:
            return None
        try:
            url = build_cobasi_affiliate_url(offer.direct_url)
        except InvalidCobasiUrlError:
            return None
        return url, "affiliate_product"

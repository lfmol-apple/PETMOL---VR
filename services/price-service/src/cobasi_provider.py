"""
CobasiProvider — implementação de CommerceProvider para a Cobasi.

find_offer(): busca dinâmica via commerce_pricing.fetch_cobasi_price — a
API pública VTEX da Cobasi, ao vivo. Roda para QUALQUER produto, sem
depender de link afiliado cadastrado previamente (ver commerce_provider.py
para o princípio geral).

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

should_run(): motivo pra pular find_offer() (nem a busca ao vivo na VTEX
roda): cobasi_affiliate_mode == "disabled" — curto-circuito incondicional.
Fora isso, o provider sempre roda: com AWIN_SELLABLE_MERCHANTS vazio não
existe mais uma oferta Awin concorrente pra evitar redundância contra
(ver preferred_route_for()/merchant_routes.py — preferred_route="mais"
faz should_run() retornar True direto, sem checar offers_so_far).
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import get_active_link
from .cobasi_utm import InvalidCobasiUrlError, build_cobasi_affiliate_url
from .commerce_pricing import (
    CobasiIdentitySpec,
    fetch_cobasi_price_by_ean,
    fetch_cobasi_price_matched,
)
from .commerce_provider import DiscoveredOffer, MonetizedOffer, ProductContext
from .config import Settings, get_settings
from .merchant_routes import preferred_route_for
from .product_catalog_lookup import ProductCatalog, normalize_gtin

logger = logging.getLogger(__name__)


def _query_candidates(context: ProductContext, *, reference_name: str = "") -> list[tuple[str, str]]:
    """(kind, termo de busca) textual a tentar na Cobasi, da fonte mais forte
    pra menos. A rota por GTIN NÃO entra aqui — `products/search/{gtin}`
    sempre volta vazio; EAN é resolvido por fetch_cobasi_price_by_ean
    (`fq=alternateIds_Ean`) antes de qualquer busca textual.

      1. catalog_name — nome do products_catalog (enriquecido por GTIN);
      2. name         — nome/título passado pelo chamador;
      3. brand_name   — marca + nome (sem duplicar a marca se o nome já a tem);
      4. explicit_q   — o `q` cru que o chamador mandou.
    """
    brand = (context.brand or "").strip()
    name = (context.name or "").strip()
    ref = (reference_name or "").strip()

    def _brand_prefixed(text: str) -> str:
        # Só prefixa a marca quando ela ainda não aparece no texto — senão
        # gera "Drontal Vermífugo Drontal Plus…".
        if not text or not brand:
            return text
        if brand.lower() in text.lower():
            return ""
        return f"{brand} {text}".strip()

    raw = [
        ("catalog_name", ref if ref and ref not in (name, context.query) else ""),
        ("name", name),
        ("brand_name", _brand_prefixed(name)),
        ("explicit_q", (context.query or "").strip()),
    ]
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for kind, q in raw:
        if q and q not in seen:
            seen.add(q)
            out.append((kind, q))
    return out


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

    def _catalog_name_for_gtin(self, gtin: Optional[str]) -> Optional[str]:
        """Enriquecimento de identidade: nome confiável já gravado em
        products_catalog (preenchido por processo anterior — commerce_quality
        _optimizer). Só LÊ o dado local; nenhuma dependência nova de feed."""
        normalized = normalize_gtin(gtin or "")
        if not normalized:
            return None
        product = self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == normalized)
        )
        name = (product.name or "").strip() if product else ""
        return name or None

    def _discovered_from_price(self, price) -> DiscoveredOffer:
        # Estoque NÃO é filtrado aqui de propósito — o CommerceEngine já
        # descarta is_available is False (regra atual, inalterada).
        return DiscoveredOffer(
            merchant=self.merchant,
            product_name=price.product_name,
            brand=price.brand,
            price=price.price,
            list_price=price.list_price,
            is_available=price.is_available,
            direct_url=price.url,
            ean=price.ean,
        )

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        # Identidade do produto do tutor — a oferta Cobasi só é aceita em
        # MATCH (identidade provável). MISMATCH e UNKNOWN não viram preço.
        catalog_name = self._catalog_name_for_gtin(context.gtin)
        reference_name = catalog_name or context.name or context.query
        spec = CobasiIdentitySpec.build(
            reference_name=reference_name,
            brand=context.brand,
            species=context.species,
            gtin=context.gtin,
            weight_kg=context.weight_kg,
        )

        last_reason = "no_results"

        # ── Nível A — EAN exato (fq=alternateIds_Ean), prioridade máxima ──
        if context.gtin:
            ean_price = await fetch_cobasi_price_by_ean(context.gtin, spec)
            if ean_price.found and ean_price.price is not None:
                logger.info("[cobasi] oferta resolvida via EAN: %s (em_estoque=%s)",
                            ean_price.reason, ean_price.is_available)
                return self._discovered_from_price(ean_price)
            last_reason = ean_price.reason if ean_price.reason != "ok" else "no_price"
            logger.info("[cobasi] rota EAN sem oferta: %s", last_reason)

        # ── Nível B/C — busca textual estrutural ─────────────────────────
        candidates = _query_candidates(context, reference_name=catalog_name or "")
        if not candidates:
            logger.info("[cobasi] find_offer: sem termo de busca utilizável (last=%s)", last_reason)
            return None

        for kind, query in candidates:
            price = await fetch_cobasi_price_matched(query, spec, target_weight_kg=context.weight_kg)
            if not price.found or price.price is None:
                last_reason = price.reason if price.reason != "ok" else "no_price"
                logger.info("[cobasi] descartado: %s (query_kind=%s)", last_reason, kind)
                continue
            logger.info("[cobasi] oferta resolvida: %s (query_kind=%s, em_estoque=%s)",
                        price.reason, kind, price.is_available)
            return self._discovered_from_price(price)

        logger.info("[cobasi] sem oferta: %s (tentativas=%d)", last_reason, len(candidates))
        return None

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

    def _resolve_product_id(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[int]:
        if context.product_id is not None:
            return context.product_id
        if not offer.ean:
            return None
        gtin_normalized = normalize_gtin(offer.ean)
        product = self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
        )
        return product.id if product else None

    def _lookup_cached_link(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str]]:
        product_id = self._resolve_product_id(offer, context)
        if product_id is None:
            return None
        link = get_active_link(self._db, product_id, self.merchant)
        if not link:
            return None
        return link.affiliate_product_url, "affiliate_product"

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

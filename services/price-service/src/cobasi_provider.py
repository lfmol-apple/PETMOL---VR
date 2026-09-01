"""
CobasiProvider — implementação de CommerceProvider para a Cobasi.

find_offer() — o produto certo é SEMPRE o do código de barras. Nunca uma
busca por texto (casa a variante errada — espécie/peso/volume — e foi o
que gerou os falsos positivos de produção):
  1. GTIN com link Cobasi cadastrado (ProductAffiliateLink) → serve a
     identidade do CATÁLOGO direto, sem rede. Oferta sem preço.
  2. GTIN sem link → resolve pelo EAN exato na VTEX da Cobasi
     (commerce_pricing.fetch_cobasi_price_by_gtin, `fq=alternateIds_Ean:`).
     O SKU cujo ean bate com o GTIN — nunca uma variante vizinha. Antes,
     o gate de auditoria (commerce_identity_audit.cobasi_identity_blocks).
  3. SEM GTIN (produto cadastrado sem código de barras) → sem oferta
     Cobasi. Até ganhar um GTIN ou um ProductAffiliateLink manual.
  GTIN que não existe no catálogo da Cobasi → sem oferta (não arrisca).

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

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .affiliate_links import get_active_link
from .affiliate_offer_identity import has_ambiguous_offer_identity
from .awin_feed_provider import _identity_key, _looks_like_same_product, _select_row_by_weight
from .cobasi_utm import InvalidCobasiUrlError, build_cobasi_affiliate_url
from .commerce_pricing import fetch_cobasi_price_by_gtin
from .commerce_provider import DiscoveredOffer, MonetizedOffer, ProductContext
from .config import Settings, get_settings
from .merchant_routes import preferred_route_for
from .product_identity import IdentityDecision, MerchantCandidate, ProductIdentity, evaluate_identity
from .product_catalog_lookup import ProductCatalog, normalize_gtin


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

    def _catalog_with_manual_link(self, gtin: Optional[str]):
        """(ProductCatalog, ProductAffiliateLink) quando o GTIN tem link
        Cobasi cadastrado e ativo — senão (None, None)."""
        gtin_normalized = normalize_gtin(gtin) if gtin else None
        if not gtin_normalized:
            return None, None
        product = self._db.scalar(
            select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
        )
        if product is None:
            return None, None
        link = get_active_link(self._db, product.id, self.merchant)
        return (product, link) if link is not None else (None, None)

    def _catalog_for_gtin(self, gtin: Optional[str]) -> Optional[ProductCatalog]:
        gtin_normalized = normalize_gtin(gtin or "")
        if not gtin_normalized:
            return None
        return self._db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))

    def _identity_for_context(self, context: ProductContext, product: Optional[ProductCatalog]) -> ProductIdentity:
        if product is not None:
            return ProductIdentity.from_catalog(product)
        return ProductIdentity.build(
            gtin=context.gtin,
            canonical_name=context.canonical_name or context.name or context.query,
            brand=context.canonical_brand or context.brand,
            species=context.species,
            category=context.category,
            weight_kg=context.weight_kg,
            image_url=context.canonical_image_url,
            evidence=("PRODUCT_CONTEXT",),
        )

    def _offer_identity_payload(self, identity: ProductIdentity, product: Optional[ProductCatalog]) -> dict:
        return {
            "canonical_product_id": product.id if product else None,
            "canonical_gtin": identity.gtin,
            "canonical_name": identity.canonical_name,
            "canonical_brand": identity.brand,
            "canonical_image_url": identity.image_url,
        }

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        gtin_n = normalize_gtin(context.gtin) if context.gtin else None

        # Preço real vem SEMPRE do EAN exato na VTEX (o SKU do código de
        # barras — nunca uma variante). Vale pro link cadastrado e pro
        # resto. GTIN que a Cobasi não conhece → sem preço (link cadastrado
        # ainda serve; resto não oferece).
        price = await fetch_cobasi_price_by_gtin(context.gtin) if gtin_n else None
        price_from_cache = False
        if gtin_n:
            try:
                from .merchant_price_cache import recall_price, remember_price

                if price and price.found and price.price is not None:
                    remember_price(
                        self._db, self.merchant, gtin_n,
                        price=price.price, list_price=price.list_price,
                        product_name=price.product_name, url=price.url,
                    )
                else:
                    cached = recall_price(self._db, self.merchant, gtin_n)
                    if cached is not None:
                        from .commerce_pricing import ProductPriceResult

                        price = ProductPriceResult(
                            found=True, price=cached.price, list_price=cached.list_price,
                            product_name=cached.product_name, url=cached.url,
                            ean=gtin_n, is_available=True,
                        )
                        price_from_cache = True
            except Exception:  # noqa: BLE001 — cache nunca derruba
                pass

        # 1) Produto pré-cadastrado com link MAIS (ração do Baby /
        #    mais.app/IvUCAG) — monetize() resolve o link pelo context.gtin.
        #    Identidade do CATÁLOGO (nome/marca), preço do EAN quando houver.
        product, link = self._catalog_with_manual_link(context.gtin)
        identity = self._identity_for_context(context, product or self._catalog_for_gtin(context.gtin))
        if product is not None and link is not None:
            has_price = bool(price and price.found and price.price is not None)
            match_result = None
            if has_price:
                match_result = evaluate_identity(
                    identity,
                    MerchantCandidate.build(
                        merchant=self.merchant,
                        title=price.product_name,
                        gtin=price.ean,
                        brand=price.brand,
                        price=price.price,
                    ),
                )
                has_price = match_result.decision == IdentityDecision.EXACT
            return DiscoveredOffer(
                merchant=self.merchant,
                **self._offer_identity_payload(identity, product),
                product_name=identity.canonical_name or product.name,
                brand=identity.brand or product.brand,
                price=price.price if has_price else None,
                list_price=price.list_price if has_price else None,
                is_available=price.is_available if has_price else True,
                direct_url=None,
                ean=gtin_n,
                allow_without_price=not has_price,
                merchant_product_name=price.product_name if price else None,
                match_decision=(match_result.decision.value if match_result else "EXACT"),
                match_confidence=(match_result.confidence if match_result else 1.0),
                match_reasons=(list(match_result.reasons) if match_result else ["GTIN_MANUAL_LINK"]),
                match_attributes=(
                    [
                        {
                            "attribute": item.attribute,
                            "expected": item.expected,
                            "observed": item.observed,
                            "status": item.status.value,
                            "reason": item.reason,
                        }
                        for item in match_result.attributes
                    ]
                    if match_result else None
                ),
            )

        # SEM código de barras não há Cobasi. O produto certo é o do GTIN —
        # esse é o coração do sistema. Uma busca por texto ("Golden ração")
        # casa a variante errada (espécie/peso/volume) e foi exatamente o
        # que gerou os falsos positivos de produção. Produto cadastrado sem
        # código de barras não tem oferta Cobasi até ganhar um GTIN ou um
        # ProductAffiliateLink manual.
        if not context.gtin:
            return None

        # Auditoria de identidade: GTIN já flagrado apontando pro produto
        # errado (mismatch_hard fresco) → não oferece (ver commerce_identity_audit).
        from .commerce_identity_audit import cobasi_identity_blocks

        if cobasi_identity_blocks(self._db, context.gtin):
            return None

        # 2) Sem link cadastrado: só oferece se o EAN exato resolveu na
        #    VTEX (SKU do código de barras). GTIN que a Cobasi não conhece
        #    pode cair no fallback estruturado de feed Cobasi quando outra
        #    loja já provou que o GTIN do tutor é a mesma apresentação
        #    comercial com código irmão (ex: Scalibor M ↔ 48 cm).
        if price is None or not price.found or price.price is None:
            return await self._find_cobasi_feed_sibling_offer(context, identity)

        match_result = evaluate_identity(
            identity,
            MerchantCandidate.build(
                merchant=self.merchant,
                title=price.product_name,
                gtin=price.ean,
                brand=price.brand,
                price=price.price,
            ),
        )
        if match_result.decision != IdentityDecision.EXACT:
            return None

        return DiscoveredOffer(
            merchant=self.merchant,
            **self._offer_identity_payload(identity, self._catalog_for_gtin(context.gtin)),
            product_name=identity.canonical_name or price.product_name,
            brand=identity.brand or price.brand,
            price=price.price,
            list_price=price.list_price,
            is_available=price.is_available,
            direct_url=price.url,
            ean=price.ean or normalize_gtin(context.gtin),
            price_is_stale=price_from_cache,
            merchant_product_name=price.product_name,
            match_decision=match_result.decision.value,
            match_confidence=match_result.confidence,
            match_reasons=[*match_result.reasons, *(["COBASI_PRICE_FROM_CACHE"] if price_from_cache else [])],
            match_attributes=[
                {
                    "attribute": item.attribute,
                    "expected": item.expected,
                    "observed": item.observed,
                    "status": item.status.value,
                    "reason": item.reason,
                }
                for item in match_result.attributes
            ],
        )

    async def _find_cobasi_feed_sibling_offer(
        self,
        context: ProductContext,
        identity: ProductIdentity,
    ) -> Optional[DiscoveredOffer]:
        """Fallback para GTINs irmãos entre lojas, sem busca textual.

        A fonte continua estruturada: primeiro precisa existir uma linha de
        feed de qualquer loja Awin para o GTIN do tutor; depois buscamos uma
        linha Cobasi ativa cujo título/apresentação case pelo Product
        Identity Engine. Isso cobre casos reais como Scalibor "M" em uma
        loja e "Pequenos e Médios - 48 cm" na Cobasi, sem abrir espaço para
        misturar 48 cm com 65 cm.
        """
        canonical_gtin = normalize_gtin(context.gtin)
        if not canonical_gtin:
            return None

        references = list(self._db.scalars(
            select(AffiliateFeedOffer).where(
                AffiliateFeedOffer.network == "awin",
                AffiliateFeedOffer.gtin == canonical_gtin,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
        ))
        if not references:
            return None

        candidates = list(self._db.scalars(
            select(AffiliateFeedOffer)
            .where(
                AffiliateFeedOffer.network == "awin",
                AffiliateFeedOffer.merchant == self.merchant,
                AffiliateFeedOffer.gtin != canonical_gtin,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
            .order_by(AffiliateFeedOffer.price.asc())
        ))
        matches = [
            row for row in candidates
            if _looks_like_same_product(row, references, context)
        ]
        if not matches or has_ambiguous_offer_identity(matches):
            return None
        best_identity = _identity_key(matches[0])
        if any(_identity_key(row) != best_identity for row in matches[1:]):
            return None

        row = _select_row_by_weight(matches, context.weight_kg)
        row_identity = ProductIdentity.build(
            gtin=None,
            canonical_name=identity.canonical_name or context.canonical_name or context.name or row.title,
            brand=identity.brand or context.canonical_brand or context.brand or row.brand,
            species=identity.species or context.species,
            category=identity.category or context.category or row.category,
            weight_kg=identity.weight_kg or context.weight_kg or row.weight_kg,
            image_url=identity.image_url or context.canonical_image_url or row.image_url,
            evidence=("PRODUCT_CONTEXT", "AWIN_FEED_REFERENCE"),
        )
        match_result = evaluate_identity(
            row_identity,
            MerchantCandidate.build(
                merchant=self.merchant,
                title=row.title,
                gtin=row.gtin,
                brand=row.brand,
                category=row.category,
                price=row.price,
                external_id=row.external_product_id,
            ),
        )
        if not match_result.accepted:
            return None

        # Preço ao vivo do EAN irmão na VTEX da Cobasi — só troca o preço do
        # feed (stale) quando a consulta ao vivo resolve o MESMO SKU irmão.
        # A identidade exibida (nome/GTIN do tutor) nunca muda.
        price = row.price
        list_price = row.list_price
        price_stale = True
        price_checked_at = row.last_synced_at
        direct_url = row.merchant_url
        reasons = [*match_result.reasons, "COBASI_FEED_SIBLING_GTIN"]
        sibling_gtin = normalize_gtin(row.gtin or "")
        if sibling_gtin:
            try:
                live = await fetch_cobasi_price_by_gtin(sibling_gtin)
            except Exception:  # noqa: BLE001 — preço ao vivo é best-effort
                live = None
            if live and live.found and live.price is not None:
                try:
                    from .merchant_price_cache import remember_price

                    remember_price(self._db, self.merchant, sibling_gtin,
                                   price=live.price, list_price=live.list_price,
                                   product_name=live.product_name, url=live.url)
                except Exception:  # noqa: BLE001
                    pass
                live_match = evaluate_identity(
                    row_identity,
                    MerchantCandidate.build(
                        merchant=self.merchant,
                        title=live.product_name,
                        gtin=live.ean or sibling_gtin,
                        brand=live.brand,
                        price=live.price,
                    ),
                )
                if live_match.accepted:
                    price = live.price
                    list_price = live.list_price
                    price_stale = False
                    price_checked_at = None
                    direct_url = live.url or direct_url
                    reasons.append("COBASI_SIBLING_GTIN_LIVE")

        return DiscoveredOffer(
            merchant=self.merchant,
            **self._offer_identity_payload(identity, self._catalog_for_gtin(context.gtin)),
            product_name=identity.canonical_name or context.canonical_name or context.name or row.title,
            brand=identity.brand or context.canonical_brand or context.brand or row.brand,
            price=price,
            list_price=list_price,
            is_available=row.in_stock,
            direct_url=direct_url,
            ean=row.gtin,
            external_id=row.external_product_id,
            image_url=identity.image_url or context.canonical_image_url or row.image_url,
            price_checked_at=price_checked_at,
            price_is_stale=price_stale,
            merchant_product_name=row.title,
            match_decision=match_result.decision.value,
            match_confidence=match_result.confidence,
            match_reasons=reasons,
            match_attributes=[
                {
                    "attribute": item.attribute,
                    "expected": item.expected,
                    "observed": item.observed,
                    "status": item.status.value,
                    "reason": item.reason,
                }
                for item in match_result.attributes
            ],
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

    def _resolve_product_id(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[int]:
        if context.product_id is not None:
            return context.product_id
        # context.gtin (o produto que o PETMOL sabe que é) tem prioridade
        # sobre offer.ean (o SKU que a busca ao vivo devolveu — pode ser a
        # variante errada). Sem isso, um link cadastrado nunca é achado
        # quando a busca desambigua errado (ex: ração do Baby).
        for candidate in (context.gtin, offer.ean):
            gtin_normalized = normalize_gtin(candidate) if candidate else None
            if not gtin_normalized:
                continue
            product = self._db.scalar(
                select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
            )
            if product is not None:
                return product.id
        return None

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

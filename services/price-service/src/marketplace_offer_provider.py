"""
MarketplaceOfferProvider — implementação de CommerceProvider para
merchants tipo marketplace (Shopee hoje; Mercado Livre no mesmo formato
quando aprovado), lendo só MarketplaceOffer — nunca gera link, nunca
chama a rede do marketplace ao vivo, nunca scraping.

Diferente de AwinFeedProvider (sincroniza automaticamente via feed
externo em lote): aqui cada linha de MarketplaceOffer vem de discovery
controlado/sync oficial do marketplace ou de cadastro manual revisado por
admin, sempre com link afiliado real emitido pela rede — nunca
inventado/gerado por template. Um provider por merchant marketplace, não
um genérico "marketplace" — mesmo padrão de AwinFeedProvider(merchant).

CommerceEngine descarta qualquer DiscoveredOffer sem preço
(commerce_provider.py) — como nunca fazemos scraping de preço, uma
oferta só aparece com preço quando o sync/refresh confirmou um número
fresco; sem isso, a oferta pode virar "conferir preço na loja", mas preço
velho não é publicado como número.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer, get_active_marketplace_offer
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .db import SessionLocal
from .product_identity import IdentityMatchResult, MerchantCandidate, ProductIdentity, evaluate_identity
from .product_catalog_lookup import ProductCatalog, normalize_gtin, search_catalog_by_text
from .mercadolivre_link_validator import InvalidMercadoLivreAffiliateUrlError, validate_mercadolivre_affiliate_url
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url

# Merchants marketplace conhecidos e seu validador de link oficial — cada
# um com o próprio, nunca reaproveitando o de outro merchant por
# semelhança (regras de allowlist de domínio são específicas por rede).
_LINK_VALIDATORS = {
    "shopee": validate_shopee_affiliate_url,
    "mercadolivre": validate_mercadolivre_affiliate_url,
}


def is_marketplace_merchant_publicly_servable(merchant: str) -> bool:
    """Único ponto de decisão pra 'este marketplace pode gerar uma oferta
    visível/clicável pro tutor agora' — mesmo papel de
    is_awin_merchant_publicly_servable. Master gate por merchant:
    shopee_affiliate_enabled / mercadolivre_affiliate_enabled. Consultado
    tanto no registro do provider (commerce_offers.py) quanto dentro de
    cada find_offer()/monetize() — defesa em profundidade, mesmo padrão
    do módulo Awin.

    mercadolivre_affiliate_enabled reaproveita a mesma flag já criada
    para o provider de catálogo via Client Credentials
    (mercadolivre_commerce_provider.py) — o significado é idêntico: "só
    True quando existir mecanismo oficial de comissão confirmado", e o
    Mercado Livre não tem API de geração de link (confirmado
    24/08/2026), então esta flag continua False por padrão até alguém
    cadastrar links manualmente e decidir ligá-la."""
    if merchant == "shopee":
        return get_settings().shopee_affiliate_enabled
    if merchant == "mercadolivre":
        return get_settings().mercadolivre_affiliate_enabled
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
        if context.gtin:
            gtin_normalized = normalize_gtin(context.gtin)
            if gtin_normalized:
                product = self._db.scalar(
                    select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized)
                )
                if product:
                    return product.id

        return self._resolve_product_id_from_text(context)

    def _resolve_product_id_from_text(self, context: ProductContext) -> Optional[int]:
        """Fallback para planos legados sem barcode.

        MarketplaceOffer é cadastrado por produto do catálogo, mas alguns
        itens de alimentação antigos só guardam nome + tamanho do pacote.
        Quando já existe oferta Shopee para um produto identificável por
        texto, essa falta de GTIN no plano não deve esconder a oferta.
        """
        query = (context.name or context.query or "").strip()
        if not query:
            return None

        best: Optional[tuple[float, ProductCatalog]] = None
        catalog_query = re.sub(r"\bs\s*/?\s*o\b", " ", query, flags=re.IGNORECASE)
        for product in search_catalog_by_text(self._db, q=catalog_query, category="food", limit=10):
            if get_active_marketplace_offer(self._db, product.id, self.merchant) is None:
                continue
            result = evaluate_identity(
                ProductIdentity.from_catalog(product),
                MerchantCandidate.build(merchant=self.merchant, title=query, brand=context.brand),
            )
            if not result.accepted:
                continue
            if best is None or result.confidence > best[0]:
                best = (result.confidence, product)

        return best[1].id if best else None

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not is_marketplace_merchant_publicly_servable(self.merchant):
            return None

        product_id = self._resolve_product_id(context)
        if product_id is None:
            return None

        product = self._db.get(ProductCatalog, product_id)
        identity = _identity_from_product_context(product, context)
        offer, live_match_result = _select_valid_marketplace_offer(self._db, product_id, self.merchant, identity)
        if offer is None:
            # Produto conhecido, GTIN confiável, mas ainda sem oferta Shopee
            # cadastrada — tenta descobrir UMA vez, em background (nunca
            # inline: o cliente tem timeout de 5s). Cooldown por GTIN
            # persistido. A próxima abertura da Loja encontra a oferta.
            self._maybe_schedule_discovery(context, product)
            return None
        checked_at = _effective_checked_at(offer)
        # Oferta existe mas o preço já expirou (janela stale): agenda uma
        # reprecificação em background — mesmo mecanismo/cooldown da
        # descoberta (nunca inline). Esta abertura ainda mostra "Conferir
        # preço"; a próxima já pega o preço novo. Cobre o intervalo entre o
        # tutor escanear um produto novo e a fila noturna revalidar.
        if not _is_offer_fresh(checked_at) and not _should_live_refresh(self.merchant, checked_at):
            self._maybe_schedule_discovery(context, product)
        if _should_live_refresh(self.merchant, checked_at):
            if product and product.barcode_normalized:
                _refresh_marketplace_offer(self.merchant, product.barcode_normalized)
                self._db.expire_all()
                product = self._db.get(ProductCatalog, product_id)
                identity = _identity_from_product_context(product, context)
                offer, live_match_result = _select_valid_marketplace_offer(self._db, product_id, self.merchant, identity)
                if offer is None:
                    return None
                checked_at = _effective_checked_at(offer)

        fresh = _is_offer_fresh(checked_at)
        match_reasons = None
        match_attributes = None
        if offer.match_reasons_json:
            match_reasons = _json_list(offer.match_reasons_json)
        if offer.match_attributes_json:
            match_attributes = _json_dict_list(offer.match_attributes_json)
        if live_match_result is not None:
            match_reasons = list(live_match_result.reasons)
            match_attributes = _attributes_to_dicts(live_match_result)
        return DiscoveredOffer(
            merchant=self.merchant,
            canonical_product_id=product.id if product else product_id,
            canonical_gtin=identity.gtin or context.gtin,
            canonical_name=identity.canonical_name or context.name or context.query,
            canonical_brand=identity.brand or context.brand,
            canonical_image_url=identity.image_url or (product.thumbnail_url if product else None),
            product_name=identity.canonical_name or context.name or context.query,
            brand=identity.brand or context.brand,
            # Preço de marketplace defasado NÃO vira número na tela — o
            # anúncio de terceiro pode ter mudado de preço/estoque desde o
            # último sync. Sem preço fresco, o frontend mostra "Conferir
            # preço na <loja>" e a oferta desce pro fim do ranking.
            price=offer.price if fresh else None,
            is_available=offer.is_available,
            direct_url=offer.direct_url,
            external_id=str(offer.id),
            image_url=product.thumbnail_url if product else None,
            price_checked_at=checked_at,
            price_is_stale=not fresh,
            # Oferta afiliada válida cujo preço expirou — passa pelo engine
            # mesmo com price=None (ver commerce_provider.CommerceEngine).
            allow_without_price=not fresh,
            merchant_product_name=offer.merchant_title,
            match_decision=(live_match_result.decision.value if live_match_result is not None else offer.match_decision) or "HIGH_CONFIDENCE",
            match_confidence=live_match_result.confidence if live_match_result is not None else (offer.match_confidence if offer.match_confidence is not None else 0.75),
            match_reasons=match_reasons or ["PREVALIDATED_MARKETPLACE_OFFER"],
            match_attributes=match_attributes,
        )

    def _maybe_schedule_discovery(self, context: ProductContext, product: Optional[ProductCatalog]) -> None:
        if self.merchant != "shopee":
            return
        gtin = context.gtin or (product.barcode_normalized if product else None)
        gtin = normalize_gtin(gtin) if gtin else None
        if not gtin:
            return  # sem GTIN confiável, nunca chama a API da Shopee
        # products_catalog precisa ter nome pra o matcher ter o que casar
        # (sync_shopee_offer_for_gtin já rejeita, mas evita agendar à toa).
        if product is not None and not product.name:
            return
        try:
            from .shopee_discovery_attempt import schedule_shopee_discovery, should_attempt_discovery

            if should_attempt_discovery(self._db, gtin):
                schedule_shopee_discovery(gtin)
        except Exception:  # noqa: BLE001 — cobertura é best-effort, nunca quebra a request
            pass

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
            except (InvalidShopeeAffiliateUrlError, InvalidMercadoLivreAffiliateUrlError):
                return None

        # is_manually_cached=True: é sempre um link cadastrado manualmente
        # a partir do Portal do Afiliado, nunca gerado por template — mesma
        # proteção que o link comprovado da Cobasi usa (cobasi_provider.py).
        return row.affiliate_url, "affiliate_marketplace_offer", self.merchant, True


def _effective_checked_at(offer: MarketplaceOffer) -> Optional[datetime]:
    """Timestamp que melhor representa quando o preço foi confirmado.

    Sync novo grava last_checked_at. Linhas antigas/manuais podem ter só
    verified_at/updated_at/created_at; elas passam a expirar naturalmente
    em vez de ficarem visíveis para sempre.
    """
    checked_at = offer.last_checked_at or offer.verified_at or offer.updated_at or offer.created_at
    if checked_at is not None and checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=timezone.utc)
    return checked_at


def _identity_from_product_context(product: Optional[ProductCatalog], context: ProductContext) -> ProductIdentity:
    if product is None:
        return ProductIdentity.build(
            gtin=context.gtin,
            canonical_name=context.canonical_name or context.name or context.query,
            brand=context.canonical_brand or context.brand,
            species=context.species,
            category=context.category,
            weight_kg=context.weight_kg,
            image_url=context.canonical_image_url,
        )
    identity = ProductIdentity.from_catalog(product)
    if context.weight_kg is None or identity.weight_kg is not None:
        return identity
    return ProductIdentity.build(
        gtin=identity.gtin,
        canonical_name=identity.canonical_name,
        brand=identity.brand,
        species=identity.species,
        category=identity.category,
        product_family=identity.product_family,
        product_line=identity.product_line,
        weight_kg=context.weight_kg,
        volume_ml=identity.volume_ml,
        length_cm=identity.length_cm,
        pack_count=identity.pack_count,
        animal_weight_range=identity.animal_weight_range,
        life_stage=identity.life_stage,
        breed_size=identity.breed_size,
        breed=identity.breed,
        flavor=identity.flavor,
        therapeutic_attributes=identity.therapeutic_attributes,
        aliases=identity.aliases,
        image_url=identity.image_url,
        evidence=(*identity.evidence, "PRODUCT_CONTEXT_WEIGHT"),
    )


def _select_valid_marketplace_offer(
    db: Session,
    product_id: int,
    merchant: str,
    identity: ProductIdentity,
) -> tuple[Optional[MarketplaceOffer], Optional[IdentityMatchResult]]:
    rows = list(db.scalars(
        select(MarketplaceOffer)
        .where(
            MarketplaceOffer.product_id == product_id,
            MarketplaceOffer.merchant == merchant,
            MarketplaceOffer.active.is_(True),
        )
        .order_by(MarketplaceOffer.price.is_(None), MarketplaceOffer.price.asc(), MarketplaceOffer.verified_at.desc())
    ))
    for row in rows:
        result = _validate_marketplace_offer_identity(identity, row)
        if result is not None and result.accepted:
            return row, result
    return None, None


def _validate_marketplace_offer_identity(identity: ProductIdentity, offer: MarketplaceOffer) -> Optional[IdentityMatchResult]:
    if not offer.merchant_title and not offer.merchant_gtin:
        return None
    return evaluate_identity(
        identity,
        MerchantCandidate.build(
            merchant=offer.merchant,
            title=offer.merchant_title or "",
            gtin=offer.merchant_gtin,
            brand=None,
            price=offer.price,
            external_id=offer.external_listing_id,
        ),
    )


def _attributes_to_dicts(result: IdentityMatchResult) -> list[dict]:
    return [
        {
            "attribute": item.attribute,
            "expected": item.expected,
            "observed": item.observed,
            "status": item.status.value,
            "reason": item.reason,
        }
        for item in result.attributes
    ]


def _is_offer_fresh(checked_at: Optional[datetime]) -> bool:
    if checked_at is None:
        return False
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.marketplace_offer_stale_after_hours)
    return checked_at >= cutoff


def _should_live_refresh(merchant: str, checked_at: Optional[datetime]) -> bool:
    if merchant != "shopee":
        return False
    settings = get_settings()
    if not settings.marketplace_offer_inline_refresh_enabled:
        return False
    if settings.marketplace_offer_refresh_after_minutes <= 0:
        return False
    if checked_at is None:
        return True
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=settings.marketplace_offer_refresh_after_minutes)
    return checked_at < cutoff


def _refresh_marketplace_offer(merchant: str, gtin: str) -> None:
    """Best-effort refresh de uma oferta específica antes de exibir preço.

    Não bloqueia a monetização se a API externa falhar: a chamada pública
    ainda pode retornar a oferta cacheada, marcada como velha quando for o
    caso. O objetivo é corrigir o caso real em que o tutor vê R$ X no
    PETMOL e, ao clicar, a Shopee já mostra outro preço.
    """
    if merchant != "shopee":
        return
    from .shopee_offer_sync import sync_shopee_offer_for_gtin

    db = SessionLocal()
    try:
        sync_shopee_offer_for_gtin(db, gtin)
    except Exception:
        db.rollback()
    finally:
        db.close()


def _json_list(raw: str) -> list[str]:
    import json

    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item]


def _json_dict_list(raw: str) -> list[dict]:
    import json

    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]

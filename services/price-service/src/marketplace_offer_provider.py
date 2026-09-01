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

from datetime import datetime, timedelta, timezone
from typing import Optional
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_links import MarketplaceOffer, get_active_marketplace_offer
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .db import SessionLocal
from .product_catalog_lookup import ProductCatalog, normalize_gtin, search_catalog_by_text
from .mercadolivre_link_validator import InvalidMercadoLivreAffiliateUrlError, validate_mercadolivre_affiliate_url
from .shopee_link_validator import InvalidShopeeAffiliateUrlError, validate_shopee_affiliate_url
from .shopee_offer_matcher import score_candidate

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
            score = score_candidate(
                product.name or "",
                query,
                expected_brand=product.brand,
            )
            if score is None or score < 0.5:
                continue
            if best is None or score > best[0]:
                best = (score, product)

        return best[1].id if best else None

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not is_marketplace_merchant_publicly_servable(self.merchant):
            return None

        product_id = self._resolve_product_id(context)
        if product_id is None:
            return None

        product = self._db.get(ProductCatalog, product_id)
        offer = get_active_marketplace_offer(self._db, product_id, self.merchant)
        if offer is None:
            # Produto conhecido, GTIN confiável, mas ainda sem oferta Shopee
            # cadastrada — tenta descobrir UMA vez, em background (nunca
            # inline: o cliente tem timeout de 5s). Cooldown por GTIN
            # persistido. A próxima abertura da Loja encontra a oferta.
            self._maybe_schedule_discovery(context, product)
            return None
        checked_at = _effective_checked_at(offer)
        if _should_live_refresh(self.merchant, checked_at):
            if product and product.barcode_normalized:
                _refresh_marketplace_offer(self.merchant, product.barcode_normalized)
                self._db.expire_all()
                product = self._db.get(ProductCatalog, product_id)
                offer = get_active_marketplace_offer(self._db, product_id, self.merchant)
                if offer is None:
                    return None
                checked_at = _effective_checked_at(offer)

        fresh = _is_offer_fresh(checked_at)
        return DiscoveredOffer(
            merchant=self.merchant,
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

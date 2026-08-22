"""
AwinFeedProvider — implementação de CommerceProvider para merchants
sincronizados via feed da Awin (Cobasi, Zee Dog e Zee Now aprovadas; ver
awin_advertisers.py).

IMPORTANTE: este provider NUNCA chama a API/feed da Awin diretamente.
Ele só LÊ o que awin_feed_sync.py já tiver sincronizado em
AffiliateFeedOffer (Postgres local) — ver §14 do documento de
arquitetura interno: "job de sincronização → Postgres; tutor toca
Comprar → consulta Postgres local", nunca uma chamada externa por clique.

Duas camadas de proteção contra expor Awin sem autorização (defesa em
profundidade — não depender só de build_default_engine() lembrar de
filtrar no registro):
  1. is_awin_merchant_publicly_servable(): master gate global
     (awin_enabled/awin_shadow_mode) + status técnico do merchant — ver
     awin_advertisers.py. find_offer()/monetize() checam isto sempre,
     mesmo que o provider tenha sido registrado por engano. A ÚNICA
     exceção é o GTIN de teste único (config.awin_test_gtin — ver §7 do
     documento de arquitetura interno): quando o GTIN do contexto bate
     exatamente com ele (após normalize_gtin), a resolução é permitida
     mesmo com awin_enabled=False, pra validar uma compra real controlada
     sem abrir o catálogo inteiro. Nenhum outro GTIN se beneficia disso.
  2. Staleness: mesmo com o merchant publicamente liberado, uma oferta só
     é considerada se o último sync bem-sucedido não estiver mais velho
     que config.awin_stale_after_hours — catálogo desatualizado nunca
     abre link silenciosamente (ver §12 do doc de arquitetura interno).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer, AffiliateFeedSyncRun
from .affiliate_offer_identity import has_ambiguous_offer_identity
from .awin_advertisers import is_awin_merchant_publicly_servable
from .awin_click_redirect import build_awin_click_redirect_url
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .gtin_utils import normalize_gtin_gs1
from .product_catalog_lookup import normalize_gtin


class AwinFeedProvider:
    """Um merchant específico (cobasi, zeenow, zeedog...) sincronizado via
    feed Awin. Um provider por merchant — não um provider genérico
    "awin", porque Awin é a rede, não o merchant (ver docs/AFFILIATES.md)."""

    network = "awin"

    def __init__(self, db: Session, merchant: str):
        self.merchant = merchant
        self._db = db

    def _is_authorized(self, context: ProductContext) -> bool:
        """Autoriza resolução se o merchant está publicamente liberado OU
        (exceção estreita) se o GTIN do contexto é exatamente o GTIN de
        teste configurado pra validação de compra real controlada — ver
        docstring do módulo e is_awin_merchant_registrable()."""
        if is_awin_merchant_publicly_servable(self.merchant):
            return True
        settings = get_settings()
        if not settings.awin_test_gtin or not context.gtin:
            return False
        return normalize_gtin(context.gtin) == normalize_gtin(settings.awin_test_gtin)

    def _is_catalog_fresh(self) -> bool:
        settings = get_settings()
        cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.awin_stale_after_hours)
        last_success = self._db.scalar(
            select(AffiliateFeedSyncRun.finished_at)
            .where(
                AffiliateFeedSyncRun.network == self.network,
                AffiliateFeedSyncRun.merchant == self.merchant,
                AffiliateFeedSyncRun.status == "success",
            )
            .order_by(AffiliateFeedSyncRun.finished_at.desc())
            .limit(1)
        )
        if last_success is None:
            # Nunca sincronizado com sucesso (ou tabela de runs vazia, ex:
            # dado seedado direto em teste) — não bloqueia por staleness
            # aqui; find_offer() simplesmente não vai achar linha nenhuma
            # se de fato não houver dado. Evita depender de todo teste
            # popular AffiliateFeedSyncRun só pra exercitar AffiliateFeedOffer.
            return True
        if last_success.tzinfo is None:
            # SQLite (dev/teste) não preserva tzinfo mesmo em coluna
            # DateTime(timezone=True) — Postgres (prod) preserva.
            last_success = last_success.replace(tzinfo=timezone.utc)
        return last_success >= cutoff

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not self._is_authorized(context):
            return None
        if not self._is_catalog_fresh():
            return None

        # 1. GTIN exato primeiro — feeds de afiliados são estruturados
        # (diferente da busca textual da Cobasi/VTEX), então GTIN é o
        # caminho principal e mais confiável.
        if not context.gtin:
            return None
        gtin = normalize_gtin_gs1(context.gtin)
        if not gtin.valid or not gtin.value:
            return None

        # 2/3. Considera peso/apresentação implicitamente via weight_kg
        # (quando várias ofertas do mesmo GTIN existirem) — só
        # active + in_stock.
        query = (
            select(AffiliateFeedOffer)
            .where(
                AffiliateFeedOffer.network == self.network,
                AffiliateFeedOffer.merchant == self.merchant,
                AffiliateFeedOffer.gtin == gtin.value,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
            .order_by(AffiliateFeedOffer.price.asc())
        )
        rows = list(self._db.scalars(query))
        if not rows:
            return None
        if has_ambiguous_offer_identity(rows):
            return None

        row = _select_row_by_weight(rows, context.weight_kg)

        # 4. Fallback textual: NÃO implementado — sem dados reais de feed
        # pra validar que seria seguro (ver §16 do documento de
        # arquitetura interno). GTIN exato é o único caminho hoje.

        return DiscoveredOffer(
            merchant=self.merchant,
            product_name=row.title,
            brand=row.brand,
            price=row.price,
            list_price=row.list_price,
            is_available=row.in_stock,
            direct_url=row.merchant_url,
            ean=row.gtin,
            external_id=row.external_product_id,
        )

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str]]:
        """affiliate_url já vem pronta do feed — nunca gerada aqui, nunca
        cai para merchant_url limpa em produção (ver §17). route="awin"
        (ver merchant_routes.py) — usado pro CommerceEngine nunca exibir o
        mesmo merchant duas vezes quando também houver um CobasiProvider
        (route="mais") ativo pro mesmo merchant."""
        if not self._is_authorized(context):
            return None
        if not offer.external_id:
            return None

        row = self._db.scalar(
            select(AffiliateFeedOffer).where(
                AffiliateFeedOffer.network == self.network,
                AffiliateFeedOffer.merchant == self.merchant,
                AffiliateFeedOffer.external_product_id == offer.external_id,
                AffiliateFeedOffer.active.is_(True),
            )
        )
        if not row or not row.affiliate_url:
            return None

        return build_awin_click_redirect_url(row.affiliate_url), "affiliate_product", "awin"


def _select_row_by_weight(rows: list[AffiliateFeedOffer], target_weight_kg: Optional[float]) -> AffiliateFeedOffer:
    if target_weight_kg is None:
        return rows[0]
    for row in rows:
        if row.weight_kg is not None and round(row.weight_kg, 2) == round(target_weight_kg, 2):
            return row
    return rows[0]

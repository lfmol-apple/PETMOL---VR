"""
AwinFeedProvider — implementação de CommerceProvider para merchants
sincronizados via feed da Awin (Cobasi, Zee Now, Zee Dog — quando
aprovados; ver awin_advertisers.py).

IMPORTANTE: este provider NUNCA chama a API/feed da Awin diretamente.
Ele só LÊ o que um futuro AwinFeedSyncService já tiver sincronizado em
AffiliateFeedOffer (Postgres local) — ver §14 do documento de
arquitetura interno: "job de sincronização → Postgres; tutor toca
Comprar → consulta Postgres local", nunca uma chamada externa por clique.

Como nenhuma conta Awin está aprovada ainda, este provider hoje sempre
encontra 0 ofertas (tabela vazia) e não é registrado em
build_default_engine — existe só para a arquitetura estar pronta.
"""
from __future__ import annotations

from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .awin_advertisers import is_awin_merchant_enabled
from .commerce_provider import DiscoveredOffer, ProductContext
from .product_catalog_lookup import normalize_gtin


class AwinFeedProvider:
    """Um merchant específico (cobasi, zeenow, zeedog...) sincronizado via
    feed Awin. Um provider por merchant — não um provider genérico
    "awin", porque Awin é a rede, não o merchant (ver docs/AFFILIATES.md)."""

    network = "awin"

    def __init__(self, db: Session, merchant: str):
        self.merchant = merchant
        self._db = db

    async def find_offer(self, context: ProductContext) -> Optional[DiscoveredOffer]:
        if not is_awin_merchant_enabled(self.merchant):
            return None

        # 1. GTIN exato primeiro — feeds de afiliados são estruturados
        # (diferente da busca textual da Cobasi/VTEX), então GTIN é o
        # caminho principal e mais confiável.
        if not context.gtin:
            return None
        gtin_normalized = normalize_gtin(context.gtin)
        if not gtin_normalized:
            return None

        # 2/3. Considera peso/apresentação implicitamente via weight_kg
        # (quando várias ofertas do mesmo GTIN existirem) — só
        # active + in_stock.
        query = (
            select(AffiliateFeedOffer)
            .where(
                AffiliateFeedOffer.network == self.network,
                AffiliateFeedOffer.merchant == self.merchant,
                AffiliateFeedOffer.gtin == gtin_normalized,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
            .order_by(AffiliateFeedOffer.price.asc())
        )
        rows = list(self._db.scalars(query))
        if not rows:
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
        if not is_awin_merchant_enabled(self.merchant):
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

        return row.affiliate_url, "affiliate_product", "awin"


def _select_row_by_weight(rows: list[AffiliateFeedOffer], target_weight_kg: Optional[float]) -> AffiliateFeedOffer:
    if target_weight_kg is None:
        return rows[0]
    for row in rows:
        if row.weight_kg is not None and round(row.weight_kg, 2) == round(target_weight_kg, 2):
            return row
    return rows[0]

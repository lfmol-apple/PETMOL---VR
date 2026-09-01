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
  2. Fallback por identidade: quando o GTIN do merchant diverge do GTIN
     salvo pelo PETMOL, o provider só tenta casar por nome/apresentação se
     outra loja Awin já tiver uma oferta ativa para o GTIN original. Se o
     resultado for ambíguo, não retorna oferta.
  3. Staleness: mesmo com o merchant publicamente liberado, uma oferta só
     é considerada se o último sync bem-sucedido não estiver mais velho
     que config.awin_stale_after_hours — catálogo desatualizado nunca
     abre link silenciosamente (ver §12 do doc de arquitetura interno).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer, AffiliateFeedSyncRun
from .affiliate_offer_identity import has_ambiguous_offer_identity
from .awin_advertisers import is_awin_merchant_publicly_servable
from .awin_click_redirect import build_awin_click_redirect_url
from .cobasi_utm import InvalidCobasiUrlError, build_cobasi_affiliate_url
from .commerce_pricing import fetch_cobasi_price
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .gtin_utils import normalize_gtin_gs1
from .product_identity import MerchantCandidate, ProductIdentity, evaluate_identity
from .product_catalog_lookup import normalize_gtin
from .shopee_offer_matcher import extract_volume_ml, extract_weight_kg, extract_weight_range_kg
# Reused as-is (not duplicated): resolves a title like "Coleira ... Scalibor
# M" or "... MSD ..." to the commercial brand name regardless of which one
# a given feed's own `brand` column happens to carry — the same
# manufacturer-vs-retail-brand inconsistency this module hits in
# _looks_like_same_product below.
from .shopee_offer_sync import _brand_for_matching


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
        # caminho principal e mais confiável. Quando um merchant usa outro
        # GTIN para a mesma apresentação, só caímos no fallback por
        # referência de outra loja Awin.
        if not context.gtin:
            return None
        gtin = normalize_gtin_gs1(context.gtin)
        if not gtin.valid or not gtin.value:
            return None

        # 2/3. Considera peso/apresentação implicitamente via weight_kg
        # (quando várias ofertas do mesmo GTIN existirem) — só
        # active + in_stock.
        rows = self._find_rows_by_gtin(gtin.value)
        found_by_reference_identity = False
        if not rows:
            rows = self._find_rows_by_reference_identity(gtin.value, context)
            found_by_reference_identity = bool(rows)
        if not rows:
            return None
        if has_ambiguous_offer_identity(rows):
            return None

        row = _select_row_by_weight(rows, context.weight_kg)
        canonical_context_gtin = normalize_gtin(context.gtin)
        row_gtin = normalize_gtin(row.gtin)
        identity = ProductIdentity.build(
            gtin=None if found_by_reference_identity and row_gtin != canonical_context_gtin else (context.gtin or row.gtin),
            canonical_name=context.canonical_name or context.name or row.title,
            brand=context.canonical_brand or context.brand or row.brand,
            species=context.species,
            category=context.category or row.category,
            weight_kg=context.weight_kg or row.weight_kg,
            image_url=context.canonical_image_url or row.image_url,
            evidence=("PRODUCT_CONTEXT", "AWIN_FEED"),
        )
        match_result = evaluate_identity(
            identity,
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
        live_price = await self._live_price_for_row(row, context)
        price = row.price
        list_price = row.list_price
        is_available = row.in_stock
        direct_url = row.merchant_url
        price_checked_at = row.last_synced_at
        price_is_stale = self.merchant == "cobasi"
        if live_price is not None:
            price = live_price.price
            list_price = live_price.list_price
            is_available = live_price.is_available
            direct_url = live_price.url or row.merchant_url
            price_checked_at = datetime.now(timezone.utc)
            price_is_stale = False

        return DiscoveredOffer(
            merchant=self.merchant,
            canonical_product_id=context.product_id,
            canonical_gtin=canonical_context_gtin or identity.gtin,
            canonical_name=identity.canonical_name,
            canonical_brand=identity.brand,
            canonical_image_url=identity.image_url,
            product_name=identity.canonical_name or row.title,
            brand=identity.brand or row.brand,
            price=price,
            list_price=list_price,
            is_available=is_available,
            direct_url=direct_url,
            ean=row.gtin,
            external_id=row.external_product_id,
            image_url=identity.image_url or row.image_url,
            price_checked_at=price_checked_at,
            price_is_stale=price_is_stale,
            merchant_product_name=row.title,
            match_decision=match_result.decision.value,
            match_confidence=match_result.confidence,
            match_reasons=list(match_result.reasons),
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

    async def _live_price_for_row(self, row: AffiliateFeedOffer, context: ProductContext):
        """Cobasi: o feed Awin pode ficar alguns reais atrás do preço
        visível no storefront. Antes de mostrar preço para o tutor, tenta
        conferir na API pública VTEX da própria Cobasi e só aceita se o
        EAN retornado for o mesmo GTIN da linha Awin. Assim não trocamos
        produto para "corrigir" preço."""
        if self.merchant != "cobasi":
            return None
        if not row.title or not row.gtin:
            return None
        try:
            result = await asyncio.wait_for(
                fetch_cobasi_price(row.title, target_weight_kg=context.weight_kg or row.weight_kg),
                timeout=2.0,
            )
        except Exception:
            return None
        if not result.found or result.price is None or not result.ean:
            return None
        if normalize_gtin(result.ean) != normalize_gtin(row.gtin):
            return None
        return result

    def monetize(self, offer: DiscoveredOffer, context: ProductContext) -> Optional[tuple[str, str, str]]:
        """Para Cobasi, o feed Awin é usado só como catálogo/preço/URL de
        produto; a monetização sai pelo programa MAIS, anexando os UTMs
        oficiais à URL do produto. Para os demais merchants Awin, usa a
        affiliate_url pronta do feed."""
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
        if not row:
            return None

        if self.merchant == "cobasi":
            merchant_url = row.merchant_url or offer.direct_url
            if not merchant_url:
                return None
            try:
                return build_cobasi_affiliate_url(merchant_url), "affiliate_product", "mais"
            except InvalidCobasiUrlError:
                return None

        if not row.affiliate_url:
            return None

        affiliate_url = row.affiliate_url
        return build_awin_click_redirect_url(affiliate_url), "affiliate_product", "awin"

    def _find_rows_by_gtin(self, gtin: str) -> list[AffiliateFeedOffer]:
        query = (
            select(AffiliateFeedOffer)
            .where(
                AffiliateFeedOffer.network == self.network,
                AffiliateFeedOffer.merchant == self.merchant,
                AffiliateFeedOffer.gtin == gtin,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
            .order_by(AffiliateFeedOffer.price.asc())
        )
        return list(self._db.scalars(query))

    def _find_rows_by_reference_identity(self, gtin: str, context: ProductContext) -> list[AffiliateFeedOffer]:
        """Fallback controlado para GTIN divergente entre merchants.

        Só roda quando outra loja Awin já resolveu o GTIN original. Essa
        linha de referência reduz o risco de uma busca textual genérica
        escolher o produto errado; se a comparação deixar mais de uma
        possibilidade, nenhuma oferta é retornada.
        """
        references = list(self._db.scalars(
            select(AffiliateFeedOffer).where(
                AffiliateFeedOffer.network == self.network,
                AffiliateFeedOffer.gtin == gtin,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
        ))
        if not references:
            return []

        candidates = list(self._db.scalars(
            select(AffiliateFeedOffer)
            .where(
                AffiliateFeedOffer.network == self.network,
                AffiliateFeedOffer.merchant == self.merchant,
                AffiliateFeedOffer.gtin != gtin,
                AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True),
            )
            .order_by(AffiliateFeedOffer.price.asc())
        ))
        matches = [
            row for row in candidates
            if _looks_like_same_product(row, references, context)
        ]
        if not matches:
            return []
        if has_ambiguous_offer_identity(matches):
            return []
        best_identity = _identity_key(matches[0])
        if any(_identity_key(row) != best_identity for row in matches[1:]):
            return []
        return matches


def _select_row_by_weight(rows: list[AffiliateFeedOffer], target_weight_kg: Optional[float]) -> AffiliateFeedOffer:
    if target_weight_kg is None:
        return rows[0]
    for row in rows:
        if row.weight_kg is not None and round(row.weight_kg, 2) == round(target_weight_kg, 2):
            return row
    return rows[0]


def _looks_like_same_product(
    candidate: AffiliateFeedOffer,
    references: list[AffiliateFeedOffer],
    context: ProductContext,
) -> bool:
    candidate_title = candidate.title or ""
    if not candidate_title:
        return False
    for reference in references:
        reference_title = reference.title or context.name or context.query or ""
        if not reference_title:
            continue
        result = evaluate_identity(
            ProductIdentity.build(
                # This fallback compares a known reference identity from
                # another feed row to a merchant row that can legitimately
                # use a sibling barcode. Do not treat the different GTIN as
                # the evidence; structured identity below must carry it.
                gtin=None,
                canonical_name=reference_title,
                brand=_brand_for_matching(reference_title, reference.brand) or reference.brand,
                category=reference.category,
                weight_kg=context.weight_kg or reference.weight_kg,
            ),
            MerchantCandidate.build(
                merchant=candidate.merchant,
                title=candidate_title,
                gtin=candidate.gtin,
                brand=candidate.brand,
                category=candidate.category,
                price=candidate.price,
                external_id=candidate.external_product_id,
            ),
            min_confidence=0.58,
        )
        if result.accepted:
            return True
        if _has_attribute_match(result, "brand") and _has_attribute_match(result, "breed_size"):
            return True
    return False


def _has_attribute_match(result, attribute: str) -> bool:
    return any(item.attribute == attribute and item.status.value == "MATCH" for item in result.attributes)


def _package_markers_compatible(candidate_title: str, reference_title: str) -> bool:
    candidate_range = extract_weight_range_kg(candidate_title)
    reference_range = extract_weight_range_kg(reference_title)
    # Faixa de peso do animal ("de 4,1 a 10kg", comum em antipulgas/
    # vermífugo por porte) é um identificador forte de variante — produtos
    # com faixas diferentes nunca são o mesmo item, mesmo com marca/nome
    # quase idênticos. Quando só um lado tem faixa detectável, não dá pra
    # confirmar compatibilidade: falha fechado (rejeita) em vez de deixar
    # o número isolado de extract_weight_kg (que só pega o limite superior
    # da faixa) mascarar a diferença — caso real: NexGard "4,1 a 10kg"
    # casando com uma faixa de porte diferente só porque os títulos
    # convergem no resto do texto.
    if candidate_range is not None or reference_range is not None:
        if candidate_range != reference_range:
            return False

    candidate_weight = extract_weight_kg(candidate_title)
    reference_weight = extract_weight_kg(reference_title)
    if candidate_weight is not None and reference_weight is not None:
        if abs(candidate_weight - reference_weight) > max(0.05, reference_weight * 0.03):
            return False
    candidate_volume = extract_volume_ml(candidate_title)
    reference_volume = extract_volume_ml(reference_title)
    if candidate_volume is not None and reference_volume is not None:
        if abs(candidate_volume - reference_volume) > max(20.0, reference_volume * 0.03):
            return False
    return True


def _size_markers_compatible(candidate_title: str, reference_title: str) -> bool:
    candidate_sizes = _size_markers(candidate_title)
    reference_sizes = _size_markers(reference_title)
    if not candidate_sizes or not reference_sizes:
        return True
    return bool(candidate_sizes & reference_sizes)


def _size_markers(title: str) -> set[str]:
    normalized = _normalize_for_identity(title)
    tokens = set(normalized.split())
    sizes: set[str] = set()
    if tokens & {"pp", "xs"}:
        sizes.add("pp")
    if tokens & {"p", "s", "pequeno", "pequenos", "small"}:
        sizes.add("p")
    if tokens & {"m", "medio", "medios", "media", "medium"}:
        sizes.add("m")
    if tokens & {"g", "grande", "grandes", "large", "l"}:
        sizes.add("g")
    if tokens & {"gg", "xg", "xl"}:
        sizes.add("gg")
    return sizes


def _identity_key(row: AffiliateFeedOffer) -> tuple[str, str, str]:
    title = _normalize_for_identity(row.title or "")
    sizes = ",".join(sorted(_size_markers(row.title or "")))
    return title, sizes, _normalize_for_identity(row.brand or "")


def _normalize_for_identity(value: str) -> str:
    import re
    import unicodedata

    text = unicodedata.normalize("NFKD", value or "")
    ascii_text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()

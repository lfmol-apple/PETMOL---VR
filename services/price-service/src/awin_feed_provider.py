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
from .awin_click_redirect import build_awin_click_redirect_url, build_cobasi_awin_deep_link
from .commerce_pricing import fetch_cobasi_price
from .commerce_provider import DiscoveredOffer, ProductContext
from .config import get_settings
from .gtin_utils import normalize_gtin_gs1
from .product_catalog_lookup import normalize_gtin
from .shopee_offer_matcher import extract_volume_ml, extract_weight_kg, extract_weight_range_kg, score_candidate
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
        if not rows:
            rows = self._find_rows_by_reference_identity(gtin.value, context)
        if not rows:
            return None
        if has_ambiguous_offer_identity(rows):
            return None

        row = _select_row_by_weight(rows, context.weight_kg)
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
            product_name=row.title,
            brand=row.brand,
            price=price,
            list_price=list_price,
            is_available=is_available,
            direct_url=direct_url,
            ean=row.gtin,
            external_id=row.external_product_id,
            image_url=row.image_url,
            price_checked_at=price_checked_at,
            price_is_stale=price_is_stale,
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

        affiliate_url = row.affiliate_url
        if self.merchant == "cobasi":
            affiliate_url = build_cobasi_awin_deep_link(row.affiliate_url, row.merchant_url)
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
        if not _package_markers_compatible(candidate_title, reference_title):
            continue
        if not _size_markers_compatible(candidate_title, reference_title):
            continue
        # Marcador de tamanho explícito e coincidente nos dois lados (ex:
        # os dois falam "M") já é evidência forte de identidade por si só.
        # Itens sem peso/volume no título (coleira, brinquedo) costumam
        # ter uma variante curta em alguma loja ("Coleira Scalibor M") que
        # nunca bateria 0.75 de sobreposição textual contra um título mais
        # descritivo de outra loja ("Coleira Scalibor Cães Pequenos e
        # Médios - 48cm"), mesmo sendo o mesmo produto — caso real: Zee
        # Now nunca aparecia pro GTIN da Cobasi da coleira Scalibor por
        # causa disso. Só baixa o piso quando essa evidência independente
        # existe; sem marcador de tamanho batendo dos dois lados, mantém
        # 0.75 (mesmo comportamento de antes).
        candidate_sizes = _size_markers(candidate_title)
        reference_sizes = _size_markers(reference_title)
        has_explicit_size_match = bool(candidate_sizes and reference_sizes and (candidate_sizes & reference_sizes))
        # 0.35 é calibrado contra dados reais: "Coleira Antiparasitária
        # Scalibor M" vs a referência "...Scalibor Cães Pequenos e Médios
        # - 48 cm" pontua 0.375 (mesmo produto). Mas contra o catálogo
        # real inteiro (não só um candidato isolado), esse piso sozinho
        # também bate em OUTRAS marcas de coleira genéricas — "Coleira
        # Antiparasitária Dug's ... Cães ..." pontua parecido, porque boa
        # parte da pontuação vem de palavras genéricas do tipo de produto
        # ("coleira", "antiparasitária", "cães"), não da marca. Confirmado
        # em produção: sem a trava de marca abaixo, isso derrubava o
        # próprio caso real por ambiguidade (3+ marcas diferentes batendo
        # o piso, nenhuma vencendo). Por isso exige a marca comercial da
        # referência (extraída do título — ver _brand_for_matching, o
        # campo `brand` do feed é inconsistente fabricante-vs-comercial)
        # aparecendo no título do candidato, só nesse caminho de piso
        # reduzido.
        min_score = 0.75
        expected_brand = None
        if has_explicit_size_match:
            min_score = 0.35
            expected_brand = _brand_for_matching(reference_title, reference.brand)
        score = score_candidate(
            reference_title,
            candidate_title,
            expected_brand=expected_brand,
            expected_weight_kg=context.weight_kg or reference.weight_kg or extract_weight_kg(reference_title),
            expected_volume_ml=extract_volume_ml(reference_title),
        )
        if score is None or score < min_score:
            continue
        return True
    return False


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

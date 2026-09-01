"""
Enriquecimento do CATÁLOGO MESTRE PETMOL a partir de feeds estruturados
(Awin hoje — Cobasi / Zee Now / Zee Dog).

Princípio (ver docs/PRODUCT_IDENTITY.md):
  RAW FEED  →  normalize (CatalogEvidence)  →  merge_product_catalog_identity()  →  ProductCatalog

  - GTIN é a chave. Um GTIN = um SKU = uma linha de ProductCatalog.
  - Texto (título/categoria/descrição) ENRIQUECE; nunca contradiz um GTIN.
  - Determinístico e auditável — nada de LLM em runtime.
  - Nunca rebaixa uma informação canônica boa por uma pior:
      * escreve um `canonical_*` só quando está vazio, ou quando ESTE
        pipeline já o escreveu antes e a confiança nova ≥ a registrada;
      * discriminador estrutural (peso/volume/cm/pack) que os feeds
        discordam → fica NULO e a divergência é registrada como `ambiguous`.
  - Toda decisão fica em `ProductCatalog.identity_evidence_json`.

Awin aqui é FONTE DE DADOS, não loja. Nenhum link/preço deste módulo vira
oferta ao tutor — monetização Cobasi (ProductAffiliateLink / EAN) e
descoberta Shopee continuam nos seus providers.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .product_identity import ProductIdentity, _normalize_text, _tokenize_text

logger = logging.getLogger(__name__)

# Confiança relativa por merchant do feed — para NOME/IMAGEM (identidade
# de apresentação). Para discriminador estrutural, todos valem igual: o
# que conta é concordância, não a origem.
_MERCHANT_PRESENTATION_TRUST = {"cobasi": 0.90, "zeenow": 0.80, "zeedog": 0.80}
_DEFAULT_MERCHANT_TRUST = 0.70

# Fontes que este pipeline nunca sobrescreve, mesmo em campo já preenchido.
_PROTECTED_SOURCES = {"MANUAL", "ADMIN", "PETMOL_VALIDATED"}

_SPECIES_FROM_CATEGORY_TOKENS = {
    "dog": {"cachorro", "cachorros", "cao", "caes", "canino", "dog", "dogs"},
    "cat": {"gato", "gatos", "gata", "gatas", "felino", "cat", "cats"},
}

_STRUCTURED_DISCRIMINATORS = ("weight_kg", "volume_ml", "length_cm", "pack_count")


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass(frozen=True)
class CatalogEvidence:
    """Um sinal estruturado sobre um GTIN, extraído de UMA linha de feed."""

    gtin: str
    source: str            # "AWIN_FEED"
    source_merchant: str    # "cobasi" | "zeenow" | "zeedog"
    source_feed: str        # "awin:17870"
    presentation_trust: float
    identity: ProductIdentity
    title: Optional[str]
    image_url: Optional[str]
    has_structured_name: bool
    at: datetime = field(default_factory=_now)


@dataclass
class CatalogMergeResult:
    gtin: str
    product_id: Optional[int]
    created: bool
    updated_fields: list[str] = field(default_factory=list)
    ambiguous_fields: list[str] = field(default_factory=list)
    evidence_count: int = 0
    skipped_reason: Optional[str] = None


def _species_from_category(category: Optional[str]) -> Optional[str]:
    tokens = _tokenize_text(category or "")
    hits = {sp for sp, toks in _SPECIES_FROM_CATEGORY_TOKENS.items() if tokens & toks}
    return next(iter(hits)) if len(hits) == 1 else None


def evidence_from_feed_offer(offer: AffiliateFeedOffer) -> Optional[CatalogEvidence]:
    gtin = normalize_gtin(offer.gtin or "")
    if not gtin or not offer.title:
        return None
    species = _species_from_category(offer.category)

    # `title` é a identidade de apresentação. `category` + `description`
    # entram como texto extra pra o engine harvest de discriminadores
    # (peso/volume/cm/pack/porte/sabor/terapêutico) que o título curto pode
    # não trazer — nunca pra virar o nome.
    base = ProductIdentity.build(
        gtin=gtin, canonical_name=offer.title, brand=offer.brand,
        category=offer.category, species=species,
        image_url=offer.image_url, aliases=(offer.title,),
    )
    extra_text = " ".join(p for p in (offer.category, offer.description) if p)
    extra = ProductIdentity.build(canonical_name=f"{offer.title} {extra_text}".strip(), brand=offer.brand)
    identity = ProductIdentity.build(
        gtin=gtin, canonical_name=offer.title, brand=offer.brand,
        category=offer.category, species=species,
        image_url=offer.image_url, aliases=(offer.title,),
        weight_kg=base.weight_kg or extra.weight_kg,
        volume_ml=base.volume_ml or extra.volume_ml,
        length_cm=base.length_cm or extra.length_cm,
        pack_count=base.pack_count or extra.pack_count,
        animal_weight_range=base.animal_weight_range or extra.animal_weight_range,
        life_stage=base.life_stage or extra.life_stage,
        breed_size=base.breed_size or extra.breed_size,
        flavor=base.flavor or extra.flavor,
        therapeutic_attributes=tuple(sorted(set(base.therapeutic_attributes) | set(extra.therapeutic_attributes))),
    )
    has_structured = any(getattr(identity, d) is not None for d in _STRUCTURED_DISCRIMINATORS)
    return CatalogEvidence(
        gtin=gtin,
        source="AWIN_FEED",
        source_merchant=(offer.merchant or "").lower() or "unknown",
        source_feed=f"{offer.network or 'awin'}:{offer.advertiser_id or '?'}",
        presentation_trust=_MERCHANT_PRESENTATION_TRUST.get(
            (offer.merchant or "").lower(), _DEFAULT_MERCHANT_TRUST
        ),
        identity=identity,
        title=offer.title,
        image_url=offer.image_url,
        has_structured_name=has_structured,
    )


# ── política de merge por campo ───────────────────────────────────────

def _numeric_agree(values: list[float], *, rel: float = 0.03, absmin: float = 0.02) -> Optional[float]:
    vals = [v for v in values if v is not None]
    if not vals:
        return None
    lo, hi = min(vals), max(vals)
    tol = max(absmin, abs(lo) * rel)
    return round(sum(vals) / len(vals), 4) if (hi - lo) <= tol else None


def _mode(values: list[Any]) -> Optional[Any]:
    vals = [v for v in values if v not in (None, "")]
    if not vals:
        return None
    counts: dict[Any, int] = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    return max(counts.items(), key=lambda kv: kv[1])[0]


def _pick_canonical_name(evidences: list[CatalogEvidence]) -> Optional[str]:
    # prefere um título que já traz o SKU (peso/volume) — mais específico —
    # e, entre iguais, o merchant de maior confiança de apresentação.
    structured = [e for e in evidences if e.has_structured_name and e.title]
    pool = structured or [e for e in evidences if e.title]
    if not pool:
        return None
    pool.sort(key=lambda e: (e.presentation_trust, len(e.title or "")), reverse=True)
    return pool[0].title


def _pick_image(evidences: list[CatalogEvidence]) -> Optional[str]:
    pool = [e for e in evidences if e.image_url]
    if not pool:
        return None
    pool.sort(key=lambda e: e.presentation_trust, reverse=True)
    return pool[0].image_url


def _structured_value(field_name: str, evidences: list[CatalogEvidence]) -> tuple[Optional[Any], bool]:
    """(valor, ambíguo?). Só devolve valor quando os feeds concordam
    (ou só um informou). Divergência → (None, True)."""
    raw = [getattr(e.identity, field_name) for e in evidences]
    present = [v for v in raw if v is not None]
    if not present:
        return None, False
    if field_name == "weight_kg" or field_name == "volume_ml" or field_name == "length_cm":
        agreed = _numeric_agree([float(v) for v in present])
        return (agreed, agreed is None and len(present) > 1)
    if len(set(present)) == 1:
        return present[0], False
    return None, True


def _species_value(evidences: list[CatalogEvidence]) -> tuple[Optional[str], bool]:
    present = [e.identity.species for e in evidences if e.identity.species]
    if not present:
        return None, False
    if len(set(present)) == 1:
        return present[0], False
    return None, True


def _text_field(field_name: str, evidences: list[CatalogEvidence]) -> Optional[str]:
    return _mode([getattr(e.identity, field_name) for e in evidences])


def _therapeutics_union(evidences: list[CatalogEvidence]) -> list[str]:
    out: set[str] = set()
    for e in evidences:
        out.update(e.identity.therapeutic_attributes or ())
    return sorted(out)


def _aliases(evidences: list[CatalogEvidence]) -> list[str]:
    seen: list[str] = []
    for e in evidences:
        for a in (e.identity.aliases or ()):
            n = (a or "").strip()
            if n and n not in seen:
                seen.append(n)
    return seen[:8]


_JSON_FIELDS = {"therapeutic_attributes_json", "identity_aliases_json"}


def _load_evidence_log(product: ProductCatalog) -> dict:
    try:
        parsed = json.loads(product.identity_evidence_json or "{}")
        return parsed if isinstance(parsed, dict) else {}
    except Exception:  # noqa: BLE001
        return {}


def _may_write(product: ProductCatalog, field_name: str, log: dict, new_confidence: float) -> bool:
    current = getattr(product, field_name, None)
    if current in (None, "", "[]"):
        return True
    entry = log.get(field_name)
    if not entry:
        # campo já tem valor mas não foi este pipeline que pôs — não mexe.
        return False
    if entry.get("source") in _PROTECTED_SOURCES:
        return False
    if entry.get("source") != "AWIN_FEED":
        return False
    return float(new_confidence) >= float(entry.get("confidence", 0.0))


def merge_product_catalog_identity(
    db: Session, gtin: str, *, dry_run: bool = False
) -> CatalogMergeResult:
    gtin_n = normalize_gtin(gtin or "")
    if not gtin_n:
        return CatalogMergeResult(gtin=gtin, product_id=None, created=False, skipped_reason="gtin_invalido")

    rows = list(db.scalars(
        select(AffiliateFeedOffer).where(
            AffiliateFeedOffer.gtin == gtin_n,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.title.isnot(None),
        )
    ))
    evidences = [e for r in rows if (e := evidence_from_feed_offer(r)) is not None]
    if not evidences:
        return CatalogMergeResult(gtin=gtin_n, product_id=None, created=False, skipped_reason="sem_evidencia_de_feed")

    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_n))
    created = product is None
    if created:
        product = ProductCatalog(barcode=gtin_n, barcode_normalized=gtin_n)
        if not dry_run:
            db.add(product)

    log = _load_evidence_log(product)
    now = _now()
    n_sources = len({e.source_merchant for e in evidences})
    result = CatalogMergeResult(gtin=gtin_n, product_id=product.id, created=created, evidence_count=len(evidences))

    def _set(field_name: str, value: Any, *, confidence: float, ambiguous: bool = False, sources: Optional[list[str]] = None) -> None:
        if ambiguous:
            result.ambiguous_fields.append(field_name)
            log[field_name] = {"value": None, "source": "AWIN_FEED", "confidence": 0.0,
                               "ambiguous": True, "sources": sorted({e.source_merchant for e in evidences}),
                               "at": now.isoformat()}
            return
        if value in (None, "", []):
            return
        if not _may_write(product, field_name, log, confidence):
            return
        stored = json.dumps(value, ensure_ascii=False) if field_name in _JSON_FIELDS else value
        if getattr(product, field_name, None) == stored:
            log.setdefault(field_name, {})
            return
        if not dry_run:
            setattr(product, field_name, stored)
        result.updated_fields.append(field_name)
        log[field_name] = {
            "value": value if field_name not in _JSON_FIELDS else "…",
            "source": "AWIN_FEED", "confidence": round(float(confidence), 3),
            "sources": sorted(sources or {e.source_merchant for e in evidences}),
            "at": now.isoformat(),
        }

    # nome / marca / imagem — identidade de apresentação
    _set("canonical_name", _pick_canonical_name(evidences), confidence=max((e.presentation_trust for e in evidences), default=0.0))
    _set("canonical_brand", _text_field("brand", evidences), confidence=0.75)
    _set("thumbnail_url", _pick_image(evidences), confidence=max((e.presentation_trust for e in evidences), default=0.0))

    # espécie — categoria explícita concordante
    sp, sp_amb = _species_value(evidences)
    _set("species", sp, confidence=0.85, ambiguous=sp_amb)

    # família / linha / porte / raça / sabor
    _set("product_family", _text_field("product_family", evidences), confidence=0.6)
    _set("product_line", _text_field("product_line", evidences), confidence=0.6)
    _set("breed_size", _text_field("breed_size", evidences), confidence=0.7)
    _set("breed", _text_field("breed", evidences), confidence=0.7)
    _set("flavor", _text_field("flavor", evidences), confidence=0.7)

    # discriminadores estruturais — só se os feeds concordam
    for fname in ("weight_kg", "volume_ml", "length_cm", "pack_count"):
        val, amb = _structured_value(fname, evidences)
        # concordância entre 2+ fontes vale mais
        conf = 0.9 if (val is not None and n_sources >= 2) else 0.75
        _set(fname, val, confidence=conf, ambiguous=amb)

    # faixa de peso do animal
    ranges = [e.identity.animal_weight_range for e in evidences if e.identity.animal_weight_range]
    if ranges and len(set(ranges)) == 1:
        _set("animal_weight_min_kg", float(ranges[0][0]), confidence=0.8)
        _set("animal_weight_max_kg", float(ranges[0][1]), confidence=0.8)
    elif len(set(ranges)) > 1:
        result.ambiguous_fields.append("animal_weight_range")

    # atributos terapêuticos (união) e aliases (todos os títulos)
    therap = _therapeutics_union(evidences)
    if therap:
        _set("therapeutic_attributes_json", therap, confidence=0.7)
    aliases = _aliases(evidences)
    if aliases:
        _set("identity_aliases_json", aliases, confidence=0.6)

    if not dry_run:
        product.identity_evidence_json = json.dumps(log, ensure_ascii=False, separators=(",", ":"))
        product.identity_enriched_at = now
        product.last_verified_at = now
        product.updated_at = now
        if product.source_primary in (None, "", "pending"):
            product.source_primary = "awin_feed"
        product.source_confidence = max(float(product.source_confidence or 0.0), 80.0)
        # nunca deixa o SKU sem NENHUM nome — legado `name` cai pro canônico
        # quando estava vazio (nunca sobrescreve um nome já existente).
        if not product.name and product.canonical_name:
            product.name = product.canonical_name
        if not product.brand and product.canonical_brand:
            product.brand = product.canonical_brand
        db.flush()

    result.product_id = product.id
    return result


@dataclass
class CatalogEnrichBatchSummary:
    processed: int = 0
    created: int = 0
    updated: int = 0
    ambiguous: int = 0
    unchanged: int = 0
    errors: int = 0
    remaining: int = 0


def _tutor_scanned_gtins(db: Session) -> list[str]:
    try:
        from .product_catalog_lookup import ProductScanEvent
    except Exception:  # noqa: BLE001
        return []
    rows = db.execute(
        select(ProductScanEvent.barcode_normalized)
        .where(ProductScanEvent.barcode_normalized.isnot(None))
        .distinct()
    ).all()
    out: list[str] = []
    for (g,) in rows:
        n = normalize_gtin(g or "")
        if n:
            out.append(n)
    return out


def enrich_feed_catalog_batch(
    db: Session,
    *,
    max_products: int = 500,
    only_stale: bool = True,
    gtins: Optional[list[str]] = None,
) -> CatalogEnrichBatchSummary:
    """Roda merge_product_catalog_identity para uma leva de GTINs do feed.
    Prioridade: GTINs que os tutores escaneiam → nunca enriquecidos →
    mais antigos. Determinístico, só banco."""
    summary = CatalogEnrichBatchSummary()
    cap = max(max_products, 1)

    if gtins is not None:
        queue = [n for g in gtins if (n := normalize_gtin(g or ""))]
    else:
        stale_cut = _now() - timedelta(days=7)
        feed_gtins = [
            g for (g,) in db.execute(
                select(AffiliateFeedOffer.gtin)
                .where(AffiliateFeedOffer.active.is_(True), AffiliateFeedOffer.gtin.isnot(None),
                       AffiliateFeedOffer.title.isnot(None))
                .distinct()
            ).all() if g
        ]
        feed_set = set(feed_gtins)
        tutor = [g for g in _tutor_scanned_gtins(db) if g in feed_set]
        enriched: dict[str, Optional[datetime]] = {
            row.barcode_normalized: row.identity_enriched_at
            for row in db.scalars(
                select(ProductCatalog).where(ProductCatalog.barcode_normalized.in_(list(feed_set)))
            )
        }

        def _is_stale(g: str) -> bool:
            if not only_stale:
                return True
            at = enriched.get(g)
            if at is None:
                return True
            if at.tzinfo is None:
                at = at.replace(tzinfo=timezone.utc)
            return at < stale_cut

        seen: set[str] = set()
        queue = []
        for g in [*tutor, *feed_gtins]:
            if g in seen or not _is_stale(g):
                continue
            seen.add(g)
            queue.append(g)

    total = len(queue)
    for g in queue[:cap]:
        summary.processed += 1
        try:
            r = merge_product_catalog_identity(db, g)
            db.commit()
            if r.created:
                summary.created += 1
            if r.updated_fields:
                summary.updated += 1
            elif not r.ambiguous_fields:
                summary.unchanged += 1
            if r.ambiguous_fields:
                summary.ambiguous += 1
        except Exception as exc:  # noqa: BLE001 — um GTIN nunca derruba o job
            db.rollback()
            summary.errors += 1
            logger.warning("[catalog_enrichment] gtin=%s falhou: %s", g, exc)
    summary.remaining = max(total - cap, 0)
    return summary

"""Universal product identity engine for commerce matching.

Rule: GTIN defines identity. Text validates, enriches and disambiguates.
A merchant offer never becomes the product truth.

This module is pure business logic: no DB, no HTTP, no secrets. Providers
feed it a PETMOL canonical identity and a merchant candidate; it returns an
auditable decision with per-attribute MATCH/UNKNOWN/CONFLICT states.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Any, Optional

from .product_catalog_lookup import normalize_gtin
from .shopee_offer_matcher import (
    _normalize as _normalize_text,
    _tokenize as _tokenize_text,
    extract_length_cm,
    extract_pack_count,
    extract_volume_ml,
    extract_weight_kg,
    is_multipack,
)


class AttributeStatus(str, Enum):
    MATCH = "MATCH"
    UNKNOWN = "UNKNOWN"
    CONFLICT = "CONFLICT"


class IdentityDecision(str, Enum):
    EXACT = "EXACT"
    HIGH_CONFIDENCE = "HIGH_CONFIDENCE"
    AMBIGUOUS = "AMBIGUOUS"
    CONFLICT = "CONFLICT"
    NO_MATCH = "NO_MATCH"


@dataclass(frozen=True)
class AttributeComparison:
    attribute: str
    expected: Any = None
    observed: Any = None
    status: AttributeStatus = AttributeStatus.UNKNOWN
    reason: str = ""


@dataclass(frozen=True)
class ProductIdentity:
    gtin: Optional[str] = None
    canonical_name: Optional[str] = None
    brand: Optional[str] = None
    species: Optional[str] = None
    category: Optional[str] = None
    product_family: Optional[str] = None
    product_line: Optional[str] = None
    weight_kg: Optional[float] = None
    volume_ml: Optional[float] = None
    length_cm: Optional[float] = None
    pack_count: Optional[int] = None
    animal_weight_range: Optional[tuple[float, float]] = None
    life_stage: Optional[str] = None
    breed_size: Optional[str] = None
    breed: Optional[str] = None
    flavor: Optional[str] = None
    therapeutic_attributes: tuple[str, ...] = ()
    aliases: tuple[str, ...] = ()
    image_url: Optional[str] = None
    evidence: tuple[str, ...] = ()

    @classmethod
    def build(
        cls,
        *,
        gtin: Optional[str] = None,
        canonical_name: Optional[str] = None,
        brand: Optional[str] = None,
        species: Optional[str] = None,
        category: Optional[str] = None,
        product_family: Optional[str] = None,
        product_line: Optional[str] = None,
        weight_kg: Optional[float] = None,
        volume_ml: Optional[float] = None,
        length_cm: Optional[float] = None,
        pack_count: Optional[int] = None,
        animal_weight_range: Optional[tuple[float, float]] = None,
        life_stage: Optional[str] = None,
        breed_size: Optional[str] = None,
        breed: Optional[str] = None,
        flavor: Optional[str] = None,
        therapeutic_attributes: tuple[str, ...] = (),
        aliases: tuple[str, ...] = (),
        image_url: Optional[str] = None,
        evidence: tuple[str, ...] = (),
    ) -> "ProductIdentity":
        text = " ".join(part for part in (canonical_name, product_line, product_family) if part)
        animal_range = animal_weight_range or extract_animal_weight_range_kg(text)
        brand_norm = normalize_brand(brand, name_hint=canonical_name or product_line or product_family)
        return cls(
            gtin=normalize_gtin(gtin or "") or None,
            canonical_name=_clean(canonical_name),
            brand=brand_norm,
            species=_normalize_species(species) or _infer_species(text),
            category=_clean(category),
            product_family=_clean(product_family) or _infer_family(canonical_name, brand_norm),
            product_line=_clean(product_line) or _infer_product_line(text),
            weight_kg=weight_kg if weight_kg is not None else _product_weight_kg(text, animal_range),
            volume_ml=volume_ml if volume_ml is not None else extract_volume_ml(text),
            length_cm=length_cm if length_cm is not None else (extract_length_cm(text) or _infer_collar_length_cm(text)),
            pack_count=pack_count if pack_count is not None else extract_pack_count(text),
            animal_weight_range=animal_range,
            life_stage=_normalize_life_stage(life_stage) or _infer_life_stage(text),
            breed_size=_normalize_breed_size(breed_size) or _infer_breed_size(text),
            breed=_clean(breed),
            flavor=_normalize_flavor(flavor) or _infer_flavor(text),
            therapeutic_attributes=tuple(sorted(set(therapeutic_attributes) | _infer_therapeutics(text))),
            aliases=tuple(alias for alias in aliases if alias),
            image_url=_clean(image_url),
            evidence=tuple(evidence),
        )

    @classmethod
    def from_catalog(cls, product: Any) -> "ProductIdentity":
        aliases = _json_list(getattr(product, "identity_aliases_json", None))
        therapeutics = _json_list(getattr(product, "therapeutic_attributes_json", None))
        animal_min = getattr(product, "animal_weight_min_kg", None)
        animal_max = getattr(product, "animal_weight_max_kg", None)
        animal_range = (float(animal_min), float(animal_max)) if animal_min is not None and animal_max is not None else None
        return cls.build(
            gtin=getattr(product, "barcode_normalized", None) or getattr(product, "barcode", None),
            canonical_name=getattr(product, "canonical_name", None) or getattr(product, "name", None),
            brand=getattr(product, "canonical_brand", None) or getattr(product, "brand", None),
            species=getattr(product, "species", None),
            category=getattr(product, "category", None),
            product_family=getattr(product, "product_family", None),
            product_line=getattr(product, "product_line", None),
            weight_kg=getattr(product, "weight_kg", None),
            volume_ml=getattr(product, "volume_ml", None),
            length_cm=getattr(product, "length_cm", None),
            pack_count=getattr(product, "pack_count", None),
            animal_weight_range=animal_range,
            life_stage=getattr(product, "life_stage", None),
            breed_size=getattr(product, "breed_size", None),
            breed=getattr(product, "breed", None),
            flavor=getattr(product, "flavor", None),
            therapeutic_attributes=tuple(str(x) for x in therapeutics),
            aliases=tuple(str(x) for x in aliases),
            image_url=getattr(product, "thumbnail_url", None),
            evidence=("PRODUCT_CATALOG",),
        )


@dataclass(frozen=True)
class MerchantCandidate:
    merchant: str
    title: Optional[str] = None
    gtin: Optional[str] = None
    brand: Optional[str] = None
    category: Optional[str] = None
    price: Optional[float] = None
    external_id: Optional[str] = None

    @classmethod
    def build(
        cls,
        *,
        merchant: str,
        title: Optional[str],
        gtin: Optional[str] = None,
        brand: Optional[str] = None,
        category: Optional[str] = None,
        price: Optional[float] = None,
        external_id: Optional[str] = None,
    ) -> "MerchantCandidate":
        return cls(
            merchant=merchant,
            title=_clean(title),
            gtin=normalize_gtin(gtin or "") or None,
            brand=normalize_brand(brand, name_hint=title),
            category=_clean(category),
            price=price,
            external_id=_clean(external_id),
        )


@dataclass(frozen=True)
class IdentityMatchResult:
    decision: IdentityDecision
    confidence: float
    reasons: tuple[str, ...] = ()
    attributes: tuple[AttributeComparison, ...] = ()

    @property
    def accepted(self) -> bool:
        return self.decision in {IdentityDecision.EXACT, IdentityDecision.HIGH_CONFIDENCE}

    def reasons_json(self) -> str:
        return json.dumps(list(self.reasons), ensure_ascii=False, separators=(",", ":"))

    def attributes_json(self) -> str:
        return json.dumps([
            {
                "attribute": item.attribute,
                "expected": item.expected,
                "observed": item.observed,
                "status": item.status.value,
                "reason": item.reason,
            }
            for item in self.attributes
        ], ensure_ascii=False, separators=(",", ":"))


def evaluate_identity(
    expected: ProductIdentity,
    candidate: MerchantCandidate,
    *,
    min_confidence: float = 0.58,
) -> IdentityMatchResult:
    candidate_text = " ".join(part for part in (candidate.title, candidate.brand, candidate.category) if part)
    comparisons = [
        _compare_gtin(expected.gtin, candidate.gtin),
        _compare_brand(expected.brand, candidate.brand, candidate_text),
        _compare_species(expected.species, candidate_text),
        _compare_numeric("weight_kg", expected.weight_kg, extract_weight_kg(candidate_text), tolerance=max(0.05, (expected.weight_kg or 0) * 0.05)),
        _compare_numeric("volume_ml", expected.volume_ml, extract_volume_ml(candidate_text), tolerance=max(20.0, (expected.volume_ml or 0) * 0.05)),
        _compare_numeric("length_cm", expected.length_cm, extract_length_cm(candidate_text) or _infer_collar_length_cm(candidate_text), tolerance=2.0),
        _compare_exact("pack_count", expected.pack_count, extract_pack_count(candidate_text)),
        _compare_multipack(expected, candidate_text),
        _compare_range("animal_weight_range", expected.animal_weight_range, extract_animal_weight_range_kg(candidate_text)),
        _compare_exact("life_stage", expected.life_stage, _infer_life_stage(candidate_text)),
        _compare_exact("breed_size", expected.breed_size, _infer_breed_size(candidate_text)),
        _compare_exact("flavor", expected.flavor, _infer_flavor(candidate_text)),
        _compare_set("therapeutic_attributes", set(expected.therapeutic_attributes), _infer_therapeutics(candidate_text)),
    ]

    conflicts = [item for item in comparisons if item.status == AttributeStatus.CONFLICT]
    if conflicts:
        reasons = tuple(_reason_for_conflict(item) for item in conflicts)
        if any(item.attribute == "gtin" for item in conflicts):
            reasons = ("GTIN_CONFLICT", *[reason for reason in reasons if reason != "GTIN_CONFLICT"])
        return IdentityMatchResult(IdentityDecision.CONFLICT, 0.0, reasons, tuple(comparisons))

    gtin_cmp = comparisons[0]
    matched = [item for item in comparisons if item.status == AttributeStatus.MATCH]
    unknown = [item for item in comparisons if item.status == AttributeStatus.UNKNOWN]

    if gtin_cmp.status == AttributeStatus.MATCH:
        reasons = ("GTIN_EXACT", *[_reason_for_match(item) for item in matched if item.attribute != "gtin"])
        return IdentityMatchResult(IdentityDecision.EXACT, 1.0, _dedupe(reasons), tuple(comparisons))

    text_score = _text_identity_score(expected, candidate_text)
    family_match = _family_matches(expected, candidate_text)
    sku_matches = [item for item in matched if item.attribute in _SKU_SCORE_ATTRIBUTES]
    flavor_matches = [item for item in matched if item.attribute == "flavor"]
    identity_reasons: list[str] = []
    if _comparison("brand", comparisons).status == AttributeStatus.MATCH:
        identity_reasons.append("BRAND_MATCH")
    if family_match:
        identity_reasons.append("FAMILY_MATCH")
    identity_reasons.extend(_reason_for_match(item) for item in sku_matches)
    identity_reasons.extend(_reason_for_match(item) for item in flavor_matches)
    if text_score >= 0.82:
        identity_reasons.append("TEXT_STRONG_MATCH")

    has_identity_base = "BRAND_MATCH" in identity_reasons and (
        family_match or text_score >= 0.70 or len(sku_matches) >= 2 or (sku_matches and text_score >= 0.60)
    )
    has_sku_evidence = bool(sku_matches or flavor_matches) or not _expected_has_structured_sku(expected)
    confidence = min(0.98, round((text_score * 0.55) + (0.15 if "BRAND_MATCH" in identity_reasons else 0) + (0.15 if family_match else 0) + (0.08 * len(sku_matches)), 4))

    if has_identity_base and has_sku_evidence and confidence >= min_confidence:
        return IdentityMatchResult(
            IdentityDecision.HIGH_CONFIDENCE,
            confidence,
            _dedupe(tuple(identity_reasons)),
            tuple(comparisons),
        )

    missing = [item.attribute for item in unknown if item.attribute in _SKU_ATTRIBUTES and getattr(expected, item.attribute, None) is not None]
    reasons = ["INSUFFICIENT_IDENTITY_EVIDENCE"]
    if missing:
        reasons.extend(f"MISSING_{name.upper()}" for name in missing)
    return IdentityMatchResult(IdentityDecision.NO_MATCH, confidence, _dedupe(tuple(reasons)), tuple(comparisons))


_STRUCTURAL_FIELDS = ("weight_kg", "volume_ml", "length_cm", "pack_count", "animal_weight_range", "species", "breed_size")


def _compare_set_conflict(attribute: str, a: set, b: set) -> AttributeComparison:
    """Dois conjuntos não-vazios e diferentes = CONFLICT (ex.: urinary vs
    renal). Um vazio = UNKNOWN. Iguais = MATCH."""
    if not a or not b:
        return AttributeComparison(attribute, sorted(a), sorted(b), AttributeStatus.UNKNOWN, f"MISSING_{attribute.upper()}")
    if a == b:
        return AttributeComparison(attribute, sorted(a), sorted(b), AttributeStatus.MATCH, f"{attribute.upper()}_MATCH")
    return AttributeComparison(attribute, sorted(a), sorted(b), AttributeStatus.CONFLICT, f"{attribute.upper()}_CONFLICT")


def compare_structural(a: ProductIdentity, b: ProductIdentity) -> tuple[AttributeComparison, ...]:
    """Compara dois produtos PETMOL campo a campo (não PETMOL-vs-merchant).
    Usado pelo agrupamento de SKU: só forma grupo se os discriminadores
    estruturais BATEM; qualquer CONFLICT veta. Tolerâncias mais APERTADAS
    que o evaluate_identity — agrupamento exige o MESMO SKU, não 'perto'.
    Sem texto, sem score."""
    w_tol = max(0.01, min(a.weight_kg or 9e9, b.weight_kg or 9e9) * 0.02)
    v_tol = max(5.0, min(a.volume_ml or 9e9, b.volume_ml or 9e9) * 0.02)
    out = [
        _compare_numeric("weight_kg", a.weight_kg, b.weight_kg, tolerance=w_tol),
        _compare_numeric("volume_ml", a.volume_ml, b.volume_ml, tolerance=v_tol),
        _compare_numeric("length_cm", a.length_cm, b.length_cm, tolerance=1.0),
        _compare_exact("pack_count", a.pack_count, b.pack_count),
        _compare_range("animal_weight_range", a.animal_weight_range, b.animal_weight_range),
        _compare_exact("species", a.species, b.species),
        _compare_exact("breed_size", a.breed_size, b.breed_size),
        _compare_exact("breed", a.breed, b.breed),
        _compare_exact("life_stage", a.life_stage, b.life_stage),
        _compare_exact("flavor", a.flavor, b.flavor),
        _compare_set_conflict("therapeutic_attributes", set(a.therapeutic_attributes), set(b.therapeutic_attributes)),
        _compare_exact("product_line", a.product_line, b.product_line),
    ]
    return tuple(out)


def structural_conflict(a: ProductIdentity, b: ProductIdentity) -> Optional[str]:
    for item in compare_structural(a, b):
        if item.status == AttributeStatus.CONFLICT:
            return item.reason
    return None


def structural_agreement(a: ProductIdentity, b: ProductIdentity) -> list[str]:
    """Campos estruturais que BATEM entre os dois (não UNKNOWN, não CONFLICT)."""
    return [item.attribute for item in compare_structural(a, b) if item.status == AttributeStatus.MATCH]


def select_unambiguous_match(
    expected: ProductIdentity,
    candidates: list[MerchantCandidate],
    *,
    min_confidence: float = 0.58,
    ambiguity_margin: float = 0.08,
) -> tuple[Optional[MerchantCandidate], IdentityMatchResult, list[IdentityMatchResult]]:
    results = [evaluate_identity(expected, candidate, min_confidence=min_confidence) for candidate in candidates]
    accepted = [(candidate, result) for candidate, result in zip(candidates, results) if result.accepted]
    if not accepted:
        conflicts = [result for result in results if result.decision == IdentityDecision.CONFLICT]
        if conflicts:
            return None, conflicts[0], results
        return None, IdentityMatchResult(IdentityDecision.NO_MATCH, 0.0, ("NO_ACCEPTED_CANDIDATE",), ()), results

    accepted.sort(key=lambda item: (_decision_rank(item[1].decision), item[1].confidence), reverse=True)
    winner, winner_result = accepted[0]
    if len(accepted) > 1:
        second = accepted[1][1]
        if _decision_rank(second.decision) == _decision_rank(winner_result.decision) and (
            winner_result.confidence - second.confidence
        ) <= ambiguity_margin:
            return None, IdentityMatchResult(
                IdentityDecision.AMBIGUOUS,
                winner_result.confidence,
                ("AMBIGUOUS_ACCEPTED_CANDIDATES",),
                winner_result.attributes,
            ), results
    return winner, winner_result, results


def reason_counts(results: list[IdentityMatchResult]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for result in results:
        for reason in result.reasons:
            counts[reason] = counts.get(reason, 0) + 1
    return counts


_SKU_ATTRIBUTES = {
    "weight_kg",
    "volume_ml",
    "length_cm",
    "pack_count",
    "animal_weight_range",
    "life_stage",
    "breed_size",
    "flavor",
    "therapeutic_attributes",
}
_SKU_SCORE_ATTRIBUTES = _SKU_ATTRIBUTES - {"flavor"}

_THERAPEUTIC_GROUPS = {
    "urinary": {"urinary", "urinario", "urinaria", "urinarias", "s/o", "so"},
    "renal": {"renal", "kidney"},
    "hypoallergenic": {"hypoallergenic", "hipoalergenico", "hipoalergenica"},
    "gastrointestinal": {"gastrointestinal", "digestive"},
    "dermatologic": {"dermatologic", "dermatologico", "dermatologica", "skin"},
    "obesity": {"obesity", "satiety", "satierty"},
}

# "light" sozinho gera falso-positivo de obesidade em não-alimento ("Roupa
# Pós-Cirúrgica Dry Light", "Coleira LED Light") — só conta como sinal de
# obesidade junto de um termo de alimento/dieta.
_LIGHT_FOOD_CONTEXT = {"racao", "alimento", "dieta", "formula", "food", "diet", "seca", "umida", "petisco"}


_ANIMAL_WEIGHT_CONTEXT = re.compile(
    r"(?:caes|cao|cachorr\w*|gat\w*|animais?|racas?|pet\w*|porte)\b[^\d]{0,24}"
    r"(?:de|acima de|ate|até|maiores? que|a partir de)\s*\d",
)


def extract_animal_weight_range_kg(text: str) -> Optional[tuple[float, float]]:
    normalized = _normalize_text(text)
    range_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*(?:a|-|ate|até)\s*(\d+(?:[.,]\d+)?)\s*kg\b", normalized)
    if range_match:
        lo = float(range_match.group(1).replace(",", "."))
        hi = float(range_match.group(2).replace(",", "."))
        return (lo, hi)
    # "N e M kg" — faixa escrita com "e" ("0,5kg e 2,5kg", "de 4 e 8 kg")
    e_match = re.search(r"(\d+(?:[.,]\d+)?)\s*(?:kg)?\s*e\s*(\d+(?:[.,]\d+)?)\s*kg\b", normalized)
    if e_match:
        lo = float(e_match.group(1).replace(",", "."))
        hi = float(e_match.group(2).replace(",", "."))
        if lo < hi:
            return (lo, hi)
    upto_match = re.search(r"(?:ate|até|menores? que|abaixo de)\s*(\d+(?:[.,]\d+)?)\s*kg\b", normalized)
    if upto_match:
        return (0.0, float(upto_match.group(1).replace(",", ".")))
    acima_match = re.search(
        r"(?:acima de|mais de|maiores? que|maiores? de|superior a|a partir de)\s*(\d+(?:[.,]\d+)?)\s*kg\b",
        normalized,
    )
    if acima_match:
        lo = float(acima_match.group(1).replace(",", "."))
        return (lo, lo * 3)
    return None


def _product_weight_kg(text: str, animal_range: Optional[tuple[float, float]]) -> Optional[float]:
    """Peso da EMBALAGEM. "Cães acima de 40kg" / "para cães de 5,1 a 10kg" é
    peso do ANIMAL, não do produto — não vira weight_kg."""
    value = extract_weight_kg(text)
    if value is None:
        return None
    normalized = _normalize_text(text)
    if animal_range is not None:
        lo, hi = animal_range
        if lo - 0.01 <= value <= hi + 0.01:
            return None
    if _ANIMAL_WEIGHT_CONTEXT.search(normalized):
        # o único número em kg está numa frase de peso do animal
        other = re.findall(r"(\d+(?:[.,]\d+)?)\s*(kg|g)\b", normalized)
        if len(other) <= 1:
            return None
    return value


def _compare_gtin(expected: Optional[str], observed: Optional[str]) -> AttributeComparison:
    if not expected or not observed:
        return AttributeComparison("gtin", expected, observed, AttributeStatus.UNKNOWN, "MISSING_GTIN")
    if expected == observed:
        return AttributeComparison("gtin", expected, observed, AttributeStatus.MATCH, "GTIN_EXACT")
    return AttributeComparison("gtin", expected, observed, AttributeStatus.CONFLICT, "GTIN_CONFLICT")


def _compare_brand(expected: Optional[str], observed: Optional[str], candidate_text: str) -> AttributeComparison:
    if not expected:
        return AttributeComparison("brand", None, observed, AttributeStatus.UNKNOWN, "MISSING_EXPECTED_BRAND")
    expected_tokens = _tokenize_text(expected)
    observed_tokens = _tokenize_text(observed or "")
    candidate_tokens = _tokenize_text(candidate_text)
    if expected_tokens and expected_tokens.issubset(candidate_tokens):
        return AttributeComparison("brand", expected, observed, AttributeStatus.MATCH, "BRAND_MATCH")
    if observed_tokens and expected_tokens and not expected_tokens.issubset(observed_tokens):
        return AttributeComparison("brand", expected, observed, AttributeStatus.CONFLICT, "BRAND_CONFLICT")
    return AttributeComparison("brand", expected, observed, AttributeStatus.UNKNOWN, "MISSING_BRAND")


def _compare_species(expected: Optional[str], candidate_text: str) -> AttributeComparison:
    observed = _infer_species(candidate_text)
    if not expected or not observed:
        return AttributeComparison("species", expected, observed, AttributeStatus.UNKNOWN, "MISSING_SPECIES")
    if expected == observed:
        return AttributeComparison("species", expected, observed, AttributeStatus.MATCH, "SPECIES_MATCH")
    return AttributeComparison("species", expected, observed, AttributeStatus.CONFLICT, "SPECIES_CONFLICT")


def _compare_numeric(attribute: str, expected: Optional[float], observed: Optional[float], *, tolerance: float) -> AttributeComparison:
    if expected is None or observed is None:
        return AttributeComparison(attribute, expected, observed, AttributeStatus.UNKNOWN, f"MISSING_{attribute.upper()}")
    if abs(float(expected) - float(observed)) <= tolerance:
        return AttributeComparison(attribute, expected, observed, AttributeStatus.MATCH, f"{attribute.upper()}_MATCH")
    return AttributeComparison(attribute, expected, observed, AttributeStatus.CONFLICT, f"{attribute.upper()}_CONFLICT")


def _compare_exact(attribute: str, expected: Any, observed: Any) -> AttributeComparison:
    if expected is None or observed is None:
        return AttributeComparison(attribute, expected, observed, AttributeStatus.UNKNOWN, f"MISSING_{attribute.upper()}")
    if expected == observed:
        return AttributeComparison(attribute, expected, observed, AttributeStatus.MATCH, f"{attribute.upper()}_MATCH")
    return AttributeComparison(attribute, expected, observed, AttributeStatus.CONFLICT, f"{attribute.upper()}_CONFLICT")


def _compare_multipack(expected: "ProductIdentity", candidate_text: str) -> AttributeComparison:
    """Conjunto múltiplo (kit/combo/N unidades) é outra apresentação
    comercial que a unidade. Anúncio multipack contra produto de unidade
    (pack_count nulo ou 1, e o próprio nome não é multipack) → CONFLICT."""
    cand_multi = is_multipack(candidate_text)
    exp_multi = is_multipack(expected.canonical_name or "") or (expected.pack_count or 1) > 1
    if cand_multi and not exp_multi:
        return AttributeComparison("multipack", exp_multi, cand_multi, AttributeStatus.CONFLICT, "MULTIPACK_CONFLICT")
    if cand_multi and exp_multi:
        return AttributeComparison("multipack", exp_multi, cand_multi, AttributeStatus.MATCH, "MULTIPACK_MATCH")
    return AttributeComparison("multipack", exp_multi, cand_multi, AttributeStatus.UNKNOWN, "MISSING_MULTIPACK")


def _compare_range(attribute: str, expected: Optional[tuple[float, float]], observed: Optional[tuple[float, float]]) -> AttributeComparison:
    if expected is None or observed is None:
        return AttributeComparison(attribute, expected, observed, AttributeStatus.UNKNOWN, f"MISSING_{attribute.upper()}")
    if abs(expected[0] - observed[0]) <= 0.2 and abs(expected[1] - observed[1]) <= 0.2:
        return AttributeComparison(attribute, expected, observed, AttributeStatus.MATCH, f"{attribute.upper()}_MATCH")
    return AttributeComparison(attribute, expected, observed, AttributeStatus.CONFLICT, f"{attribute.upper()}_CONFLICT")


def _compare_set(attribute: str, expected: set[str], observed: set[str]) -> AttributeComparison:
    if not expected or not observed:
        return AttributeComparison(attribute, sorted(expected) or None, sorted(observed) or None, AttributeStatus.UNKNOWN, f"MISSING_{attribute.upper()}")
    if expected == observed or expected.issubset(observed):
        return AttributeComparison(attribute, sorted(expected), sorted(observed), AttributeStatus.MATCH, f"{attribute.upper()}_MATCH")
    return AttributeComparison(attribute, sorted(expected), sorted(observed), AttributeStatus.CONFLICT, f"{attribute.upper()}_CONFLICT")


def _comparison(attribute: str, comparisons: list[AttributeComparison]) -> AttributeComparison:
    for item in comparisons:
        if item.attribute == attribute:
            return item
    return AttributeComparison(attribute)


def _reason_for_conflict(item: AttributeComparison) -> str:
    return f"{item.attribute.upper()}_CONFLICT"


def _reason_for_match(item: AttributeComparison) -> str:
    if item.reason.endswith("_MATCH") or item.reason == "GTIN_EXACT":
        return item.reason
    return f"{item.attribute.upper()}_MATCH"


def _text_identity_score(expected: ProductIdentity, candidate_text: str) -> float:
    references = [expected.canonical_name or "", *expected.aliases]
    scores = []
    candidate_tokens = _tokenize_text(candidate_text)
    for reference in references:
        expected_tokens = _tokenize_text(reference)
        if not expected_tokens:
            continue
        scores.append(len(expected_tokens & candidate_tokens) / len(expected_tokens))
    return max(scores) if scores else 0.0


def _family_matches(expected: ProductIdentity, candidate_text: str) -> bool:
    family = expected.product_family or expected.canonical_name or ""
    family_tokens = _tokenize_text(family)
    if not family_tokens:
        return False
    candidate_tokens = _tokenize_text(candidate_text)
    return len(family_tokens & candidate_tokens) / max(len(family_tokens), 1) >= 0.6


def _expected_has_structured_sku(expected: ProductIdentity) -> bool:
    return any([
        expected.weight_kg is not None,
        expected.volume_ml is not None,
        expected.length_cm is not None,
        expected.pack_count is not None,
        expected.animal_weight_range is not None,
        expected.life_stage is not None,
        expected.breed_size is not None,
        bool(expected.therapeutic_attributes),
    ])


def _decision_rank(decision: IdentityDecision) -> int:
    return {
        IdentityDecision.EXACT: 5,
        IdentityDecision.HIGH_CONFIDENCE: 4,
        IdentityDecision.AMBIGUOUS: 3,
        IdentityDecision.NO_MATCH: 2,
        IdentityDecision.CONFLICT: 1,
    }.get(decision, 0)


def _infer_species(text: str) -> Optional[str]:
    tokens = _tokenize_text(text)
    dog = bool(tokens & {"cao", "caes", "cachorro", "cachorros", "canino", "dog", "dogs"})
    cat = bool(tokens & {"gato", "gatos", "gata", "gatas", "felino", "cat", "cats"})
    if dog and not cat:
        return "dog"
    if cat and not dog:
        return "cat"
    return None


def _normalize_species(value: Optional[str]) -> Optional[str]:
    tokens = _tokenize_text(value or "")
    if tokens & {"dog", "dogs", "cao", "caes", "cachorro", "cachorros", "canino"}:
        return "dog"
    if tokens & {"cat", "cats", "gato", "gatos", "gata", "gatas", "felino"}:
        return "cat"
    return None


def _infer_life_stage(text: str) -> Optional[str]:
    tokens = _tokenize_text(text)
    if tokens & {"filhote", "filhotes", "puppy", "junior"}:
        return "puppy"
    if tokens & {"senior", "idoso", "idosos", "mature"}:
        return "senior"
    if tokens & {"adulto", "adultos", "adult", "adults"}:
        return "adult"
    return None


def _normalize_life_stage(value: Optional[str]) -> Optional[str]:
    return _infer_life_stage(value or "")


# Coleiras antiparasitárias vêm em tamanhos fixos por comprimento (cm) e a
# maioria dos títulos traz só a letra ("Scalibor M") ou "Cães Grandes". O
# comprimento é o discriminador de SKU que separa 48 de 65 cm. Conjunto
# fechado, tabelas publicadas pelos fabricantes — não é matcher, é
# normalizador de identidade.
_COLLAR_LENGTH_CM: dict[str, list[tuple[re.Pattern[str], float]]] = {
    "scalibor": [
        (re.compile(r"\b(65|grandes?|large|\bg\b)\b"), 65.0),
        (re.compile(r"\b(48|pequenos?|medios?|small|\bp\b|\bm\b)\b"), 48.0),
    ],
    "seresto": [
        (re.compile(r"\b(70|grandes?|acima de 8|large|\bg\b)\b"), 70.0),
        (re.compile(r"\b(38|pequenos?|gatos?|ate 8|até 8|small|\bp\b)\b"), 38.0),
    ],
}


def _infer_collar_length_cm(text: Optional[str]) -> Optional[float]:
    if not text:
        return None
    normalized = _normalize_text(text)
    if "coleira" not in normalized and "collar" not in normalized:
        return None
    for brand, rules in _COLLAR_LENGTH_CM.items():
        if brand not in normalized:
            continue
        for pattern, cm in rules:
            if pattern.search(normalized):
                return cm
    return None


def _infer_breed_size(text: str) -> Optional[str]:
    tokens = _tokenize_text(text)
    if tokens & {"mini", "pequeno", "pequenos", "pequena", "pequenas", "small", "p"}:
        if tokens & {"medio", "medios", "media", "medium", "m"}:
            return "small_medium"
        return "small"
    if tokens & {"maxi", "grande", "grandes", "large", "g"}:
        return "large"
    if tokens & {"giant", "gigante", "gg"}:
        return "giant"
    if tokens & {"medium", "medio", "medios", "media", "medias"}:
        return "medium"
    normalized = _normalize_text(text)
    if "scalibor" in normalized and re.search(r"\b48\s*cm\b", normalized):
        return "small_medium"
    if "scalibor" in normalized and re.search(r"\b65\s*cm\b", normalized):
        return "large"
    if "scalibor" in normalized and re.search(r"\bm\b", normalized):
        return "small_medium"
    if "scalibor" in normalized and re.search(r"\bg\b", normalized):
        return "large"
    if re.search(r"\b(pp|xs)\b", normalized):
        return "xsmall"
    if re.search(r"\b(m)\b", normalized):
        return "medium"
    return None


def _normalize_breed_size(value: Optional[str]) -> Optional[str]:
    return _infer_breed_size(value or "")


def _infer_therapeutics(text: str) -> set[str]:
    normalized = _normalize_text(text)
    tokens = _tokenize_text(text)
    out: set[str] = set()
    for label, aliases in _THERAPEUTIC_GROUPS.items():
        if tokens & aliases or any(alias in normalized for alias in aliases if "/" in alias):
            out.add(label)
    if "light" in tokens and tokens & _LIGHT_FOOD_CONTEXT:
        out.add("obesity")
    return out


_FLAVOR_GROUPS = {
    "multi": {"multi", "multisabor", "sabores"},
    "beef": {"carne", "bovino", "beef"},
    "chicken": {"frango", "galinha", "chicken"},
    "lamb": {"cordeiro", "lamb"},
    "salmon": {"salmao", "salmon"},
    "fish": {"peixe", "fish"},
    "tuna": {"atum", "tuna"},
    "turkey": {"peru", "turkey"},
    "pork": {"porco", "suino", "pork"},
}


def _infer_flavor(text: str) -> Optional[str]:
    normalized = _normalize_text(text)
    if re.search(r"\bmulti\s*sabor(?:es)?\b", normalized):
        return "multi"
    tokens = _tokenize_text(text)
    found = {
        flavor
        for flavor, aliases in _FLAVOR_GROUPS.items()
        if tokens & aliases or any(alias in normalized for alias in aliases if " " in alias)
    }
    if not found:
        return None
    if "multi" in found:
        return "multi"
    return "+".join(sorted(found))


def _normalize_flavor(value: Optional[str]) -> Optional[str]:
    return _infer_flavor(value or "") or _clean(value)


def _infer_product_line(text: str) -> Optional[str]:
    therapeutics = sorted(_infer_therapeutics(text))
    if therapeutics:
        return " ".join(therapeutics)
    return None


def _infer_family(name: Optional[str], brand: Optional[str]) -> Optional[str]:
    tokens = list(_tokenize_text(name or ""))
    brand_tokens = _tokenize_text(brand or "")
    family_tokens = [token for token in tokens if token not in brand_tokens and not re.fullmatch(r"\d+", token)]
    return " ".join(family_tokens[:5]) or _clean(name)


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


# Alguns feeds preenchem "brand" com o nome do FABRICANTE/distribuidor
# ("MSD", "Boehringer Ingelheim", "Elanco") no lugar da marca de prateleira
# ("Scalibor", "NexGard", "Drontal"). Isso vira CONFLITO de marca no
# Identity Engine e mata o match com a mesma apresentação em outra loja.
# Mapa fabricante -> marcas de consumo que ele detém no varejo pet BR. A
# troca só acontece quando a marca de consumo aparece LITERALMENTE no nome
# do produto — determinístico, nunca chuta.
_MANUFACTURER_TO_BRANDS: dict[str, tuple[str, ...]] = {
    "msd": ("scalibor", "bravecto", "nobivac"),
    "msd animal health": ("scalibor", "bravecto", "nobivac"),
    "merck": ("scalibor", "bravecto"),
    "boehringer": ("nexgard", "frontline", "broadline"),
    "boehringer ingelheim": ("nexgard", "frontline", "broadline"),
    "merial": ("nexgard", "frontline", "broadline"),
    "elanco": ("drontal", "credelio", "seresto", "milbemax", "comfortis"),
    "bayer": ("advantage", "advocate", "seresto", "drontal", "profender"),
    "zoetis": ("simparic", "revolution", "apoquel", "cytopoint"),
    "ceva": ("vectra", "milpro", "adaptil", "feliway"),
    "virbac": ("effipro", "effitix"),
    "mars": ("pedigree", "whiskas", "sheba", "dreamies", "optimum", "royal canin", "cesar"),
    "mars petcare": ("pedigree", "whiskas", "sheba", "dreamies", "optimum", "royal canin"),
    "adimax": ("origens", "monello", "papparico"),
    "nestle purina": ("pro plan", "dog chow", "cat chow", "friskies", "felix"),
    "purina": ("pro plan", "dog chow", "cat chow", "friskies", "felix"),
}


def normalize_brand(raw: Optional[str], *, name_hint: Optional[str] = None) -> Optional[str]:
    """Troca um nome de fabricante pela marca de prateleira quando esta
    aparece no nome do produto. Sem hint ou sem correspondência única,
    devolve o valor original — nunca piora o que já existe."""
    cleaned = _clean(raw)
    if not cleaned:
        return cleaned
    owned = _MANUFACTURER_TO_BRANDS.get(_normalize_text(cleaned))
    if not owned:
        return cleaned
    hint_tokens = _tokenize_text(name_hint or "")
    if not hint_tokens:
        return cleaned
    found = [b for b in owned if set(_tokenize_text(b)).issubset(hint_tokens)]
    return found[0].title() if len(found) == 1 else cleaned


def _json_list(value: Optional[str]) -> list[str]:
    if not value:
        return []
    try:
        parsed = json.loads(value)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item) for item in parsed if item]


def _dedupe(items: tuple[str, ...]) -> tuple[str, ...]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return tuple(out)

from __future__ import annotations

import re
import unicodedata
from typing import Iterable, Protocol


class OfferIdentityLike(Protocol):
    title: str | None
    brand: str | None
    category: str | None


_STOPWORDS = {
    "a",
    "as",
    "com",
    "da",
    "de",
    "do",
    "dos",
    "e",
    "em",
    "o",
    "os",
    "para",
    "por",
    "produto",
    "un",
    "unidade",
}


def has_ambiguous_offer_identity(rows: Iterable[OfferIdentityLike]) -> bool:
    """Return True when rows with the same merchant+GTIN look incompatible.

    This is intentionally conservative: equivalent rows with very similar
    titles, shared brand, or same product category continue to resolve. Rows
    with almost no title overlap and different categories/brands are treated
    as ambiguous and must be reviewed instead of auto-offered.
    """
    prepared = [
        (
            _tokens(row.title),
            _norm(row.brand),
            _norm(row.category),
        )
        for row in rows
    ]
    prepared = [item for item in prepared if item[0]]
    if len(prepared) < 2:
        return False

    for idx, (tokens_a, brand_a, category_a) in enumerate(prepared):
        for tokens_b, brand_b, category_b in prepared[idx + 1:]:
            if _looks_equivalent(tokens_a, tokens_b, brand_a, brand_b, category_a, category_b):
                continue
            overlap = len(tokens_a & tokens_b) / max(len(tokens_a | tokens_b), 1)
            brands_conflict = bool(brand_a and brand_b and brand_a != brand_b)
            categories_conflict = bool(category_a and category_b and category_a != category_b)
            no_shared_brand = not brand_a or not brand_b or brand_a != brand_b
            if overlap < 0.2 and (brands_conflict or categories_conflict or no_shared_brand):
                return True
    return False


def _looks_equivalent(
    tokens_a: set[str],
    tokens_b: set[str],
    brand_a: str | None,
    brand_b: str | None,
    category_a: str | None,
    category_b: str | None,
) -> bool:
    overlap = len(tokens_a & tokens_b) / max(len(tokens_a | tokens_b), 1)
    if overlap >= 0.6:
        return True
    if tokens_a <= tokens_b or tokens_b <= tokens_a:
        return True
    if brand_a and brand_b and brand_a == brand_b and category_a and category_b and category_a == category_b and overlap >= 0.35:
        return True
    return False


def _tokens(value: str | None) -> set[str]:
    normalized = _norm(value) or ""
    return {token for token in re.findall(r"[a-z0-9]+", normalized) if token not in _STOPWORDS}


def _norm(value: str | None) -> str | None:
    if not value:
        return None
    text = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(ch for ch in text if not unicodedata.combining(ch))
    cleaned = re.sub(r"\s+", " ", ascii_text.lower()).strip()
    return cleaned or None

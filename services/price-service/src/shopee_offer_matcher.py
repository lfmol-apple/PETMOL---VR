"""
Casamento entre um produto real do catálogo PETMOL e os candidatos que a
busca por palavra-chave da Shopee (productOfferV2) devolve.

Por que isto existe: a API da Shopee não tem lookup por GTIN exato, só
busca textual (ver shopee_affiliate_client.py) — diferente da Cobasi/Awin,
que casam por GTIN exato via feed. Buscar por palavra-chave pode devolver
produto errado (marca diferente, peso diferente, item não relacionado).
Este módulo é a única linha de defesa contra publicar uma oferta Shopee
errada no grid de preços de um produto — por isso as checagens de marca e
peso são desqualificantes (hard fail), nunca só "descontam pontos": um
candidato sem a marca esperada, ou com peso divergente, nunca é
considerado, não importa quão parecido o nome pareça.

Pure functions, sem I/O — testável sem rede e sem banco.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Optional

# Palavras que não ajudam a diferenciar produtos (preposições, unidades
# genéricas) — removidas do cálculo de sobreposição de tokens pra não
# inflar o score por coincidência.
_STOPWORDS = frozenset({
    "de", "da", "do", "das", "dos", "para", "com", "e", "em", "a", "o", "os", "as",
    "un", "und", "unidade", "unidades", "pacote", "pct", "kit", "promocao", "oferta",
})

_WEIGHT_TOKEN_RE = re.compile(r"^\d+(?:[.,]\d+)?(kg|g)$")
_WEIGHT_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(kg|g)\b")


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    return text.lower()


def extract_weight_kg(text: str) -> Optional[float]:
    """Primeiro peso encontrado no texto, convertido pra kg. None se
    nenhum peso reconhecível estiver presente."""
    match = _WEIGHT_RE.search(_normalize(text))
    if not match:
        return None
    value = float(match.group(1).replace(",", "."))
    return value if match.group(2) == "kg" else value / 1000


def _tokenize(text: str) -> set[str]:
    normalized = _normalize(text)
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    tokens = set()
    for token in normalized.split():
        if not token or token in _STOPWORDS:
            continue
        if _WEIGHT_TOKEN_RE.match(token):
            continue
        tokens.add(token)
    return tokens


def score_candidate(
    expected_name: str,
    candidate_name: str,
    *,
    expected_brand: Optional[str] = None,
    expected_weight_kg: Optional[float] = None,
    weight_tolerance_ratio: float = 0.05,
) -> Optional[float]:
    """Score de confiança em [0, 1] — fração dos tokens significativos de
    expected_name que aparecem em candidate_name. Retorna None (nunca um
    score baixo) quando uma checagem obrigatória falha:

    - expected_brand fornecido e nenhum token da marca aparece no
      candidato — marca diferente nunca é "quase igual", é outro produto.
    - expected_weight_kg fornecido e o candidato não tem peso reconhecível,
      ou tem um peso fora da tolerância — nunca assume que "sem peso no
      nome" significa "mesmo peso".
    """
    candidate_tokens = _tokenize(candidate_name)

    if expected_brand:
        brand_tokens = _tokenize(expected_brand)
        if brand_tokens and not brand_tokens.issubset(candidate_tokens):
            return None

    if expected_weight_kg is not None:
        candidate_weight = extract_weight_kg(candidate_name)
        if candidate_weight is None:
            return None
        tolerance = max(0.05, expected_weight_kg * weight_tolerance_ratio)
        if abs(candidate_weight - expected_weight_kg) > tolerance:
            return None

    expected_tokens = _tokenize(expected_name)
    if not expected_tokens:
        return None

    return len(expected_tokens & candidate_tokens) / len(expected_tokens)


def find_best_match(
    nodes: list[dict],
    expected_name: str,
    *,
    expected_brand: Optional[str] = None,
    expected_weight_kg: Optional[float] = None,
    min_confidence: float = 0.5,
) -> Optional[dict]:
    """Melhor nó de productOfferV2 (dict cru, como veio da API) pro
    produto esperado, ou None se nenhum candidato passar nas checagens
    obrigatórias E atingir min_confidence. Nunca escolhe "o menos pior"
    abaixo do limiar — ausência de match confiável é sempre None, nunca
    uma aposta."""
    best_node: Optional[dict] = None
    best_score = 0.0
    for node in nodes:
        candidate_name = node.get("productName") or ""
        score = score_candidate(
            expected_name,
            candidate_name,
            expected_brand=expected_brand,
            expected_weight_kg=expected_weight_kg,
        )
        if score is None:
            continue
        if score >= min_confidence and score > best_score:
            best_node = node
            best_score = score
    return best_node

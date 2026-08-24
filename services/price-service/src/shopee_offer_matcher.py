"""
Casamento entre um produto real do catálogo PETMOL e os candidatos que a
busca por palavra-chave da Shopee (productOfferV2) devolve.

Por que isto existe: a API da Shopee não tem lookup por GTIN exato, só
busca textual (ver shopee_affiliate_client.py) — diferente da Cobasi/Awin,
que casam por GTIN exato via feed. Buscar por palavra-chave pode devolver
produto errado (marca diferente, tamanho diferente, item não relacionado).
Este módulo é a única linha de defesa contra publicar uma oferta Shopee
errada no grid de preços de um produto — por isso as checagens de marca e
tamanho (peso/volume) são desqualificantes (hard fail) sempre que o
próprio catálogo PETMOL tiver essa informação, nunca só "descontam
pontos": um candidato sem a marca esperada, ou com peso/volume
divergente, nunca é considerado, não importa quão parecido o nome pareça.

Caso real que motivou o desempate por preço (21/08/2026): "Shampoo Hydra
Pelos Claros Pet Society" (nome PETMOL sem nenhum tamanho informado)
casou com sobreposição de tokens IDÊNTICA tanto para a versão de varejo
(300ml, ~R$66) quanto para uma versão profissional de 5L (R$554) — sem
tamanho nenhum pra comparar dos dois lados, o antigo critério ("primeiro
com maior score") ficava refém da ordem de relevância da própria busca da
Shopee, que pode favorecer o anúncio mais caro. Por isso, em empate de
score, o candidato de MENOR preço vence — é a suposição mais segura
quando não dá pra confirmar o tamanho (varejo, não atacado profissional).

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
# Faixa de peso do animal (não do pacote) — comum em antipulgas/vermífugo
# ("de 4,1 a 10kg para Cães"). extract_weight_kg sozinho só pega o número
# colado no "kg" (o limite superior), perdendo o inferior; duas faixas com
# limite superior igual mas inferior diferente (ex: "4,1 a 10kg" vs "0,1 a
# 10kg") passavam batidas por _package_markers_compatible.
_WEIGHT_RANGE_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*a\s*(\d+(?:[.,]\d+)?)\s*(kg|g)\b")
_VOLUME_TOKEN_RE = re.compile(r"^\d+(?:[.,]\d+)?(ml|l|litro|litros)$")
_VOLUME_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s*(ml|l|litro|litros)\b")
_PACK_COUNT_RE = re.compile(
    r"\b(\d+)\s*"
    r"(comprimidos?|tabletes?|tabs?|pipetas?|doses?|unidades?|unds?)\b"
)

# Termos que mudam a identidade comercial de ração. Com busca textual da
# Shopee, "Royal Canin 15kg" pode devolver outra linha/porte/idade na
# mesma marca e peso. Esses termos não podem ser tratados como detalhe de
# score: se o produto esperado tem um deles, o anúncio precisa ter também;
# se o anúncio tem um termo conflitante, é outro produto.
_DISTINCTIVE_GROUPS = (
    frozenset({"mini", "pequeno", "pequena", "pequenas", "small"}),
    frozenset({"medium", "medio", "media", "medias"}),
    frozenset({"maxi", "grande", "grandes", "large"}),
    frozenset({"giant", "gigante"}),
    frozenset({"filhote", "filhotes", "puppy", "junior"}),
    frozenset({"adulto", "adult", "adults"}),
    frozenset({"senior", "idoso", "idosos", "mature"}),
    frozenset({"castrado", "castrados", "castrada", "castradas", "sterilised", "sterilized"}),
    frozenset({"urinary", "urinario", "urinaria"}),
    frozenset({"renal", "kidney"}),
    frozenset({"hypoallergenic", "hipoalergenico", "hipoalergenica"}),
    frozenset({"gastrointestinal", "digestive"}),
    frozenset({"dermatologic", "dermatologica", "dermatologico", "skin"}),
    frozenset({"light", "obesity", "satiety"}),
)


def _normalize(text: str) -> str:
    text = unicodedata.normalize("NFKD", text or "")
    text = text.encode("ascii", "ignore").decode("ascii")
    return text.lower()


def extract_weight_kg(text: str) -> Optional[float]:
    """Primeiro peso (kg/g) encontrado no texto, convertido pra kg. None
    se nenhum peso reconhecível estiver presente."""
    match = _WEIGHT_RE.search(_normalize(text))
    if not match:
        return None
    value = float(match.group(1).replace(",", "."))
    return value if match.group(2) == "kg" else value / 1000


def extract_weight_range_kg(text: str) -> Optional[tuple[float, float]]:
    """Faixa de peso do animal ("de 4,1 a 10kg"), como (min, max) em kg.
    None se o texto não tiver uma faixa explícita (só um peso único, ou
    nenhum peso)."""
    match = _WEIGHT_RANGE_RE.search(_normalize(text))
    if not match:
        return None
    lo = float(match.group(1).replace(",", "."))
    hi = float(match.group(2).replace(",", "."))
    if match.group(3) == "g":
        lo, hi = lo / 1000, hi / 1000
    return (lo, hi)


def extract_volume_ml(text: str) -> Optional[float]:
    """Primeiro volume (ml/L/Litro(s)) encontrado no texto, convertido pra
    ml. None se nenhum volume reconhecível estiver presente."""
    match = _VOLUME_RE.search(_normalize(text))
    if not match:
        return None
    value = float(match.group(1).replace(",", "."))
    return value if match.group(2) == "ml" else value * 1000


def extract_pack_count(text: str) -> Optional[int]:
    """Quantidade explícita de unidades terapêuticas/embalagem.

    Usada como hard fail no matcher: "3 comprimidos" não pode casar com
    "1 tablete", e "1 pipeta" não pode casar com "3 pipetas". Só retorna
    algo quando há unidade clara; números de faixa de peso continuam sendo
    tratados por extract_weight_kg.
    """
    match = _PACK_COUNT_RE.search(_normalize(text))
    if not match:
        return None
    return int(match.group(1))


def _parse_price(raw: object) -> Optional[float]:
    if raw is None:
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _tokenize(text: str) -> set[str]:
    normalized = _normalize(text)
    normalized = re.sub(r"[^a-z0-9\s]", " ", normalized)
    tokens = set()
    for token in normalized.split():
        if not token or token in _STOPWORDS:
            continue
        if _WEIGHT_TOKEN_RE.match(token) or _VOLUME_TOKEN_RE.match(token):
            continue
        tokens.add(token)
    return tokens


def _distinctive_groups(tokens: set[str]) -> set[frozenset[str]]:
    groups: set[frozenset[str]] = set()
    for group in _DISTINCTIVE_GROUPS:
        if tokens & group:
            groups.add(group)
    return groups


def _distinctive_terms_compatible(expected_tokens: set[str], candidate_tokens: set[str]) -> bool:
    expected_groups = _distinctive_groups(expected_tokens)
    if expected_groups:
        # Tudo que define a apresentação esperada precisa aparecer no
        # candidato. Ex: esperado "Mini Adult" não pode casar com anúncio
        # só "Adult 15kg", nem com "Maxi Adult 15kg".
        for group in expected_groups:
            if not (candidate_tokens & group):
                return False

    candidate_groups = _distinctive_groups(candidate_tokens)
    # Grupos conflitantes presentes só no candidato indicam outra variação
    # dentro da mesma marca/peso. Só aceitamos grupo extra quando o esperado
    # não especificou nenhum grupo daquele eixo, para não bloquear nomes
    # genéricos sem porte/idade.
    if expected_groups and not candidate_groups.issubset(expected_groups):
        return False
    return True


def score_candidate(
    expected_name: str,
    candidate_name: str,
    *,
    expected_brand: Optional[str] = None,
    expected_weight_kg: Optional[float] = None,
    expected_volume_ml: Optional[float] = None,
    weight_tolerance_ratio: float = 0.05,
    volume_tolerance_ratio: float = 0.05,
) -> Optional[float]:
    """Score de confiança em [0, 1] — fração dos tokens significativos de
    expected_name que aparecem em candidate_name. Retorna None (nunca um
    score baixo) quando uma checagem obrigatória falha:

    - expected_brand fornecido e nenhum token da marca aparece no
      candidato — marca diferente nunca é "quase igual", é outro produto.
    - expected_weight_kg fornecido e o candidato não tem peso reconhecível,
      ou tem peso fora da tolerância.
    - expected_volume_ml fornecido e o candidato não tem volume
      reconhecível, ou tem volume fora da tolerância.

    Quando nem peso nem volume são extraíveis do nome PETMOL (ex:
    "Shampoo Hydra Pelos Claros Pet Society", sem tamanho nenhum
    informado), nenhuma das duas checagens roda — a defesa contra
    escolher um tamanho errado nesse caso é o desempate por preço em
    find_best_match(), não este score.
    """
    candidate_tokens = _tokenize(candidate_name)
    expected_tokens = _tokenize(expected_name)

    if not _distinctive_terms_compatible(expected_tokens, candidate_tokens):
        return None

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

    if expected_volume_ml is not None:
        candidate_volume = extract_volume_ml(candidate_name)
        if candidate_volume is None:
            return None
        tolerance = max(20.0, expected_volume_ml * volume_tolerance_ratio)
        if abs(candidate_volume - expected_volume_ml) > tolerance:
            return None

    expected_pack_count = extract_pack_count(expected_name)
    if expected_pack_count is not None:
        candidate_pack_count = extract_pack_count(candidate_name)
        if candidate_pack_count is None or candidate_pack_count != expected_pack_count:
            return None

    if not expected_tokens:
        return None

    return len(expected_tokens & candidate_tokens) / len(expected_tokens)


def find_best_match(
    nodes: list[dict],
    expected_name: str,
    *,
    expected_brand: Optional[str] = None,
    expected_weight_kg: Optional[float] = None,
    expected_volume_ml: Optional[float] = None,
    min_confidence: float = 0.5,
) -> Optional[dict]:
    """Melhor nó de productOfferV2 (dict cru, como veio da API) pro
    produto esperado, ou None se nenhum candidato passar nas checagens
    obrigatórias E atingir min_confidence.

    Em empate de score, o candidato de MENOR preço vence — quando não dá
    pra confirmar o tamanho (peso/volume ausentes dos dois lados), a
    suposição mais segura é a versão de varejo, nunca a mais cara/atacado
    só porque a busca da Shopee a listou primeiro (ver docstring do
    módulo pro caso real que motivou isto). Nunca escolhe "o menos pior"
    abaixo do limiar — ausência de match confiável é sempre None, nunca
    uma aposta."""
    candidates: list[tuple[float, float, dict]] = []
    for node in nodes:
        candidate_name = node.get("productName") or ""
        score = score_candidate(
            expected_name,
            candidate_name,
            expected_brand=expected_brand,
            expected_weight_kg=expected_weight_kg,
            expected_volume_ml=expected_volume_ml,
        )
        if score is None or score < min_confidence:
            continue
        price = _parse_price(node.get("price"))
        candidates.append((score, price if price is not None else float("inf"), node))

    if not candidates:
        return None

    candidates.sort(key=lambda c: (-c[0], c[1]))
    return candidates[0][2]

"""Sexo PROVÁVEL do tutor pelo primeiro nome — calculado na consulta, sem persistência, desligado por padrão.

Regras (avaliação de privacidade aprovada em 14/11/2026; ativação em produção só com autorização específica do dono):
  · flag `push_tutor_sex_estimate_enabled` (OFF). Desligada, o filtro não existe (nem na lista de campos, nem na validação);
  · nada é gravado: nem coluna, nem cache, nem log — a função só devolve um rótulo em memória durante a consulta;
  · "homem"/"mulher" só se ≥ 95% das ocorrências do nome no Censo forem daquele sexo E o nome tiver ≥ 2.000 ocorrências;
    nome ausente da base, apelido, sigla ou texto que não parece nome → "sem identificação" (nunca classificado);
  · o resultado NÃO personaliza mensagem, nunca é mostrado ao tutor e não é usado para excluir oferta/preço/serviço.
"""
from __future__ import annotations

import csv
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Optional

from ..config import get_settings

_FILE = Path(__file__).parent / "data" / "ibge_nomes_sexo.csv"
MIN_OCCURRENCES = 2000
MIN_SHARE = 0.95

MALE, FEMALE, UNKNOWN = "male", "female", "unknown"
LABELS = {MALE: "Tutor (homem provável)", FEMALE: "Tutora (mulher provável)", UNKNOWN: "Sem identificação"}


def enabled() -> bool:
    return bool(get_settings().push_tutor_sex_estimate_enabled)


def _fold(value: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", str(value or ""))
    return "".join(ch for ch in s if not unicodedata.combining(ch)).upper().strip()


@lru_cache(maxsize=1)
def _table() -> dict[str, str]:
    out: dict[str, str] = {}
    with open(_FILE, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            m, fe = int(r["masculino"]), int(r["feminino"])
            tot = m + fe
            if tot < MIN_OCCURRENCES:
                continue
            if m / tot >= MIN_SHARE:
                out[r["nome"]] = MALE
            elif fe / tot >= MIN_SHARE:
                out[r["nome"]] = FEMALE
    return out


def first_name(full_name: Optional[str]) -> str:
    """Primeiro nome só se parecer nome: letras (com acento), sem dígitos/símbolos, 2 a 30 letras. Senão, vazio."""
    parts = str(full_name or "").strip().split()
    if not parts:
        return ""
    token = parts[0]
    return token if re.fullmatch(r"[A-Za-zÀ-ÿ]{2,30}", token) else ""


def estimate(full_name: Optional[str]) -> str:
    """'male' | 'female' | 'unknown'. Em memória; não grava nada."""
    fn = _fold(first_name(full_name))
    return _table().get(fn, UNKNOWN) if fn else UNKNOWN

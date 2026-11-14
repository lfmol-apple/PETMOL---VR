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

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, String

from ..config import get_settings
from ..db import Base

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


class FirstNameSex(Base):
    """Normalização MANUAL feita pelo dono na página temporária /admin/nomes: PRIMEIRO NOME → sexo provável. É um dicionário de nomes,
    sem ligação com nenhum tutor (nem id, nem e-mail): vale para todos que tiverem aquele primeiro nome."""

    __tablename__ = "first_name_sex"
    name_key = Column(String(40), primary_key=True)          # primeiro nome sem acento, maiúsculo
    sex = Column(String(8), nullable=False)                  # 'male' | 'female'
    set_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


def name_key(full_name: Optional[str]) -> str:
    return _fold(first_name(full_name))


def load_overrides(db) -> dict[str, str]:
    return {k: v for k, v in db.query(FirstNameSex.name_key, FirstNameSex.sex).all()}


def email_first_name(email: Optional[str]) -> str:
    """Primeiro nome provável tirado do começo do e-mail (antes do @), SÓ quando o campo nome é inutilizável. Calculado na hora, nunca
    gravado, e só vale se casar com um nome da base pública: 'mariana.silva@' → MARIANA; 'joaosilva@' → JOAO (prefixo de 4+ letras)."""
    local = str(email or "").split("@", 1)[0].lower()
    seg = re.split(r"[._\-+0-9]+", local)[0]
    seg = _fold(seg)
    if len(seg) < 3 or not seg.isalpha():
        return ""
    t = _table()
    if seg in t:
        return seg
    for n in range(min(len(seg) - 1, 8), 3, -1):
        if seg[:n] in t:
            return seg[:n]
    return ""


def estimate(full_name: Optional[str], email: Optional[str] = None, overrides: Optional[dict[str, str]] = None) -> str:
    """'male' | 'female' | 'unknown'. Em memória; não grava nada. Ordem: normalização manual do dono (por primeiro nome) → base do IBGE →
    (só se o campo nome for inutilizável) começo do e-mail contra a mesma base."""
    fn = name_key(full_name)
    if fn:
        if overrides and fn in overrides:
            return overrides[fn]
        return _table().get(fn, UNKNOWN)
    ef = email_first_name(email)
    return _table().get(ef, UNKNOWN) if ef else UNKNOWN

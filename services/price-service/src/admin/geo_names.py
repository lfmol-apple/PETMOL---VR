"""Normalização de nomes geográficos (estado/cidade) para a segmentação por localização. Base versionada: municípios do IBGE
(`data/municipios_ibge.csv`, 5.571 municípios com código IBGE). Só para COMPARAR e listar; o dado original nunca é alterado.

Regras (aprovadas em 14/11/2026):
  · siglas e nomes de estado → UF (nome completo só na exibição);
  · cidade = sempre junto da UF (homônimas: Campinas/SP×PB, Salvador/BA×…); casa sem acento/caixa DENTRO da UF com o nome IBGE;
  · "São Paulo capital" → São Paulo; sufixos como "capital" / "(SP)" são descartados antes de casar;
  · cidade que não casa com nenhum município NÃO é oferecida nas listas (mas o tutor segue valendo para estado/Brasil inteiro);
  · lugar fora do Brasil nunca vira UF (ex.: Flórida, Guiana Francesa) e fica fora das opções de estado;
  · "City of The Dalles" e afins (robôs/crawlers de nuvem) são ignorados.
"""
from __future__ import annotations

import csv
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Optional

_FILE = Path(__file__).parent / "data" / "municipios_ibge.csv"

UF_NAMES = {
    "AC": "Acre", "AL": "Alagoas", "AP": "Amapá", "AM": "Amazonas", "BA": "Bahia", "CE": "Ceará", "DF": "Distrito Federal",
    "ES": "Espírito Santo", "GO": "Goiás", "MA": "Maranhão", "MT": "Mato Grosso", "MS": "Mato Grosso do Sul", "MG": "Minas Gerais",
    "PA": "Pará", "PB": "Paraíba", "PR": "Paraná", "PE": "Pernambuco", "PI": "Piauí", "RJ": "Rio de Janeiro", "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul", "RO": "Rondônia", "RR": "Roraima", "SC": "Santa Catarina", "SP": "São Paulo", "SE": "Sergipe", "TO": "Tocantins",
}
CAPITALS = {
    "AC": "Rio Branco", "AL": "Maceió", "AP": "Macapá", "AM": "Manaus", "BA": "Salvador", "CE": "Fortaleza", "DF": "Brasília",
    "ES": "Vitória", "GO": "Goiânia", "MA": "São Luís", "MT": "Cuiabá", "MS": "Campo Grande", "MG": "Belo Horizonte", "PA": "Belém",
    "PB": "João Pessoa", "PR": "Curitiba", "PE": "Recife", "PI": "Teresina", "RJ": "Rio de Janeiro", "RN": "Natal", "RS": "Porto Alegre",
    "RO": "Porto Velho", "RR": "Boa Vista", "SC": "Florianópolis", "SP": "São Paulo", "SE": "Aracaju", "TO": "Palmas",
}
_ROBOT_CITY = re.compile(r"^(city of|the dalles|ashburn|council bluffs|boardman|mountain view|santa clara)\b")
_COUNTRY_ALIASES = {"brasil", "brazil", "br", "republica federativa do brasil"}


def fold(value: Optional[str]) -> str:
    s = unicodedata.normalize("NFKD", str(value or ""))
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", s.casefold()).strip()


_UF_BY_FOLD = {**{fold(n): uf for uf, n in UF_NAMES.items()}, **{uf.casefold(): uf for uf in UF_NAMES}}


def to_uf(value: Optional[str]) -> Optional[str]:
    """'sp', 'São Paulo', 'PIAUÍ' → UF; qualquer outra coisa (inclusive região estrangeira) → None."""
    return _UF_BY_FOLD.get(fold(value))


def is_brazil(value: Optional[str]) -> bool:
    return fold(value) in _COUNTRY_ALIASES


@lru_cache(maxsize=1)
def _municipalities() -> dict[str, dict[str, str]]:
    """UF → {nome sem acento/caixa: nome oficial IBGE}."""
    out: dict[str, dict[str, str]] = {uf: {} for uf in UF_NAMES}
    with open(_FILE, encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            out.setdefault(r["uf"], {})[fold(r["nome"])] = r["nome"]
    return out


def clean_city(city: Optional[str]) -> str:
    """Tira sufixos que não fazem parte do nome ('capital', '(SP)', '- SP') antes de casar com o IBGE."""
    s = fold(city)
    s = re.sub(r"\s*[\(\[].*?[\)\]]\s*", " ", s)
    s = re.sub(r"\s+-\s+[a-z]{2}$", "", s)
    s = re.sub(r"\s+capital$", "", s)
    return s.strip()


def is_robot_city(city: Optional[str]) -> bool:
    return bool(_ROBOT_CITY.match(fold(city)))


def official_city(uf: Optional[str], city: Optional[str]) -> Optional[str]:
    """Nome oficial do município na UF, ou None se não casar (cidade desconhecida/estrangeira/robô)."""
    if not uf or not city or is_robot_city(city):
        return None
    return _municipalities().get(uf, {}).get(clean_city(city))


def city_key(uf: Optional[str], city: Optional[str]) -> Optional[str]:
    """Chave comparável da cidade: nome oficial sem acento/caixa, ou None se não reconhecida. Sempre usada junto da UF."""
    off = official_city(uf, city)
    return fold(off) if off else None


def capital_key(uf: str) -> str:
    return fold(CAPITALS[uf])


def municipality_count() -> int:
    return sum(len(v) for v in _municipalities().values())

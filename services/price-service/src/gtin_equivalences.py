"""
Equivalencias explicitas de GTIN para o mesmo produto/apresentacao.

Isto nao e busca textual nem inferencia automatica: cada grupo aqui deve
vir de verificacao manual ou de uma fonte confiavel, porque permite que um
merchant com GTIN divergente ainda resolva uma oferta do mesmo produto.
"""
from __future__ import annotations


_EQUIVALENT_GTIN_GROUPS: tuple[frozenset[str], ...] = (
    # Scalibor coleira antiparasitaria caes pequenos/medios, 48 cm / M.
    # Zee Now usa 7896185907004; Cobasi usa 7896185957009 no feed Awin.
    frozenset({"7896185907004", "7896185957009"}),
)

_EQUIVALENT_GTINS: dict[str, tuple[str, ...]] = {}
for _group in _EQUIVALENT_GTIN_GROUPS:
    ordered = tuple(sorted(_group))
    for _gtin in _group:
        _EQUIVALENT_GTINS[_gtin] = ordered


def equivalent_gtins_for(gtin: str) -> tuple[str, ...]:
    return _EQUIVALENT_GTINS.get(gtin, (gtin,))

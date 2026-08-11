"""
Política de rota preferida por merchant — usada pelo CommerceEngine para
nunca exibir o mesmo merchant duas vezes (ex: Cobasi via MAIS/UTM e,
futuramente, Cobasi via Awin) quando mais de um provider resolver oferta
pro mesmo merchant.

A escolha NUNCA é por maior comissão — é por confiabilidade/validação
(ver docs/AFFILIATES.md). Quando um merchant não está listado aqui, o
CommerceEngine mantém a primeira oferta encontrada (ordem de registro em
commerce_offers.build_default_engine).
"""
from __future__ import annotations

from typing import Optional

# Hoje só a Cobasi tem mais de uma rota possível (mais vs awin, quando a
# conta Awin for aprovada). "mais" é a única confirmada em produção.
PREFERRED_ROUTE_BY_MERCHANT: dict[str, str] = {
    "cobasi": "mais",
}


def preferred_route_for(merchant: str) -> Optional[str]:
    return PREFERRED_ROUTE_BY_MERCHANT.get(merchant)

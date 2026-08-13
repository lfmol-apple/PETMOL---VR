"""
Política de rota preferida por merchant — usada pelo CommerceEngine para
nunca exibir o mesmo merchant duas vezes (ex: Cobasi via MAIS/UTM e Cobasi
via Awin) quando mais de um provider resolver oferta pro mesmo merchant.

A escolha NUNCA é por maior comissão — é por confiabilidade/validação
(ver docs/AFFILIATES.md). Quando um merchant não está listado aqui, o
CommerceEngine mantém a primeira oferta encontrada (ordem de registro em
commerce_offers.build_default_engine).

Tentativa de teste real em 13/08/2026: cheguei a trocar temporariamente
"cobasi" pra "awin" pra validar comissão com uma compra de teste, mas
descobri que nenhuma tela do frontend envia `gtin` hoje
(useCommerceOffers(query, packageSizeKg) — sem o terceiro argumento
opcional; ver apps/web/src/features/commerce/useCommerceOffers.ts) —
sem gtin, AwinFeedProvider.find_offer() sempre retorna None, então a
troca de rota não tinha nenhum efeito real no app. Revertido pra "mais"
até o frontend ganhar um caminho que envie gtin (só aí faz sentido
tentar de novo). Produtos com link cadastrado manualmente continuam
blindados de qualquer forma (is_manually_cached, ver
commerce_provider.py) — vale manter essa proteção mesmo sem uso ainda.
"""
from __future__ import annotations

from typing import Optional

PREFERRED_ROUTE_BY_MERCHANT: dict[str, str] = {
    "cobasi": "mais",
}


def preferred_route_for(merchant: str) -> Optional[str]:
    return PREFERRED_ROUTE_BY_MERCHANT.get(merchant)

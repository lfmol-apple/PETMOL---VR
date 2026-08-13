"""
Política de rota preferida por merchant — usada pelo CommerceEngine para
nunca exibir o mesmo merchant duas vezes (ex: Cobasi via MAIS/UTM e Cobasi
via Awin) quando mais de um provider resolver oferta pro mesmo merchant.

A escolha NUNCA é por maior comissão — é por confiabilidade/validação
(ver docs/AFFILIATES.md). Quando um merchant não está listado aqui, o
CommerceEngine mantém a primeira oferta encontrada (ordem de registro em
commerce_offers.build_default_engine).

TESTE TEMPORÁRIO EM PRODUÇÃO (13/08/2026): "cobasi" trocado pra "awin" só
pra validar com uma compra real se a Awin de fato gera comissão (8,5% é
o CPA nominal, não confirmado; cookie de 1 dia). Produtos com link
cadastrado manualmente (ex: Baby/mais.app) NÃO são afetados — blindados
no dedupe por is_manually_cached, ver commerce_provider.py e
test_commerce_offers_awin_dedupe.py::test_manually_cached_link_survives_even_with_awin_preferred.
REVERTER pra "mais" assim que o teste terminar — não é decisão
permanente, é só a janela do teste.
"""
from __future__ import annotations

from typing import Optional

PREFERRED_ROUTE_BY_MERCHANT: dict[str, str] = {
    "cobasi": "awin",
}


def preferred_route_for(merchant: str) -> Optional[str]:
    return PREFERRED_ROUTE_BY_MERCHANT.get(merchant)

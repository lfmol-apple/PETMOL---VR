"""
Política de rota preferida/fallback por merchant — usada pelo CommerceEngine
para nunca exibir o mesmo merchant duas vezes (ex: Cobasi via MAIS e Cobasi
via Awin) quando mais de um provider resolver oferta pro mesmo merchant.

Ordem de critérios pra decidir qual oferta de um merchant sobrevive ao
dedupe (nunca por maior comissão nominal):
  1. merchant correto (dedupe é por merchant, sempre);
  2. link cadastrado manualmente (is_manually_cached) NUNCA cede lugar —
     ver commerce_provider.py::_dedupe_by_merchant;
  3. rota preferida, SE ela realmente resolveu uma oferta — a preferência
     não é um requisito pra aparecer, é um desempate entre ofertas que já
     existem. Se só uma rota resolveu (preferida ou não), ela é a
     exibida — nunca "some" a Cobasi só porque a rota que resolveu não é
     a preferida (ver fallback_routes abaixo);
  4. sem preferência configurada, mantém a primeira oferta encontrada
     (ordem de registro em commerce_offers.build_default_engine).
  5. preço, só entre merchants DIFERENTES (sort final do CommerceEngine,
     não do dedupe).

fallback_routes é documentação explícita de "que outras rotas eu aceito
pra este merchant, em ordem de preferência decrescente" — hoje não muda o
comportamento do dedupe (que já aceita naturalmente qualquer oferta única
disponível, seja preferida ou não), serve pra deixar a intenção explícita
e testável, e pra futuras rotas com MAIS de duas opções por merchant.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional


@dataclass(frozen=True)
class MerchantRoutePolicy:
    merchant: str
    # Rota que vence o dedupe quando mais de uma oferta resolve pro mesmo
    # merchant — só vence se de fato existir uma oferta nessa rota (ver
    # docstring do módulo, critério 3). NÃO é um requisito de exposição:
    # com só uma rota resolvendo, essa é a exibida, preferida ou não.
    preferred_route: str
    # Outras rotas aceitas pro mesmo merchant, em ordem de preferência —
    # hoje só documentação/teste (ver docstring do módulo); nenhuma
    # aparece se sua respectiva flag de habilitação (ex:
    # awin_enabled/awin_shadow_mode) não permitir a oferta ser gerada.
    fallback_routes: tuple[str, ...] = field(default_factory=tuple)


# Cobasi: decisão de produto em 14/08/2026 — Awin (8,5% nominal, ainda não
# confirmado por venda real, cookie de 1 dia) vira a rota preferida sobre
# MAIS (7%, confirmado), aceitando o risco de a comissão realizada da Awin
# ficar abaixo do nominal por causa da janela curta de atribuição. "mais"
# passa a ser o fallback — continua vencendo quando a Awin não resolver
# nada pro produto (sem feed sincronizado, fora de estoque, etc.).
# IMPORTANTE: isto sozinho não expõe nada — awin_enabled=False no master
# gate global (config.py) continua sendo o que efetivamente decide se
# qualquer oferta Awin existe. Link cadastrado manualmente
# (is_manually_cached, ex: Baby/Royal Canin) continua vencendo os dois,
# sempre — ver docstring do módulo, critério 2.
MERCHANT_ROUTE_POLICIES: dict[str, MerchantRoutePolicy] = {
    "cobasi": MerchantRoutePolicy(merchant="cobasi", preferred_route="awin", fallback_routes=("mais",)),
}

# Mantido por compatibilidade com código/testes existentes — dict simples
# {merchant: preferred_route}, derivado de MERCHANT_ROUTE_POLICIES.
PREFERRED_ROUTE_BY_MERCHANT: dict[str, str] = {
    m: p.preferred_route for m, p in MERCHANT_ROUTE_POLICIES.items()
}


def preferred_route_for(merchant: str) -> Optional[str]:
    return PREFERRED_ROUTE_BY_MERCHANT.get(merchant)


def fallback_routes_for(merchant: str) -> tuple[str, ...]:
    policy = MERCHANT_ROUTE_POLICIES.get(merchant)
    return policy.fallback_routes if policy else ()

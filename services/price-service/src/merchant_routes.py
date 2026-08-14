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


# Cobasi: "mais" é a única rota validada/comprovada em produção hoje —
# permanece preferida até uma compra real confirmar que a Awin comissiona
# de fato (ver docs/AFFILIATES.md). "awin" já é aceita como fallback
# estrutural (a rota "resolve por si só se mais não resolver" já é como
# o dedupe funciona), mas awin_enabled=False no master gate global
# (config.py) é o que efetivamente impede qualquer oferta Awin de existir
# hoje — mudar a lista aqui sozinho não libera nada.
MERCHANT_ROUTE_POLICIES: dict[str, MerchantRoutePolicy] = {
    "cobasi": MerchantRoutePolicy(merchant="cobasi", preferred_route="mais", fallback_routes=("awin",)),
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

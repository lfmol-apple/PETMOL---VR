"""
merchant_routes.py — MerchantRoutePolicy (preferred_route/fallback_routes
explícitos) e a garantia central: a rota preferida só vence quando de fato
existe uma oferta nela; com uma única rota resolvendo (preferida ou não),
essa é a exibida — nunca "some" o merchant. Cobertura end-to-end do
fallback fica em test_commerce_offers_awin_dedupe.py (com providers
reais); aqui é só o contrato de dados.
"""
from src.merchant_routes import (
    MERCHANT_ROUTE_POLICIES,
    PREFERRED_ROUTE_BY_MERCHANT,
    fallback_routes_for,
    preferred_route_for,
)


def test_cobasi_preferred_route_is_mais_until_validated():
    """"mais" é a única rota comprovada em produção — continua preferida
    até uma compra real validar a Awin (ver docs/AFFILIATES.md)."""
    assert preferred_route_for("cobasi") == "mais"


def test_cobasi_lists_awin_as_fallback():
    assert fallback_routes_for("cobasi") == ("awin",)


def test_unknown_merchant_has_no_preference_or_fallback():
    assert preferred_route_for("shopee") is None
    assert fallback_routes_for("shopee") == ()


def test_preferred_route_by_merchant_derived_from_policies():
    """Dict legado (usado por _dedupe_by_merchant e por monkeypatch em
    testes existentes) precisa ficar consistente com o dataclass novo."""
    for merchant, policy in MERCHANT_ROUTE_POLICIES.items():
        assert PREFERRED_ROUTE_BY_MERCHANT[merchant] == policy.preferred_route

"""
CobasiProvider.monetize() por modo (cobasi_affiliate_mode). O padrão
desde 15/08/2026 é "disabled" (MAIS totalmente desativado, decisão de
produto — só Awin resolve a Cobasi enquanto isso não é revisitado); UTM
NÃO é ativada em produção sem confirmação formal (ver docs/AFFILIATES.md
e cobasi_utm.py). Os testes abaixo que exercitam "cached"/"utm" ligam o
modo explicitamente via COBASI_AFFILIATE_MODE — não dependem do padrão
atual, só provam que a lógica de cada modo continua correta quando
alguém o reativar. fetch_cobasi_price é sempre monkeypatchado; nunca
chama a API real da Cobasi.
"""
import pytest

from src.affiliate_links import ProductAffiliateLink
from src.cobasi_provider import CobasiProvider
from src.commerce_pricing import ProductPriceResult
from src.commerce_provider import DiscoveredOffer, ProductContext
from src.config import get_settings
from src.db import SessionLocal
from src.product_catalog_lookup import ProductCatalog


GTIN = "7891234567890"


@pytest.fixture(autouse=True)
def _force_env(monkeypatch):
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.delenv("AFFILIATE_ONLY_COMMERCE", raising=False)
    monkeypatch.delenv("COBASI_AFFILIATE_MODE", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _register_product(gtin: str = GTIN) -> int:
    db = SessionLocal()
    try:
        product = ProductCatalog(barcode=gtin, barcode_normalized=gtin, name="Produto Teste", brand="Marca Teste")
        db.add(product)
        db.commit()
        db.refresh(product)
        return product.id
    finally:
        db.close()


def _offer(direct_url="https://www.cobasi.com.br/produto/p") -> DiscoveredOffer:
    return DiscoveredOffer(merchant="cobasi", price=100.0, direct_url=direct_url, ean=GTIN)


def test_default_mode_is_utm(monkeypatch):
    """Desde 29/08/2026, o padrão é 'utm' — confirmado manualmente via
    painel MAIS (URL de produto real gerou link que resolve pra página
    real, não 404) e decisão de produto de nunca monetizar via Awin (ver
    AWIN_SELLABLE_MERCHANTS em awin_advertisers.py, sempre vazio) — o
    programa MAIS/UTM é a única rota real de venda da Cobasi agora."""
    assert get_settings().cobasi_affiliate_mode == "utm"


def test_cached_mode_uses_registered_link(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://mais.app/ABC", "affiliate_product", "mais", True)
    finally:
        db.close()


def test_cached_mode_without_link_and_prod_returns_none(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "true")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result is None
    finally:
        db.close()


def test_cached_mode_without_link_and_dev_falls_back_to_direct(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://www.cobasi.com.br/produto/p", "direct", "mais")
    finally:
        db.close()


def test_utm_mode_generates_url_when_explicitly_enabled(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert result is not None
        url, link_type, route = result
        assert "utm_source=mais" in url
        assert link_type == "affiliate_product"
        assert route == "mais"
    finally:
        db.close()


def test_utm_mode_still_prefers_cached_link_when_one_exists(monkeypatch):
    """§19-20: mudar cobasi_affiliate_mode pra 'utm' nunca deve abandonar
    um link já cadastrado e comprovado (ex: Baby/mais.app/IvUCAG) — o link
    manual sempre tem prioridade, mesmo em modo 'utm'."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(
            product_id=product_id, merchant="cobasi",
            affiliate_product_url="https://mais.app/IvUCAG", active=True,
        ))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result == ("https://mais.app/IvUCAG", "affiliate_product", "mais", True)
    finally:
        db.close()


def test_utm_mode_offer_is_not_flagged_as_manually_cached(monkeypatch):
    """Distingue UTM (gerado) de link cadastrado — só o segundo blinda a
    oferta no dedupe do CommerceEngine (ver commerce_provider.py). UTM
    continua retornando 3-tupla (sem is_manually_cached explícito),
    consumido pelo CommerceEngine como is_manually_cached=False."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert len(result) == 3
    finally:
        db.close()


def test_disabled_mode_never_monetizes(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext(product_id=product_id))
        assert result is None
    finally:
        db.close()


def test_should_run_false_when_mode_disabled_regardless_of_manual_link(monkeypatch):
    """Desativação total (padrão desde 15/08/2026): should_run() nem
    verifica se existe link cadastrado ou oferta Awin — o provider inteiro
    fica fora do ar, sem sequer a chamada de rede em find_offer()."""
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()
    product_id = _register_product()
    db = SessionLocal()
    try:
        db.add(ProductAffiliateLink(product_id=product_id, merchant="cobasi", affiliate_product_url="https://mais.app/ABC", active=True))
        db.commit()

        provider = CobasiProvider(db)
        assert provider.should_run(ProductContext(gtin=GTIN, product_id=product_id), []) is False
    finally:
        db.close()


def test_api_mode_not_implemented_returns_none(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "api")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        result = provider.monetize(_offer(), ProductContext())
        assert result is None
    finally:
        db.close()


def test_invalid_mode_rejected_by_settings(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "not-a-real-mode")
    get_settings.cache_clear()
    with pytest.raises(Exception):
        get_settings()




def test_prod_env_default_mode_is_still_utm(monkeypatch):
    """Mesmo com ENV=prod, sem COBASI_AFFILIATE_MODE explícito o padrão
    continua 'utm' (decisão de produto fixa, ver test_default_mode_is_utm)."""
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.delenv("COBASI_AFFILIATE_MODE", raising=False)
    get_settings.cache_clear()
    try:
        assert get_settings().cobasi_affiliate_mode == "utm"
    finally:
        monkeypatch.setenv("ENV", "dev")
        get_settings.cache_clear()


# ═══════════════════════════════════════════════════════════════════════════
# IDENTIDADE ESTRUTURAL — _candidate_identity_verdict (função pura)
# A auditoria de produção encontrou: "Golden ração" + weight 15 devolvia
# ração de gato 1 kg R$32,90; Drontal 4 comp caía no SKU de 2 comp; etc.
# Filosofia: melhor não mostrar preço do que mostrar preço de produto errado.
# ═══════════════════════════════════════════════════════════════════════════
from src.commerce_pricing import (  # noqa: E402
    CobasiIdentitySpec,
    _candidate_identity_verdict,
    _search_cobasi_matched_once,
    fetch_cobasi_price_matched,
)

_ACCEPT = {"ean_equal", "structural_match", "brand_plus_attr_match", "strong_name_match"}


def _verdict(spec, product, sku="", ean=None):
    return _candidate_identity_verdict(spec, product, sku, ean)


def test_identity_ean_equal_accepts():
    spec = CobasiIdentitySpec.build(reference_name="Ração X 15kg", brand="X", gtin="7891234567890")
    ok, reason = _verdict(spec, "Ração Qualquer", "Ração Qualquer 3 kg", "7891234567890")
    assert ok and reason == "ean_equal"


def test_identity_ean_divergent_rejects():
    spec = CobasiIdentitySpec.build(reference_name="Ração X 15kg", brand="X", gtin="7891234567890")
    ok, reason = _verdict(spec, "Ração Qualquer", "Ração Qualquer 15 kg", "7899999999999")
    assert not ok and reason == "ean_mismatch"


def test_identity_species_contradiction_rejects():
    # Golden cão 15 kg  ✗  Golden gato filhote 1 kg
    spec = CobasiIdentitySpec.build(
        reference_name="Golden Fórmula Cães Adultos Frango e Arroz 15kg", brand="Golden",
        species="dog", weight_kg=15,
    )
    ok, reason = _verdict(
        spec, "Ração Golden Seleção Natural Gatos Filhotes Frango e Arroz",
        "Ração Golden Seleção Natural Gatos Filhotes Frango e Arroz 1 kg",
    )
    assert not ok
    assert reason in ("species_mismatch", "weight_mismatch")  # qualquer contradição objetiva basta


def test_identity_weight_15_vs_1_rejects():
    spec = CobasiIdentitySpec.build(reference_name="Golden Adultos Frango 15kg", brand="Golden", weight_kg=15)
    ok, reason = _verdict(spec, "Ração Golden Adultos Frango", "Ração Golden Adultos Frango 1 kg")
    assert not ok and reason == "weight_mismatch"


def test_identity_weight_15_vs_15_accepts():
    spec = CobasiIdentitySpec.build(reference_name="Golden Fórmula Cães Adultos Frango 15kg", brand="Golden", species="dog", weight_kg=15)
    ok, reason = _verdict(spec, "Ração Golden Fórmula Cães Adultos Frango e Arroz",
                          "Ração Golden Fórmula Cães Adultos Frango e Arroz 15 kg")
    assert ok and reason in _ACCEPT


def test_identity_weight_500g_vs_1kg_rejects_when_presentation_known():
    spec = CobasiIdentitySpec.build(reference_name="Premier Gatos Castrados Frango 500g", brand="Premier", species="cat", weight_kg=0.5)
    ok, reason = _verdict(spec, "Ração Premier Gatos Castrados Frango", "Ração Premier Gatos Castrados Frango 1 kg")
    assert not ok and reason == "weight_mismatch"


def test_identity_weight_500g_vs_500g_accepts():
    spec = CobasiIdentitySpec.build(reference_name="Premier Ambientes Internos Gatos Castrados 7 a 11 Anos Frango 500g", brand="Premier", species="cat", weight_kg=0.5)
    ok, reason = _verdict(spec, "Ração Premier Ambientes Internos Gatos Castrados 7 a 11 Anos Frango",
                          "Ração Premier Ambientes Internos Gatos Castrados 7 a 11 Anos Frango 500 g")
    assert ok and reason in _ACCEPT


def test_identity_pack_count_4_vs_2_rejects():
    spec = CobasiIdentitySpec.build(reference_name="Drontal Plus Cães 10kg 4 Comprimidos", brand="Drontal")
    ok, reason = _verdict(spec, "Vermífugo Drontal Plus + Sabor para Cães 10kg",
                          "Vermífugo Drontal Plus + Sabor para Cães 10kg 2 Comprimidos")
    assert not ok and reason == "pack_count_mismatch"


def test_identity_pack_count_4_vs_4_accepts():
    spec = CobasiIdentitySpec.build(reference_name="Drontal Plus Cães 10kg 4 Comprimidos", brand="Drontal")
    ok, reason = _verdict(spec, "Vermífugo Drontal Plus + Sabor para Cães 10kg",
                          "Vermífugo Drontal Plus + Sabor para Cães 10kg 4 Comprimidos")
    assert ok and reason in _ACCEPT


def test_identity_length_48_vs_65_rejects():
    spec = CobasiIdentitySpec.build(reference_name="Coleira Scalibor Cães Pequenos e Médios 48 cm", brand="Scalibor")
    ok, reason = _verdict(spec, "Coleira Antiparasitária Scalibor Cães Grandes",
                          "Coleira Antiparasitária Scalibor Cães Grandes 65 cm")
    assert not ok and reason == "length_mismatch"


def test_identity_length_48_vs_48_accepts():
    spec = CobasiIdentitySpec.build(reference_name="Coleira Scalibor Cães Pequenos e Médios 48 cm", brand="Scalibor")
    ok, reason = _verdict(spec, "Coleira Antiparasitária Scalibor Cães Pequenos e Médios",
                          "Coleira Antiparasitária Scalibor Cães Pequenos e Médios 48 cm")
    assert ok and reason in _ACCEPT


def test_identity_premier_wrong_line_rejected_when_distinctive_group_known():
    # esperado tem grupo distintivo explícito que o candidato não tem
    spec = CobasiIdentitySpec.build(reference_name="Ração Premier Raças Pequenas Filhotes Frango 1kg", brand="Premier", species="dog", weight_kg=1)
    ok, reason = _verdict(spec, "Ração Premier Raças Específicas Pitbull Adulto Frango",
                          "Ração Premier Raças Específicas Pitbull Adulto Frango 12 kg")
    assert not ok  # weight (1≠12) e/ou distinctive group (filhotes vs adulto / pequenas vs pitbull)


def test_identity_fail_closed_when_no_discriminator():
    # "Golden ração" — só marca + categoria, sem peso/espécie/qtd → não dá pra provar
    spec = CobasiIdentitySpec.build(reference_name="Golden ração", brand="Golden")
    ok, reason = _verdict(spec, "Ração Golden Fórmula Cães Adultos Frango e Arroz",
                          "Ração Golden Fórmula Cães Adultos Frango e Arroz 15 kg")
    assert not ok and reason == "insufficient_identity_evidence"


def test_identity_no_gtin_no_reference_no_brand_fails_closed():
    spec = CobasiIdentitySpec.build(reference_name=None, brand=None)
    ok, reason = _verdict(spec, "Qualquer Coisa", "Qualquer Coisa 500 g")
    assert not ok and reason == "insufficient_identity_evidence"


def test_identity_weight_unverifiable_on_candidate_fails_closed():
    spec = CobasiIdentitySpec.build(reference_name="Golden Adultos 15kg", brand="Golden", weight_kg=15)
    ok, reason = _verdict(spec, "Ração Golden Adultos Frango", "Ração Golden Adultos Frango")  # SKU sem peso
    assert not ok and reason == "weight_unverifiable"


def test_identity_correct_match_still_accepted_rich_name():
    spec = CobasiIdentitySpec.build(
        reference_name="NexGard Antipulgas e Carrapatos de 4,1 a 10kg para Cães 1 tablete",
        brand="NexGard", species="dog",
    )
    ok, reason = _verdict(
        spec, "NexGard Antipulgas e Carrapatos  de 4,1 a 10kg para Cães",
        "NexGard Antipulgas e Carrapatos  de 4,1 a 10kg para Cães 1 tablete",
    )
    assert ok and reason in _ACCEPT


# ═══════════════════════════════════════════════════════════════════════════
# _search_cobasi_matched_once — examina TODOS os SKUs, não só o primeiro
# ═══════════════════════════════════════════════════════════════════════════

class _FakeResp:
    def __init__(self, payload):
        self._payload = payload
        self.status_code = 200

    def json(self):
        return self._payload

    def raise_for_status(self):
        pass


def _fake_vtex(payload):
    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return _FakeResp(payload)
    return _Client


def _vtex_product(name, brand, skus):
    """skus: list of (nameComplete, ean, price)"""
    return {
        "productName": name, "brand": brand, "linkText": name.lower().replace(" ", "-"),
        "items": [
            {"nameComplete": nc, "ean": ean,
             "sellers": [{"commertialOffer": {"Price": price, "ListPrice": price, "IsAvailable": True}}]}
            for nc, ean, price in skus
        ],
    }


@pytest.mark.asyncio
async def test_matched_picks_correct_sku_among_siblings_drontal(monkeypatch):
    """VTEX devolve o produto com 2 SKUs: 2 comprimidos e 4 comprimidos.
    Spec pede 4 → escolhe o SKU de 4, não o primeiro (2)."""
    payload = [_vtex_product(
        "Vermífugo Drontal Plus + Sabor para Cães 10kg", "Drontal",
        [("Vermífugo Drontal Plus + Sabor para Cães 10kg 2 Comprimidos", "5420036960836", 45.5),
         ("Vermífugo Drontal Plus + Sabor para Cães 10kg 4 Comprimidos", "5420036960843", 68.5)],
    )]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(reference_name="Drontal Plus Cães 10kg 4 Comprimidos", brand="Drontal", gtin="5420036960843")
    r = await _search_cobasi_matched_once("drontal 4 comprimidos", spec)
    assert r.found and r.price == 68.5 and "4 Comprimidos" in (r.product_name or "")


@pytest.mark.asyncio
async def test_matched_prefers_second_product_when_first_is_wrong_size(monkeypatch):
    """VTEX ranqueia a coleira de 65 cm primeiro; a de 48 cm vem depois.
    Spec pede 48 → pula a de 65 e pega a de 48."""
    payload = [
        _vtex_product("Coleira Antiparasitária Scalibor Cães Grandes", "Scalibor",
                      [("Coleira Antiparasitária Scalibor Cães Grandes 65 cm", None, 93.5)]),
        _vtex_product("Coleira Antiparasitária Scalibor Cães Pequenos e Médios", "Scalibor",
                      [("Coleira Antiparasitária Scalibor Cães Pequenos e Médios 48 cm", None, 84.5)]),
    ]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(reference_name="Coleira Scalibor Cães Pequenos e Médios 48 cm", brand="Scalibor")
    r = await _search_cobasi_matched_once("scalibor coleira", spec)
    assert r.found and r.price == 84.5 and "48 cm" in (r.product_name or "")


@pytest.mark.asyncio
async def test_matched_returns_not_found_when_only_wrong_variants(monkeypatch):
    """Só a de 65 cm no resultado, spec pede 48 → não mostra preço."""
    payload = [_vtex_product("Coleira Antiparasitária Scalibor Cães Grandes", "Scalibor",
                             [("Coleira Antiparasitária Scalibor Cães Grandes 65 cm", None, 93.5)])]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(reference_name="Coleira Scalibor Cães Pequenos e Médios 48 cm", brand="Scalibor")
    r = await _search_cobasi_matched_once("scalibor coleira", spec)
    assert not r.found and r.reason == "variant_mismatch"


@pytest.mark.asyncio
async def test_matched_dog_food_query_never_returns_cat_food(monkeypatch):
    """Caso real de produção: q='Golden ração' + species=dog + weight=15;
    VTEX devolve ração de gato 1 kg primeiro. Deve NÃO mostrar preço."""
    payload = [
        _vtex_product("Ração Golden Seleção Natural Gatos Filhotes Frango e Arroz", "Golden",
                      [("Ração Golden Seleção Natural Gatos Filhotes Frango e Arroz 1 kg", None, 32.9)]),
        _vtex_product("Ração Golden Gatos Adultos Carne", "Golden",
                      [("Ração Golden Gatos Adultos Carne 1 kg", None, 30.5)]),
    ]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(reference_name="Golden ração", brand="Golden", species="dog", weight_kg=15)
    r = await _search_cobasi_matched_once("Golden ração", spec)
    assert not r.found  # espécie e peso contradizem — nunca vira R$32,90


@pytest.mark.asyncio
async def test_matched_dog_food_query_finds_right_dog_food_if_present(monkeypatch):
    payload = [
        _vtex_product("Ração Golden Seleção Natural Gatos Filhotes", "Golden",
                      [("Ração Golden Seleção Natural Gatos Filhotes Frango 1 kg", None, 32.9)]),
        _vtex_product("Ração Golden Fórmula Cães Adultos Frango e Arroz", "Golden",
                      [("Ração Golden Fórmula Cães Adultos Frango e Arroz 3 kg", "7897348203759", 59.9),
                       ("Ração Golden Fórmula Cães Adultos Frango e Arroz 15 kg", "7897348200703", 179.9)]),
    ]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(
        reference_name="Golden Fórmula Cães Adultos Frango e Arroz 15kg",
        brand="Golden", species="dog", weight_kg=15,
    )
    r = await _search_cobasi_matched_once("Golden ração", spec)
    assert r.found and r.price == 179.9 and "15 kg" in (r.product_name or "")


# ═══════════════════════════════════════════════════════════════════════════
# CobasiProvider.find_offer — integração (fetch_cobasi_price_matched fake)
# ═══════════════════════════════════════════════════════════════════════════

def _matched_ok(**kw):
    base = dict(found=True, store="cobasi", price=100.0, is_available=True,
                url="https://www.cobasi.com.br/x/p", reason="structural_match", ean=None)
    base.update(kw)
    return ProductPriceResult(**base)


@pytest.mark.asyncio
async def test_find_offer_returns_offer_when_identity_matched(monkeypatch):
    async def fake(query, spec, *, target_weight_kg=None):
        return _matched_ok(product_name="Ração Golden Fórmula Cães Adultos 15 kg", brand="Golden", price=179.9)
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake)
    db = SessionLocal()
    try:
        offer = await CobasiProvider(db).find_offer(
            ProductContext(query="Golden ração", brand="Golden", species="dog", weight_kg=15)
        )
        assert offer is not None and offer.price == 179.9
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_none_when_identity_not_proven(monkeypatch):
    async def fake(query, spec, *, target_weight_kg=None):
        return ProductPriceResult(found=False, reason="insufficient_identity_evidence")
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake)
    db = SessionLocal()
    try:
        offer = await CobasiProvider(db).find_offer(ProductContext(query="Golden ração", brand="Golden"))
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_passes_spec_species_and_weight_to_matcher(monkeypatch):
    captured = {}
    async def fake(query, spec, *, target_weight_kg=None):
        captured["species"] = spec.species
        captured["weight"] = spec.weight_kg
        captured["gtin"] = spec.gtin
        return ProductPriceResult(found=False, reason="no_results")
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake)
    db = SessionLocal()
    try:
        await CobasiProvider(db).find_offer(
            ProductContext(query="racao", name="Golden Frango 15kg", brand="Golden", species="cat", weight_kg=15, gtin="7897348200703")
        )
        assert captured["species"] == "cat" and captured["weight"] == 15 and captured["gtin"] == "7897348200703"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_tries_gtin_candidate_first(monkeypatch):
    calls = []
    async def fake(query, spec, *, target_weight_kg=None):
        calls.append(query)
        return ProductPriceResult(found=False, reason="no_results")
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake)
    db = SessionLocal()
    try:
        await CobasiProvider(db).find_offer(
            ProductContext(query="racao golden", gtin="7897348200703", brand="Golden", name="Golden 15kg")
        )
        assert calls[0] == "7897348200703"
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_no_usable_query_returns_none():
    db = SessionLocal()
    try:
        offer = await CobasiProvider(db).find_offer(ProductContext())
        assert offer is None
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_out_of_stock_still_returned_engine_filters(monkeypatch):
    from src.commerce_provider import CommerceEngine
    async def fake(query, spec, *, target_weight_kg=None):
        return _matched_ok(is_available=False, product_name="Ração Golden 15kg", brand="Golden")
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake)
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    db = SessionLocal()
    try:
        provider = CobasiProvider(db)
        ctx = ProductContext(name="Golden 15kg", brand="Golden", species="dog", weight_kg=15)
        discovered = await provider.find_offer(ctx)
        assert discovered is not None and discovered.is_available is False
        assert await CommerceEngine([provider]).get_offers(ctx) == []
    finally:
        db.close()
        get_settings.cache_clear()

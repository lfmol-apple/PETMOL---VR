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
# IDENTIDADE DE PRODUTO — MATCH / MISMATCH / UNKNOWN
# AUSENTE != DIFERENTE. Rota EAN-exato (fq=alternateIds_Ean) tem prioridade.
# Corpus real de referência: caso-testemunha Royal Canin Urinary S/O Small
# Dog 7,5 kg (GTIN 7896181298090, EAN do SKU 7,5 kg == GTIN; SKU 2 kg tem
# EAN 7896181298083).
# ═══════════════════════════════════════════════════════════════════════════
from src.commerce_pricing import (  # noqa: E402
    CobasiIdentitySpec,
    MatchState,
    _candidate_identity_verdict,
    _sanitize_query,
    _search_cobasi_by_ean_once,
    _search_cobasi_matched_once,
    fetch_cobasi_price_by_ean,
    fetch_cobasi_price_matched,
)
from src.cobasi_provider import _query_candidates  # noqa: E402


def _v(spec, product_name, sku="", ean=None, *, product=None, item=None):
    return _candidate_identity_verdict(spec, product_name, sku, ean, product=product, item=item)


def _prod(product_name, brand, skus, **specs):
    """skus: [(nameComplete, ean, price)]. specs: campos de specification VTEX."""
    return {
        "productName": product_name, "brand": brand,
        "linkText": product_name.lower().replace(" ", "-"),
        "items": [
            {"nameComplete": nc, "name": nc.split()[-1], "ean": ean,
             "sellers": [{"commertialOffer": {"Price": p, "ListPrice": p, "IsAvailable": True}}]}
            for nc, ean, p in skus
        ],
        **specs,
    }


def _fake_vtex(payload):
    class _Resp:
        status_code = 200
        def __init__(self, pl): self._pl = pl
        def json(self): return self._pl
        def raise_for_status(self): pass

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return _Resp(payload)
    return _Client


# ── 1/2. Baby: EAN exato aceita; SKU 2 kg do mesmo produto é rejeitado ─────
def test_baby_ean_exact_accepts_and_wrong_sku_of_same_product_rejects():
    spec = CobasiIdentitySpec.build(
        reference_name="Royal Canin Veterinary Diet Urinary Small Dog 7,5kg",
        brand="Royal Canin", species="dog", gtin="7896181298090", weight_kg=7.5,
    )
    p = "Ração Royal Canin Veterinary Diet Urinary Small Dog para Cães de Porte Pequeno com Cálculos Urinários"
    st_ok, r_ok = _v(spec, p, p + " 7,5kg", "7896181298090")
    st_no, r_no = _v(spec, p, p + " 2kg", "7896181298083")
    assert st_ok is MatchState.MATCH and r_ok == "ean_equal"
    assert st_no is MatchState.MISMATCH and r_no == "ean_mismatch"


# ── 3/4. EAN-first usa fq=alternateIds_Ean e NÃO products/search/{gtin} ────
@pytest.mark.asyncio
async def test_ean_first_uses_fq_alternate_ids_endpoint(monkeypatch):
    seen = {}

    class _Resp:
        status_code = 200
        def __init__(self, pl): self._pl = pl
        def json(self): return self._pl

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, **kw):
            seen["url"] = url
            seen["params"] = kw.get("params")
            return _Resp([_prod(
                "Ração Royal Canin Veterinary Diet Urinary Small Dog", "Royal Canin",
                [("Ração Royal Canin Urinary Small Dog 2kg", "7896181298083", 154.99),
                 ("Ração Royal Canin Urinary Small Dog 7,5kg", "7896181298090", 457.81)],
                **{"customLabel0 Departamento": ["Cachorro"]},
            )])
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _Client)
    spec = CobasiIdentitySpec.build(reference_name="Royal Canin Urinary Small Dog 7,5kg",
                                    brand="Royal Canin", species="dog", gtin="7896181298090", weight_kg=7.5)
    r = await fetch_cobasi_price_by_ean("7896181298090", spec)
    assert r.found and r.price == 457.81 and r.reason == "ean_equal"
    assert "/products/search/7896181298090" not in seen["url"]
    assert seen["params"].get("fq") == "alternateIds_Ean:7896181298090"


def test_query_candidates_has_no_raw_gtin_candidate():
    from src.commerce_provider import ProductContext
    cands = _query_candidates(ProductContext(query="Golden ração", brand="Golden",
                                             gtin="7896181298090", name="Golden Frango 15kg"))
    assert "7896181298090" not in [q for _, q in cands]


# ── 5. Golden Fórmula Adultos 15 kg (nome rico) continua MATCH ────────────
def test_golden_formula_adultos_15kg_matches_with_rich_name():
    spec = CobasiIdentitySpec.build(
        reference_name="Golden Fórmula Cães Adultos Frango Arroz e Vegetais 15kg",
        brand="Golden", species="dog", weight_kg=15,
    )
    p = "Ração Golden Formula Cães Adultos Frango, Arroz e Vegetais"
    st, _ = _v(spec, p, p + " 15 kg", "7897348200703",
               product=_prod(p, "Golden", [(p + " 15 kg", "7897348200703", 179.9)],
                             Idade=["Adulto"], **{"customLabel0 Departamento": ["Cachorro"]}),
               item={"nameComplete": p + " 15 kg", "name": "15", "variations": []})
    assert st is MatchState.MATCH


# ── 6. Golden Adultos 3 kg  !=  Golden Sênior 3 kg ───────────────────────
def test_golden_adultos_not_senior_when_age_known():
    spec = CobasiIdentitySpec.build(
        reference_name="Golden Fórmula Cães Adultos Frango 3kg", brand="Golden", species="dog", weight_kg=3,
    )
    p = "Ração Golden Cães Sênior Porte Pequeno Mini Bits Carne e Arroz"
    st, r = _v(spec, p, p + " 3 kg", None,
               product=_prod(p, "Golden", [(p + " 3 kg", None, 59.9)], Idade=["Sênior"]),
               item={"nameComplete": p + " 3 kg", "name": "3", "variations": []})
    assert st is MatchState.MISMATCH and r == "line_mismatch"


# ── 7. Golden Gatos Castrados  !=  Golden Gatos Filhotes ─────────────────
def test_golden_gatos_castrados_not_filhotes():
    spec = CobasiIdentitySpec.build(
        reference_name="Golden Gatos Adultos Castrados Frango 1kg", brand="Golden", species="cat", weight_kg=1,
    )
    p = "Ração Golden Seleção Natural Gatos Filhotes Frango e Arroz"
    st, r = _v(spec, p, p + " 1 kg", None,
               product=_prod(p, "Golden", [(p + " 1 kg", None, 32.9)], Idade=["Filhote"]))
    assert st is MatchState.MISMATCH


# ── 8. Premier Golden Retriever  !=  Premier Pitbull (linha racial) ──────
def test_premier_breed_line_mismatch():
    spec = CobasiIdentitySpec.build(
        reference_name="Ração Premier Raças Específicas Golden Retriever Adultos 12kg",
        brand="Premier", species="dog", weight_kg=12,
    )
    p = "Ração Premier Raças Específicas Pitbull Adulto Frango"
    st, r = _v(spec, p, p + " 12 kg", None,
               product=_prod(p, "Premier", [(p + " 12 kg", None, 276.9)], Linha=["Raças Específicas"]))
    assert st is MatchState.MISMATCH and r == "line_mismatch"


# ── 9. Royal Canin Gatos Castrados  !=  Royal Canin Persa ───────────────
def test_royal_canin_castrados_not_persa():
    spec = CobasiIdentitySpec.build(
        reference_name="Ração Royal Canin Gatos Castrados 1,5kg", brand="Royal Canin", species="cat", weight_kg=1.5,
    )
    p = "Ração Royal Canin Persa Gatos Adultos"
    st, r = _v(spec, p, p + " 1,5kg", None,
               product=_prod(p, "Royal Canin", [(p + " 1,5kg", None, 145.74)], Linha=["Raças Específicas"]))
    assert st is MatchState.MISMATCH


# ── 10/11. Drontal 2 comp certo; Drontal 4 comp certo ───────────────────
def test_drontal_2_comp_correct():
    spec = CobasiIdentitySpec.build(reference_name="Vermífugo Drontal Plus Cães 2 comprimidos", brand="Drontal", species="dog")
    p = "Vermífugo Drontal Plus + Sabor para Cães 10kg"
    st, _ = _v(spec, p, p + " 2 Comprimidos", None)
    assert st is MatchState.MATCH


def test_drontal_4_comp_correct():
    spec = CobasiIdentitySpec.build(reference_name="Vermífugo Drontal Plus Cães 4 comprimidos", brand="Drontal", species="dog")
    p = "Vermífugo Drontal Plus + Sabor para Cães 10kg"
    st, _ = _v(spec, p, p + " 4 Comprimidos", None)
    assert st is MatchState.MATCH


# ── 12. Drontal 4 comp  !=  Drontal 2 comp ─────────────────────────────
def test_drontal_4_not_2():
    spec = CobasiIdentitySpec.build(reference_name="Vermífugo Drontal Plus Cães 4 comprimidos", brand="Drontal", species="dog")
    p = "Vermífugo Drontal Plus + Sabor para Cães 10kg"
    st, r = _v(spec, p, p + " 2 Comprimidos", None)
    assert st is MatchState.MISMATCH and r == "pack_count_mismatch"


# ── 13. Scalibor 48  !=  65 ; 48 == 48 ────────────────────────────────
def test_scalibor_48_not_65_and_48_ok():
    spec = CobasiIdentitySpec.build(reference_name="Coleira Scalibor 48cm", brand="Scalibor", species="dog")
    p48 = "Coleira Antiparasitária Scalibor Cães Pequenos e Médios"
    p65 = "Coleira Antiparasitária Scalibor Cães Grandes"
    ok48, _ = _v(spec, p48, p48 + " 48 cm", None)
    st65, r65 = _v(spec, p65, p65 + " 65 cm", None)
    assert ok48 is MatchState.MATCH
    assert st65 is MatchState.MISMATCH and r65 == "length_mismatch"


# ── 14. espécie cão  !=  gato (contradição objetiva) ──────────────────
def test_species_dog_not_cat():
    spec = CobasiIdentitySpec.build(reference_name="Golden Fórmula Cães Adultos Frango 15kg",
                                    brand="Golden", species="dog", weight_kg=15)
    p = "Ração Golden Gatos Adultos Frango"
    st, r = _v(spec, p, p + " 1 kg", None)
    assert st is MatchState.MISMATCH and r == "species_mismatch"


def test_species_dual_species_product_not_rejected():
    spec = CobasiIdentitySpec.build(reference_name="Shampoo Neutro Pet Clean 700ml",
                                    brand="Pet Clean", species="dog")
    p = "Shampoo e Condicionador Neutro Cães e Gatos Pet Clean"
    st, _ = _v(spec, p, p + " 700 ml", None)
    assert st is not MatchState.MISMATCH


# ── 15. peso ausente no nome  →  UNKNOWN, não MISMATCH automático ──────
def test_weight_absent_is_unknown_not_mismatch():
    spec = CobasiIdentitySpec.build(reference_name="Marca Linha Cães Adultos Frango 15kg",
                                    brand="Marca", species="dog", weight_kg=15)
    p = "Ração Marca Linha Cães Adultos Frango"   # SKU sem peso em nenhum campo
    st, r = _v(spec, p, p, None,
               product=_prod(p, "Marca", [(p, None, 100.0)]),
               item={"nameComplete": p, "name": "un", "variations": []})
    assert st is MatchState.UNKNOWN and r.startswith("attr_unverifiable")


# ── 16. peso achado em specification VTEX resolve o UNKNOWN ───────────
def test_weight_found_in_vtex_spec_resolves_unknown():
    spec = CobasiIdentitySpec.build(reference_name="Marca Linha Cães Adultos Frango 15kg",
                                    brand="Marca", species="dog", weight_kg=15)
    p = "Ração Marca Linha Cães Adultos Frango"
    prod = _prod(p, "Marca", [(p, None, 100.0)], **{"Peso da Ração": ["15 kg"]})
    prod["items"][0]["variations"] = ["Peso Ração Cachorro"]
    prod["items"][0]["Peso Ração Cachorro"] = ["15 kg"]
    st, _ = _v(spec, p, p, None, product=prod, item=prod["items"][0])
    assert st is MatchState.MATCH


# ── 17. espécie achada em customLabel0 Departamento é usada ───────────
def test_species_from_customlabel_department():
    spec = CobasiIdentitySpec.build(reference_name="Marca Linha Adultos 15kg",
                                    brand="Marca", species="dog", weight_kg=15)
    p = "Ração Marca Linha Adultos Frango"   # sem "gato"/"cão" no nome
    prod = _prod(p, "Marca", [(p + " 15 kg", None, 100.0)],
                 **{"customLabel0 Departamento": ["Gatos"]})
    st, r = _v(spec, p, p + " 15 kg", None, product=prod, item=prod["items"][0])
    assert st is MatchState.MISMATCH and r == "species_mismatch"


# ── 18. ProductCatalog.name enriquece reference_name (find_offer) ─────
@pytest.mark.asyncio
async def test_find_offer_enriches_reference_from_catalog(monkeypatch):
    from src.commerce_provider import ProductContext
    captured = {}

    async def fake_ean(gtin, spec):
        captured["ref"] = spec.reference_name
        return ProductPriceResult(found=False, reason="no_results")

    async def fake_matched(query, spec, *, target_weight_kg=None):
        captured.setdefault("queries", []).append(query)
        return ProductPriceResult(found=False, reason="no_results")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_by_ean", fake_ean)
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake_matched)
    db = SessionLocal()
    try:
        db.add(ProductCatalog(barcode="7896181298090", barcode_normalized="7896181298090",
                              name="Ração Royal Canin Veterinary Diet Urinary Small Dog 7,5kg", brand="Royal Canin"))
        db.commit()
        await CobasiProvider(db).find_offer(ProductContext(
            query="Royal Canin ração", brand="Royal Canin", species="dog",
            weight_kg=7.5, gtin="7896181298090",
        ))
        assert "Urinary Small Dog" in (captured["ref"] or "")
        assert any("Urinary Small Dog" in q for q in captured.get("queries", []))
    finally:
        db.query(ProductCatalog).filter(ProductCatalog.barcode_normalized == "7896181298090").delete()
        db.commit()
        db.close()


# ── 19. cache continua funcionando (rota EAN e textual) ──────────────
@pytest.mark.asyncio
async def test_ean_route_is_cached(monkeypatch):
    calls = {"n": 0}

    class _Resp:
        status_code = 200
        def json(self): return [_prod("Ração X", "X", [("Ração X 7,5kg", "7896181298090", 457.81)],
                                      **{"customLabel0 Departamento": ["Cachorro"]})]

    class _Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k):
            calls["n"] += 1
            return _Resp()
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _Client)
    spec = CobasiIdentitySpec.build(reference_name="X 7,5kg", brand="X", species="dog", gtin="7896181298090", weight_kg=7.5)
    r1 = await fetch_cobasi_price_by_ean("7896181298090", spec)
    r2 = await fetch_cobasi_price_by_ean("7896181298090", spec)
    assert r1.price == r2.price == 457.81 and calls["n"] == 1


# ── 20. monetização Cobasi inalterada (monetize por modo) ───────────
def test_monetize_utm_unchanged(monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "utm")
    get_settings.cache_clear()
    try:
        db = SessionLocal()
        try:
            offer = DiscoveredOffer(merchant="cobasi", product_name="Ração X", price=10.0,
                                    direct_url="https://www.cobasi.com.br/racao-x/p", ean=None)
            out = CobasiProvider(db).monetize(offer, ProductContext(query="x"))
            assert out is not None
            url, link_type, route = out[0], out[1], out[2]
            assert route == "mais" and "utm_source=mais" in url and link_type == "affiliate_product"
        finally:
            db.close()
    finally:
        monkeypatch.delenv("COBASI_AFFILIATE_MODE", raising=False)
        get_settings.cache_clear()


# ── sanitização de query (WAF VTEX rejeita aspas/apóstrofo/barra) ────
def test_sanitize_query_strips_waf_triggers():
    assert _sanitize_query("Hill's K/D Cães") == "Hill s K D Cães"
    assert "'" not in _sanitize_query("Hill's K/D")
    assert "/" not in _sanitize_query("Hill's K/D")


# ── multi-SKU: acha o SKU certo entre irmãos; sem correto → sem preço ──
@pytest.mark.asyncio
async def test_matched_picks_correct_sku_among_siblings(monkeypatch):
    payload = [_prod(
        "Vermífugo Drontal Plus + Sabor para Cães 10kg", "Drontal",
        [("Vermífugo Drontal Plus + Sabor para Cães 10kg 2 Comprimidos", "5420036960836", 45.5),
         ("Vermífugo Drontal Plus + Sabor para Cães 10kg 4 Comprimidos", "5420036960843", 68.5)],
    )]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(reference_name="Drontal Plus Cães 10kg 4 Comprimidos",
                                    brand="Drontal", species="dog")
    r = await _search_cobasi_matched_once("drontal 4 comprimidos", spec)
    assert r.found and r.price == 68.5 and "4 Comprimidos" in (r.product_name or "")


@pytest.mark.asyncio
async def test_matched_no_price_when_only_wrong_variants(monkeypatch):
    payload = [_prod("Coleira Antiparasitária Scalibor Cães Grandes", "Scalibor",
                     [("Coleira Antiparasitária Scalibor Cães Grandes 65 cm", None, 93.5)])]
    monkeypatch.setattr("src.commerce_pricing.httpx.AsyncClient", _fake_vtex(payload))
    spec = CobasiIdentitySpec.build(reference_name="Coleira Scalibor 48cm", brand="Scalibor", species="dog")
    r = await _search_cobasi_matched_once("scalibor coleira", spec)
    assert not r.found and r.reason == "variant_mismatch"


# ═══════════════════════════════════════════════════════════════════════════
# CobasiProvider.find_offer — integração
# ═══════════════════════════════════════════════════════════════════════════

def _matched_ok(**kw):
    base = dict(found=True, store="cobasi", price=100.0, is_available=True,
                url="https://www.cobasi.com.br/x/p", reason="structural_match", ean=None)
    base.update(kw)
    return ProductPriceResult(**base)


@pytest.mark.asyncio
async def test_find_offer_ean_first_before_textual(monkeypatch):
    order = []

    async def fake_ean(gtin, spec):
        order.append("ean")
        return _matched_ok(product_name="Ração Royal Canin Urinary Small Dog 7,5kg", price=457.81, reason="ean_equal")

    async def fake_matched(query, spec, *, target_weight_kg=None):
        order.append("textual")
        return ProductPriceResult(found=False, reason="no_results")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_by_ean", fake_ean)
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake_matched)
    db = SessionLocal()
    try:
        offer = await CobasiProvider(db).find_offer(ProductContext(
            query="Royal Canin ração", brand="Royal Canin", species="dog", weight_kg=7.5, gtin="7896181298090"))
        assert offer is not None and offer.price == 457.81
        assert order == ["ean"]   # nem tentou a busca textual
    finally:
        db.close()


@pytest.mark.asyncio
async def test_find_offer_falls_back_to_textual_when_ean_route_empty(monkeypatch):
    async def fake_ean(gtin, spec):
        return ProductPriceResult(found=False, reason="no_results")

    async def fake_matched(query, spec, *, target_weight_kg=None):
        return _matched_ok(product_name="Ração Golden Fórmula Cães Adultos 15 kg", price=179.9)

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_by_ean", fake_ean)
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake_matched)
    db = SessionLocal()
    try:
        offer = await CobasiProvider(db).find_offer(ProductContext(
            query="Golden ração", brand="Golden", species="dog", weight_kg=15,
            name="Golden Fórmula Cães Adultos Frango 15kg"))
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
async def test_find_offer_passes_species_weight_gtin_to_spec(monkeypatch):
    captured = {}

    async def fake_ean(gtin, spec):
        captured["species"] = spec.species
        captured["weight"] = spec.weight_kg
        captured["gtin"] = spec.gtin
        return ProductPriceResult(found=False, reason="no_results")

    async def fake_matched(query, spec, *, target_weight_kg=None):
        return ProductPriceResult(found=False, reason="no_results")

    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_by_ean", fake_ean)
    monkeypatch.setattr("src.cobasi_provider.fetch_cobasi_price_matched", fake_matched)
    db = SessionLocal()
    try:
        await CobasiProvider(db).find_offer(ProductContext(
            query="racao", name="Golden Frango 15kg", brand="Golden",
            species="cat", weight_kg=15, gtin="7897348200703"))
        assert captured == {"species": "cat", "weight": 15, "gtin": "7897348200703"}
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

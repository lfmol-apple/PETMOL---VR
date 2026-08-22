"""
Configuração central de advertisers Awin — nenhuma chamada real, só o
contrato de dados. Ver docs/AFFILIATES.md para a situação comercial real.
"""
from src.awin_advertisers import (
    AWIN_ADVERTISERS,
    awin_merchants_publicly_servable,
    awin_merchants_with_feed,
    get_awin_advertiser,
    is_awin_merchant_enabled,
    is_awin_merchant_publicly_servable,
)
from src.config import get_settings


def test_no_unapproved_awin_merchant_is_enabled():
    """§33: não ativar nenhum antes da aprovação real. Cobasi, Zee Dog e
    Zee Now são exceções aprovadas; enabled=True nelas ainda depende do
    master gate global para expor algo ao tutor."""
    for merchant in AWIN_ADVERTISERS:
        if merchant in {"cobasi", "zeedog", "zeenow"}:
            continue
        assert is_awin_merchant_enabled(merchant) is False, f"{merchant} não deveria estar enabled"


def test_awin_globally_disabled_by_default():
    settings = get_settings()
    assert settings.awin_enabled is False
    assert settings.awin_shadow_mode is False


def test_publisher_id_matches_real_account():
    settings = get_settings()
    assert settings.awin_publisher_id == "3032803"


def test_all_known_merchants_configured():
    assert set(AWIN_ADVERTISERS.keys()) == {"cobasi", "petz", "zeenow", "zeedog", "araujo"}


def test_get_awin_advertiser_returns_none_for_unknown_merchant():
    assert get_awin_advertiser("amazon") is None


def test_petz_and_araujo_have_no_feed_others_do():
    assert get_awin_advertiser("petz").feed_available is False
    assert get_awin_advertiser("araujo").feed_available is False
    assert get_awin_advertiser("cobasi").feed_available is True
    assert get_awin_advertiser("zeenow").feed_available is True
    assert get_awin_advertiser("zeedog").feed_available is True
    assert set(awin_merchants_with_feed()) == {"cobasi", "zeenow", "zeedog"}


def test_advertiser_ids_match_known_real_values():
    assert get_awin_advertiser("cobasi").advertiser_id == "17870"
    assert get_awin_advertiser("petz").advertiser_id == "127553"
    assert get_awin_advertiser("zeenow").advertiser_id == "127557"
    assert get_awin_advertiser("zeedog").advertiser_id == "127555"


def test_no_awin_credential_committed():
    """Nenhum valor real de credencial deve existir no código/padrão —
    ambas vêm só de env var (ver config.py)."""
    settings = get_settings()
    assert settings.awin_oauth_token is None
    assert settings.awin_datafeed_key is None


def test_cobasi_approved_with_feed_id():
    """Aprovada em 13/08/2026 — ver awin_advertisers.py. enabled=True aqui
    só habilita o AwinFeedProvider a funcionar SE registrado em
    build_default_engine() — hoje não está (ver test_commerce_offers /
    build_default_engine em commerce_offers.py), então isto sozinho não
    muda nada pro tutor."""
    cobasi = get_awin_advertiser("cobasi")
    assert cobasi.commercial_status == "approved"
    assert cobasi.feed_id == "48117"
    assert cobasi.enabled is True


def test_zeedog_approved_with_feed_id():
    zeedog = get_awin_advertiser("zeedog")
    assert zeedog.commercial_status == "approved"
    assert zeedog.feed_id == "116649"
    assert zeedog.enabled is True
    assert "1.799 produtos" in zeedog.notes
    assert "100% de GTINs" in zeedog.notes


def test_zeenow_approved_with_feed_id():
    zeenow = get_awin_advertiser("zeenow")
    assert zeenow.commercial_status == "approved"
    assert zeenow.feed_id == "116779"
    assert zeenow.enabled is True
    assert "13.835 produtos" in zeenow.notes
    assert "152 UPC-11" in zeenow.notes


def test_merchants_without_feed_have_no_feed_id():
    assert get_awin_advertiser("petz").feed_id is None
    assert get_awin_advertiser("araujo").feed_id is None


def test_araujo_registered_pending_no_feed_disabled():
    """Araújo (advertiser 17919): not_joined/pending, sem Product Feed —
    nunca deve virar AwinFeedProvider (ver awin_advertisers.py e
    is_awin_merchant_publicly_servable). Uma futura integração precisaria
    de fonte de discovery separada; não implementada nesta tarefa."""
    araujo = get_awin_advertiser("araujo")
    assert araujo is not None
    assert araujo.advertiser_id == "17919"
    assert araujo.commercial_status == "pending"
    assert araujo.feed_available is False
    assert araujo.enabled is False
    assert araujo.cookie_days == 1
    assert araujo.cpa_percent == 3.1
    assert araujo.feed_id is None
    assert "araujo" not in awin_merchants_with_feed()


def test_araujo_never_publicly_servable_even_if_enabled_and_master_gate_on(monkeypatch):
    """Defesa em profundidade: mesmo com o master gate ligado E
    araujo.enabled forçado True por engano, feed_available=False barra."""
    monkeypatch.setenv("AWIN_ENABLED", "true")
    monkeypatch.setenv("AWIN_SHADOW_MODE", "false")
    get_settings.cache_clear()
    monkeypatch.setattr("src.awin_advertisers.is_awin_merchant_enabled", lambda m: m == "araujo")
    try:
        assert is_awin_merchant_publicly_servable("araujo") is False
        assert "araujo" not in awin_merchants_publicly_servable()
    finally:
        get_settings.cache_clear()


def test_publicly_servable_empty_by_default():
    """awin_enabled=False (padrão real) — lista vazia mesmo cobasi estando
    enabled=True individualmente."""
    assert get_settings().awin_enabled is False
    assert awin_merchants_publicly_servable() == []

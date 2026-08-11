"""
Configuração central de advertisers Awin — nenhuma chamada real, só o
contrato de dados. Ver docs/AFFILIATES.md para a situação comercial real.
"""
from src.awin_advertisers import (
    AWIN_ADVERTISERS,
    awin_merchants_with_feed,
    get_awin_advertiser,
    is_awin_merchant_enabled,
)
from src.config import get_settings


def test_no_awin_merchant_is_enabled_by_default():
    """§33: não ativar nenhum antes da aprovação real."""
    for merchant in AWIN_ADVERTISERS:
        assert is_awin_merchant_enabled(merchant) is False, f"{merchant} não deveria estar enabled"


def test_awin_globally_disabled_by_default():
    settings = get_settings()
    assert settings.awin_enabled is False
    assert settings.awin_shadow_mode is False


def test_publisher_id_matches_real_account():
    settings = get_settings()
    assert settings.awin_publisher_id == "3032803"


def test_all_four_known_merchants_configured():
    assert set(AWIN_ADVERTISERS.keys()) == {"cobasi", "petz", "zeenow", "zeedog"}


def test_get_awin_advertiser_returns_none_for_unknown_merchant():
    assert get_awin_advertiser("amazon") is None


def test_petz_has_no_feed_others_do():
    assert get_awin_advertiser("petz").feed_available is False
    assert get_awin_advertiser("cobasi").feed_available is True
    assert get_awin_advertiser("zeenow").feed_available is True
    assert get_awin_advertiser("zeedog").feed_available is True
    assert set(awin_merchants_with_feed()) == {"cobasi", "zeenow", "zeedog"}


def test_advertiser_ids_match_known_real_values():
    assert get_awin_advertiser("cobasi").advertiser_id == "17870"
    assert get_awin_advertiser("petz").advertiser_id == "127553"
    assert get_awin_advertiser("zeenow").advertiser_id == "127557"
    assert get_awin_advertiser("zeedog").advertiser_id == "127555"


def test_no_awin_api_token_committed():
    """Nenhum valor real de token deve existir no código/padrão."""
    settings = get_settings()
    assert settings.awin_api_token is None

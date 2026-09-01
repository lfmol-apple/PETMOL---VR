"""
Fase 1-B — passo de irmãos no /commerce/offers.

Puramente aditivo: nunca reduz o total de ofertas, nunca troca a
identidade canônica do tutor, e só descarta uma oferta irmã em CONFLICT
explícito (nunca UNKNOWN — não repete d6cfd6b).
"""
import pytest

from src.affiliate_links import MarketplaceOffer
from src.commerce_provider import MonetizedOffer
from src.commerce_offers import _merge_group_offers


def _offer(merchant, price, *, stale=False, origin=None):
    return MonetizedOffer(
        merchant=merchant, url="https://x", link_type="direct",
        canonical_gtin="111", price=price, price_is_stale=stale,
        origin_gtin=origin or "111",
    )


def test_merge_is_additive_never_drops_primary():
    primary = [_offer("shopee", None, stale=True), _offer("cobasi", 10.0)]
    siblings = [_offer("shopee", 8.0, origin="222"), _offer("petz", 12.0, origin="222")]
    merged = _merge_group_offers(primary, siblings)
    merchants = {o.merchant for o in merged}
    assert merchants == {"shopee", "cobasi", "petz"}
    assert len(merged) >= len(primary)


def test_fresh_sibling_replaces_priceless_primary_for_same_merchant():
    primary = [_offer("shopee", None, stale=True)]
    siblings = [_offer("shopee", 8.0, origin="222")]
    merged = _merge_group_offers(primary, siblings)
    shopee = [o for o in merged if o.merchant == "shopee"]
    assert len(shopee) == 1
    assert shopee[0].price == 8.0
    assert shopee[0].origin_gtin == "222"


def test_fresh_primary_beats_sibling_for_same_merchant():
    primary = [_offer("cobasi", 20.0)]
    siblings = [_offer("cobasi", 15.0, origin="222")]
    merged = _merge_group_offers(primary, siblings)
    cobasi = [o for o in merged if o.merchant == "cobasi"]
    assert len(cobasi) == 1
    assert cobasi[0].price == 20.0
    assert cobasi[0].origin_gtin == "111"


def test_stale_primary_kept_as_fallback_when_no_fresh_sibling():
    primary = [_offer("shopee", None, stale=True)]
    siblings = [_offer("shopee", 9.0, stale=True, origin="222")]  # irmã também stale
    merged = _merge_group_offers(primary, siblings)
    # nunca menos que a primária; a stale primária permanece como fallback
    assert any(o.merchant == "shopee" for o in merged)
    assert len(merged) >= 1


@pytest.mark.asyncio
async def test_sibling_pass_disabled_by_flag(monkeypatch):
    from src import commerce_offers
    from src.config import get_settings

    monkeypatch.setenv("SKU_GROUPING_ENABLED", "false")
    get_settings.cache_clear()

    class _FakeEngine:
        async def get_offers(self, ctx):
            raise AssertionError("engine não deve ser chamado pra irmãos com a flag off")

    out = await commerce_offers._sku_group_sibling_offers(
        db=None, engine=_FakeEngine(), product=object(),
        canonical_gtin="111", canonical_name="X", canonical_brand="Y",
        canonical_image_url=None, query=None, target_weight_kg=None, primary=[],
    )
    assert out == []
    get_settings.cache_clear()

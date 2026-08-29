import base64
from urllib.parse import parse_qs, urlsplit

import pytest

from src.awin_click_redirect import (
    advertiser_id_from_awin_url,
    build_awin_click_redirect_url,
    build_cobasi_awin_deep_link,
    decode_awin_click_url,
    resolve_awin_click_target,
    should_redirect_awin_in_browser,
)


AWIN_URL = "https://www.awin1.com/pclick.php?p=31117188249&a=3032803&m=17870&clickref=petmol%2Fabc&foo=bar"
COBASI_MERCHANT_URL = "https://www.cobasi.com.br/produto-teste/p?idsku=123"
ZEENOW_AWIN_URL = "https://www.awin1.com/pclick.php?p=45390676945&a=3032803&m=127557"
ZEEDOG_AWIN_URL = "https://www.awin1.com/pclick.php?p=45390600000&a=3032803&m=127555"


def test_supported_awin_pclick_becomes_petmol_redirect():
    redirect_url = build_awin_click_redirect_url(AWIN_URL)

    assert redirect_url.startswith("/commerce/awin-click?u=")
    assert decode_awin_click_url(redirect_url.split("u=", 1)[1]) == AWIN_URL


def test_supported_awin_cread_becomes_petmol_redirect():
    awin_url = build_cobasi_awin_deep_link(AWIN_URL, COBASI_MERCHANT_URL)
    redirect_url = build_awin_click_redirect_url(awin_url)

    assert redirect_url.startswith("/commerce/awin-click?u=")
    assert decode_awin_click_url(redirect_url.split("u=", 1)[1]) == awin_url


def test_cobasi_awin_deep_link_uses_cread_with_product_destination():
    awin_url = build_cobasi_awin_deep_link(AWIN_URL, COBASI_MERCHANT_URL)
    parts = urlsplit(awin_url)
    query = parse_qs(parts.query)

    assert parts.scheme == "https"
    assert parts.netloc == "www.awin1.com"
    assert parts.path == "/cread.php"
    assert query["awinmid"] == ["17870"]
    assert query["awinaffid"] == ["3032803"]
    assert query["clickref"] == ["petmol/abc"]
    assert query["ued"] == [COBASI_MERCHANT_URL]


def test_awin_merchants_that_need_attribution_use_browser_side_strategy():
    assert should_redirect_awin_in_browser(AWIN_URL) is True
    assert should_redirect_awin_in_browser(ZEENOW_AWIN_URL) is True
    assert should_redirect_awin_in_browser(ZEEDOG_AWIN_URL) is True


def test_unsupported_awin_url_is_left_untouched():
    url = "https://track.awin.com/deep-link-teste"

    assert build_awin_click_redirect_url(url) == url


def test_decode_rejects_non_awin_url():
    encoded = base64.urlsafe_b64encode(b"https://example.com/not-awin").decode("ascii").rstrip("=")

    with pytest.raises(ValueError):
        decode_awin_click_url(encoded)


def test_cobasi_awin_click_redirects_browser_to_original_awin_url(client, monkeypatch):
    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("Cobasi must use Awin browser-side attribution, not server-side resolution")

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", ForbiddenClient)
    redirect_url = build_awin_click_redirect_url(AWIN_URL)

    response = client.get(redirect_url, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == AWIN_URL
    assert decode_awin_click_url(redirect_url.split("u=", 1)[1]) == AWIN_URL
    assert advertiser_id_from_awin_url(AWIN_URL) == "17870"


def test_cobasi_awin_click_preserves_existing_awin_parameters(client, monkeypatch):
    awin_url = "https://www.awin1.com/pclick.php?p=1&a=3032803&m=17870&clickref=PETMOL-26%2F08&ued=https%3A%2F%2Fwww.cobasi.com.br%2Fproduto%2Fp"

    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("Cobasi must use Awin browser-side attribution, not server-side resolution")

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", ForbiddenClient)

    response = client.get(build_awin_click_redirect_url(awin_url), follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == awin_url


def test_cobasi_awin_click_redirects_cread_to_awin_browser_side(client, monkeypatch):
    awin_url = build_cobasi_awin_deep_link(AWIN_URL, COBASI_MERCHANT_URL)

    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("Cobasi must use Awin browser-side attribution, not server-side resolution")

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", ForbiddenClient)

    response = client.get(build_awin_click_redirect_url(awin_url), follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == awin_url
    assert advertiser_id_from_awin_url(awin_url) == "17870"


def test_zeenow_awin_click_redirects_browser_to_original_awin_url(client, monkeypatch):
    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("Zee Now must use Awin browser/app tracking, not server-side resolution")

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", ForbiddenClient)

    response = client.get(build_awin_click_redirect_url(ZEENOW_AWIN_URL), follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == ZEENOW_AWIN_URL


def test_zeedog_awin_click_redirects_browser_to_original_awin_url(client, monkeypatch):
    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("Zee Dog must use Awin browser-side attribution, not server-side resolution")

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", ForbiddenClient)

    response = client.get(build_awin_click_redirect_url(ZEEDOG_AWIN_URL), follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == ZEEDOG_AWIN_URL


@pytest.mark.parametrize(
    "user_agent",
    [
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Safari/605.1.15",
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148",
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36",
    ],
)
def test_cobasi_awin_click_is_platform_neutral(client, monkeypatch, user_agent):
    class ForbiddenClient:
        def __init__(self, *args, **kwargs):
            raise AssertionError("Cobasi must use Awin browser-side attribution, not server-side resolution")

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", ForbiddenClient)

    response = client.get(
        build_awin_click_redirect_url(AWIN_URL),
        follow_redirects=False,
        headers={"User-Agent": user_agent},
    )

    assert response.status_code == 302
    assert response.headers["location"] == AWIN_URL


@pytest.mark.asyncio
async def test_resolve_accepts_zeenow_destination(monkeypatch):
    target = "https://www.zeenow.com.br/produto/biscoito-pedigree?awc=abc"

    class FakeResponse:
        status_code = 302
        headers = {"location": target}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", FakeClient)

    assert await resolve_awin_click_target(ZEENOW_AWIN_URL) == target


@pytest.mark.asyncio
async def test_resolve_accepts_followed_zeenow_destination_without_location(monkeypatch):
    target = "https://www.zeenow.com.br/produto/biscoito-pedigree?awc=abc"

    class FakeResponse:
        status_code = 200
        headers = {}
        url = target

    class FakeClient:
        def __init__(self, *args, **kwargs):
            assert kwargs.get("follow_redirects") is True

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", FakeClient)

    assert await resolve_awin_click_target(ZEENOW_AWIN_URL) == target


@pytest.mark.asyncio
async def test_resolve_accepts_zeedog_destination(monkeypatch):
    target = "https://www.zeedog.com.br/produto/coleira?awc=abc"

    class FakeResponse:
        status_code = 302
        headers = {"location": target}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", FakeClient)

    assert await resolve_awin_click_target(ZEEDOG_AWIN_URL) == target


@pytest.mark.asyncio
async def test_resolve_rejects_destination_that_does_not_match_advertiser(monkeypatch):
    target = "https://www.cobasi.com.br/produto-errado/p?awc=abc"

    class FakeResponse:
        status_code = 302
        headers = {"location": target}

    class FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, *args, **kwargs):
            return FakeResponse()

    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", FakeClient)

    with pytest.raises(ValueError, match="Destino Awin inesperado"):
        await resolve_awin_click_target(ZEENOW_AWIN_URL)


@pytest.mark.asyncio
async def test_resolve_rejects_unknown_awin_advertiser():
    with pytest.raises(ValueError, match="Advertiser Awin não permitido"):
        await resolve_awin_click_target("https://www.awin1.com/pclick.php?p=1&a=3032803&m=999999")

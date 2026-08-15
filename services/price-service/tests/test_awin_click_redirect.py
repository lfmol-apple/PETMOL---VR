import base64

import pytest

from src.awin_click_redirect import (
    build_awin_click_redirect_url,
    decode_awin_click_url,
)


AWIN_URL = "https://www.awin1.com/pclick.php?p=31117188249&a=3032803&m=17870"


def test_supported_awin_pclick_becomes_petmol_redirect():
    redirect_url = build_awin_click_redirect_url(AWIN_URL)

    assert redirect_url.startswith("/commerce/awin-click?u=")
    assert decode_awin_click_url(redirect_url.split("u=", 1)[1]) == AWIN_URL


def test_unsupported_awin_url_is_left_untouched():
    url = "https://track.awin.com/deep-link-teste"

    assert build_awin_click_redirect_url(url) == url


def test_decode_rejects_non_awin_url():
    encoded = base64.urlsafe_b64encode(b"https://example.com/not-awin").decode("ascii").rstrip("=")

    with pytest.raises(ValueError):
        decode_awin_click_url(encoded)


def test_commerce_awin_click_redirects_to_resolved_cobasi_url(client, monkeypatch):
    target = "https://www.cobasi.com.br/produto-teste/p?idsku=1&awc=abc"

    async def fake_resolve(url: str) -> str:
        assert url == AWIN_URL
        return target

    monkeypatch.setattr("src.awin_click_redirect.resolve_awin_click_target", fake_resolve)
    redirect_url = build_awin_click_redirect_url(AWIN_URL)

    response = client.get(redirect_url, follow_redirects=False)

    assert response.status_code == 302
    assert response.headers["location"] == target

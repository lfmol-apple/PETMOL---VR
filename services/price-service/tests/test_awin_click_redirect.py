import base64

import pytest

from src.awin_click_redirect import (
    build_awin_click_redirect_url,
    decode_awin_click_url,
    resolve_awin_click_target,
)


AWIN_URL = "https://www.awin1.com/pclick.php?p=31117188249&a=3032803&m=17870"
ZEENOW_AWIN_URL = "https://www.awin1.com/pclick.php?p=45390676945&a=3032803&m=127557"
ZEEDOG_AWIN_URL = "https://www.awin1.com/pclick.php?p=45390600000&a=3032803&m=127555"


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


class _FakeAwinClient:
    """Client falso reutilizável — devolve `target` como destino final,
    simulando o redirect real (302 com Location) do lado da Awin."""

    def __init__(self, target: str):
        self._target = target

    def __call__(self, *args, **kwargs):
        return self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return None

    async def get(self, *args, **kwargs):
        class FakeResponse:
            status_code = 302
            headers = {"location": self._target}
        FakeResponse.headers = {"location": self._target}
        return FakeResponse()


@pytest.mark.asyncio
async def test_awin_redirect_preserves_attribution_param(monkeypatch):
    """Contrato central da seção 9: domínio+path corretos não bastam —
    o destino final precisa carregar o parâmetro `awc` (o que de fato
    prova a atribuição de comissão Awin), não só "parecer" uma página
    de produto da loja certa."""
    target = "https://www.zeenow.com.br/produto/biscoito-pedigree?awc=abc123"
    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", _FakeAwinClient(target))

    resolved = await resolve_awin_click_target(ZEENOW_AWIN_URL)
    assert resolved == target
    assert "awc=abc123" in resolved


@pytest.mark.asyncio
async def test_awin_redirect_rejects_destination_missing_attribution_param(monkeypatch):
    """Regressão: um destino com domínio/path corretos mas SEM `awc`
    (ex: a Awin muda de comportamento, um proxy/cache remove a query
    string) tinha antes sido aceito — domínio válido não é prova de
    comissão. Agora precisa ser rejeitado, fail-closed."""
    target = "https://www.zeenow.com.br/produto/biscoito-pedigree"  # sem awc
    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", _FakeAwinClient(target))

    with pytest.raises(ValueError, match="atribuição"):
        await resolve_awin_click_target(ZEENOW_AWIN_URL)


@pytest.mark.asyncio
async def test_awin_redirect_rejects_destination_with_empty_attribution_param(monkeypatch):
    target = "https://www.zeenow.com.br/produto/biscoito-pedigree?awc="
    monkeypatch.setattr("src.awin_click_redirect.httpx.AsyncClient", _FakeAwinClient(target))

    with pytest.raises(ValueError, match="atribuição"):
        await resolve_awin_click_target(ZEENOW_AWIN_URL)

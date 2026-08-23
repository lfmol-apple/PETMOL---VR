import httpx
import pytest

from src.models import SearchQuery
from src.providers.mercadolivre import (
    ML_SEARCH_URL,
    ML_TOKEN_URL,
    MercadoLivreAuthError,
    MercadoLivreClientCredentialsTokenClient,
    MercadoLivreMissingCredentials,
    MercadoLivreProvider,
)
from src.search import clear_cache, search_offers_async


def _token_response(token="APP_TOKEN", expires_in=21600):
    return {"access_token": token, "token_type": "bearer", "expires_in": expires_in, "scope": "read"}


def _ml_item(
    *,
    item_id="MLB1",
    title="Scalibor Coleira Scalibor Antiparasitaria Para Caes",
    gtin="7891234567895",
    price=69.9,
    original_price=89.9,
    available_quantity=5,
    brand="Scalibor",
):
    return {
        "id": item_id,
        "title": title,
        "price": price,
        "original_price": original_price,
        "currency_id": "BRL",
        "permalink": f"http://produto.mercadolivre.com.br/{item_id}",
        "thumbnail": f"http://http2.mlstatic.com/{item_id}.jpg",
        "available_quantity": available_quantity,
        "buying_mode": "buy_it_now",
        "seller": {"nickname": "PETSHOP"},
        "shipping": {"free_shipping": True},
        "attributes": [
            {"id": "BRAND", "value_name": brand},
            {"id": "GTIN", "value_name": gtin},
        ],
    }


def test_legacy_user_oauth_routes_are_disabled(client):
    assert client.get("/auth/ml/start").status_code == 410
    assert client.get("/auth/ml/callback").status_code == 410


def test_ml_status_is_not_public(client):
    assert client.get("/debug/ml/status").status_code == 401


@pytest.mark.asyncio
async def test_token_client_fetches_and_caches_token():
    calls = 0
    now = [1000.0]

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        assert str(request.url) == ML_TOKEN_URL
        assert b"grant_type=client_credentials" in request.content
        assert b"client_id=client-id" in request.content
        assert b"client_secret=secret-value" in request.content
        return httpx.Response(200, json=_token_response("TOKEN1", 21600))

    client = MercadoLivreClientCredentialsTokenClient(
        client_id="client-id",
        client_secret="secret-value",
        now=lambda: now[0],
        transport=httpx.MockTransport(handler),
    )

    assert await client.get_access_token() == "TOKEN1"
    assert await client.get_access_token() == "TOKEN1"
    assert calls == 1
    status = client.get_status()
    assert status.client_id_configured is True
    assert status.client_secret_configured is True
    assert status.has_access_cached is True
    assert status.access_expires_at is not None


@pytest.mark.asyncio
async def test_token_client_renews_before_expiration():
    now = [1000.0]
    tokens = ["TOKEN1", "TOKEN2"]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=_token_response(tokens.pop(0), 180))

    client = MercadoLivreClientCredentialsTokenClient(
        client_id="client-id",
        client_secret="secret-value",
        now=lambda: now[0],
        transport=httpx.MockTransport(handler),
    )

    assert await client.get_access_token() == "TOKEN1"
    now[0] = 1070.0
    assert await client.get_access_token() == "TOKEN2"


@pytest.mark.asyncio
async def test_token_client_rejects_missing_secret_without_exposing_values():
    client = MercadoLivreClientCredentialsTokenClient(client_id="client-id", client_secret=None)
    with pytest.raises(MercadoLivreMissingCredentials) as exc:
        await client.get_access_token()
    assert "client-id" not in str(exc.value)


@pytest.mark.asyncio
async def test_token_client_error_never_exposes_secret():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "invalid client"})

    client = MercadoLivreClientCredentialsTokenClient(
        client_id="client-id",
        client_secret="super-secret",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(MercadoLivreAuthError) as exc:
        await client.get_access_token()
    assert "super-secret" not in str(exc.value)


@pytest.mark.asyncio
async def test_provider_retries_once_after_401_with_fresh_token():
    token_calls = 0
    search_calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal token_calls, search_calls
        if str(request.url) == ML_TOKEN_URL:
            token_calls += 1
            return httpx.Response(200, json=_token_response(f"TOKEN{token_calls}", 21600))
        assert str(request.url).startswith(ML_SEARCH_URL)
        search_calls += 1
        if search_calls == 1:
            assert request.headers["Authorization"] == "Bearer TOKEN1"
            return httpx.Response(401, json={"message": "expired"})
        assert request.headers["Authorization"] == "Bearer TOKEN2"
        return httpx.Response(200, json={"results": [_ml_item()]})

    transport = httpx.MockTransport(handler)
    provider = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=transport,
        ),
        transport=transport,
    )

    results = await provider.search("Scalibor Coleira", limit=5)
    assert len(results) == 1
    assert token_calls == 2
    assert search_calls == 2


@pytest.mark.asyncio
async def test_provider_handles_429_and_timeout_without_raising():
    def rate_limited(request: httpx.Request) -> httpx.Response:
        if str(request.url) == ML_TOKEN_URL:
            return httpx.Response(200, json=_token_response())
        return httpx.Response(429, json={"message": "slow down"})

    provider_429 = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=httpx.MockTransport(rate_limited),
        ),
        transport=httpx.MockTransport(rate_limited),
    )
    assert await provider_429.search("Scalibor Coleira") == []

    def timeout(request: httpx.Request) -> httpx.Response:
        if str(request.url) == ML_TOKEN_URL:
            return httpx.Response(200, json=_token_response())
        raise httpx.TimeoutException("timeout")

    provider_timeout = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=httpx.MockTransport(timeout),
        ),
        transport=httpx.MockTransport(timeout),
    )
    assert await provider_timeout.search("Scalibor Coleira") == []


@pytest.mark.asyncio
async def test_search_parses_price_previous_price_stock_image_seller_and_shipping():
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == ML_TOKEN_URL:
            return httpx.Response(200, json=_token_response())
        return httpx.Response(200, json={"results": [_ml_item(available_quantity=0)]})

    transport = httpx.MockTransport(handler)
    provider = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=transport,
        ),
        transport=transport,
    )

    result = (await provider.search("Scalibor Coleira"))[0]
    assert result.price == 69.9
    assert result.original_price == 89.9
    assert result.currency == "BRL"
    assert result.in_stock is False
    assert result.free_shipping is True
    assert result.seller == "PETSHOP"
    assert result.image_url.startswith("https://")
    assert result.url.startswith("https://")
    assert result.gtin == "7891234567895"


@pytest.mark.asyncio
async def test_lookup_barcode_requires_exact_gtin_not_first_text_result():
    wanted = "7891234567895"

    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == ML_TOKEN_URL:
            return httpx.Response(200, json=_token_response())
        return httpx.Response(200, json={"results": [
            _ml_item(item_id="WRONG", title="Scalibor parecido", gtin="1111111111111"),
            _ml_item(item_id="RIGHT", title="Scalibor correto", gtin=wanted),
        ]})

    transport = httpx.MockTransport(handler)
    provider = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=transport,
        ),
        transport=transport,
    )

    result = await provider.lookup_barcode(wanted)
    assert result is not None
    assert result.source_item_id == "RIGHT"
    assert result.gtin == wanted


@pytest.mark.asyncio
async def test_lookup_barcode_rejects_when_returned_gtin_does_not_match():
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == ML_TOKEN_URL:
            return httpx.Response(200, json=_token_response())
        return httpx.Response(200, json={"results": [_ml_item(gtin="1111111111111")]})

    transport = httpx.MockTransport(handler)
    provider = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=transport,
        ),
        transport=transport,
    )

    assert await provider.lookup_barcode("7891234567895") is None


@pytest.mark.asyncio
async def test_text_search_rejects_divergent_pack_size_variant():
    def handler(request: httpx.Request) -> httpx.Response:
        if str(request.url) == ML_TOKEN_URL:
            return httpx.Response(200, json=_token_response())
        return httpx.Response(200, json={"results": [
            _ml_item(title="Royal Canin Maxi Adult 15kg", brand="Royal Canin"),
        ]})

    transport = httpx.MockTransport(handler)
    provider = MercadoLivreProvider(
        token_client=MercadoLivreClientCredentialsTokenClient(
            client_id="client-id",
            client_secret="secret",
            transport=transport,
        ),
        transport=transport,
    )

    assert await provider.search("Royal Canin Maxi Adult 10kg") == []


@pytest.mark.asyncio
async def test_search_respects_public_flags_off(monkeypatch):
    class Settings:
        cache_ttl = 300
        enable_ml_provider = True
        mercadolivre_public_offers_enabled = False
        mercadolivre_affiliate_enabled = False
        affiliate_only_commerce_enforced = True

    clear_cache()
    monkeypatch.setattr("src.search.get_settings", lambda: Settings())
    result = await search_offers_async(SearchQuery(query="Scalibor Coleira", country_code="BR"))
    assert result.offers == []

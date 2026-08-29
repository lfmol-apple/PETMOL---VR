"""Helpers for the internal Awin click redirect endpoint."""
from __future__ import annotations

import base64
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx


AWIN_CLICK_PATH = "/commerce/awin-click"
AWIN_SUPPORTED_CLICK_PATHS = {"/pclick.php", "/cread.php"}
AWIN_DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
)
AWIN_ALLOWED_TARGETS_BY_ADVERTISER = {
    # Cobasi
    "17870": {"www.cobasi.com.br"},
    # Zee Dog
    "127555": {"www.zeedog.com.br", "zeedog.com.br"},
    # Zee Now
    "127557": {"www.zeenow.com.br", "zeenow.com.br"},
}
AWIN_BROWSER_SIDE_ADVERTISERS = {
    # Cobasi BR: o clique precisa passar pelo navegador do tutor para a
    # Awin/Cobasi gravarem cookie/sessão de atribuição. Resolver server-side
    # até a URL final com awc abriu produto, mas podia quebrar comissão em
    # compras navegando depois da landing.
    "17870",
    # Zee Now BR: painel Awin informa "Otimizado para Celular: Sim" e
    # "Rastreamento de App: Sim" (publisher 3032803, advertiser 127557).
    # Nesse caso, deixar Awin/Zee Now decidirem web/app no dispositivo é
    # mais fiel ao modelo last-click/app tracking do que resolver server-side.
    "127557",
    # Zee Dog BR: mesmo sem app tracking declarado, manter o clique no
    # navegador do tutor reduz risco de perder cookie/sessão de comissão.
    "127555",
}


def advertiser_id_from_awin_url(url: str) -> str | None:
    query = parse_qs(urlsplit(url).query)
    values = query.get("m") or query.get("awinmid") or []
    return values[0] if values else None


def publisher_id_from_awin_url(url: str) -> str | None:
    query = parse_qs(urlsplit(url).query)
    values = query.get("a") or query.get("awinaffid") or []
    return values[0] if values else None


def should_redirect_awin_in_browser(url: str) -> bool:
    return advertiser_id_from_awin_url(url) in AWIN_BROWSER_SIDE_ADVERTISERS


def is_supported_awin_click_url(url: str) -> bool:
    parts = urlsplit((url or "").strip())
    return (
        parts.scheme == "https"
        and parts.netloc.lower() == "www.awin1.com"
        and parts.path in AWIN_SUPPORTED_CLICK_PATHS
    )


def _is_supported_cobasi_product_url(url: str) -> bool:
    parts = urlsplit((url or "").strip())
    return parts.scheme == "https" and parts.netloc.lower() == "www.cobasi.com.br" and "/p" in parts.path


def build_cobasi_awin_deep_link(affiliate_url: str, merchant_url: str | None) -> str:
    """Use an Awin browser-side deeplink with an explicit Cobasi product URL.

    Cobasi's mobile OneLink can open the app homepage from product-feed
    pclick URLs. Awin's documented deeplink shape (`cread.php` + `ued`)
    keeps attribution in the browser while making the product destination
    explicit to Awin/Cobasi.
    """
    if advertiser_id_from_awin_url(affiliate_url) != "17870":
        return affiliate_url
    if not merchant_url or not _is_supported_cobasi_product_url(merchant_url):
        return affiliate_url
    publisher_id = publisher_id_from_awin_url(affiliate_url)
    if not publisher_id:
        return affiliate_url

    source_query = parse_qs(urlsplit(affiliate_url).query)
    query: list[tuple[str, str]] = [
        ("awinmid", "17870"),
        ("awinaffid", publisher_id),
    ]
    for key in ("clickref", "clickref2", "clickref3", "clickref4", "clickref5", "clickref6", "pref1", "pref2", "pref3", "pref4", "pref5", "pref6"):
        for value in source_query.get(key, []):
            query.append((key, value))
    query.append(("ued", merchant_url))
    return f"https://www.awin1.com/cread.php?{urlencode(query)}"


def build_awin_click_redirect_url(url: str) -> str:
    """Retorna uma URL relativa do backend PETMOL para resolver no clique.

    URL relativa é intencional: o frontend prefixa com API_BASE_URL, que já
    conhece se está em produção (`/api`) ou dev (`http://localhost:8000`).
    """
    if not is_supported_awin_click_url(url):
        return url
    encoded = base64.urlsafe_b64encode(url.encode("utf-8")).decode("ascii").rstrip("=")
    return f"{AWIN_CLICK_PATH}?u={encoded}"


def decode_awin_click_url(encoded: str) -> str:
    if not encoded:
        raise ValueError("URL Awin ausente")
    padded = encoded + ("=" * ((4 - len(encoded) % 4) % 4))
    try:
        decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
    except Exception as exc:
        raise ValueError("URL Awin inválida") from exc
    if not is_supported_awin_click_url(decoded):
        raise ValueError("URL Awin não permitida")
    return decoded


async def resolve_awin_click_target(awin_url: str) -> str:
    """Resolve um clique Awin sem seguir o OneLink mobile.

    A resposta esperada da Awin com user-agent desktop é um 302 direto para
    o site oficial do advertiser indicado pelo `m=` da própria URL Awin.
    Validamos esse par advertiser/dominio para impedir redirect aberto.
    """
    advertiser_id = advertiser_id_from_awin_url(awin_url)
    allowed_hosts = AWIN_ALLOWED_TARGETS_BY_ADVERTISER.get(advertiser_id or "")
    if not allowed_hosts:
        raise ValueError("Advertiser Awin não permitido")

    async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, max_redirects=5) as client:
        response = await client.get(
            awin_url,
            headers={
                "User-Agent": AWIN_DESKTOP_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

    location = response.headers.get("location")
    if response.status_code in {301, 302, 303, 307, 308} and location:
        target = str(httpx.URL(awin_url).join(location))
    elif 200 <= response.status_code < 400 and getattr(response, "url", None):
        target = str(response.url)
    else:
        raise ValueError(f"Awin não retornou redirect válido: {response.status_code}")

    parts = urlsplit(target)
    if parts.scheme != "https" or parts.netloc.lower() not in allowed_hosts:
        raise ValueError("Destino Awin inesperado")
    if advertiser_id == "17870" and "/p" not in parts.path:
        raise ValueError("Destino Awin não parece página de produto Cobasi")
    return target

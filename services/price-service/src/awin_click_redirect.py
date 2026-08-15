"""
Redirect seguro para cliques Awin/Cobasi em mobile.

Em iPhone, a Awin redireciona `www.awin1.com/pclick.php` para um OneLink
AppsFlyer da Cobasi (`cobasi.onelink.me`) com `af_dp=appcobasi://`. Esse
salto pode cair na home da Cobasi em Safari/iOS. No clique real, resolvemos
a Awin server-side com user-agent desktop para obter a URL web afiliada com
`awc` e redirecionamos o tutor direto para a página do produto.
"""
from __future__ import annotations

import base64
from urllib.parse import urlsplit

import httpx


AWIN_CLICK_PATH = "/commerce/awin-click"
AWIN_DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
)


def is_supported_awin_click_url(url: str) -> bool:
    parts = urlsplit((url or "").strip())
    return (
        parts.scheme == "https"
        and parts.netloc.lower() == "www.awin1.com"
        and parts.path == "/pclick.php"
    )


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
    `https://www.cobasi.com.br/.../p?...awc=...`. Validamos o destino para
    impedir que este endpoint vire redirect aberto.
    """
    async with httpx.AsyncClient(timeout=8.0, follow_redirects=False) as client:
        response = await client.get(
            awin_url,
            headers={
                "User-Agent": AWIN_DESKTOP_USER_AGENT,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            },
        )

    location = response.headers.get("location")
    if response.status_code not in {301, 302, 303, 307, 308} or not location:
        raise ValueError(f"Awin não retornou redirect válido: {response.status_code}")

    target = str(httpx.URL(awin_url).join(location))
    parts = urlsplit(target)
    if parts.scheme != "https" or parts.netloc.lower() != "www.cobasi.com.br":
        raise ValueError("Destino Awin inesperado")
    if "/p" not in parts.path:
        raise ValueError("Destino Awin não parece página de produto Cobasi")
    return target

"""
UTM builder para a Cobasi — função pura, testável. Ativa em produção
desde 29/08/2026 (ver `cobasi_affiliate_mode` em config.py, padrão "utm").

Contexto: confirmado manualmente que colar uma URL de produto Cobasi real
no gerador de link do painel MAIS produz um link que, aberto fora do
painel, resolve pra uma página de produto real (não 404) com
utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol — os
mesmos 3 parâmetros que esta função anexa. É o único mecanismo de
monetização da Cobasi hoje: Awin nunca gera link de compra (ver
AWIN_SELLABLE_MERCHANTS em awin_advertisers.py, sempre vazio).
"""
from __future__ import annotations

from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

_COBASI_DOMAINS = {"www.cobasi.com.br", "cobasi.com.br"}

# Valores confirmados no painel MAIS (ver docs/AFFILIATES.md) — não mudar
# sem reconfirmar com a Cobasi/MAIS.
_REQUIRED_UTM_PARAMS: tuple[tuple[str, str], ...] = (
    ("utm_source", "mais"),
    ("utm_medium", "maisplataforma"),
    ("utm_campaign", "lojapetmol"),
)


class InvalidCobasiUrlError(ValueError):
    pass


def build_cobasi_affiliate_url(direct_url: str) -> str:
    """Anexa a UTM da Cobasi/MAIS a uma URL de produto Cobasi.

    - Exige https e domínio cobasi.com.br (bloqueia qualquer outro host).
    - Preserva path e query existentes (SKU/variante do produto).
    - Remove qualquer utm_* já presente antes de adicionar os 3 exigidos,
      para nunca duplicar/conflitar.
    """
    if not direct_url or not direct_url.strip():
        raise InvalidCobasiUrlError("URL vazia")

    parts = urlsplit(direct_url.strip())
    if parts.scheme != "https":
        raise InvalidCobasiUrlError("URL deve ser https://")
    if parts.netloc not in _COBASI_DOMAINS:
        raise InvalidCobasiUrlError(f"Domínio não é da Cobasi: {parts.netloc!r}")

    existing_params = [
        (key, value)
        for key, value in parse_qsl(parts.query, keep_blank_values=True)
        if not key.startswith("utm_")
    ]
    final_params = existing_params + list(_REQUIRED_UTM_PARAMS)
    new_query = urlencode(final_params)

    return urlunsplit((parts.scheme, parts.netloc, parts.path, new_query, parts.fragment))

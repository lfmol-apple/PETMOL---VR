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

# Hosts de produto Cobasi que aceitamos como entrada. O host de SAÍDA é
# SEMPRE `minhaloja.cobasi.com.br` (a vitrine afiliada "Minha Loja"/MAIS) —
# o site principal com só os parâmetros UTM não credita a comissão MAIS;
# a atribuição exige entrar pela Minha Loja. Confirmado que o mesmo slug
# de produto (`/<slug>/p`) e a busca (`/busca?q=`) funcionam nesse host
# sem redirecionar para fora.
_MINHA_LOJA_HOST = "minhaloja.cobasi.com.br"
_COBASI_MAIN_SITE_HOSTS = {"www.cobasi.com.br", "cobasi.com.br"}
_COBASI_DOMAINS = _COBASI_MAIN_SITE_HOSTS | {_MINHA_LOJA_HOST}

# Valores confirmados no painel MAIS (ver docs/AFFILIATES.md) — não mudar
# sem reconfirmar com a Cobasi/MAIS.
_REQUIRED_UTM_PARAMS: tuple[tuple[str, str], ...] = (
    ("utm_source", "mais"),
    ("utm_medium", "maisplataforma"),
    ("utm_campaign", "lojapetmol"),
)


class InvalidCobasiUrlError(ValueError):
    pass


def is_cobasi_url(url: str) -> bool:
    """True se `url` é https e de um host Cobasi conhecido (inclui a Minha Loja)."""
    if not url or not url.strip():
        return False
    parts = urlsplit(url.strip())
    return parts.scheme == "https" and parts.netloc in _COBASI_DOMAINS


def build_cobasi_affiliate_url(direct_url: str) -> str:
    """Reescreve uma URL de produto/busca Cobasi para a vitrine afiliada
    "Minha Loja" (`minhaloja.cobasi.com.br`) e anexa a UTM da Cobasi/MAIS.

    - Exige https e host Cobasi conhecido (bloqueia qualquer outro host).
    - HOST DE SAÍDA é SEMPRE `minhaloja.cobasi.com.br` — o site principal
      com só UTM não credita a comissão MAIS.
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

    return urlunsplit((parts.scheme, _MINHA_LOJA_HOST, parts.path, new_query, parts.fragment))


def to_minha_loja_url(url: str) -> str:
    """Roteia uma URL para a vitrine "Minha Loja" QUANDO ela aponta para o
    site principal da Cobasi:

    - `www.cobasi.com.br` / `cobasi.com.br` → reescrita para
      `minhaloja.cobasi.com.br` + UTM MAIS (via build_cobasi_affiliate_url).
    - Já em `minhaloja.cobasi.com.br`, shortlink MAIS (`mais.app/...`), ou
      qualquer outro host → devolvida EXATAMENTE como veio (quem cadastrou
      o link sabia o que estava fazendo; já passa pela atribuição MAIS).
    """
    if not url or not url.strip():
        return url
    parts = urlsplit(url.strip())
    if parts.scheme == "https" and parts.netloc in _COBASI_MAIN_SITE_HOSTS:
        try:
            return build_cobasi_affiliate_url(url)
        except InvalidCobasiUrlError:
            return url
    return url

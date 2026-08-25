"""
Validador de URL Petz — mesma responsabilidade e forma de
shopee_link_validator.py/mercadolivre_link_validator.py, nunca
reaproveitado por herança (cada merchant tem suas próprias regras de
compliance — ver docs/AFFILIATES.md).

Diferente do validador do Mercado Livre: a Petz ainda não tem um
mecanismo de afiliado comprovado (nenhum parâmetro de tracking
conhecido — ver docs/AFFILIATES.md §Petz), então este validador hoje só
garante host/esquema seguros (https + domínio oficial petz.com.br).
Usado tanto para a URL direta do produto (sempre) quanto para a
affiliate_product_url quando/se um formato real de link afiliado for
comprovado — não inventar parâmetro obrigatório antes de existir um
link real gerado pelo mecanismo oficial da Petz.
"""
from __future__ import annotations

from urllib.parse import urlsplit

PETZ_ALLOWED_DOMAINS = frozenset({"petz.com.br", "www.petz.com.br"})

_BLOCKED_SCHEMES = {"javascript", "data", "file"}


class InvalidPetzAffiliateUrlError(ValueError):
    pass


def is_allowed_petz_host(hostname: str) -> bool:
    hostname = (hostname or "").strip().lower()
    if not hostname:
        return False
    return hostname in PETZ_ALLOWED_DOMAINS


def validate_petz_affiliate_url(url: str) -> str:
    """https obrigatório + host oficial Petz. Nunca reescreve a URL —
    só confirma e retorna inalterada, ou levanta InvalidPetzAffiliateUrlError."""
    if not url or not url.strip():
        raise InvalidPetzAffiliateUrlError("URL vazia")

    parsed = urlsplit(url.strip())
    scheme = (parsed.scheme or "").lower()
    if scheme in _BLOCKED_SCHEMES:
        raise InvalidPetzAffiliateUrlError(f"Esquema de URL não permitido: {scheme}:")
    if scheme != "https":
        raise InvalidPetzAffiliateUrlError("URL deve ser https://")
    if not parsed.netloc:
        raise InvalidPetzAffiliateUrlError("URL inválida (sem host)")
    if not is_allowed_petz_host(parsed.hostname or ""):
        raise InvalidPetzAffiliateUrlError(f"Host não permitido para Petz: {parsed.hostname}")

    return url.strip()

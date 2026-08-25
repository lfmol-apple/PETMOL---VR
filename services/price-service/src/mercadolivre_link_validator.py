"""
Validação de link oficial de afiliado Mercado Livre — nunca gera link,
nunca reescreve parâmetro nenhum. Mercado Livre não tem API de geração de
link (confirmado em 24/08/2026 — ver docs/AFFILIATES.md); todo link
cadastrado aqui vem de geração manual no painel "Gerador de links" do
Programa de Afiliados e Criadores, colado exatamente como o Mercado Livre
emitiu. Este módulo só confirma domínio oficial + https + presença dos
parâmetros de rastreamento esperados, antes de deixar cadastrar/servir
(ver marketplace_offer_provider.py).

Allowlist documentada e centralizada — mesmo princípio do
shopee_link_validator.py: nunca afrouxar pra aceitar por
substring/prefixo (ver is_allowed_mercadolivre_host).
"""
from __future__ import annotations

from urllib.parse import parse_qs, urlparse

# Domínio oficial confirmado ao vivo em 24/08/2026: link real gerado pelo
# "Gerador de links" do Programa de Afiliados e Criadores tinha o formato
# https://www.mercadolivre.com.br/social/<etiqueta>?matt_word=...&matt_tool=...&ref=...
MERCADOLIVRE_ALLOWED_DOMAINS = frozenset({
    "mercadolivre.com.br",
    "www.mercadolivre.com.br",
})

# Parâmetros de rastreamento que sempre apareceram no link real observado
# — presença aqui é o sinal de que a URL veio mesmo do gerador oficial,
# não de um link de produto comum copiado sem passar pelo programa.
REQUIRED_TRACKING_PARAMS = ("matt_word", "matt_tool")


class InvalidMercadoLivreAffiliateUrlError(ValueError):
    pass


def is_allowed_mercadolivre_host(hostname: str) -> bool:
    """True só para um domínio da allowlist exato ou um subdomínio real
    dele — nunca por prefixo/substring."""
    host = (hostname or "").lower()
    return host in MERCADOLIVRE_ALLOWED_DOMAINS or any(
        host.endswith(f".{domain}") for domain in MERCADOLIVRE_ALLOWED_DOMAINS
    )


def validate_mercadolivre_affiliate_url(url: str) -> str:
    """Retorna a URL EXATAMENTE como recebida se for válida (https +
    domínio oficial + parâmetros de rastreamento do afiliado presentes)
    — nunca adiciona, remove ou reordena parâmetro algum. Levanta
    InvalidMercadoLivreAffiliateUrlError caso a URL seja vazia,
    malformada, não-https, de domínio não reconhecido, ou sem os
    parâmetros que confirmam que veio do gerador oficial."""
    if not url or not url.strip():
        raise InvalidMercadoLivreAffiliateUrlError("URL vazia")

    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise InvalidMercadoLivreAffiliateUrlError(f"esquema deve ser https, recebeu {parsed.scheme!r}")
    if not parsed.netloc:
        raise InvalidMercadoLivreAffiliateUrlError("URL sem domínio")
    if not is_allowed_mercadolivre_host(parsed.hostname or ""):
        raise InvalidMercadoLivreAffiliateUrlError(f"domínio não é um domínio oficial Mercado Livre: {parsed.hostname!r}")

    query = parse_qs(parsed.query)
    missing = [p for p in REQUIRED_TRACKING_PARAMS if p not in query]
    if missing:
        raise InvalidMercadoLivreAffiliateUrlError(
            f"URL sem parâmetro(s) de rastreamento de afiliado esperado(s): {', '.join(missing)} "
            "— confirme que veio do Gerador de links do Programa de Afiliados, não de um link de produto comum"
        )

    return url

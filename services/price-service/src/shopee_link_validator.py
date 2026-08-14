"""
Validação de link oficial de afiliado Shopee — nunca gera link, nunca
reescreve parâmetro nenhum. As regras do programa Shopee Affiliates
exigem usar exatamente a URL emitida pelo Portal do Afiliado (modificar
parâmetros é motivo de desqualificação) — este módulo só confirma que uma
URL fornecida é de fato um domínio oficial da Shopee e usa https, antes
de deixá-la ser cadastrada/servida (ver marketplace_offer_provider.py).

Allowlist documentada e centralizada — domínios conhecidos usados por
links reais do Portal do Afiliado da Shopee Brasil. Se um link legítimo
vier de um domínio que não está aqui, ADICIONE o domínio à lista (com uma
nota de onde veio); nunca afrouxe a checagem pra aceitar por
substring/prefixo (ver is_allowed_shopee_host — mesma lógica de
subdomínio real usada em amazonAffiliate.ts no frontend).
"""
from __future__ import annotations

from urllib.parse import urlparse

# Domínios oficiais conhecidos de links emitidos pelo Portal do Afiliado
# Shopee Brasil. "s.shopee.com.br" é o encurtador usado nos links de
# afiliado reais observados até 14/08/2026 — nenhum link oficial foi
# recebido ainda (aguardando aprovação de mídia, ver config.py
# shopee_approved_media), então esta lista é baseada em documentação
# pública do programa, não em um link já confirmado nosso.
SHOPEE_ALLOWED_DOMAINS = frozenset({
    "shopee.com.br",
    "s.shopee.com.br",
})


class InvalidShopeeAffiliateUrlError(ValueError):
    pass


def is_allowed_shopee_host(hostname: str) -> bool:
    """True só para um domínio da allowlist exato ou um subdomínio real
    dele — nunca por prefixo/substring (rejeita
    "shopee.com.br.golpe.com" e "golpeshopee.com.br" pelo mesmo motivo
    que o validador da Amazon)."""
    host = (hostname or "").lower()
    return host in SHOPEE_ALLOWED_DOMAINS or any(
        host.endswith(f".{domain}") for domain in SHOPEE_ALLOWED_DOMAINS
    )


def validate_shopee_affiliate_url(url: str) -> str:
    """Retorna a URL EXATAMENTE como recebida se for válida (https +
    domínio oficial) — nunca adiciona, remove ou reordena parâmetro
    algum; a URL cadastrada é sempre um passthrough do que o Portal do
    Afiliado emitiu. Levanta InvalidShopeeAffiliateUrlError caso a URL
    seja vazia, malformada, não-https, ou de domínio não reconhecido."""
    if not url or not url.strip():
        raise InvalidShopeeAffiliateUrlError("URL vazia")

    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise InvalidShopeeAffiliateUrlError(f"esquema deve ser https, recebeu {parsed.scheme!r}")
    if not parsed.netloc:
        raise InvalidShopeeAffiliateUrlError("URL sem domínio")
    if not is_allowed_shopee_host(parsed.hostname or ""):
        raise InvalidShopeeAffiliateUrlError(f"domínio não é um domínio oficial Shopee: {parsed.hostname!r}")

    return url

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
substring/prefixo (ver is_allowed_shopee_host).
"""
from __future__ import annotations

import logging
from urllib.parse import parse_qs, urlparse

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

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
    "shopee.com.br.golpe.com" e "golpeshopee.com.br")."""
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


def _has_tracking_markers(url: str, app_id: str) -> bool:
    """True se a query string da URL já carrega o rastreio da nossa conta
    (`utm_source=an_<app_id>` ou `mmp_pid=an_<app_id>`) — a assinatura
    provada em docs/SHOPEE_AFFILIATE_TRACKING_AUDIT.md."""
    q = parse_qs(urlparse(url).query)
    marker = f"an_{app_id}"
    return marker in q.get("utm_source", []) or marker in q.get("mmp_pid", [])


def validate_manual_shopee_affiliate_url(url: str, *, timeout_seconds: float = 6.0) -> str:
    """Validação MAIS RIGOROSA, só para o link colado à mão por um admin
    (tela /admin/shopee-coverage, "Cadastrar link") — nunca para os links
    que o próprio sync já gera via API (esses nascem monetizados; ver
    shopee_offer_sync.py, chamam `validate_shopee_affiliate_url` normal).

    Um humano pode colar QUALQUER URL da Shopee que achou navegando — como
    a página comum de um produto, sem rastreio nenhum — e o validador
    básico (só confere domínio) deixaria passar. Aqui, além do domínio:

      - link curto (s.shopee.com.br/...): resolvemos o redirect de
        verdade e conferimos se a URL final carrega nosso rastreio;
      - link longo (shopee.com.br/...): a própria URL colada já precisa
        carregar `utm_source=an_<app_id>` ou `mmp_pid=an_<app_id>` —
        página comum de produto (sem esses parâmetros) é rejeitada.

    Falha "fechada": qualquer timeout, erro de rede ou ausência do
    rastreio rejeita o cadastro. Nunca grava produto não monetizado.
    """
    validated = validate_shopee_affiliate_url(url)
    settings = get_settings()
    app_id = (settings.shopee_affiliate_app_id or "").strip()
    if not app_id:
        # Sem app_id configurado não há assinatura pra conferir — mais
        # seguro recusar do que aceitar sem prova nenhuma.
        raise InvalidShopeeAffiliateUrlError(
            "SHOPEE_AFFILIATE_APP_ID não configurado — não há como confirmar que o link é monetizado"
        )

    host = (urlparse(validated).hostname or "").lower()
    is_short_link = host == "s.shopee.com.br" or host.endswith(".s.shopee.com.br")

    if not is_short_link:
        if _has_tracking_markers(validated, app_id):
            return validated
        raise InvalidShopeeAffiliateUrlError(
            "esse link não tem o rastreio da nossa conta (utm_source=an_… / mmp_pid=an_…) — "
            "parece ser a página comum do produto, não o link do Portal do Afiliado. "
            "Copie o link de afiliado (encurtado s.shopee.com.br/… ou com utm_source) em vez do link da página."
        )

    # Link curto: o rastreio só aparece depois do redirect — resolve de
    # verdade em vez de confiar só no domínio.
    try:
        with httpx.Client(follow_redirects=True, timeout=timeout_seconds) as client:
            resp = client.get(validated)
        resolved_url = str(resp.url)
    except httpx.HTTPError as exc:
        logger.warning("shopee link validator: falha ao resolver link curto %r: %s", validated, exc)
        raise InvalidShopeeAffiliateUrlError(
            "não consegui confirmar esse link curto agora (falha de rede) — tente de novo em instantes"
        ) from exc

    if _has_tracking_markers(resolved_url, app_id):
        return validated
    raise InvalidShopeeAffiliateUrlError(
        "esse link curto não resolveu para o rastreio da nossa conta — pode ser de outro afiliado ou "
        "um encurtador antigo. Gere um novo link no Portal do Afiliado da Shopee e cole ele aqui."
    )

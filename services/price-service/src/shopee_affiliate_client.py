"""
Cliente da API GraphQL oficial da Shopee Affiliate Open Platform
(https://open-api.affiliate.shopee.com.br/graphql).

Única chamada real à rede da Shopee em todo o código — roda em lote
(shopee_offer_sync.py / scripts/sync_shopee_offers.py), nunca a partir de
uma requisição HTTP do tutor. Este módulo só fala com a API e devolve os
nós crus de productOfferV2; o casamento produto-real x candidato Shopee é
responsabilidade de shopee_offer_matcher.py, e o upsert em MarketplaceOffer
é responsabilidade de shopee_offer_sync.py — nenhuma dessas duas coisas
acontece aqui.

Autenticação (confirmada por introspecção ao vivo em 21/08/2026, não só
por documentação de terceiros):
  Authorization: SHA256 Credential={AppId},Timestamp={ts},Signature={sig}
  sig = SHA256(AppId + str(ts) + payload + Secret), payload = corpo JSON
  exato enviado (mesma string, byte a byte).

offerLink/productLink vêm prontos da Shopee — nunca reescritos,
concatenados ou regenerados aqui; o validador de domínio
(shopee_link_validator.py) roda depois, no sync e de novo no clique
(defesa em profundidade, mesmo padrão do resto do módulo Shopee).
"""
from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Optional

import httpx

from .config import get_settings

logger = logging.getLogger(__name__)

API_URL = "https://open-api.affiliate.shopee.com.br/graphql"

PRODUCT_OFFER_QUERY = """
query($keyword: String, $page: Int, $limit: Int) {
  productOfferV2(keyword: $keyword, page: $page, limit: $limit) {
    nodes {
      itemId
      productName
      shopName
      price
      priceMin
      priceMax
      commissionRate
      sales
      ratingStar
      offerLink
      productLink
      imageUrl
    }
    pageInfo { page limit hasNextPage }
  }
}
"""


class ShopeeAffiliateError(RuntimeError):
    """Erro de configuração, autenticação ou resposta da API Shopee."""


def _sign(app_id: str, secret: str, timestamp: int, payload: str) -> str:
    factor = f"{app_id}{timestamp}{payload}{secret}"
    return hashlib.sha256(factor.encode("utf-8")).hexdigest()


def _post(query: str, variables: dict) -> dict:
    settings = get_settings()
    app_id = settings.shopee_affiliate_app_id
    secret = settings.shopee_affiliate_app_secret
    if not app_id or not secret:
        raise ShopeeAffiliateError(
            "SHOPEE_AFFILIATE_APP_ID/SHOPEE_AFFILIATE_APP_SECRET não configurados"
        )

    body = {"query": query, "variables": variables}
    # separators sem espaço + a mesma string usada pra assinar E pra
    # enviar — a Shopee valida a assinatura contra o payload exato
    # recebido, então corpo assinado e corpo enviado têm que ser
    # byte-a-byte idênticos.
    payload = json.dumps(body, separators=(",", ":"), ensure_ascii=False)
    timestamp = int(time.time())
    signature = _sign(app_id, secret, timestamp, payload)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"SHA256 Credential={app_id},Timestamp={timestamp},Signature={signature}",
    }

    response = httpx.post(API_URL, content=payload.encode("utf-8"), headers=headers, timeout=15.0)
    response.raise_for_status()
    data = response.json()
    if data.get("errors"):
        raise ShopeeAffiliateError(str(data["errors"]))
    return data.get("data") or {}


def search_product_offers(keyword: str, limit: int = 10) -> list[dict]:
    """Busca por palavra-chave (a API não tem lookup por GTIN exato, só
    texto — ver shopee_offer_matcher.py pro casamento). Retorna a lista
    crua de nós (dicts) como a Shopee devolveu — nenhum parsing/validação
    de negócio aqui além do necessário pra falar com a API."""
    keyword = (keyword or "").strip()
    if not keyword:
        return []
    data = _post(PRODUCT_OFFER_QUERY, {"keyword": keyword, "page": 1, "limit": limit})
    offer = data.get("productOfferV2") or {}
    return offer.get("nodes") or []

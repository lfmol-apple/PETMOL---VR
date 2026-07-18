"""
MercadoLivre Provider — Busca de produtos via API pública do ML.

Usa api.mercadolibre.com/sites/MLB/search sem autenticação para buscas
básicas. Com ML_CLIENT_ID configurado, pode usar endpoints autenticados
para mais dados (frete, reputação do vendedor, etc.).

Erros são logados via log_error() e nunca propagam — a busca retorna
lista vazia em caso de falha.
"""
import logging
from datetime import datetime
from typing import List, Optional
import re

import httpx

from .base import CatalogCandidate, CatalogProvider, PackSize, ProviderError, ProviderStatus

logger = logging.getLogger(__name__)

_ML_SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search"
_ML_TIMEOUT = 8.0  # segundos


def _parse_pack_sizes(title: str, attributes: list) -> List[PackSize]:
    """Extrai peso/volume do título ou atributos do item."""
    sizes: List[PackSize] = []

    # Tenta atributos estruturados primeiro
    for attr in attributes:
        attr_id = attr.get("id", "")
        val = attr.get("value_name", "") or ""
        if attr_id in ("WEIGHT", "NET_WEIGHT", "PACKAGE_WEIGHT"):
            m = re.search(r"([\d.,]+)\s*(kg|g|lb|oz)", val, re.IGNORECASE)
            if m:
                num = float(m.group(1).replace(",", "."))
                unit = m.group(2).lower()
                sizes.append(PackSize(value=num, unit=unit))
                break

    if sizes:
        return sizes

    # Fallback: extrai do título  (ex: "15kg", "15 Kg", "1,5kg")
    for m in re.finditer(r"([\d][.\d,]*)\s*(kg|g|lb|oz)\b", title, re.IGNORECASE):
        num = float(m.group(1).replace(",", "."))
        unit = m.group(2).lower()
        sizes.append(PackSize(value=num, unit=unit))

    return sizes[:1]  # apenas o primeiro achado


def _extract_brand(attributes: list) -> Optional[str]:
    for attr in attributes:
        if attr.get("id") == "BRAND":
            return attr.get("value_name")
    return None


class MercadoLivreProvider(CatalogProvider):
    """Provider para MercadoLivre Brasil (MLB)."""

    name = "ml"
    display_name = "MercadoLivre"
    country_codes = ["BR"]

    def __init__(self, access_token: Optional[str] = None):
        super().__init__()
        self._access_token = access_token

    def _headers(self) -> dict:
        h = {"Accept": "application/json", "User-Agent": "PETMOL/1.0"}
        if self._access_token:
            h["Authorization"] = f"Bearer {self._access_token}"
        return h

    async def search(
        self,
        query: str,
        country: str = "BR",
        product_type: str = "food",
        limit: int = 10,
    ) -> List[CatalogCandidate]:
        try:
            async with httpx.AsyncClient(timeout=_ML_TIMEOUT) as client:
                resp = await client.get(
                    _ML_SEARCH_URL,
                    params={"q": query, "limit": min(limit, 20)},
                    headers=self._headers(),
                )
                if resp.status_code != 200:
                    self.log_error(ProviderError(
                        provider=self.name,
                        error_type="http_error",
                        message=f"Status {resp.status_code}",
                        query=query,
                        status_code=resp.status_code,
                    ))
                    return []

                data = resp.json()
        except httpx.TimeoutException:
            self.log_error(ProviderError(
                provider=self.name,
                error_type="timeout",
                message=f"Timeout após {_ML_TIMEOUT}s",
                query=query,
            ))
            return []
        except Exception as exc:
            self.log_error(ProviderError(
                provider=self.name,
                error_type="request_error",
                message=str(exc),
                query=query,
            ))
            return []

        results = data.get("results", [])
        candidates: List[CatalogCandidate] = []

        for item in results:
            try:
                attrs = item.get("attributes", [])
                pack_sizes = _parse_pack_sizes(item.get("title", ""), attrs)
                brand = _extract_brand(attrs)

                # Preço — ML retorna em centavos ou reais dependendo da versão
                price = item.get("price")
                original_price = item.get("original_price")

                # Condição de estoque
                available_qty = item.get("available_quantity", 1)
                in_stock = available_qty > 0 and item.get("buying_mode") != "classified"

                # Seller
                seller_info = item.get("seller", {})
                seller_nickname = seller_info.get("nickname") if isinstance(seller_info, dict) else None

                # Frete grátis
                shipping = item.get("shipping", {})
                free_shipping = bool(shipping.get("free_shipping")) if isinstance(shipping, dict) else False

                candidate = CatalogCandidate(
                    source="ml",
                    source_item_id=str(item.get("id", "")),
                    title=item.get("title", ""),
                    brand=brand,
                    pack_sizes=pack_sizes,
                    image_url=item.get("thumbnail"),
                    price=float(price) if price is not None else None,
                    original_price=float(original_price) if original_price is not None else None,
                    currency="BRL",
                    url=item.get("permalink"),
                    in_stock=in_stock,
                    seller=seller_nickname,
                    free_shipping=free_shipping,
                    fetched_at=datetime.utcnow(),
                )
                candidates.append(candidate)
            except Exception as exc:
                logger.debug(f"[ml] Erro ao parsear item {item.get('id')}: {exc}")
                continue

        return candidates

    async def lookup_barcode(
        self,
        barcode: str,
        country: str = "BR",
    ) -> Optional[CatalogCandidate]:
        results = await self.search(query=barcode, country=country, limit=1)
        return results[0] if results else None


# Instância singleton — importada por search.py quando ENABLE_ML_PROVIDER=true
mercadolivre_provider = MercadoLivreProvider()

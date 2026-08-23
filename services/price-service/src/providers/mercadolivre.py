"""Mercado Livre catalog provider using backend-only Client Credentials.

This provider is intentionally catalog/price only. It never creates an
affiliate URL and must not be registered in the public commerce engine until
there is an official monetization method for Mercado Livre.
"""
from __future__ import annotations

import asyncio
import logging
import re
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Iterable, List, Optional
from urllib.parse import urlsplit, urlunsplit

import httpx

from ..config import get_settings
from .base import CatalogCandidate, CatalogProvider, PackSize, ProviderError

logger = logging.getLogger(__name__)

ML_TOKEN_URL = "https://api.mercadolibre.com/oauth/token"
ML_SEARCH_URL = "https://api.mercadolibre.com/sites/MLB/search"
ML_TIMEOUT = 8.0
ML_TOKEN_REFRESH_SKEW_SECONDS = 120


class MercadoLivreAuthError(RuntimeError):
    """Operational auth failure without exposing credentials."""


class MercadoLivreMissingCredentials(MercadoLivreAuthError):
    """Client Credentials are not configured."""


@dataclass
class MercadoLivreTokenStatus:
    client_id_configured: bool
    client_secret_configured: bool
    has_access_cached: bool
    access_expires_at: Optional[str]
    token_url_configured: bool = True
    grant_type: str = "client_credentials"


class MercadoLivreClientCredentialsTokenClient:
    """Fetches and caches Mercado Livre app tokens in memory only."""

    def __init__(
        self,
        *,
        client_id: Optional[str],
        client_secret: Optional[str],
        token_url: str = ML_TOKEN_URL,
        timeout: float = ML_TIMEOUT,
        now: Callable[[], float] = time.time,
        transport: Optional[httpx.AsyncBaseTransport] = None,
    ):
        self._client_id = client_id
        self._client_secret = client_secret
        self._token_url = token_url
        self._timeout = timeout
        self._now = now
        self._transport = transport
        self._access_token: Optional[str] = None
        self._expires_at: Optional[float] = None
        self._lock = asyncio.Lock()

    def _cached_token_valid(self) -> bool:
        return bool(
            self._access_token
            and self._expires_at is not None
            and self._now() < self._expires_at - ML_TOKEN_REFRESH_SKEW_SECONDS
        )

    async def get_access_token(self, *, force_refresh: bool = False) -> str:
        if not force_refresh and self._cached_token_valid():
            return self._access_token or ""

        async with self._lock:
            if not force_refresh and self._cached_token_valid():
                return self._access_token or ""

            if not self._client_id or not self._client_secret:
                raise MercadoLivreMissingCredentials("Mercado Livre Client Credentials ausentes")

            async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                response = await client.post(
                    self._token_url,
                    data={
                        "grant_type": "client_credentials",
                        "client_id": self._client_id,
                        "client_secret": self._client_secret,
                    },
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "application/x-www-form-urlencoded",
                    },
                )

            if response.status_code != 200:
                raise MercadoLivreAuthError(f"Falha ao obter token Mercado Livre: status {response.status_code}")

            payload = response.json()
            access_token = payload.get("access_token")
            expires_in = payload.get("expires_in")
            if not isinstance(access_token, str) or not access_token:
                raise MercadoLivreAuthError("Resposta de token Mercado Livre sem access_token")
            if not isinstance(expires_in, int) or expires_in <= 0:
                raise MercadoLivreAuthError("Resposta de token Mercado Livre sem expires_in válido")

            self._access_token = access_token
            self._expires_at = self._now() + expires_in
            return access_token

    def clear_access_token(self) -> None:
        self._access_token = None
        self._expires_at = None

    def get_status(self) -> MercadoLivreTokenStatus:
        return MercadoLivreTokenStatus(
            client_id_configured=bool(self._client_id),
            client_secret_configured=bool(self._client_secret),
            has_access_cached=bool(self._access_token),
            access_expires_at=datetime.utcfromtimestamp(self._expires_at).isoformat() if self._expires_at else None,
        )


def _digits(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    normalized = re.sub(r"\D+", "", str(value))
    return normalized or None


def _extract_gtins(attributes: Iterable[dict]) -> list[str]:
    gtins: list[str] = []
    for attr in attributes:
        attr_id = str(attr.get("id") or "").upper()
        name = str(attr.get("name") or "").upper()
        if attr_id not in {"GTIN", "EAN", "UPC", "JAN", "ISBN"} and "GTIN" not in name and "EAN" not in name:
            continue
        values = attr.get("values")
        candidates = []
        if isinstance(values, list):
            candidates.extend(v.get("name") or v.get("value_name") for v in values if isinstance(v, dict))
        candidates.append(attr.get("value_name"))
        for candidate in candidates:
            normalized = _digits(candidate)
            if normalized and normalized not in gtins:
                gtins.append(normalized)
    return gtins


def _extract_brand(attributes: Iterable[dict]) -> Optional[str]:
    for attr in attributes:
        if str(attr.get("id") or "").upper() == "BRAND":
            value = attr.get("value_name")
            return str(value).strip() if value else None
    return None


def _parse_pack_sizes(title: str, attributes: Iterable[dict]) -> List[PackSize]:
    sizes: List[PackSize] = []
    for attr in attributes:
        attr_id = str(attr.get("id") or "").upper()
        val = str(attr.get("value_name") or "")
        if attr_id in {"WEIGHT", "NET_WEIGHT", "PACKAGE_WEIGHT", "VOLUME", "NET_VOLUME"}:
            m = re.search(r"([\d.,]+)\s*(kg|g|ml|l|lb|oz)\b", val, re.IGNORECASE)
            if m:
                unit = m.group(2).lower()
                value = _parse_decimal(m.group(1))
                if unit == "l":
                    unit = "ml"
                    value *= 1000
                sizes.append(PackSize(value=value, unit=unit))
                return sizes

    for m in re.finditer(r"([\d][.\d,]*)\s*(kg|g|ml|l|lb|oz)\b", title, re.IGNORECASE):
        unit = m.group(2).lower()
        value = _parse_decimal(m.group(1))
        if unit == "l":
            unit = "ml"
            value *= 1000
        sizes.append(PackSize(value=value, unit=unit))
        break
    return sizes


def _parse_decimal(value: str) -> float:
    if "," in value:
        return float(value.replace(".", "").replace(",", "."))
    return float(value)


def _https_url(url: Optional[str]) -> Optional[str]:
    if not url:
        return None
    parts = urlsplit(url)
    if not parts.netloc:
        return url
    return urlunsplit(("https", parts.netloc, parts.path, parts.query, parts.fragment))


def _best_image(item: dict) -> Optional[str]:
    pictures = item.get("pictures")
    if isinstance(pictures, list) and pictures:
        urls = [p.get("secure_url") or p.get("url") for p in pictures if isinstance(p, dict)]
        urls = [u for u in urls if u]
        if urls:
            return _https_url(str(urls[-1]))
    return _https_url(item.get("secure_thumbnail") or item.get("thumbnail"))


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) >= 3}


def _size_signature(pack_sizes: list[PackSize]) -> Optional[tuple[float, str]]:
    if not pack_sizes:
        return None
    first = pack_sizes[0]
    return (round(first.value, 3), first.unit.lower())


def _text_match_is_conservative(query: str, candidate: CatalogCandidate) -> bool:
    query_tokens = _tokens(query)
    if not query_tokens:
        return False
    title_tokens = _tokens(candidate.title)
    brand_tokens = _tokens(candidate.brand or "")
    matched = len(query_tokens & (title_tokens | brand_tokens))
    if matched < max(2, min(4, len(query_tokens))):
        return False

    query_sizes = _parse_pack_sizes(query, [])
    if query_sizes and candidate.pack_sizes:
        return _size_signature(query_sizes) == _size_signature(candidate.pack_sizes)
    return True


class MercadoLivreProvider(CatalogProvider):
    """Provider for Mercado Livre Brasil (MLB)."""

    name = "ml"
    display_name = "Mercado Livre"
    country_codes = ["BR"]

    def __init__(
        self,
        *,
        token_client: Optional[MercadoLivreClientCredentialsTokenClient] = None,
        transport: Optional[httpx.AsyncBaseTransport] = None,
        timeout: float = ML_TIMEOUT,
    ):
        super().__init__()
        settings = get_settings()
        self._token_client = token_client or MercadoLivreClientCredentialsTokenClient(
            client_id=settings.mercadolivre_client_id,
            client_secret=settings.mercadolivre_client_secret,
            transport=transport,
        )
        self._transport = transport
        self._timeout = timeout

    async def _get_json(self, url: str, *, params: dict, query: str) -> Optional[dict]:
        for attempt in (0, 1):
            try:
                token = await self._token_client.get_access_token(force_refresh=attempt == 1)
                async with httpx.AsyncClient(timeout=self._timeout, transport=self._transport) as client:
                    response = await client.get(
                        url,
                        params=params,
                        headers={
                            "Accept": "application/json",
                            "Authorization": f"Bearer {token}",
                            "User-Agent": "PETMOL/1.0",
                        },
                    )
            except MercadoLivreMissingCredentials:
                self.log_error(ProviderError(self.name, "missing_config", "Mercado Livre Client Credentials ausentes", query=query))
                return None
            except httpx.TimeoutException:
                self.log_error(ProviderError(self.name, "timeout", f"Timeout após {self._timeout}s", query=query))
                return None
            except Exception as exc:
                self.log_error(ProviderError(self.name, "request_error", str(exc), query=query))
                return None

            if response.status_code == 401 and attempt == 0:
                self._token_client.clear_access_token()
                continue
            if response.status_code == 429:
                self.log_error(ProviderError(self.name, "rate_limited", "Mercado Livre retornou 429", query=query, status_code=429))
                return None
            if response.status_code != 200:
                self.log_error(ProviderError(self.name, "http_error", f"Status {response.status_code}", query=query, status_code=response.status_code))
                return None
            return response.json()
        return None

    def _candidate_from_item(self, item: dict) -> Optional[CatalogCandidate]:
        attrs = item.get("attributes") if isinstance(item.get("attributes"), list) else []
        price = item.get("price")
        if price is None:
            return None

        gtins = _extract_gtins(attrs)
        seller = item.get("seller") if isinstance(item.get("seller"), dict) else {}
        shipping = item.get("shipping") if isinstance(item.get("shipping"), dict) else {}
        available_qty = item.get("available_quantity")
        in_stock = bool(available_qty is None or available_qty > 0)

        return CatalogCandidate(
            source="ml",
            source_item_id=str(item.get("id") or ""),
            title=str(item.get("title") or ""),
            brand=_extract_brand(attrs),
            pack_sizes=_parse_pack_sizes(str(item.get("title") or ""), attrs),
            image_url=_best_image(item),
            gtin=gtins[0] if gtins else None,
            price=float(price),
            original_price=float(item["original_price"]) if item.get("original_price") is not None else None,
            currency=str(item.get("currency_id") or "BRL"),
            url=_https_url(item.get("permalink")),
            in_stock=in_stock and item.get("buying_mode") != "classified",
            seller=str(seller.get("nickname")) if seller.get("nickname") else None,
            free_shipping=bool(shipping.get("free_shipping")),
            fetched_at=datetime.utcnow(),
        )

    async def search(
        self,
        query: str,
        country: str = "BR",
        product_type: str = "food",
        limit: int = 10,
    ) -> List[CatalogCandidate]:
        if country.upper() != "BR":
            return []

        data = await self._get_json(
            ML_SEARCH_URL,
            params={"q": query, "limit": min(max(limit, 1), 20)},
            query=query,
        )
        if not data:
            return []

        candidates: list[CatalogCandidate] = []
        for item in data.get("results", []):
            if not isinstance(item, dict):
                continue
            candidate = self._candidate_from_item(item)
            if candidate and _text_match_is_conservative(query, candidate):
                candidates.append(candidate)
        return candidates[:limit]

    async def lookup_barcode(self, barcode: str, country: str = "BR") -> Optional[CatalogCandidate]:
        normalized = _digits(barcode)
        if not normalized or country.upper() != "BR":
            return None

        data = await self._get_json(
            ML_SEARCH_URL,
            params={"q": normalized, "limit": 20},
            query=normalized,
        )
        if not data:
            return None

        for item in data.get("results", []):
            if not isinstance(item, dict):
                continue
            attrs = item.get("attributes") if isinstance(item.get("attributes"), list) else []
            if normalized not in _extract_gtins(attrs):
                continue
            candidate = self._candidate_from_item(item)
            if candidate:
                candidate.gtin = normalized
                return candidate
        return None


def build_mercadolivre_provider() -> MercadoLivreProvider:
    return MercadoLivreProvider()


mercadolivre_provider = build_mercadolivre_provider()

"""
Base Provider Interface for Catalog/Offers

This module defines the abstract interface that all catalog providers must implement.
Providers: MercadoLivre (official API) and future official catalog APIs.

Architecture follows "Trivago-style" aggregation:
- Multiple providers search in parallel
- Results are aggregated, normalized, and deduplicated
- Canonical products are created from best matches

NO mock/demo/scraping - only official APIs.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class ProviderStatus(str, Enum):
    """Provider operational status."""
    ACTIVE = "active"
    DISABLED = "disabled"
    ERROR = "error"
    MISSING_CONFIG = "missing_config"


@dataclass
class PackSize:
    """Product pack size."""
    value: float
    unit: str  # "kg", "g", "lb", "oz", "unit", "ml"


@dataclass
class CatalogCandidate:
    """
    A product candidate from a provider.
    This is the raw result from external APIs before normalization.
    """
    source: str  # "ml", etc.
    source_item_id: str
    title: str
    brand: Optional[str] = None
    variant: Optional[str] = None
    species: Optional[str] = None  # "dog", "cat", "unknown"
    pack_sizes: List[PackSize] = field(default_factory=list)
    image_url: Optional[str] = None
    gtin: Optional[str] = None
    price: Optional[float] = None
    original_price: Optional[float] = None
    currency: Optional[str] = None
    url: Optional[str] = None
    in_stock: bool = True
    seller: Optional[str] = None
    rating: Optional[float] = None
    reviews_count: Optional[int] = None
    free_shipping: bool = False
    fetched_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "source": self.source,
            "source_item_id": self.source_item_id,
            "title": self.title,
            "brand": self.brand,
            "variant": self.variant,
            "species": self.species,
            "pack_sizes": [{"value": ps.value, "unit": ps.unit} for ps in self.pack_sizes],
            "image_url": self.image_url,
            "gtin": self.gtin,
            "price": self.price,
            "original_price": self.original_price,
            "currency": self.currency,
            "url": self.url,
            "in_stock": self.in_stock,
            "seller": self.seller,
            "rating": self.rating,
            "reviews_count": self.reviews_count,
        }


@dataclass
class ProviderError:
    """Logged error from a provider."""
    provider: str
    error_type: str
    message: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    query: Optional[str] = None
    status_code: Optional[int] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "provider": self.provider,
            "error_type": self.error_type,
            "message": self.message,
            "timestamp": self.timestamp.isoformat(),
            "query": self.query,
            "status_code": self.status_code,
        }


class CatalogProvider(ABC):
    """
    Abstract base class for catalog providers.
    
    Each provider must implement these methods.
    Providers should:
    - Handle their own rate limiting and retries
    - Cache results appropriately
    - Log errors to the error store
    """
    
    name: str = "base"
    display_name: str = "Base Provider"
    country_codes: List[str] = []  # Supported countries
    
    def __init__(self):
        self._status = ProviderStatus.ACTIVE
        self._last_error: Optional[ProviderError] = None
        self._errors: List[ProviderError] = []
        self._max_errors = 50  # Keep last N errors
    
    @property
    def status(self) -> ProviderStatus:
        return self._status
    
    @property
    def last_error(self) -> Optional[ProviderError]:
        return self._last_error
    
    @property
    def errors(self) -> List[ProviderError]:
        return self._errors[-self._max_errors:]
    
    def log_error(self, error: ProviderError):
        """Log an error for observability."""
        self._last_error = error
        self._errors.append(error)
        if len(self._errors) > self._max_errors:
            self._errors = self._errors[-self._max_errors:]
        logger.warning(f"[{self.name}] {error.error_type}: {error.message}")
    
    def get_info(self) -> Dict[str, Any]:
        """Get provider info for /debug/providers endpoint."""
        return {
            "name": self.name,
            "display_name": self.display_name,
            "status": self._status.value,
            "country_codes": self.country_codes,
            "last_error": self._last_error.to_dict() if self._last_error else None,
            "error_count": len(self._errors),
        }
    
    @abstractmethod
    async def search(
        self,
        query: str,
        country: str = "BR",
        product_type: str = "food",
        limit: int = 10,
    ) -> List[CatalogCandidate]:
        """
        Search for products matching the query.
        
        Args:
            query: Search string (e.g., "royal canin maxi")
            country: Country code (BR, US, etc.)
            product_type: "food", "product", "medicine", etc.
            limit: Maximum results to return
            
        Returns:
            List of CatalogCandidate objects
        """
        pass
    
    @abstractmethod
    async def lookup_barcode(
        self,
        barcode: str,
        country: str = "BR",
    ) -> Optional[CatalogCandidate]:
        """
        Look up a product by barcode (EAN-13/UPC).
        
        Args:
            barcode: The barcode string
            country: Country code hint
            
        Returns:
            CatalogCandidate if found, None otherwise
        """
        pass
    
    async def get_offers(
        self,
        query: str,
        country: str = "BR",
        limit: int = 10,
    ) -> List[CatalogCandidate]:
        """
        Get offers for a product query.
        Default implementation just calls search().
        Override for providers with separate offer endpoints.
        """
        return await self.search(query, country, "product", limit)


# Global error store for observability
_global_errors: List[ProviderError] = []
_max_global_errors = 100


def log_global_error(error: ProviderError):
    """Log error to global store for /debug/last-errors."""
    global _global_errors
    _global_errors.append(error)
    if len(_global_errors) > _max_global_errors:
        _global_errors = _global_errors[-_max_global_errors:]


def get_global_errors(limit: int = 20) -> List[Dict[str, Any]]:
    """Get recent errors for /debug/last-errors."""
    return [e.to_dict() for e in _global_errors[-limit:]]


def clear_global_errors():
    """Clear error store."""
    global _global_errors
    _global_errors = []

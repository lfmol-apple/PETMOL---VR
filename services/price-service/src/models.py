"""
Data models for the price service API.
"""
from datetime import datetime
from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, Field


class Currency(str, Enum):
    """Supported currencies."""
    BRL = "BRL"
    USD = "USD"
    EUR = "EUR"
    GBP = "GBP"
    MXN = "MXN"
    ARS = "ARS"
    COP = "COP"
    CLP = "CLP"
    CAD = "CAD"
    AUD = "AUD"


class UnitSystem(str, Enum):
    """Unit systems."""
    METRIC = "metric"
    IMPERIAL = "imperial"


class PackSizeUnit(str, Enum):
    """Pack size units."""
    KG = "kg"
    G = "g"
    LB = "lb"
    OZ = "oz"
    UNIT = "unit"
    ML = "ml"
    FLOZ = "floz"


class ShippingType(str, Enum):
    """Shipping types."""
    FREE = "free"
    FIXED = "fixed"
    CALCULATED = "calculated"
    UNKNOWN = "unknown"


class Provider(str, Enum):
    """
    Supported price providers.
    
    PRODUCTION: Only providers with official API integration.
    """
    # Latin America (Mercado Livre)
    MERCADOLIVRE = "mercadolivre"


class SearchQuery(BaseModel):
    """Search query parameters."""
    query: str = Field(..., min_length=2, max_length=200)
    country_code: str = Field(..., min_length=2, max_length=2)
    postal_code: Optional[str] = Field(None, max_length=20)
    currency: Currency = Currency.USD
    unit_system: UnitSystem = UnitSystem.METRIC
    category: Optional[str] = Field(None, max_length=50)
    brand: Optional[str] = Field(None, max_length=100)
    min_pack_size: Optional[float] = None
    max_pack_size: Optional[float] = None
    pack_size_unit: Optional[PackSizeUnit] = None
    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)


class ShippingInfo(BaseModel):
    """Shipping information for an offer."""
    type: ShippingType
    cost: Optional[float] = None
    estimated_days: Optional[int] = None
    carrier: Optional[str] = None


class Offer(BaseModel):
    """A product offer from a provider."""
    id: str
    provider: Provider
    provider_product_id: str
    name: str
    brand: Optional[str] = None
    variant: Optional[str] = None
    pack_size_value: Optional[float] = None
    pack_size_unit: Optional[PackSizeUnit] = None
    price: float
    original_price: Optional[float] = None
    currency: Currency
    price_per_unit: Optional[float] = None  # price per kg/lb
    url: str
    image_url: Optional[str] = None
    in_stock: bool = True
    shipping: Optional[ShippingInfo] = None
    total_cost: Optional[float] = None  # price + shipping
    fetched_at: datetime = Field(default_factory=datetime.utcnow)
    
    @property
    def discount_percent(self) -> Optional[float]:
        """Calculate discount percentage."""
        if self.original_price and self.original_price > self.price:
            return round((1 - self.price / self.original_price) * 100, 1)
        return None


class SearchResult(BaseModel):
    """Search results response."""
    query: str
    country_code: str
    currency: Currency
    total_results: int
    offers: List[Offer]
    best_total: Optional[Offer] = None
    best_unit_price: Optional[Offer] = None
    fastest_shipping: Optional[Offer] = None
    cached: bool = False
    cache_expires_at: Optional[datetime] = None


class HealthResponse(BaseModel):
    """Health check response."""
    status: str
    version: str
    providers: List[str]


class ErrorResponse(BaseModel):
    """Error response."""
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


# ========================================
# Catalog Candidate Models (Trivago-style)
# ========================================

class CatalogPackSize(BaseModel):
    """Pack size option."""
    value: float
    unit: str


class CatalogCandidate(BaseModel):
    """A catalog candidate from a source (trivago-style)."""
    source: str  # "ml", "catalog", etc.
    source_item_id: str
    title: str
    brand: Optional[str] = None
    variant: Optional[str] = None
    species: Optional[str] = None  # "dog", "cat", "unknown"
    life_stage: Optional[str] = None
    port: Optional[str] = None  # "mini", "pequeno", "medio", "grande", "gigante", "all"
    neutered: Optional[bool] = None
    pack_sizes: List[CatalogPackSize] = []
    image_url: Optional[str] = None
    price: Optional[float] = None
    currency: Optional[str] = None
    url: Optional[str] = None


class CatalogSearchResult(BaseModel):
    """Result from catalog search."""
    candidates: List[CatalogCandidate]
    query: str
    country: str
    cached: bool = False


class CanonicalProduct(BaseModel):
    """A canonical (normalized) product."""
    id: str
    name: str
    brand: str
    pack_size: Optional[CatalogPackSize] = None
    image_url: Optional[str] = None
    species: Optional[str] = None


class NormalizeResult(BaseModel):
    """Result from normalize endpoint."""
    product: CanonicalProduct


class PushSubscription(BaseModel):
    """Push notification subscription."""
    user_id: int
    endpoint: str
    p256dh: str  # Public key
    auth: str    # Auth secret
    created_at: datetime = Field(default_factory=datetime.utcnow)
    
    
class NotificationPayload(BaseModel):
    """Payload for sending push notifications."""
    title: str
    body: str
    icon: Optional[str] = None
    badge: Optional[str] = None
    url: Optional[str] = None
    tag: Optional[str] = None
    require_interaction: bool = False

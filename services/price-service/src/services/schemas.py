"""
Pydantic schemas for services API.
SLICE 1 - NEW SCHEMAS
"""
from typing import Optional, List, Literal
from pydantic import BaseModel, Field

from ..serialization.utc_instant import UtcInstant


# ===== Service Search =====

class PlaceResult(BaseModel):
    """Resultado individual de um lugar (parceiro ou Google)."""
    id: str
    name: str
    display_name: Optional[str] = None
    lat: float
    lng: float
    formatted_address: Optional[str] = None
    rating: Optional[float] = None
    user_rating_count: Optional[int] = None
    business_status: Optional[str] = None
    distance_meters: Optional[int] = None
    
    # Metadata
    is_partner: bool = False
    partner_level: Optional[int] = None
    is_verified: bool = False
    
    # Contatos (se já disponíveis)
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    website: Optional[str] = None


class SearchMeta(BaseModel):
    """Metadados da busca para debugging e analytics."""
    cache_hit: bool
    partners_count: int
    google_count: int
    total_count: int
    tier: str  # near, mid, far
    radius_meters: int
    geohash: str
    service_type: str


class ServiceSearchRequest(BaseModel):
    """Request para busca de serviços."""
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")
    service: Literal["banho_tosa", "vet_clinic", "emergencia", "petshop"] = Field(
        ..., 
        description="Tipo de serviço"
    )
    radius_meters: Optional[int] = Field(
        default=2000,
        ge=100,
        le=10000,
        description="Raio de busca em metros (100-10000)"
    )
    limit: int = Field(default=20, ge=1, le=50, description="Limite de resultados")


class ServiceSearchResponse(BaseModel):
    """Response da busca de serviços."""
    results: List[PlaceResult]
    meta: SearchMeta


# ===== Place Contact =====

class PlaceContactResponse(BaseModel):
    """Contatos de um lugar específico."""
    place_id: str
    national_phone_number: Optional[str] = None
    formatted_phone_number: Optional[str] = None
    website_uri: Optional[str] = None
    business_status: Optional[str] = None
    cached: bool = False


# ===== Handoff =====

class HandoffRequest(BaseModel):
    """Request para gerar handoff link."""
    place_id: Optional[str] = None
    place_name: Optional[str] = None
    action: Literal["whatsapp", "call", "directions", "website", "share_rg", "qr_scan"]
    source: Literal["partner", "google", "qr"] = "google"
    service: Optional[str] = None
    target_url: str = Field(..., description="URL de destino (wa.me, tel:, maps, etc)")
    
    # Metadados opcionais
    app_version: Optional[str] = None
    platform: Optional[Literal["web", "ios", "android"]] = "web"


class HandoffResponse(BaseModel):
    """Response do handoff com lead_id gerado."""
    lead_id: str
    redirect_url: str


# ===== Establishments Portal =====

class EstablishmentClaimRequest(BaseModel):
    """Request para claim de estabelecimento."""
    place_id: str = Field(..., description="Google Place ID")
    display_name: str
    email: Optional[str] = None
    phone: str


class EstablishmentClaimResponse(BaseModel):
    """Response do claim."""
    establishment_id: str
    qr_id: str
    claim_status: str
    verification_sent: bool


class EstablishmentOut(BaseModel):
    """Dados públicos do estabelecimento."""
    id: str
    display_name: str
    qr_id: str
    plan: str
    is_verified: bool
    created_at: UtcInstant

    class Config:
        from_attributes = True


# ===== Analytics =====

class AnalyticsClickCreate(BaseModel):
    """Dados internos para criar registro de analytics."""
    lead_id: str
    place_id: Optional[str] = None
    place_name: Optional[str] = None
    action: str
    source: str
    service: Optional[str] = None
    country_code: Optional[str] = None
    app_version: Optional[str] = None
    platform: Optional[str] = None

"""Pydantic schemas for admin endpoints."""

from typing import Optional, List

from pydantic import BaseModel, EmailStr, Field

from ..serialization.utc_instant import UtcInstant, OptionalUtcInstant


class AdminBootstrapPromoteRequest(BaseModel):
    email: EmailStr
    role: str = "admin"


class AdminMeData(BaseModel):
    admin_id: str
    user_id: str
    email: EmailStr
    role: str
    created_at: UtcInstant


class AdminMeOut(BaseModel):
    success: bool = True
    data: AdminMeData


class GlobalStatsData(BaseModel):
    total_users: int
    total_owners: int
    total_pets: int
    total_vaccines: int = 0
    total_appointments: int = 0
    countries_count: int = 0
    cities_count: int = 0


class GlobalStatsOut(BaseModel):
    success: bool = True
    data: GlobalStatsData


class PetOut(BaseModel):
    id: str
    name: str
    species: str
    breed: Optional[str] = None
    birth_date: Optional[str] = None
    weight_value: Optional[float] = None
    weight_unit: Optional[str] = None
    neutered: Optional[bool] = None


class TutorOut(BaseModel):
    id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


class AccountOut(BaseModel):
    user_id: str
    email: EmailStr
    created_at: UtcInstant
    tutor: Optional[TutorOut] = None
    pets: List[PetOut] = Field(default_factory=list)


class AccountsListOut(BaseModel):
    success: bool = True
    data: List[AccountOut]


class OkOut(BaseModel):
    success: bool = True


# User management schemas
class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str


class UserUpdateRequest(BaseModel):
    email: Optional[EmailStr] = None
    password: Optional[str] = None
    email_verified: Optional[bool] = None


class UserOut(BaseModel):
    id: str
    email: EmailStr
    created_at: UtcInstant
    email_verified: bool = False


class UserDetailOut(BaseModel):
    success: bool = True
    data: UserOut


class UsersListOut(BaseModel):
    success: bool = True
    data: List[UserOut]


# Pet management schemas
class PetCreateRequest(BaseModel):
    user_id: str
    name: str
    species: str
    breed: Optional[str] = None
    birth_date: Optional[str] = None  # ISO date string
    weight_value: Optional[float] = None
    weight_unit: Optional[str] = None
    photo: Optional[str] = None
    neutered: Optional[bool] = None


class PetUpdateRequest(BaseModel):
    name: Optional[str] = None
    species: Optional[str] = None
    breed: Optional[str] = None
    birth_date: Optional[str] = None  # ISO date string
    weight_value: Optional[float] = None
    weight_unit: Optional[str] = None
    photo: Optional[str] = None
    neutered: Optional[bool] = None


class PetDetailOut(BaseModel):
    success: bool = True
    data: PetOut


class PetsListOut(BaseModel):
    success: bool = True
    data: List[PetOut]


# Generic responses
class DeletedOut(BaseModel):
    success: bool = True
    message: str = "Excluído com sucesso"


# Affiliate links (deep link por produto/GTIN → merchant)
class AffiliateLinkCreateRequest(BaseModel):
    gtin: str
    merchant: str
    affiliate_product_url: str
    direct_product_url: Optional[str] = None
    affiliate_program: Optional[str] = None
    active: bool = True


class AffiliateLinkUpdateRequest(BaseModel):
    affiliate_product_url: Optional[str] = None
    direct_product_url: Optional[str] = None
    affiliate_program: Optional[str] = None
    active: Optional[bool] = None
    # True → marca verified_at=now(); False → limpa. Nunca aceita timestamp
    # do cliente, para não permitir "verificação" retroativa forjada.
    verified: Optional[bool] = None


class AffiliateLinkOut(BaseModel):
    id: int
    product_id: int
    gtin: str
    merchant: str
    affiliate_product_url: str
    direct_product_url: Optional[str] = None
    affiliate_program: Optional[str] = None
    active: bool
    verified_at: OptionalUtcInstant = None
    created_at: UtcInstant
    updated_at: UtcInstant


class AffiliateLinkDetailOut(BaseModel):
    success: bool = True
    data: AffiliateLinkOut


class AffiliateLinksListOut(BaseModel):
    success: bool = True
    data: List[AffiliateLinkOut]


# Petz — aprendizado de mapeamento produto↔Petz (ver petz_mapping.py).
# Distinto de AffiliateLink*: guarda estado de DESCOBERTA (status,
# confiança, variante, query de busca), não o link comercial final.
class PetzMappingOut(BaseModel):
    id: Optional[int] = None
    product_id: Optional[int] = None
    gtin: str
    petz_product_id: Optional[str] = None
    product_url: Optional[str] = None
    search_query: Optional[str] = None
    match_status: str
    match_confidence: Optional[float] = None
    variant_label: Optional[str] = None
    variant_weight_kg: Optional[float] = None
    rejection_reason: Optional[str] = None
    last_verified_at: OptionalUtcInstant = None
    created_at: OptionalUtcInstant = None
    updated_at: OptionalUtcInstant = None


class PetzMappingSuggestOut(BaseModel):
    gtin: str
    search_query: Optional[str] = None
    current_status: str


class PetzMappingConfirmRequest(BaseModel):
    petz_product_id: str
    product_url: str
    variant_label: Optional[str] = None
    variant_weight_kg: Optional[float] = None
    match_confidence: Optional[float] = None


class PetzMappingRejectRequest(BaseModel):
    reason: Optional[str] = None


class PetzSetAffiliateLinkRequest(BaseModel):
    affiliate_product_url: str


class PetzCoverageOut(BaseModel):
    total: int
    unknown: int
    candidate: int
    ambiguous: int
    confirmed: int
    affiliate_pending: int
    affiliate_ready: int
    rejected: int


# Marketplace offers (link oficial de vendedor/marketplace por produto —
# Shopee hoje; NUNCA gerado por template, sempre colado do Portal do
# Afiliado — ver marketplace_offer_provider.py / shopee_link_validator.py)
class MarketplaceOfferCreateRequest(BaseModel):
    gtin: str
    merchant: str
    affiliate_url: str
    direct_url: Optional[str] = None
    seller_name: Optional[str] = None
    external_listing_id: Optional[str] = None
    price: Optional[float] = None
    is_available: Optional[bool] = None
    active: bool = True


class MarketplaceOfferUpdateRequest(BaseModel):
    affiliate_url: Optional[str] = None
    direct_url: Optional[str] = None
    seller_name: Optional[str] = None
    external_listing_id: Optional[str] = None
    price: Optional[float] = None
    is_available: Optional[bool] = None
    active: Optional[bool] = None
    verified: Optional[bool] = None


class MarketplaceOfferOut(BaseModel):
    id: int
    product_id: int
    gtin: str
    merchant: str
    affiliate_url: str
    direct_url: Optional[str] = None
    seller_name: Optional[str] = None
    external_listing_id: Optional[str] = None
    price: Optional[float] = None
    is_available: Optional[bool] = None
    active: bool
    verified_at: OptionalUtcInstant = None
    created_at: UtcInstant
    updated_at: UtcInstant


class MarketplaceOfferDetailOut(BaseModel):
    success: bool = True
    data: MarketplaceOfferOut


class MarketplaceOffersListOut(BaseModel):
    success: bool = True
    data: List[MarketplaceOfferOut]

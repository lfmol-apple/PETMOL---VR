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

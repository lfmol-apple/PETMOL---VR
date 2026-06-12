"""Pydantic schemas for local auth."""
from typing import Optional

from pydantic import BaseModel, EmailStr, Field

from ..serialization.utc_instant import OptionalUtcInstant


class UserCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)
    phone: Optional[str] = Field(None, max_length=40)
    terms_accepted: bool = Field(default=False)
    # Address fields (optional at registration)
    postal_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=20, max_length=256)
    password: str = Field(min_length=6, max_length=128)


class PasswordResetResponse(BaseModel):
    ok: bool = True
    message: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    name: str
    phone: Optional[str] = None
    whatsapp: bool = True
    postal_code: Optional[str] = None
    street: Optional[str] = None
    number: Optional[str] = None
    complement: Optional[str] = None
    neighborhood: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    monthly_checkin_day: int = 5
    monthly_checkin_hour: int = 9
    monthly_checkin_minute: int = 0
    created_at: OptionalUtcInstant = None

    class Config:
        from_attributes = True


class LoginResponse(BaseModel):
    id: str
    email: EmailStr
    created_at: OptionalUtcInstant = None
    access_token: str

    class Config:
        from_attributes = True


class TokenData(BaseModel):
    user_id: Optional[str] = None

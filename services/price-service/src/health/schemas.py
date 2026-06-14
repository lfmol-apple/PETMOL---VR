"""
PETMOL Health Module - Pydantic Schemas

Request/Response models for health endpoints.
"""
from datetime import date
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ============================================================================
# Vaccine Models
# ============================================================================

class VaccinePayload(BaseModel):
    """Vaccine data from OCR confirmation or manual entry."""
    temp_id: Optional[str] = None
    code: Optional[str] = None
    display_name: str
    brand: Optional[str] = None
    dose_number: Optional[int] = None
    applied_on: str  # date string "YYYY-MM-DD"
    next_due_on: Optional[str] = None
    source: str = "ocr"  # ocr | manual | vet
    confirmed_by_user: bool = True
    notes: Optional[str] = None
    record_type: str = "confirmed_application"  # confirmed_application | estimated_control_start
    clinic_name: Optional[str] = None
    veterinarian: Optional[str] = None
    alert_days_before: Optional[int] = Field(None, ge=0, le=60)
    reminder_date: Optional[str] = None
    reminder_time: Optional[str] = Field(None, max_length=5)
    reminder_enabled: bool = False


class BulkConfirmRequest(BaseModel):
    """Request to confirm multiple vaccines from card reading."""
    country_code: str
    species: str  # dog | cat
    vaccines: List[VaccinePayload]


class VaccineResponse(BaseModel):
    """Vaccine response with calculated next_due_on."""
    temp_id: Optional[str] = None
    id: str
    # Catalog fields (nullable – legacy records without catalog mapping return None)
    vaccine_code: Optional[str] = None    # e.g. "DOG_RABIES"
    country_code: Optional[str] = None   # e.g. "BR"
    code: Optional[str] = None            # kept for backward-compat (mirrors vaccine_code)
    canonical_name: Optional[str] = None  # normalised canonical name from catalog
    display_name: str
    brand: Optional[str] = None
    dose_number: Optional[int] = None
    applied_on: str
    next_due_on: Optional[str] = None
    next_due_source: str = "unknown"      # protocol | manual | unknown
    notes: Optional[str] = None
    source: str
    confirmed_by_user: bool
    record_type: str = "confirmed_application"
    alert_days_before: Optional[int] = None
    reminder_date: Optional[str] = None
    reminder_time: Optional[str] = None
    reminder_enabled: bool = False


class AlertsSummary(BaseModel):
    """Alerts summary for health snapshot."""
    overdue_count: int = 0
    overdue_names: List[str] = []
    upcoming_count: int = 0
    upcoming_within_days: int = 30


class BulkConfirmResponse(BaseModel):
    """Response after confirming vaccines."""
    status: str = "ok"
    pet_id: str
    country_code: str
    species: str
    vaccines: List[VaccineResponse]
    alerts: AlertsSummary


# ============================================================================
# Feeding / Food Stock Control Models
# ============================================================================

class FeedingSnapshot(BaseModel):
    """Feeding snapshot for health snapshot response."""
    estimated_end_date: Optional[str] = None
    estimated_days_left: Optional[int] = None
    low_stock: bool = False
    recommended_alert_date: Optional[str] = None
    food_brand: Optional[str] = None
    duration_days: Optional[int] = None
    reminder_time: Optional[str] = None
    mode: str = "kibble"
    enabled: bool = True
    items: List["FeedingPlanItemData"] = Field(default_factory=list)


class FeedingPlanItemPayload(BaseModel):
    id: Optional[str] = None
    label: Optional[str] = None
    food_brand: Optional[str] = None
    package_size_kg: Optional[float] = Field(None, ge=0.1, le=100)
    daily_amount_g: Optional[float] = Field(None, ge=1, le=10000)
    duration_days: Optional[int] = Field(None, ge=1, le=3650)
    last_refill_date: Optional[str] = None
    mode: str = Field("kibble", pattern="^(kibble|wet|mixed|homemade|prescribed)$")
    barcode: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=1000)
    is_primary: bool = False


class FeedingPlanItemData(BaseModel):
    id: str
    label: Optional[str] = None
    food_brand: Optional[str] = None
    package_size_kg: Optional[float] = None
    daily_amount_g: Optional[float] = None
    duration_days: Optional[int] = None
    last_refill_date: Optional[str] = None
    mode: str = "kibble"
    barcode: Optional[str] = None
    category: Optional[str] = None
    notes: Optional[str] = None
    is_primary: bool = False


class FeedingPlanCreateRequest(BaseModel):
    """
    Request to create/update feeding plan for a pet.
    
    All food-related fields are optional to support incomplete saves:
    - User might not have all info yet
    - Can fill in incrementally
    """
    species: Optional[str] = "dog"   # dog | cat
    country_code: Optional[str] = "BR"
    
    # Optional food details
    food_brand: Optional[str] = None
    package_size_kg: Optional[float] = Field(None, ge=0.1, le=100)
    daily_amount_g: Optional[float] = Field(None, ge=1, le=10000)
    duration_days: Optional[int] = Field(None, ge=1, le=3650)
    last_refill_date: Optional[str] = None  # date string "YYYY-MM-DD"
    
    # Configuration
    safety_buffer_days: int = Field(3, ge=0, le=30)
    meals_per_day: Optional[int] = Field(None, ge=1, le=10)
    mode: str = Field("kibble", pattern="^(kibble|wet|mixed|homemade|prescribed)$")
    notes: Optional[str] = Field(None, max_length=1000)
    
    # Control flags
    enabled: bool = True
    no_consumption_control: bool = False
    
    # Manual mode fields (when no_consumption_control=true)
    next_purchase_date: Optional[str] = None  # date string "YYYY-MM-DD"
    manual_reminder_days_before: Optional[int] = Field(None, ge=0, le=60)
    reminder_time: Optional[str] = Field(None, max_length=5)
    items: Optional[List[FeedingPlanItemPayload]] = None


class FeedingPlanResponse(BaseModel):
    """Response with feeding plan and calculated estimates."""
    status: str = "ok"
    pet_id: str
    plan: "FeedingPlanData"
    estimate: Optional["FeedingEstimate"] = None  # null if enabled=false or no_consumption_control=true


class FeedingPlanData(BaseModel):
    """Feeding plan data (persisted)."""
    pet_id: str
    species: str
    country_code: str
    
    food_brand: Optional[str] = None
    package_size_kg: Optional[float] = None
    daily_amount_g: Optional[float] = None
    duration_days: Optional[int] = None
    last_refill_date: Optional[str] = None
    
    safety_buffer_days: int
    meals_per_day: Optional[int] = None
    mode: str
    notes: Optional[str] = None
    
    enabled: bool
    no_consumption_control: bool
    
    # Manual mode fields
    next_purchase_date: Optional[str] = None
    manual_reminder_days_before: Optional[int] = None
    reminder_time: Optional[str] = None
    reminder_source: str = "calculated"
    items: List[FeedingPlanItemData] = Field(default_factory=list)
    
    created_at: str
    updated_at: str


class FeedingEstimate(BaseModel):
    """Calculated food stock estimates."""
    estimated_end_date: Optional[str] = None
    estimated_days_left: Optional[int] = None
    low_stock: bool = False
    recommended_alert_date: Optional[str] = None
    calculated_at: str


# ============================================================================
# Health Snapshot Models
# ============================================================================

class SnapshotAlerts(BaseModel):
    """Detailed alerts for snapshot."""
    vaccine_overdue_count: int = 0
    vaccine_overdue_names: List[str] = []
    upcoming_vaccines_count: int = 0
    upcoming_vaccines_within_days: int = 30


class HealthSnapshotResponse(BaseModel):
    """Complete health snapshot for  a pet."""
    status: str = "ok"
    pet_id: str
    vaccines: List[VaccineResponse]
    alerts: SnapshotAlerts
    feeding: Optional[FeedingSnapshot] = None
    snapshot_at: str  # ISO datetime


# ============================================================================
# Countries Catalog
# ============================================================================

class VaccineCodeInfo(BaseModel):
    """Minimal vaccine code entry."""
    vaccine_code: str
    display_name: str
    category: str        # core | non_core | lifestyle
    interval_days: Optional[int] = None


class CountryInfo(BaseModel):
    """Country meta and its relevant vaccine codes."""
    country_code: str
    label: str
    name_pt: str           # Portuguese name for the country
    locale: str
    supported: bool
    coverage_level: str = "BETA"  # BETA | GLOBAL
    core_vaccines: Dict[str, List[VaccineCodeInfo]]  # species → list


class CountriesResponse(BaseModel):
    """Response for /api/health/countries."""
    status: str = "ok"
    countries: List[CountryInfo]

"""Pydantic schemas for pet documents."""
from datetime import date
from typing import Optional
from pydantic import BaseModel, field_validator

from ..serialization.utc_instant import OptionalUtcInstant, UtcInstant


CATEGORY_ICONS = {
    "exam": "🔬",
    "vaccine": "💉",
    "prescription": "📋",
    "report": "📄",
    "comprovante": "🧾",
    "photo": "📸",
    "other": "📁",
}


class PetDocumentOut(BaseModel):
    id: str
    pet_id: str
    kind: str
    category: Optional[str] = None
    title: Optional[str] = None
    document_date: Optional[date] = None
    notes: Optional[str] = None
    source: str
    url_masked: Optional[str] = None
    # url_raw is intentionally excluded — never returned
    establishment_name: Optional[str] = None
    storage_key: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    event_id: Optional[str] = None   # linked timeline event
    created_at: UtcInstant
    deleted_at: OptionalUtcInstant = None
    icon: str = "📁"

    @field_validator("icon", mode="before")
    @classmethod
    def _icon(cls, v, info):
        cat = (info.data or {}).get("category") or ""
        return CATEGORY_ICONS.get(cat, "📁")

    model_config = {"from_attributes": True}


class AddLinkRequest(BaseModel):
    url: str
    title: Optional[str] = None
    category: Optional[str] = None
    document_date: Optional[date] = None
    notes: Optional[str] = None
    create_timeline_event: bool = False


class ImportLinkRequest(BaseModel):
    url: str
    category: Optional[str] = None
    document_date: Optional[date] = None


class ImportItem(BaseModel):
    url: str
    title: Optional[str] = None
    kind: Optional[str] = None  # 'pdf' | 'jpg' | 'file'


class ImportItemsRequest(BaseModel):
    import_id: Optional[str] = None   # from previous import-link response
    items: list[ImportItem]
    category: Optional[str] = None
    document_date: Optional[date] = None


class DiscoveredItem(BaseModel):
    url_masked: str
    title: str
    kind: str  # 'pdf' | 'jpg' | 'file'
    # url is NOT included — server stores it in import session


class ImportLinkResponse(BaseModel):
    import_id: str
    provider: str
    discovered: list[DiscoveredItem] = []
    imported: list[PetDocumentOut] = []
    link_saved: bool = False
    link_doc: Optional[PetDocumentOut] = None
    error: Optional[str] = None
    status: str  # 'discovered' | 'imported' | 'failed' | 'link_saved'

"""SQLAlchemy model for pet documents (cofre documental)."""
from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class PetDocument(Base):
    __tablename__ = "pet_documents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    pet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True, nullable=False
    )

    kind: Mapped[str] = mapped_column(String(10), nullable=False, default="file")  # 'file' | 'link'
    category: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)     # 'exam','vaccine','prescription','report','comprovante','photo','other'
    title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    document_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="upload")  # 'upload'|'link'|'import'

    # Link / import fields — url_raw stored but never returned in API response
    url_masked: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url_raw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Extracted metadata
    establishment_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # File fields
    storage_key: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    mime_type: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    size_bytes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # Linked timeline event (FK to events.id)
    event_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)

    pet: Mapped["Pet"] = relationship("Pet", back_populates="documents")


class PetDocumentImport(Base):
    """Registro de uma sessão de importação (audit trail)."""
    __tablename__ = "pet_document_imports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4())
    )
    pet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="generic")
    # 'queued' | 'discovered' | 'imported' | 'failed'
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="queued")
    url_masked: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # url_raw NEVER returned by API
    url_raw: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    discovered_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    imported_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # never contains URL
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )

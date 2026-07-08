"""Pet caretaker model — users who co-care for a pet they don't own."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..db import Base


class PetCaretaker(Base):
    __tablename__ = "pet_caretakers"
    __table_args__ = (UniqueConstraint("pet_id", "user_id"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    pet_id: Mapped[str] = mapped_column(String(36), ForeignKey("pets.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

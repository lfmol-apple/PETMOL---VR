"""
[PETMOL_PUSH_AUDIT] — Comprehensive logging framework for push notification debugging.

This module provides structured audit logging to track:
- Which reminder type is executing
- How many users are eligible
- Why each reminder fires or doesn't
- How many pushes are actually sent
- Errors and stack traces
"""

import logging
import json
from typing import Dict, List, Optional, Any
from datetime import datetime
from enum import Enum

# Create dedicated audit logger
audit_logger = logging.getLogger("petmol_push_audit")
if not audit_logger.handlers:
    handler = logging.StreamHandler()
    handler.setFormatter(
        logging.Formatter(
            "[PETMOL_PUSH_AUDIT] %(asctime)s | %(levelname)s | %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    audit_logger.addHandler(handler)
    audit_logger.setLevel(logging.DEBUG)


class ReminderType(Enum):
    """Enum for reminder types."""
    MEDICATION = "medication"
    TEST = "test"
    VACCINE = "vaccine"
    FLEA_TICK = "flea_tick"
    DEWORMER = "dewormer"
    COLLAR = "collar"
    GROOMING = "grooming"
    FOOD = "food"
    URGENT = "urgent"
    MONTHLY_DOCS = "monthly_docs"
    NO_CONTROL = "no_control"


class SkipReason(Enum):
    """Reasons why a reminder was skipped."""
    NO_SUBSCRIPTIONS = "no_subscriptions"
    NO_ELIGIBLE_RECORDS = "no_eligible_records"
    NOT_SUBSCRIBED = "not_subscribed"
    BEFORE_START_DATE = "before_start_date"
    AFTER_DUE_DATE = "after_due_date"
    TIME_WINDOW_CLOSED = "time_window_closed"
    REMINDER_DISABLED = "reminder_disabled"
    NO_DUE_DATE = "no_due_date"
    DEDUP_ACTIVE = "dedup_active"
    TREATMENT_COMPLETE = "treatment_complete"
    DAY_ALREADY_CLOSED = "day_already_closed"
    SLOT_ALREADY_CLOSED = "slot_already_closed"
    SPECIAL_CASE_LOGIC = "special_case_logic"
    PARSING_ERROR = "parsing_error"
    DATABASE_ERROR = "database_error"
    UNKNOWN = "unknown"


class AuditLog:
    """Structured audit log for a notification run."""

    def __init__(self, reminder_type: ReminderType, job_name: str):
        self.reminder_type = reminder_type
        self.job_name = job_name
        self.start_time = datetime.now()
        self.end_time: Optional[datetime] = None
        self.elapsed_ms: Optional[float] = None
        
        # Counters
        self.total_users = 0
        self.eligible_users = 0
        self.total_records = 0
        self.eligible_records = 0
        self.pushes_sent = 0
        self.pushes_deduped = 0
        self.errors = 0
        
        # Details
        self.skip_reasons: Dict[str, int] = {}
        self.errors_detail: List[str] = []
        self.sent_details: List[Dict[str, Any]] = []

    def add_skip(self, reason: SkipReason, detail: str = ""):
        """Record a skipped reminder."""
        key = f"{reason.value}:{detail}" if detail else reason.value
        self.skip_reasons[key] = self.skip_reasons.get(key, 0) + 1

    def add_error(self, error_msg: str):
        """Record an error."""
        self.errors += 1
        self.errors_detail.append(error_msg)
        audit_logger.error(f"[{self.reminder_type.value}] ERROR: {error_msg}")

    def add_sent(self, user_id: str, pet_id: str, record_id: str, details: Optional[Dict] = None):
        """Record a successful push send."""
        self.pushes_sent += 1
        self.sent_details.append({
            "user_id": user_id,
            "pet_id": pet_id,
            "record_id": record_id,
            "details": details or {},
            "timestamp": datetime.now().isoformat(),
        })

    def finalize(self):
        """Calculate final stats and log summary."""
        self.end_time = datetime.now()
        self.elapsed_ms = (self.end_time - self.start_time).total_seconds() * 1000

    def log_summary(self):
        """Log audit summary."""
        self.finalize()
        summary = {
            "reminder_type": self.reminder_type.value,
            "job_name": self.job_name,
            "elapsed_ms": round(self.elapsed_ms, 2),
            "total_users": self.total_users,
            "eligible_users": self.eligible_users,
            "total_records": self.total_records,
            "eligible_records": self.eligible_records,
            "pushes_sent": self.pushes_sent,
            "pushes_deduped": self.pushes_deduped,
            "errors": self.errors,
            "skip_reasons": self.skip_reasons,
        }
        audit_logger.info(f"SUMMARY: {json.dumps(summary, default=str)}")

        if self.errors > 0:
            audit_logger.warning(f"ERRORS ({self.errors}): {'; '.join(self.errors_detail[:5])}")

        if self.pushes_sent > 0:
            audit_logger.info(f"SENT {self.pushes_sent} pushes in {self.elapsed_ms:.0f}ms")


def create_audit_log(reminder_type: ReminderType, job_name: str) -> AuditLog:
    """Factory function to create an audit log."""
    audit_logger.debug(f"START {reminder_type.value} job ({job_name})")
    return AuditLog(reminder_type, job_name)

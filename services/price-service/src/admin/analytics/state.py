"""Deterministic feature-adoption state machine.

Every per-pet / per-tutor feature resolves to exactly one of:

    NEVER_CONFIGURED  — no real record for this feature
    ACTIVE            — configured and the next action is on track
    STALE             — configured, but the next action is overdue (recent)
    INACTIVE          — configured long ago and clearly abandoned

The rules are 100% derived from the operational database (dates on the
records themselves). No analytics events, no LLM, no guessing. Thresholds
live here as named constants so the dashboard and the docs agree.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum
from typing import Optional


class FeatureState(str, Enum):
    NEVER_CONFIGURED = "never_configured"
    ACTIVE = "active"
    STALE = "stale"
    INACTIVE = "inactive"


CONFIGURED_STATES = (FeatureState.ACTIVE, FeatureState.STALE, FeatureState.INACTIVE)


# ── Thresholds (days) ────────────────────────────────────────────────────────
# A feature whose "next action" is at most GRACE days in the past still counts
# as ACTIVE (people are a few days late). Past that, it is STALE until it is
# more than ABANDON days overdue, at which point it is INACTIVE (abandoned).
#
# Recurring health controls (vaccine / parasite / grooming / medication) have
# a real next-due date on the record, so GRACE/ABANDON are applied to that.
# Feeding has no hard next-due, so it is classified on record recency.

GRACE_DAYS = 21
ABANDON_DAYS = 120

# Feeding: enabled plan touched within FEEDING_ACTIVE_DAYS is ACTIVE;
# older than FEEDING_ABANDON_DAYS (or disabled) is INACTIVE; in between STALE.
FEEDING_ACTIVE_DAYS = 150
FEEDING_ABANDON_DAYS = 300


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def classify_by_next_due(
    next_due: Optional[datetime],
    *,
    last_touch: Optional[datetime] = None,
    now: Optional[datetime] = None,
    grace_days: int = GRACE_DAYS,
    abandon_days: int = ABANDON_DAYS,
) -> FeatureState:
    """Classify a recurring control that carries a next-due date.

    Caller has already established at least one non-deleted record exists,
    so the result is never NEVER_CONFIGURED here.
    """
    now = now or _utcnow()
    next_due = _aware(next_due)
    last_touch = _aware(last_touch)

    if next_due is not None:
        overdue_days = (now - next_due).total_seconds() / 86400.0
        if overdue_days <= grace_days:
            return FeatureState.ACTIVE
        if overdue_days <= abandon_days:
            return FeatureState.STALE
        return FeatureState.INACTIVE

    # No next-due on the record — fall back to how recently it was touched.
    if last_touch is None:
        return FeatureState.STALE
    age_days = (now - last_touch).total_seconds() / 86400.0
    if age_days <= grace_days:
        return FeatureState.ACTIVE
    if age_days <= abandon_days:
        return FeatureState.STALE
    return FeatureState.INACTIVE


def classify_feeding(
    *,
    has_data: bool,
    enabled: bool,
    updated_at: Optional[datetime],
    deleted: bool,
    now: Optional[datetime] = None,
) -> FeatureState:
    now = now or _utcnow()
    if deleted or not has_data:
        return FeatureState.NEVER_CONFIGURED
    updated_at = _aware(updated_at)
    if not enabled:
        return FeatureState.INACTIVE
    if updated_at is None:
        return FeatureState.STALE
    age_days = (now - updated_at).total_seconds() / 86400.0
    if age_days <= FEEDING_ACTIVE_DAYS:
        return FeatureState.ACTIVE
    if age_days <= FEEDING_ABANDON_DAYS:
        return FeatureState.STALE
    return FeatureState.INACTIVE


def classify_by_recency(
    last_touch: Optional[datetime],
    *,
    now: Optional[datetime] = None,
    active_days: int = GRACE_DAYS,
    abandon_days: int = ABANDON_DAYS,
) -> FeatureState:
    """For features with no next-due date at all (weight logs, vet visits)."""
    now = now or _utcnow()
    last_touch = _aware(last_touch)
    if last_touch is None:
        return FeatureState.NEVER_CONFIGURED
    age_days = (now - last_touch).total_seconds() / 86400.0
    if age_days <= active_days:
        return FeatureState.ACTIVE
    if age_days <= abandon_days:
        return FeatureState.STALE
    return FeatureState.INACTIVE


@dataclass(frozen=True)
class FeatureDef:
    """One row of the feature matrix."""

    key: str
    label: str
    # 'operational' — state derived from PETMOL tables (per pet)
    # 'operational_user' — derived from PETMOL tables (per tutor, not per pet)
    # 'behavioral' — adoption only, from analytics events (no per-pet state)
    kind: str
    scope: str  # 'pet' | 'user'
    note: str = ""


# The registry the /features endpoint iterates. Keys are stable API contract.
FEATURE_REGISTRY: tuple[FeatureDef, ...] = (
    FeatureDef("food", "Alimentação", "operational", "pet",
               "feeding_plans — plano habilitado com dados de ração/consumo."),
    FeatureDef("vaccine", "Vacinas", "operational", "pet",
               "vaccine_records não deletados; estado pela próxima dose."),
    FeatureDef("dewormer", "Vermífugo", "operational", "pet",
               "parasite_control_records type in (dewormer, heartworm)."),
    FeatureDef("flea_tick", "Antipulgas / carrapato", "operational", "pet",
               "parasite_control_records type in (flea_tick, collar, leishmaniasis)."),
    FeatureDef("grooming", "Banho & tosa", "operational", "pet",
               "grooming_records não deletados; próxima visita recomendada."),
    FeatureDef("medication", "Medicação", "operational", "pet",
               "events type='medication' não deletados."),
    FeatureDef("weight", "Peso", "operational", "pet",
               "pets.weight_value ou events type='weight_check'."),
    FeatureDef("vet_visit", "Consultas", "operational", "pet",
               "events type='vet_appointment' não deletados."),
    FeatureDef("rg", "RG do pet (público)", "operational", "pet",
               "rg_public com is_public=true."),
    FeatureDef("missing_pet", "Pet Sumido / SOS", "operational_user", "user",
               "missing_pets criados pelo tutor."),
    FeatureDef("family", "Família & cuidadores", "operational_user", "user",
               "family_members OR pet_caretakers envolvendo o tutor."),
    FeatureDef("push", "Notificações push", "operational_user", "user",
               "push_subscriptions/native_push_tokens ativos (não disabled)."),
    FeatureDef("store", "Loja / comércio", "behavioral", "user",
               "analytics: usuários únicos com store_opened."),
)

FEATURE_BY_KEY = {f.key: f for f in FEATURE_REGISTRY}

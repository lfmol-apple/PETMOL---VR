from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import sys


SERVICE_DIR = Path(__file__).resolve().parents[1]

if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.notifications import send_care_pushes  # noqa: E402
import src.notifications as notifications  # noqa: E402


def _frozen_datetime(now_utc: datetime):
    class FrozenDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return now_utc.astimezone(tz) if tz is not None else now_utc

    return FrozenDateTime


class FakeQuery:
    def __init__(self, rows):
        self._rows = rows

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return list(self._rows)

    def first(self):
        return self._rows[0] if self._rows else None

    def count(self):
        return len(self._rows)


class FakeSession:
    def __init__(self, mapping):
        self._mapping = mapping

    def query(self, model):
        name = model.__name__ if isinstance(model, type) else model.class_.__name__
        return FakeQuery(self._mapping.get(name, []))

    def close(self):
        return None


def test_send_care_pushes_uses_vaccine_tutor_time_and_advance(monkeypatch):
    pet = SimpleNamespace(id="pet-1", name="Luna", user_id="user-1")
    vaccine = SimpleNamespace(
        id="vac-1",
        pet_id="pet-1",
        vaccine_name="Raiva",
        vaccine_code="DOG_RABIES",
        applied_date=datetime(2026, 1, 1, 12, 0, tzinfo=timezone.utc),
        next_dose_date=datetime(2026, 4, 20, 12, 0, tzinfo=timezone.utc),
        alert_days_before=3,
        reminder_time="14:25",
        deleted=False,
    )
    sent_payloads = []

    monkeypatch.setattr(notifications, "datetime", _frozen_datetime(datetime(2026, 4, 17, 17, 25, tzinfo=timezone.utc)))
    monkeypatch.setattr(notifications, "_load_subscriptions", lambda: {"user-1": {"endpoint": "https://example.test/push", "p256dh": "k", "auth": "a"}})
    monkeypatch.setattr(notifications, "SessionLocal", lambda: FakeSession({
        "Pet": [pet],
        "VaccineRecord": [vaccine],
        "ParasiteControlRecord": [],
        "GroomingRecord": [],
    }))
    monkeypatch.setattr(notifications, "_send_push", lambda subscription, payload: sent_payloads.append(payload) or True)
    monkeypatch.setattr(notifications, "_upsert_pend", lambda **_kwargs: None)

    send_care_pushes()

    assert len(sent_payloads) == 1
    assert sent_payloads[0]["tag"] == "petmol-care-vaccine-vac-1-start-2026-04-17"


def test_send_care_pushes_uses_parasite_reminder_time(monkeypatch):
    pet = SimpleNamespace(id="pet-1", name="Thor", user_id="user-1")
    parasite = SimpleNamespace(
        id="par-1",
        pet_id="pet-1",
        type="dewormer",
        product_name="Drontal",
        date_applied=datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc),
        next_due_date=datetime(2026, 4, 17, 12, 0, tzinfo=timezone.utc),
        alert_days_before=5,
        reminder_days=5,
        reminder_time="10:45",
        deleted=False,
    )
    sent_payloads = []

    monkeypatch.setattr(notifications, "datetime", _frozen_datetime(datetime(2026, 4, 17, 13, 45, tzinfo=timezone.utc)))
    monkeypatch.setattr(notifications, "_load_subscriptions", lambda: {"user-1": {"endpoint": "https://example.test/push", "p256dh": "k", "auth": "a"}})
    monkeypatch.setattr(notifications, "SessionLocal", lambda: FakeSession({
        "Pet": [pet],
        "VaccineRecord": [],
        "ParasiteControlRecord": [parasite],
        "GroomingRecord": [],
    }))
    monkeypatch.setattr(notifications, "_send_push", lambda subscription, payload: sent_payloads.append(payload) or True)
    monkeypatch.setattr(notifications, "_upsert_pend", lambda **_kwargs: None)

    send_care_pushes()

    assert len(sent_payloads) == 1
    assert sent_payloads[0]["tag"] == "petmol-care-dewormer-par-1-due-2026-04-17"



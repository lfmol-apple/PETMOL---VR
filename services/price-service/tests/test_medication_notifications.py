from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
import sys


SERVICE_DIR = Path(__file__).resolve().parents[1]

if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.notifications import send_medication_pushes  # noqa: E402
import src.notifications as notifications  # noqa: E402


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        base = cls(2026, 4, 17, 12, 0, tzinfo=timezone.utc)  # 09:00 BRT — outside quiet hours
        return base.astimezone(tz) if tz is not None else base


class FakeQuery:
    def __init__(self, events):
        self._events = events

    def filter(self, *_args, **_kwargs):
        return self

    def all(self):
        return list(self._events)

    def first(self):
        return self._events[0] if self._events else None

    def count(self):
        return len(self._events)


class FakeSession:
    def __init__(self, events):
        self._events = events

    def query(self, _model):
        return FakeQuery(self._events)

    def close(self):
        return None


def test_send_medication_pushes_sends_due_active_treatment(monkeypatch):
    sent_payloads = []
    event = SimpleNamespace(
        id="event-1",
        user_id="user-1",
        pet_id="pet-1",
        title="Antibiótico",
        status="active",
        next_due_date=None,
        scheduled_at=datetime(2026, 4, 17, 0, 0, tzinfo=timezone.utc),
        extra_data='{"reminder_time":"09:00","reminder_times":["09:00"],"treatment_days":7,"applied_dates":[],"skipped_dates":[]}',
    )

    monkeypatch.setattr(notifications, "datetime", FrozenDateTime)
    monkeypatch.setattr(
        notifications,
        "_load_subscriptions",
        lambda: {"user-1": {"endpoint": "https://example.test/push", "p256dh": "k", "auth": "a"}},
    )
    monkeypatch.setattr(notifications, "SessionLocal", lambda: FakeSession([event]))
    monkeypatch.setattr(
        notifications,
        "_send_push",
        lambda subscription, payload: sent_payloads.append((subscription, payload)) or True,
    )

    send_medication_pushes()

    assert len(sent_payloads) == 1
    _subscription, payload = sent_payloads[0]
    assert payload["title"] == "💊 Antibiótico"
    assert payload["body"] == "Hora de aplicar (09:00)"
    assert payload["data"]["url"].startswith("/home?modal=medication&petId=pet-1&eventId=event-1")


def test_send_medication_pushes_skips_completed_treatment(monkeypatch):
    sent_payloads = []
    event = SimpleNamespace(
        id="event-2",
        user_id="user-1",
        pet_id="pet-1",
        title="Vermífugo",
        status="completed",
        next_due_date=None,
        scheduled_at=datetime(2026, 4, 17, 0, 0, tzinfo=timezone.utc),
        extra_data='{"reminder_time":"09:00","reminder_times":["09:00"],"treatment_days":7,"applied_dates":[],"skipped_dates":[]}',
    )

    class FilteringQuery(FakeQuery):
        def all(self):
            return [ev for ev in self._events if ev.status in {"active", "pending", "rescheduled"}]

    class FilteringSession(FakeSession):
        def query(self, _model):
            return FilteringQuery(self._events)

    monkeypatch.setattr(notifications, "datetime", FrozenDateTime)
    monkeypatch.setattr(
        notifications,
        "_load_subscriptions",
        lambda: {"user-1": {"endpoint": "https://example.test/push", "p256dh": "k", "auth": "a"}},
    )
    monkeypatch.setattr(notifications, "SessionLocal", lambda: FilteringSession([event]))
    monkeypatch.setattr(
        notifications,
        "_send_push",
        lambda subscription, payload: sent_payloads.append((subscription, payload)) or True,
    )

    send_medication_pushes()

    assert sent_payloads == []
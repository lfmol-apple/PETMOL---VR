"""Marcador de "versão atual" do app (user_auth/legacy_marker.py, docs/PLANO_ASSINATURA.md §5)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from src.user_auth import legacy_marker as lm

UA_OLD = "Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile/15E148 PetmolApp"
UA_NEW = "Mozilla/5.0 (iPhone) AppleWebKit/605 Mobile/15E148 PetmolApp/2.0"
UA_WEB = "Mozilla/5.0 (Macintosh) Chrome/120 Safari/537"


def _user():
    return SimpleNamespace(native_app_first_seen_at=None, native_app_first_version=None, legacy_app_user=False)


def _set(monkeypatch, enabled: bool, until: str = ""):
    monkeypatch.setattr(lm, "get_settings", lambda: SimpleNamespace(legacy_marker_enabled=enabled, legacy_marker_until=until))


@pytest.fixture
def on(monkeypatch):
    _set(monkeypatch, True)


def test_parse_ua():
    assert lm.parse_native_ua(UA_OLD) == (True, None)
    assert lm.parse_native_ua(UA_NEW) == (True, "2.0")
    assert lm.parse_native_ua("PetmolApp/2.1.3-beta") == (True, "2.1.3-beta")
    assert lm.parse_native_ua(UA_WEB) == (False, None)
    assert lm.parse_native_ua(None) == (False, None)
    assert lm.parse_native_ua("") == (False, None)


def test_flag_off_does_nothing(monkeypatch):
    _set(monkeypatch, False)
    u, db = _user(), MagicMock()
    assert lm.record_native_client(db, u, UA_OLD) is False
    assert u.native_app_first_seen_at is None and u.legacy_app_user is False
    db.commit.assert_not_called()


def test_old_shell_marks_legacy(on):
    u, db = _user(), MagicMock()
    assert lm.record_native_client(db, u, UA_OLD) is True
    assert u.legacy_app_user is True
    assert u.native_app_first_version == "unversioned"
    assert u.native_app_first_seen_at is not None
    db.commit.assert_called_once()


def test_new_shell_is_not_legacy(on):
    u, db = _user(), MagicMock()
    assert lm.record_native_client(db, u, UA_NEW) is True
    assert u.legacy_app_user is False and u.native_app_first_version == "2.0"


def test_web_browser_is_not_marked(on):
    u, db = _user(), MagicMock()
    assert lm.record_native_client(db, u, UA_WEB) is False
    assert u.native_app_first_seen_at is None
    db.commit.assert_not_called()


def test_written_once_never_undone(on):
    u, db = _user(), MagicMock()
    lm.record_native_client(db, u, UA_OLD)
    first = u.native_app_first_seen_at
    # upgrade depois: não desfaz nem reescreve
    assert lm.record_native_client(db, u, UA_NEW) is False
    assert u.legacy_app_user is True and u.native_app_first_seen_at == first
    assert db.commit.call_count == 1


def test_cutoff_blocks_new_legacy(monkeypatch):
    past = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
    _set(monkeypatch, True, past)
    u, db = _user(), MagicMock()
    assert lm.record_native_client(db, u, UA_OLD) is True
    assert u.legacy_app_user is False  # visto, mas depois do limite
    future = (datetime.now(timezone.utc) + timedelta(days=1)).isoformat()
    _set(monkeypatch, True, future)
    u2 = _user()
    lm.record_native_client(db, u2, UA_OLD)
    assert u2.legacy_app_user is True


def test_invalid_cutoff_is_ignored(on, monkeypatch):
    _set(monkeypatch, True, "isso-nao-e-data")
    u = _user()
    lm.record_native_client(MagicMock(), u, UA_OLD)
    assert u.legacy_app_user is True


def test_never_raises_and_rolls_back(on):
    db = MagicMock()
    db.commit.side_effect = RuntimeError("db fora")
    u = _user()
    assert lm.record_native_client(db, u, UA_OLD) is False
    db.rollback.assert_called_once()

from pathlib import Path
import sys


SERVICE_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = SERVICE_DIR.parents[1]

if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from src.config import Settings


def test_settings_load_notifications_env_from_repo_root(monkeypatch):
    for key in ("FEATURE_REMINDERS_PUSH", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "DEBUG"):
        monkeypatch.delenv(key, raising=False)

    monkeypatch.chdir(REPO_ROOT)

    settings = Settings()

    assert settings.feature_reminders_push is True
    assert bool(settings.vapid_public_key) is True
    assert bool(settings.vapid_private_key) is True


def test_debug_accepts_release_string(monkeypatch):
    monkeypatch.chdir(SERVICE_DIR)
    monkeypatch.setenv("DEBUG", "release")

    settings = Settings()

    assert settings.debug is False

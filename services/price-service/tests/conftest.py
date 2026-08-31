"""Shared pytest fixtures.

Critical: DATABASE_URL must be overridden to a throwaway SQLite file BEFORE
`src.config`/`src.db`/`src.main` are imported anywhere. The real `.env` in
this directory points at a Postgres "prod mirror" — importing the app
without this override would build a SQLAlchemy engine against that database.

Test isolation: the suite must be hermetic. `Settings` normally reads
`services/price-service/.env` (and `.secrets/.env`), so on a developer
machine flags like AWIN_ENABLED / SHOPEE_* would leak in and make tests
non-deterministic (this is exactly what broke the AWIN master-gate tests).
Below we disable dotenv loading entirely for the test process — config comes
only from code defaults plus the explicit os.environ overrides here.
"""
import os
import sys
from pathlib import Path

_TESTS_DIR = Path(__file__).resolve().parent
_SERVICE_DIR = _TESTS_DIR.parent
_TEST_DB_PATH = _TESTS_DIR / "_test_petmol.db"

os.environ["DATABASE_URL"] = f"sqlite:///{_TEST_DB_PATH}"
os.environ.setdefault("ENV", "dev")

sys.path.insert(0, str(_SERVICE_DIR))

# Hermetic config: the test process must not inherit the developer's local
# services/price-service/.env (or .secrets/.env).
#   1. pydantic-settings reads those files via SettingsConfigDict(env_file=...)
#      → disable that below;
#   2. src.main also calls dotenv.load_dotenv(".env") at import, which dumps
#      every key into os.environ (highest precedence) → neutralise it before
#      importing src.main. This is what made the AWIN master-gate tests
#      inherit AWIN_ENABLED from the machine.
import dotenv  # noqa: E402

dotenv.load_dotenv = lambda *a, **k: False  # type: ignore[assignment]

import src.config as _config  # noqa: E402

_config.Settings.model_config["env_file"] = None
if hasattr(_config.get_settings, "cache_clear"):
    _config.get_settings.cache_clear()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from src.main import app  # noqa: E402
from src.db import Base, engine  # noqa: E402

# The push-reminder scheduler starts a real background thread on a
# per-second cron and has nothing to do with the flows under test — drop it
# so test runs don't spawn a scheduler per session.
app.router.on_startup = [
    h for h in app.router.on_startup if getattr(h, "__name__", "") != "start_push_scheduler"
]


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c
    _TEST_DB_PATH.unlink(missing_ok=True)


@pytest.fixture(autouse=True)
def _reset_db():
    """Fresh schema before every test — flows are independent, order-proof."""
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def _hermetic_settings():
    """`get_settings()` is `@lru_cache`d. A test that does
    `monkeypatch.setenv(...) + get_settings.cache_clear()` leaves a mutated
    Settings cached; the next test that reads `get_settings()` without
    clearing (e.g. the AWIN master-gate tests) then sees the leaked value.
    Clear the cache around every test so each one starts from code defaults.
    """
    from src.config import get_settings

    get_settings.cache_clear()
    yield
    get_settings.cache_clear()

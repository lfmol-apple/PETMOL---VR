"""Shared pytest fixtures.

Critical: DATABASE_URL must be overridden to a throwaway SQLite file BEFORE
`src.config`/`src.db`/`src.main` are imported anywhere. The real `.env` in
this directory points at a Postgres "prod mirror" — importing the app
without this override would build a SQLAlchemy engine against that database.
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

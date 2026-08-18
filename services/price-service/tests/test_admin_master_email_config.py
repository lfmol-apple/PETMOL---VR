"""admin_master_email no longer has a hardcoded personal-email default — it
must come from ADMIN_MASTER_EMAIL, and prod must refuse to start without it
(empty or whitespace-only counts as unset). These are plain Settings/
validate_prod unit tests: no DB, no TestClient, no app import needed.
"""
from src.config import Settings

# Valid values for every OTHER validate_prod() check, so each test below
# isolates the admin_master_email assertion specifically.
_OTHER_VALID_PROD_FIELDS = dict(
    jwt_secret="a-sufficiently-random-jwt-secret-value",
    zip_hmac_secret="a-sufficiently-random-zip-secret-value",
    database_url="postgresql://user:pass@host/db",
    storage_backend="local",
)


def test_prod_without_admin_master_email_fails_startup():
    settings = Settings(env="prod", admin_master_email=None, **_OTHER_VALID_PROD_FIELDS)
    try:
        settings.validate_prod()
        assert False, "validate_prod() should have raised"
    except RuntimeError as e:
        assert "ADMIN_MASTER_EMAIL" in str(e)


def test_prod_with_admin_master_email_passes_that_check():
    settings = Settings(env="prod", admin_master_email="ops@example.com", **_OTHER_VALID_PROD_FIELDS)
    settings.validate_prod()  # must not raise


def test_dev_without_admin_master_email_is_allowed():
    settings = Settings(env="dev", admin_master_email=None)
    settings.validate_prod()  # no-op outside prod — must not raise


def test_prod_with_whitespace_only_admin_master_email_fails_startup():
    settings = Settings(env="prod", admin_master_email="   ", **_OTHER_VALID_PROD_FIELDS)
    try:
        settings.validate_prod()
        assert False, "validate_prod() should have raised"
    except RuntimeError as e:
        assert "ADMIN_MASTER_EMAIL" in str(e)


def test_error_message_never_reveals_an_email_address():
    """Generic check: no error message from validate_prod() should ever
    contain an email address, regardless of which one was previously
    configured or hardcoded."""
    settings = Settings(env="prod", admin_master_email=None, **_OTHER_VALID_PROD_FIELDS)
    try:
        settings.validate_prod()
        assert False, "validate_prod() should have raised"
    except RuntimeError as e:
        assert "@" not in str(e)

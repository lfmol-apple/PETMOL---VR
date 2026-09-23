"""O rótulo do período no painel mostra horário de São Paulo (nunca ISO em UTC)."""
from datetime import datetime, timezone

from src.admin.analytics.locations_bi import _fmt_sp


def test_fmt_sp_converts_utc_to_sao_paulo():
    assert _fmt_sp(datetime(2026, 9, 23, 22, 0, tzinfo=timezone.utc)) == "23/09/2026 19:00"


def test_fmt_sp_crosses_midnight_and_handles_naive_as_utc():
    assert _fmt_sp(datetime(2026, 9, 24, 2, 59, 59)) == "23/09/2026 23:59"
    assert _fmt_sp(None) == "—"

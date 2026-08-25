"""
GET /handoff/shopping — auditoria de monetização (25/08/2026, ver
docs/AFFILIATES.md): este endpoint sempre redirecionava pra /go/shopping,
uma busca PURA do Google Shopping sem afiliado nenhum — violava "NO
MONETIZATION PROOF → NO BUY BUTTON". Não era um fallback, era o único
comportamento. Em produção (affiliate_only_commerce_enforced), agora
recusa fail-closed em vez de abrir esse link.
"""
from __future__ import annotations

import pytest

from src.config import get_settings


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    monkeypatch.delenv("AFFILIATE_ONLY_COMMERCE", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_handoff_shopping_blocked_when_affiliate_only_enforced(client, monkeypatch):
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "true")
    get_settings.cache_clear()

    resp = client.get("/handoff/shopping", params={"query": "racao para cachorro"}, follow_redirects=False)

    assert resp.status_code == 302
    assert resp.headers["location"] != "/go/shopping"
    assert "not_monetized" in resp.headers["location"]


def test_handoff_shopping_still_works_when_affiliate_only_disabled(client, monkeypatch):
    """Modo estrito é opt-out explícito (dev/teste) — não um estado
    novo inventado; comportamento anterior preservado quando desligado."""
    monkeypatch.setenv("AFFILIATE_ONLY_COMMERCE", "false")
    get_settings.cache_clear()

    resp = client.get("/handoff/shopping", params={"query": "racao para cachorro"}, follow_redirects=False)

    assert resp.status_code == 302
    assert resp.headers["location"].startswith("/go/shopping")

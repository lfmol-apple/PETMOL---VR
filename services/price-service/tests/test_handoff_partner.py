"""
handoff_partner.py (GET /api/handoff/shop, /api/handoff/doglife) —
router legado, descoberto sem cobertura de teste na auditoria de
25/08/2026 (ver docs/AFFILIATES.md). Dois bugs reais corrigidos aqui:

1. `dest` era um open redirect — o cliente podia mandar qualquer URL e
   o backend redirecionava pra lá quando a env var do parceiro estava
   vazia. Removido; estes testes provam que passar `dest` não tem
   nenhum efeito no destino.
2. `partner=petz` ignorava is_petz_publicly_servable() (o gate único
   criado pra fechar exatamente essa classe de bug em
   /commerce/petz-direct-link). Agora passa pelo mesmo gate.
"""
from __future__ import annotations

import pytest

from src.config import get_settings


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    monkeypatch.delenv("PETZ_AFFILIATE_ENABLED", raising=False)
    monkeypatch.delenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", raising=False)
    monkeypatch.delenv("COBASI_AFFILIATE_MODE", raising=False)
    monkeypatch.delenv("COBASI_AFFILIATE_URL", raising=False)
    monkeypatch.delenv("PETZ_AFFILIATE_URL", raising=False)
    monkeypatch.delenv("PETLOVE_AFFILIATE_ENABLED", raising=False)
    monkeypatch.delenv("PETLOVE_DOG_LIFE_URL", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_handoff_shop_petz_blocked_without_master_gate(client, monkeypatch):
    """O gate único vem LIGADO por padrão desde 04/09/2026 (ver
    test_handoff_shop_petz_works_by_default abaixo, sem monkeypatch
    nenhum) — este teste passou a cobrir o kill-switch
    (petz_publicly_disabled) explicitamente ligado, defesa em
    profundidade."""
    monkeypatch.setenv("PETZ_PUBLICLY_DISABLED", "true")
    get_settings.cache_clear()

    resp = client.get("/handoff/shop", params={"partner": "petz"}, follow_redirects=False)
    assert resp.status_code == 503
    assert resp.json()["error"] == "partner_url_not_configured"


def test_handoff_shop_petz_ignores_dest_open_redirect(client, monkeypatch):
    """Regressão: `dest` já foi um open redirect. Mesmo passando um alvo
    arbitrário, com o gate explicitamente desligado o resultado continua
    sendo 503 — nunca um redirect pro valor de `dest`."""
    monkeypatch.setenv("PETZ_PUBLICLY_DISABLED", "true")
    get_settings.cache_clear()

    resp = client.get(
        "/handoff/shop",
        params={"partner": "petz", "dest": "https://evil.example/phish"},
        follow_redirects=False,
    )
    assert resp.status_code == 503


def test_handoff_shop_petz_works_by_default(client):
    """Desde 04/09/2026 as três flags do gate único já vêm ligadas por
    padrão (ver config.py/docs/PETZ_COMMISSION_VALIDATION.md — prova
    comercial documentada com compra real em 29/08/2026) — SEM nenhum
    monkeypatch, o handoff já funciona."""
    resp = client.get("/handoff/shop", params={"partner": "petz"}, follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"] == "https://www.petz.com.br/parceiro/pettmol"


def test_handoff_shop_petz_works_once_gate_verified(client, monkeypatch):
    monkeypatch.setenv("PETZ_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETZ_COUPON_ATTRIBUTION_VERIFIED", "true")
    monkeypatch.setenv("PETZ_PUBLICLY_DISABLED", "false")
    get_settings.cache_clear()

    resp = client.get("/handoff/shop", params={"partner": "petz"}, follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"] == "https://www.petz.com.br/parceiro/pettmol"


def test_handoff_shop_cobasi_blocked_when_mode_disabled(client, monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()

    resp = client.get("/handoff/shop", params={"partner": "cobasi"}, follow_redirects=False)
    assert resp.status_code == 503


def test_handoff_shop_cobasi_ignores_dest_open_redirect(client, monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "disabled")
    get_settings.cache_clear()

    resp = client.get(
        "/handoff/shop",
        params={"partner": "cobasi", "dest": "https://evil.example/phish"},
        follow_redirects=False,
    )
    assert resp.status_code == 503


def test_handoff_shop_cobasi_works_once_mode_enabled(client, monkeypatch):
    monkeypatch.setenv("COBASI_AFFILIATE_MODE", "cached")
    get_settings.cache_clear()

    resp = client.get("/handoff/shop", params={"partner": "cobasi"}, follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("https://minhaloja.cobasi.com.br")


def test_handoff_shop_amazon_always_disabled(client):
    resp = client.get("/handoff/shop", params={"partner": "amazon"}, follow_redirects=False)
    assert resp.status_code == 503


def test_handoff_doglife_ignores_dest_open_redirect(client):
    resp = client.get(
        "/handoff/doglife",
        params={"dest": "https://evil.example/phish"},
        follow_redirects=False,
    )
    assert resp.status_code == 503


def test_petlove_disabled_by_default(client, monkeypatch):
    monkeypatch.setenv("PETLOVE_DOG_LIFE_URL", "https://www.petlove.com.br/dog-life")
    get_settings.cache_clear()

    resp = client.get("/handoff/doglife", follow_redirects=False)
    assert resp.status_code == 503


def test_petlove_url_alone_not_enough(client, monkeypatch):
    monkeypatch.setenv("PETLOVE_DOG_LIFE_URL", "https://www.petlove.com.br/dog-life")
    get_settings.cache_clear()

    resp = client.get("/handoff/shop", params={"partner": "petlove"}, follow_redirects=False)
    assert resp.status_code == 503


def test_handoff_doglife_rejects_non_https_configured_url(client, monkeypatch):
    monkeypatch.setenv("PETLOVE_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETLOVE_DOG_LIFE_URL", "javascript:alert(1)")
    get_settings.cache_clear()

    resp = client.get("/handoff/doglife", follow_redirects=False)
    assert resp.status_code == 503


def test_petlove_verified_gate(client, monkeypatch):
    monkeypatch.setenv("PETLOVE_AFFILIATE_ENABLED", "true")
    monkeypatch.setenv("PETLOVE_DOG_LIFE_URL", "https://www.petlove.com.br/dog-life")
    get_settings.cache_clear()

    resp = client.get("/handoff/doglife", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"] == "https://www.petlove.com.br/dog-life"

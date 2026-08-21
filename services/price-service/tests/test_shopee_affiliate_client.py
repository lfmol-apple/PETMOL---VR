"""
shopee_affiliate_client — assinatura da requisição e parsing da resposta.
Nunca chama a rede de verdade: httpx.post é substituído por monkeypatch
(a integração real já foi validada manualmente contra a API ao vivo em
21/08/2026 — introspecção de schema + busca real, ver histórico da sessão).
"""
import hashlib
import json

import pytest

from src.config import get_settings
import src.shopee_affiliate_client as client_module
from src.shopee_affiliate_client import ShopeeAffiliateError, _sign, search_product_offers


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    # setenv("") em vez de delenv: Settings lê de um .env real neste
    # repositório (SettingsConfigDict(env_file=...)) — só apagar a env var
    # do processo não sobrepõe um valor já presente no arquivo. Um valor
    # vazio no ambiente tem precedência sobre o .env e ainda é "falsy" pro
    # client (`if not app_id or not secret`).
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_ID", "")
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_SECRET", "")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _configure_credentials(monkeypatch, app_id="123456", secret="s3cr3t"):
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_ID", app_id)
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_SECRET", secret)
    get_settings.cache_clear()


class _FakeResponse:
    def __init__(self, json_body, status_code=200):
        self._json_body = json_body
        self.status_code = status_code

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self._json_body


def test_sign_e_deterministico_e_bate_com_a_formula_documentada():
    # sig = SHA256(AppId + Timestamp + Payload + Secret) — confirmado por
    # introspecção ao vivo contra a API real (ver shopee_affiliate_client.py).
    expected = hashlib.sha256(b"123456" + b"1000" + b'{"a":1}' + b"s3cr3t").hexdigest()
    assert _sign("123456", "s3cr3t", 1000, '{"a":1}') == expected


def test_sem_credenciais_configuradas_levanta_erro_sem_chamar_rede(monkeypatch):
    called = {"value": False}
    monkeypatch.setattr(client_module.httpx, "post", lambda *a, **k: called.__setitem__("value", True))

    with pytest.raises(ShopeeAffiliateError):
        search_product_offers("racao para cachorro")
    assert called["value"] is False


def test_keyword_vazio_retorna_lista_vazia_sem_chamar_rede(monkeypatch):
    called = {"value": False}
    monkeypatch.setattr(client_module.httpx, "post", lambda *a, **k: called.__setitem__("value", True))
    _configure_credentials(monkeypatch)

    assert search_product_offers("   ") == []
    assert called["value"] is False


def test_monta_header_de_autenticacao_correto_e_devolve_os_nodes(monkeypatch):
    captured = {}

    def _fake_post(url, content, headers, timeout):
        captured["url"] = url
        captured["headers"] = headers
        captured["body"] = json.loads(content)
        return _FakeResponse({"data": {"productOfferV2": {"nodes": [{"itemId": 1, "productName": "X"}]}}})

    monkeypatch.setattr(client_module.httpx, "post", _fake_post)
    _configure_credentials(monkeypatch, app_id="123456", secret="s3cr3t")

    nodes = search_product_offers("racao para cachorro", limit=5)

    assert nodes == [{"itemId": 1, "productName": "X"}]
    assert captured["url"] == client_module.API_URL
    assert captured["body"]["variables"] == {"keyword": "racao para cachorro", "page": 1, "limit": 5}
    auth = captured["headers"]["Authorization"]
    assert auth.startswith("SHA256 Credential=123456,Timestamp=")
    assert ",Signature=" in auth


def test_resposta_com_errors_levanta_shopee_affiliate_error(monkeypatch):
    monkeypatch.setattr(
        client_module.httpx, "post",
        lambda *a, **k: _FakeResponse({"errors": [{"message": "Invalid Signature"}]}),
    )
    _configure_credentials(monkeypatch)

    with pytest.raises(ShopeeAffiliateError):
        search_product_offers("racao para cachorro")

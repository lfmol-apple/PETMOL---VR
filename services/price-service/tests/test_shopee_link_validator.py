"""
shopee_link_validator.py — nunca gera link, só valida um link oficial já
fornecido pelo Portal do Afiliado. Ver docstring do módulo.
"""
import httpx
import pytest

from src.config import get_settings
import src.shopee_link_validator as validator_module
from src.shopee_link_validator import (
    InvalidShopeeAffiliateUrlError,
    is_allowed_shopee_host,
    validate_manual_shopee_affiliate_url,
    validate_shopee_affiliate_url,
)


@pytest.fixture(autouse=True)
def _app_id_configured(monkeypatch):
    # Mesmo padrão de test_shopee_affiliate_client.py: setenv("") sobrepõe
    # o .env real deste repo; setenv(valor) configura pro teste.
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_ID", "18392191175")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_valid_official_link_passes_through_unchanged():
    url = "https://s.shopee.com.br/3AbCdEfGh?utm_content=xyz&extra=1"
    assert validate_shopee_affiliate_url(url) == url


def test_apex_domain_also_accepted():
    url = "https://shopee.com.br/produto-i.123.456"
    assert validate_shopee_affiliate_url(url) == url


def test_parameters_never_altered():
    """Nenhum parâmetro é adicionado, removido ou reordenado — a URL
    validada é byte-a-byte igual à recebida."""
    url = "https://s.shopee.com.br/abc?z=1&a=2&m=3"
    assert validate_shopee_affiliate_url(url) == url


def test_rejects_http():
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("http://s.shopee.com.br/abc")


def test_rejects_dangerous_schemes():
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("javascript:alert(1)")
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("data:text/html,<script>alert(1)</script>")


def test_rejects_fake_domain_prefix_attack():
    """"shopee.com.br" como prefixo de outro domínio — não é um subdomínio real."""
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("https://shopee.com.br.golpe.com/abc")


def test_rejects_fake_domain_glued_attack():
    """Domínio colado sem o ponto de subdomínio."""
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("https://golpeshopee.com.br/abc")


def test_rejects_unrelated_domain():
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("https://mercadolivre.com.br/produto")


def test_rejects_empty_url():
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("")


def test_rejects_malformed_url():
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_shopee_affiliate_url("não é uma url")


def test_is_allowed_shopee_host_accepts_real_subdomain():
    assert is_allowed_shopee_host("s.shopee.com.br") is True
    assert is_allowed_shopee_host("shopee.com.br") is True
    assert is_allowed_shopee_host("SHOPEE.COM.BR") is True  # case-insensitive


def test_is_allowed_shopee_host_rejects_fake():
    assert is_allowed_shopee_host("shopee.com.br.golpe.com") is False
    assert is_allowed_shopee_host("golpeshopee.com.br") is False
    assert is_allowed_shopee_host("") is False


# ── validate_manual_shopee_affiliate_url — link colado à mão por um admin ──
# Mais rigoroso que o validador base: exige PROVA de rastreio da nossa
# conta, não só o domínio — porque aqui a URL vem de um humano navegando,
# não de uma chamada nossa à API (que já nasce monetizada).

def test_manual_rejeita_pagina_comum_de_produto_sem_rastreio():
    """O caso real que motivou isto: link de produto igual ao que se pega
    clicando 'Procurar manualmente na Shopee' e copiando a barra de
    endereço — sem nenhum parâmetro de afiliado."""
    url = "https://shopee.com.br/Petisco-Biscrok-i.1194006916.22693494739?extraParams=%7B%22display_model_id%22%3A209600309974%7D"
    with pytest.raises(InvalidShopeeAffiliateUrlError, match="rastreio"):
        validate_manual_shopee_affiliate_url(url)


def test_manual_aceita_link_longo_com_utm_source_da_conta():
    url = "https://shopee.com.br/search?keyword=pet&utm_content=petmol-lojadopet---&utm_source=an_18392191175"
    assert validate_manual_shopee_affiliate_url(url) == url


def test_manual_aceita_link_longo_com_mmp_pid_da_conta():
    url = "https://shopee.com.br/produto-i.1.2?mmp_pid=an_18392191175"
    assert validate_manual_shopee_affiliate_url(url) == url


def test_manual_rejeita_link_longo_com_rastreio_de_outra_conta():
    url = "https://shopee.com.br/produto-i.1.2?utm_source=an_99999999999"
    with pytest.raises(InvalidShopeeAffiliateUrlError, match="rastreio"):
        validate_manual_shopee_affiliate_url(url)


def test_manual_resolve_link_curto_e_aceita_quando_bate_o_rastreio(monkeypatch):
    resolved = httpx.Response(200, request=httpx.Request("GET", "https://shopee.com.br/x?mmp_pid=an_18392191175"))

    class _FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, url): return resolved

    monkeypatch.setattr(validator_module.httpx, "Client", _FakeClient)
    url = "https://s.shopee.com.br/3AbCdEfGh"
    assert validate_manual_shopee_affiliate_url(url) == url


def test_manual_resolve_link_curto_e_rejeita_quando_nao_bate_o_rastreio(monkeypatch):
    resolved = httpx.Response(200, request=httpx.Request("GET", "https://shopee.com.br/x"))  # sem rastreio nenhum

    class _FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, url): return resolved

    monkeypatch.setattr(validator_module.httpx, "Client", _FakeClient)
    with pytest.raises(InvalidShopeeAffiliateUrlError, match="rastreio"):
        validate_manual_shopee_affiliate_url("https://s.shopee.com.br/naoConfiavel")


def test_manual_falha_fechada_quando_a_resolucao_do_link_curto_da_erro_de_rede(monkeypatch):
    class _FakeClient:
        def __init__(self, *a, **kw): pass
        def __enter__(self): return self
        def __exit__(self, *a): return False
        def get(self, url): raise httpx.ConnectTimeout("timeout")

    monkeypatch.setattr(validator_module.httpx, "Client", _FakeClient)
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_manual_shopee_affiliate_url("https://s.shopee.com.br/abc")


def test_manual_sem_app_id_configurado_recusa_tudo(monkeypatch):
    monkeypatch.setenv("SHOPEE_AFFILIATE_APP_ID", "")
    get_settings.cache_clear()
    with pytest.raises(InvalidShopeeAffiliateUrlError, match="AFFILIATE_APP_ID"):
        validate_manual_shopee_affiliate_url("https://shopee.com.br/produto-i.1.2?utm_source=an_18392191175")


def test_manual_ainda_recusa_dominio_desconhecido():
    with pytest.raises(InvalidShopeeAffiliateUrlError):
        validate_manual_shopee_affiliate_url("https://mercadolivre.com.br/produto")

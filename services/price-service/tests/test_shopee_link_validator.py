"""
shopee_link_validator.py — nunca gera link, só valida um link oficial já
fornecido pelo Portal do Afiliado. Ver docstring do módulo.
"""
import pytest

from src.shopee_link_validator import (
    InvalidShopeeAffiliateUrlError,
    is_allowed_shopee_host,
    validate_shopee_affiliate_url,
)


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

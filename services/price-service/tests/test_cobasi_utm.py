"""
build_cobasi_affiliate_url — função pura, sem rede. Ver docs/AFFILIATES.md
e cobasi_utm.py: NÃO ativada em produção por padrão (cobasi_affiliate_mode
= "cached"), mas precisa estar correta e testada para quando for.
"""
import pytest

from src.cobasi_utm import InvalidCobasiUrlError, build_cobasi_affiliate_url


def test_adds_required_utm_params():
    url = build_cobasi_affiliate_url("https://www.cobasi.com.br/racao-royal-canin-3827380/p")
    assert "utm_source=mais" in url
    assert "utm_medium=maisplataforma" in url
    assert "utm_campaign=lojapetmol" in url


def test_preserves_path_sku():
    url = build_cobasi_affiliate_url("https://www.cobasi.com.br/racao-royal-canin-caes-urinary-s-o-racas-pequenas-small-dog-3827380/p")
    assert url.startswith("https://www.cobasi.com.br/racao-royal-canin-caes-urinary-s-o-racas-pequenas-small-dog-3827380/p")


def test_preserves_existing_non_utm_query_params():
    url = build_cobasi_affiliate_url("https://www.cobasi.com.br/produto/p?sku=12345&cor=azul")
    assert "sku=12345" in url
    assert "cor=azul" in url


def test_removes_conflicting_utm_params():
    url = build_cobasi_affiliate_url("https://www.cobasi.com.br/produto/p?utm_source=outro&utm_campaign=velha")
    assert "utm_source=outro" not in url
    assert "utm_campaign=velha" not in url
    assert url.count("utm_source=") == 1
    assert url.count("utm_campaign=") == 1


def test_does_not_duplicate_params_on_repeated_calls():
    once = build_cobasi_affiliate_url("https://www.cobasi.com.br/produto/p?sku=1")
    twice = build_cobasi_affiliate_url(once)
    assert twice.count("utm_source=") == 1
    assert twice.count("sku=1") == 1


def test_rejects_non_https():
    with pytest.raises(InvalidCobasiUrlError):
        build_cobasi_affiliate_url("http://www.cobasi.com.br/produto/p")


def test_rejects_non_cobasi_domain():
    with pytest.raises(InvalidCobasiUrlError):
        build_cobasi_affiliate_url("https://www.petz.com.br/produto/p")


def test_rejects_javascript_scheme():
    with pytest.raises(InvalidCobasiUrlError):
        build_cobasi_affiliate_url("javascript:alert(1)")


def test_rejects_empty_url():
    with pytest.raises(InvalidCobasiUrlError):
        build_cobasi_affiliate_url("")

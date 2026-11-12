"""Push de produto (admin): link colado → loja conhecida, nome conferido, toque abre o produto direto; teste vai para as 3 contas."""
import re
from pathlib import Path
from types import SimpleNamespace

import httpx
import pytest

import src.admin.broadcast_router as br
import src.admin.product_link as pl
from src.admin.activation_campaign_router import ActivationCampaignContact, ActivationOptOut
from src.admin.deps import get_current_admin
from src.db import SessionLocal
from src.health.models import FeedingPlan
from src.notifications import PushSubscription
from src.pets.models import Pet
from src.pets.vaccine_models import VaccineRecord
from tests.test_admin_broadcast import _mk_pet, _mk_user  # reaproveita os auxiliares


# ── validação do link ────────────────────────────────────────────────────────

@pytest.mark.parametrize("url", [
    "https://amzn.to/3SN1ORt", "https://www.amazon.com.br/dp/B07FQ6F1PZ?tag=amazonpetmol-20",
    "https://s.shopee.com.br/4AzW1leQcW", "https://www.cobasi.com.br/racao-x-123/p", "https://meli.la/1Ab2Cd3",
])
def test_links_de_lojas_conhecidas_passam(url):
    assert pl.validate_product_url("  " + url + " ") == url


@pytest.mark.parametrize("url,trecho", [
    ("", "Cole o link"),
    ("http://amzn.to/abc", "https://"),
    ("https://evil.com/amazon.com.br", "loja parceira"),
    ("https://amazon.com.br.evil.com/x", "loja parceira"),
    ("https://user:pw@amzn.to/x", "inválido"),
    ("https://amzn.to:8443/x", "inválido"),
    ("https://localhost/x", "loja parceira"),
    ("https://127.0.0.1/x", "loja parceira"),
    ("javascript:alert(1)", "https://"),
    ("https://amzn.to/a b", "espaços"),
    ("https://amzn.to/" + "a" * 800, "longo"),
])
def test_links_perigosos_ou_de_fora_sao_recusados(url, trecho):
    with pytest.raises(pl.ProductLinkError) as e:
        pl.validate_product_url(url)
    assert trecho in str(e.value)


# ── título ───────────────────────────────────────────────────────────────────

@pytest.mark.parametrize("bruto,esperado", [
    ("Pet Supplies : KONG Classic Stuffable Dog Toy, Natural Rubber (Pack of 2)", "KONG Classic Stuffable Dog Toy, Natural Rubber (Pack of 2)"),
    ("Amazon.com.br: Ração Golden Fórmula 15kg : Produtos para Animais de Estimação", "Ração Golden Fórmula 15kg"),
    ("Alimentação Natural Chef Bob para Cães Carne | Cobasi", "Alimentação Natural Chef Bob para Cães Carne"),
    ("Petisco Biscrok 500g | Shopee Brasil", "Petisco Biscrok 500g"),
    ("Coleira Scalibor 48cm - Mercado Livre", "Coleira Scalibor 48cm"),
    ("  Ra&ccedil;&atilde;o   Premier\n Cães ", "Ração Premier Cães"),
])
def test_titulo_e_limpo(bruto, esperado):
    assert pl.clean_title(bruto) == esperado


@pytest.mark.parametrize("bruto", ["", None, "Mercado Libre", "Shopee Brasil", "Cobasi - Sem resultados encontrados", "Não foi possível encontrar esta página",
                                   "Robot Check", "Just a moment...", "Amazon.com", "Verificação de conta"])
def test_titulo_generico_ou_de_erro_e_descartado(bruto):
    assert pl.clean_title(bruto) is None


def test_extrai_nome_do_dado_estruturado_antes_do_titulo_da_pagina():
    page = ('<html><head><title>Loja | Cobasi</title><meta property="og:title" content="Outro | Cobasi">'
            '<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Product","name":"Ração Golden 15kg"}]}</script></head></html>')
    assert pl.extract_title(page) == "Ração Golden 15kg"
    assert pl.extract_title('<meta content="Petisco X | Shopee Brasil" property="og:title">') == "Petisco X"
    assert pl.extract_title("<html><title>Mercado Libre</title></html>") is None


# ── leitura do link (rede simulada) ──────────────────────────────────────────

def _transport(rotas):
    def handler(request: httpx.Request) -> httpx.Response:
        r = rotas.get(str(request.url))
        if r is None:
            return httpx.Response(404, text="nada")
        return r
    return httpx.MockTransport(handler)


def _html(title):
    return httpx.Response(200, headers={"content-type": "text/html; charset=utf-8"}, text=f"<html><head><title>{title}</title><meta property='og:image' content='https://img.x/p.jpg'></head></html>")


OK_HOST = lambda host: True


def test_encurtador_amazon_redireciona_e_o_nome_e_lido_mas_o_link_enviado_e_o_colado():
    t = _transport({
        "https://amzn.to/3SN1ORt": httpx.Response(302, headers={"location": "https://www.amazon.com/dp/B0F7KCRV4M?lv=shuf"}),
        "https://www.amazon.com/dp/B0F7KCRV4M?lv=shuf": _html("Pet Supplies : KONG Classic Stuffable Dog Toy"),
    })
    r = pl.fetch_product_info("https://amzn.to/3SN1ORt", transport=t, host_ok=OK_HOST)
    assert r["readable"] and r["title"] == "KONG Classic Stuffable Dog Toy" and r["store"] == "Amazon"
    assert r["url"] == "https://amzn.to/3SN1ORt" and r["final_host"] == "www.amazon.com" and r["image"] == "https://img.x/p.jpg"


def test_loja_que_nao_deixa_ler_pede_o_nome_manual():
    t = _transport({"https://shopee.com.br/Petisco-i.1.2": _html("")})
    r = pl.fetch_product_info("https://shopee.com.br/Petisco-i.1.2", transport=t, host_ok=OK_HOST)
    assert not r["readable"] and r["title"] is None and "Digite o nome" in r["reason"]


def test_redirecionamento_para_fora_das_lojas_e_bloqueado():
    t = _transport({"https://amzn.to/x": httpx.Response(302, headers={"location": "https://evil.example.com/phishing"})})
    r = pl.fetch_product_info("https://amzn.to/x", transport=t, host_ok=OK_HOST)
    assert not r["readable"] and "fora das lojas" in r["reason"]


def test_redirecionamento_para_http_e_bloqueado():
    t = _transport({"https://amzn.to/x": httpx.Response(302, headers={"location": "http://www.amazon.com/x"})})
    r = pl.fetch_product_info("https://amzn.to/x", transport=t, host_ok=OK_HOST)
    assert not r["readable"] and "sem https" in r["reason"]


def test_endereco_nao_publico_e_recusado_antes_de_conectar():
    chamadas = []
    t = httpx.MockTransport(lambda req: (chamadas.append(1) or httpx.Response(200, text="x")))
    r = pl.fetch_product_info("https://amzn.to/x", transport=t, host_ok=lambda h: False)
    assert not r["readable"] and "segurança" in r["reason"] and chamadas == []


def test_dns_interno_e_recusado_de_verdade(monkeypatch):
    monkeypatch.setattr(pl.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("10.0.0.5", 443))])
    assert pl._public_host("amzn.to") is False
    monkeypatch.setattr(pl.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("127.0.0.1", 443))])
    assert pl._public_host("amzn.to") is False
    monkeypatch.setattr(pl.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("8.8.8.8", 443)), (2, 1, 6, "", ("192.168.0.1", 443))])
    assert pl._public_host("amzn.to") is False          # basta UM endereço interno para recusar
    monkeypatch.setattr(pl.socket, "getaddrinfo", lambda *a, **k: [(2, 1, 6, "", ("52.1.2.3", 443))])
    assert pl._public_host("amzn.to") is True


def test_loop_de_redirecionamento_e_erros_de_rede_nao_derrubam():
    t = _transport({"https://amzn.to/a": httpx.Response(302, headers={"location": "https://amzn.to/a"})})
    assert "Redirecionamentos demais" in pl.fetch_product_info("https://amzn.to/a", transport=t, host_ok=OK_HOST)["reason"]
    t2 = httpx.MockTransport(lambda req: (_ for _ in ()).throw(httpx.ConnectError("sem rede")))
    assert "Digite o nome" in pl.fetch_product_info("https://amzn.to/a", transport=t2, host_ok=OK_HOST)["reason"]
    t3 = _transport({"https://amzn.to/pdf": httpx.Response(200, headers={"content-type": "application/pdf"}, content=b"%PDF")})
    assert "não abre uma página" in pl.fetch_product_info("https://amzn.to/pdf", transport=t3, host_ok=OK_HOST)["reason"]
    t4 = _transport({"https://amzn.to/x": httpx.Response(503)})
    assert "503" in pl.fetch_product_info("https://amzn.to/x", transport=t4, host_ok=OK_HOST)["reason"]


def test_lista_de_lojas_do_servidor_e_do_app_sao_a_mesma():
    ts = Path(__file__).resolve().parents[3] / "apps/web/src/features/commerce/pushProductLink.ts"
    if not ts.exists():
        pytest.skip("front-end não está neste checkout")
    hosts = set(re.findall(r"'([a-z0-9.\-]+\.[a-z]{2,})'", ts.read_text(encoding="utf-8").split("PUSH_PRODUCT_HOSTS", 1)[1].split("] as const", 1)[0]))
    assert hosts == set(pl.STORE_HOSTS)


# ── push: payload, validação do envio e três contas de teste ─────────────────

def test_toque_abre_o_produto_direto():
    p = br._push_payload("B1", "t", "b", "produto", "https://amzn.to/3SN1ORt?x=1&y=2")
    assert p["data"]["url"] == "/home?produto=https%3A%2F%2Famzn.to%2F3SN1ORt%3Fx%3D1%26y%3D2&b=B1"
    assert br._push_payload("B1", "t", "b", "produto")["data"]["url"] == "/home?b=B1"          # sem link: não inventa destino
    assert br._push_payload("B1", "t", "b", "loja")["data"]["url"] == "/home?modal=loja&b=B1"  # o resto não mudou
    assert {g["key"]: g["open"] for g in br.GOAL_CATALOG}["link_produto"] == "produto" and "produto" in br.DESTINATIONS


@pytest.fixture()
def adm(client, monkeypatch):
    sent = []
    monkeypatch.setattr(br, "push_to_user", lambda uid, payload: (sent.append((uid, payload)) or 1))
    monkeypatch.setattr(br, "_spawn", lambda fn, *a: fn(*a))
    monkeypatch.setattr(br.time, "sleep", lambda s: None)
    with SessionLocal() as db:
        for model in (br.AdminBroadcastRecipient, br.AdminBroadcast, ActivationCampaignContact, ActivationOptOut,
                      FeedingPlan, VaccineRecord, PushSubscription, Pet):
            db.query(model).delete()
        db.commit()
        dono = _mk_user(db, "Leonardo Dono", "dono@example.com")
        henrique = _mk_user(db, "Henrique Admin", "henrique@example.com")
        vep = _mk_user(db, "VEP Consorcio", "vep@example.com", push=False)      # esta conta ainda não ativou notificação
        _mk_pet(db, dono, "Baby")
        _mk_pet(db, henrique, "Rex")
    monkeypatch.setattr(br, "admin_allowed_emails", lambda settings: {"dono@example.com", "henrique@example.com", "vep@example.com"})
    client.app.dependency_overrides[get_current_admin] = lambda: (SimpleNamespace(id=dono), None)
    yield SimpleNamespace(client=client, sent=sent, dono=dono, henrique=henrique, vep=vep)
    client.app.dependency_overrides.pop(get_current_admin, None)


def _body(**kw):
    base = {"message": "Oferta de ração hoje.", "segment": "todos", "audience": {"kind": "test"},
            "product_url": "https://amzn.to/3SN1ORt", "product_title": "KONG Classic"}
    base.update(kw)
    return base


def test_teste_vai_para_as_tres_contas_e_avisa_quem_nao_tem_notificacao(adm):
    prev = adm.client.post("/v1/admin/broadcast/preview", json=_body()).json()
    assert prev["will_send"] == 3 and prev["destination"] == "produto" and prev["product"]["title"] == "KONG Classic"
    contas = {c["name"]: c["has_push"] for c in prev["test_accounts"]}
    assert contas == {"Leonardo": True, "Henrique": True, "VEP": False}

    r = adm.client.post("/v1/admin/broadcast/send", json={**_body(), "confirm_count": 3})
    assert r.status_code == 200, r.text
    assert {uid for uid, _ in adm.sent} == {adm.dono, adm.henrique, adm.vep}
    url = adm.sent[0][1]["data"]["url"]
    assert url.startswith("/home?produto=https%3A%2F%2Famzn.to%2F3SN1ORt&b=")
    hist = adm.client.get("/v1/admin/broadcast/history").json()["items"][0]
    assert hist["product"] == {"title": "KONG Classic", "url": "https://amzn.to/3SN1ORt"} and hist["audience_kind"] == "test"


def test_quem_pediu_o_teste_sempre_entra_mesmo_fora_da_lista(adm, monkeypatch):
    monkeypatch.setattr(br, "admin_allowed_emails", lambda settings: {"henrique@example.com"})
    prev = adm.client.post("/v1/admin/broadcast/preview", json=_body()).json()
    assert prev["will_send"] == 2          # Henrique (da lista) + o dono (quem pediu)


def test_envio_sem_nome_conferido_ou_com_link_de_fora_e_recusado(adm):
    sem_nome = adm.client.post("/v1/admin/broadcast/preview", json=_body(product_title="  "))
    assert sem_nome.status_code == 422 and "Confira o nome" in sem_nome.text
    de_fora = adm.client.post("/v1/admin/broadcast/preview", json=_body(product_url="https://evil.com/x"))
    assert de_fora.status_code == 422 and "loja parceira" in de_fora.text
    sem_link = adm.client.post("/v1/admin/broadcast/preview", json={"message": "oi aqui", "audience": {"kind": "test"}, "goal": "link_produto"})
    assert sem_link.status_code == 422 and "Cole o link" in sem_link.text
    sem_link2 = adm.client.post("/v1/admin/broadcast/preview", json={"message": "oi aqui", "audience": {"kind": "test"}, "destination": "produto"})
    assert sem_link2.status_code == 422


def test_envio_normal_sem_link_nao_mudou(adm):
    body = {"message": "cadastre a ração de {pets}.", "segment": "todos", "audience": {"kind": "test"}}
    r = adm.client.post("/v1/admin/broadcast/send", json={**body, "confirm_count": 3})
    assert r.status_code == 200
    assert all(p["data"]["url"].startswith("/home?b=") for _, p in adm.sent)
    assert adm.client.get("/v1/admin/broadcast/history").json()["items"][0]["product"] is None


def test_endpoint_de_conferencia_devolve_nome_ou_pede_manual(adm, monkeypatch):
    def falso(url):
        pl.validate_product_url(url)            # a validação é a de verdade; só a rede é simulada
        return {"url": url, "store": "Amazon", "host": "amzn.to", "final_host": "www.amazon.com", "title": "KONG Classic",
                "image": None, "readable": True, "reason": None}
    monkeypatch.setattr(br, "fetch_product_info", falso)
    ok = adm.client.post("/v1/admin/broadcast/link-preview", json={"url": "https://amzn.to/3SN1ORt"}).json()
    assert ok["title"] == "KONG Classic" and ok["store"] == "Amazon" and ok["readable"] is True
    ruim = adm.client.post("/v1/admin/broadcast/link-preview", json={"url": "https://evil.com/x"})
    assert ruim.status_code == 422 and "loja parceira" in ruim.text


def test_sem_login_de_admin_o_endpoint_recusa(client):
    client.app.dependency_overrides.pop(get_current_admin, None)
    assert client.post("/v1/admin/broadcast/link-preview", json={"url": "https://amzn.to/x"}).status_code in (401, 403)

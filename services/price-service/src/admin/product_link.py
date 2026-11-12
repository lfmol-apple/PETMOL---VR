"""Link de produto para o push do admin: só lojas conhecidas, só https, e leitura do NOME do produto para o dono conferir.

Por que existe: o dono cola o link de um produto (Amazon, Cobasi, Shopee, Mercado Livre…) e a notificação abre esse produto
direto na loja. Antes de enviar, o painel mostra o nome do produto lido do próprio link ("só para conferir").

Segurança (o endereço vem de um formulário, mesmo que só de admin):
  · só https e só domínios da lista de lojas abaixo (inclusive depois de cada redirecionamento);
  · antes de conectar, o domínio é resolvido e qualquer endereço que não seja público (localhost, rede interna) é recusado;
  · poucos redirecionamentos, tempo curto e limite de tamanho.
Honestidade: nem toda loja deixa ler o nome (Shopee carrega o nome por JavaScript; o Mercado Livre pede login). Nesses
casos `title` vem vazio e o dono digita o nome. O link que vai na notificação é SEMPRE o colado (com a etiqueta de afiliado
dele), nunca o endereço final do redirecionamento.

A lista de domínios abaixo é espelhada em apps/web/src/features/commerce/pushProductLink.ts (um teste confere que são iguais).
"""
from __future__ import annotations

import html
import ipaddress
import json
import re
import socket
from typing import Callable, Optional
from urllib.parse import urljoin, urlparse

import httpx

# host → nome da loja (para o painel mostrar "Amazon", "Cobasi"…)
STORE_HOSTS: dict[str, str] = {
    # Amazon (amzn.to é o encurtador; os produtos do PETMOL também resolvem para amazon.com)
    "www.amazon.com.br": "Amazon", "amazon.com.br": "Amazon", "amzn.to": "Amazon", "www.amazon.com": "Amazon", "amazon.com": "Amazon",
    # Shopee
    "shopee.com.br": "Shopee", "www.shopee.com.br": "Shopee", "s.shopee.com.br": "Shopee",
    # Mercado Livre
    "www.mercadolivre.com.br": "Mercado Livre", "mercadolivre.com.br": "Mercado Livre", "lista.mercadolivre.com.br": "Mercado Livre",
    "produto.mercadolivre.com.br": "Mercado Livre", "meli.la": "Mercado Livre",
    # Cobasi (MAIS) e Awin (rede de afiliados que redireciona para a Cobasi/Zee)
    "www.cobasi.com.br": "Cobasi", "cobasi.com.br": "Cobasi", "minhaloja.cobasi.com.br": "Cobasi", "mais.app": "Cobasi",
    "www.awin1.com": "Awin", "awin1.com": "Awin",
    # Petz, Petlove, Zee
    "www.petz.com.br": "Petz", "petz.com.br": "Petz",
    "www.petlove.com.br": "Petlove", "petlove.com.br": "Petlove",
    "www.zeedog.com.br": "Zee.Dog", "zeedog.com.br": "Zee.Dog", "www.zeenow.com.br": "Zee.Now", "zeenow.com.br": "Zee.Now",
}

MAX_URL_LEN = 700
MAX_TITLE_LEN = 140
MAX_REDIRECTS = 6
MAX_BYTES = 600_000
TIMEOUT_S = 8.0
UA = "Mozilla/5.0 (compatible; PETMOL-LinkPreview/1.0; +https://www.petmol.com.br)"


class ProductLinkError(ValueError):
    """Link recusado (mensagem em português para mostrar ao dono)."""


def validate_product_url(raw: str) -> str:
    """Normaliza e valida. Devolve a URL (https, sem espaços) ou levanta ProductLinkError."""
    url = (raw or "").strip()
    if not url:
        raise ProductLinkError("Cole o link do produto.")
    if len(url) > MAX_URL_LEN:
        raise ProductLinkError("O link é longo demais.")
    if re.search(r"\s", url):
        raise ProductLinkError("O link não pode ter espaços.")
    try:
        u = urlparse(url)
    except ValueError:
        raise ProductLinkError("Link inválido.")
    if u.scheme != "https":
        raise ProductLinkError("O link precisa começar com https://")
    host = (u.hostname or "").lower()
    if u.username or u.password or (u.port not in (None, 443)):
        raise ProductLinkError("Link inválido.")
    if host not in STORE_HOSTS:
        raise ProductLinkError("Este endereço não é de uma loja parceira (Amazon, Cobasi, Shopee, Mercado Livre, Petz, Petlove, Zee).")
    return url


def store_label(url: str) -> str:
    return STORE_HOSTS.get((urlparse(url).hostname or "").lower(), "")


# ── Título ───────────────────────────────────────────────────────────────────

_GENERIC_TITLES = re.compile(
    r"^(mercado (libre|livre)|shopee( brasil)?|amazon(\.com(\.br)?)?|cobasi|petz|petlove|zee\.?(dog|now)|home|início|inicio)$"
    r"|sem resultados|não foi possível encontrar|pagina nao encontrada|página não encontrada|access denied|robot check|captcha|just a moment"
    r"|attention required|^404|^403|not found|verifica(ç|c)ão|account.verification", re.I)
_STORE_SUFFIX = re.compile(r"\s*[|–—-]\s*(Cobasi|Shopee( Brasil)?|Mercado (Livre|Libre)|Petz|Petlove|Zee\.?(Dog|Now)|Amazon(\.com(\.br)?)?)\b.*$", re.I)
_AMAZON_PREFIX = re.compile(r"^\s*Amazon(\.com(\.br)?)?\s*[:|–—-]\s*", re.I)
# Trechos que são só a CATEGORIA da Amazon ("Pet Supplies : Produto" / "Produto : Produtos para Animais de Estimação")
_CATEGORY = re.compile(r"^(pet supplies|pet products|dog supplies|cat supplies|produtos para animais( de estimação)?|animais de estimação|pet shop|"
                       r"cachorros?|gatos?|ração e petiscos|brinquedos?|home & kitchen|health & household|toys & games)$", re.I)


def clean_title(raw: Optional[str]) -> Optional[str]:
    """Limpa o título de página (tira o nome da loja, categoria da Amazon, espaços) e descarta títulos genéricos/de erro."""
    t = html.unescape(raw or "")
    t = re.sub(r"\s+", " ", t).strip()
    if not t:
        return None
    t = _AMAZON_PREFIX.sub("", t)
    if " : " in t:                                  # Amazon: "Pet Supplies : Produto" / "Produto : Categoria" → tira a categoria
        partes = [p.strip() for p in t.split(" : ") if p.strip()]
        sobra = [p for p in partes if not _CATEGORY.match(p)]
        t = max(sobra or partes, key=len)
    t = _STORE_SUFFIX.sub("", t).strip(" -|–—:")
    if not t or _GENERIC_TITLES.search(t):
        return None
    return t if len(t) <= MAX_TITLE_LEN else t[:MAX_TITLE_LEN - 1].rstrip() + "…"


def _meta(content: str, key: str) -> Optional[str]:
    for pat in (rf'<meta[^>]+(?:property|name)=["\']{key}["\'][^>]+content=["\']([^"\']+)',
                rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{key}["\']'):
        m = re.search(pat, content, re.I)
        if m:
            return m.group(1)
    return None


def _jsonld_product_name(content: str) -> Optional[str]:
    for block in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', content, re.I | re.S):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        stack = data if isinstance(data, list) else [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
            elif isinstance(node, dict):
                kind = node.get("@type")
                kinds = kind if isinstance(kind, list) else [kind]
                if "Product" in kinds and isinstance(node.get("name"), str):
                    return node["name"]
                stack.extend(v for v in node.values() if isinstance(v, (dict, list)))
    return None


def extract_title(page: str) -> Optional[str]:
    """Ordem: dado estruturado do produto → og:title → twitter:title → <title>. Devolve o primeiro que passar na limpeza."""
    candidates = [_jsonld_product_name(page), _meta(page, "og:title"), _meta(page, "twitter:title")]
    m = re.search(r"<title[^>]*>(.*?)</title>", page, re.I | re.S)
    candidates.append(m.group(1) if m else None)
    for c in candidates:
        t = clean_title(c)
        if t:
            return t
    return None


# ── Rede (com proteção) ──────────────────────────────────────────────────────

def _public_host(host: str) -> bool:
    """True só se TODOS os endereços do domínio forem públicos (nada de localhost/rede interna)."""
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError:
        return False
    addrs = {i[4][0] for i in infos}
    return bool(addrs) and all(ipaddress.ip_address(a).is_global for a in addrs)


def fetch_product_info(raw_url: str, *, transport: Optional[httpx.BaseTransport] = None,
                       host_ok: Callable[[str], bool] = _public_host) -> dict:
    """Lê o nome do produto do link. Nunca levanta por falha de rede: devolve readable=False + motivo.
    ProductLinkError só para link inválido (loja desconhecida, http, etc.)."""
    url = validate_product_url(raw_url)
    out = {"url": url, "store": store_label(url), "host": (urlparse(url).hostname or ""), "final_host": None,
           "title": None, "image": None, "readable": False, "reason": None}
    current = url
    try:
        with httpx.Client(follow_redirects=False, timeout=TIMEOUT_S, transport=transport,
                          headers={"User-Agent": UA, "Accept": "text/html,application/xhtml+xml", "Accept-Language": "pt-BR,pt;q=0.9"}) as client:
            for _ in range(MAX_REDIRECTS + 1):
                host = (urlparse(current).hostname or "").lower()
                if host not in STORE_HOSTS:
                    out["reason"] = "O link leva para fora das lojas conhecidas."
                    return out
                if not host_ok(host):
                    out["reason"] = "Endereço recusado por segurança."
                    return out
                with client.stream("GET", current) as resp:
                    if resp.status_code in (301, 302, 303, 307, 308):
                        loc = resp.headers.get("location")
                        if not loc:
                            out["reason"] = "A loja devolveu um redirecionamento sem destino."
                            return out
                        current = urljoin(current, loc)
                        if urlparse(current).scheme != "https":
                            out["reason"] = "O link redireciona para um endereço sem https."
                            return out
                        continue
                    out["final_host"] = host
                    if resp.status_code >= 400:
                        out["reason"] = f"A loja respondeu {resp.status_code}."
                        return out
                    ctype = resp.headers.get("content-type", "")
                    if "html" not in ctype.lower():
                        out["reason"] = "O link não abre uma página de produto."
                        return out
                    body = b""
                    for chunk in resp.iter_bytes():
                        body += chunk
                        if len(body) >= MAX_BYTES:
                            break
                    page = body.decode(resp.encoding or "utf-8", "replace")
                    out["title"] = extract_title(page)
                    img = _meta(page, "og:image")
                    out["image"] = img if img and img.startswith("https://") else None
                    out["readable"] = out["title"] is not None
                    if not out["readable"]:
                        out["reason"] = "A loja não deixa ler o nome automaticamente. Digite o nome do produto."
                    return out
            out["reason"] = "Redirecionamentos demais."
            return out
    except httpx.HTTPError:
        out["reason"] = "Não consegui abrir o link agora. Digite o nome do produto."
        return out

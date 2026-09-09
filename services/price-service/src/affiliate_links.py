"""
Links de afiliado por produto — infraestrutura comercial/afiliados.

IMPORTANTE (reclassificado — ver docs/AFFILIATES.md e commerce_provider.py):
ProductAffiliateLink NÃO é mais pré-condição para um produto ser
descoberto/buscado. A descoberta (CobasiProvider.find_offer) é sempre
dinâmica e roda para qualquer produto. Esta tabela é uma das ESTRATÉGIAS
de monetização que um provider pode consultar (modo "cached" em
CobasiProvider.monetize/cobasi_affiliate_mode) — hoje a única confirmada
para a Cobasi, mas um override/cache, não um gate.

Um GTIN/apresentação pode ter, por merchant, um deep link afiliado
específico (ex: gerado no painel Cobasi MAIS). Isso é dado comercial
dinâmico e por isso fica no banco, não em env var/build do frontend —
ativar/desativar um link não deve exigir deploy de frontend.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Optional
from urllib.parse import quote_plus, urlsplit

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .db import Base
from .config import get_settings

# Storefronts afiliadas fixas (navegação geral, não por produto) — URLs
# públicas confirmadas, nunca modificadas/geradas dinamicamente. Ver
# docs/AFFILIATES.md. Deve espelhar o mesmo valor usado em
# apps/web/src/features/commerce/homeShoppingPartners.ts para a Cobasi/Petz.
#
# Petz (29/08/2026): programa próprio "Loja Parceira" — URL fixa da
# vitrine + cupom PETMOL aplicado manualmente pelo tutor no checkout.
# Não é link afiliado por produto e não deve ser concatenado com /produto.
PETZ_PARTNER_STORE_URL = "https://www.petz.com.br/parceiro/PETMOL"
PETZ_COUPON_CODE = "PETMOL"
PETZ_AFFILIATE_PROGRAM = "petz_partner"
# Busca do site da Petz (plataforma VTEX — padrão /busca?q=). Usada como
# fallback do "Ver na Petz" quando o produto ainda não tem mapping
# confirmado: a comissão do Parceiro Petz vem do cupom PETMOL aplicado
# no checkout (ver docs/PETZ_COMMISSION_VALIDATION.md), então qualquer
# página de chegada dentro de petz.com.br remunera igual — o importante
# é levar o tutor ao produto certo e com o cupom no clipboard.
PETZ_SITE_SEARCH_BASE = "https://www.petz.com.br/busca"

# "Carrinho pré-montado" (flag petz_cart_prefill) — endpoints legados Struts
# da loja da Petz, descobertos por engenharia reversa em 08/09/2026. A loja
# nova (Next.js/Vue) não os usa mais, mas continuam respondendo. Ver o
# comentário do flag em config.py e docs/PETZ_COMMISSION_VALIDATION.md.
#   1. PETZ_COUPON_APPLY_URL  → registra o cupom PETMOL na sessão do carrinho
#   2. comprarAgora_Loja.html?prod=<id>&qtde=1 → adiciona o produto e
#      redireciona pro /checkout/cart. Chamado DEPOIS do (1), o cupom já
#      entra aplicado.
# NÃO documentados: podem sair do ar. Só use quando a flag estiver ON e
# houver petz_product_id; o bridge sempre tem fallback pro fluxo de hoje.
PETZ_COUPON_APPLY_URL = f"https://www.petz.com.br/aplicarCupom_Loja.html?cupom={PETZ_COUPON_CODE}"
_PETZ_CART_ADD_BASE = "https://www.petz.com.br/comprarAgora_Loja.html"


def petz_cart_add_url(petz_product_id: str, qty: int = 1) -> Optional[str]:
    """URL que adiciona o produto Petz ao carrinho e redireciona pro
    checkout. Segunda navegação do fluxo "carrinho pré-montado" — a
    primeira é PETZ_COUPON_APPLY_URL. `petz_product_id` é o id numérico
    do PetzProductMapping (o mesmo `prod=` da loja legada)."""
    pid = (petz_product_id or "").strip()
    if not pid.isdigit():
        return None
    q = qty if isinstance(qty, int) and qty > 0 else 1
    return f"{_PETZ_CART_ADD_BASE}?prod={quote_plus(pid)}&qtde={q}"

# A busca da Petz devolve "0 resultados" quando o termo é o título Awin
# completo (marca + variante + tamanho + "para Cães e Gatos"). Reduzimos
# a marca + as 2 primeiras palavras significativas do nome — o suficiente
# pra cair na categoria certa filtrada pela marca.
_PETZ_SIZE_RE = re.compile(
    r"\b\d+([.,]\d+)?\s?(ml|l|kg|g|un|und|unidades?|comprimidos?|caps?|c[áa]psulas?|"
    r"sach[êe]s?|tabletes?|litros?|gramas?)\b",
    re.IGNORECASE,
)
_PETZ_FILLER = {
    "para", "com", "sem", "de", "da", "do", "e", "ou", "a", "o",
    "cães", "caes", "cão", "cao", "gatos", "gato", "cachorros", "cachorro",
    "filhotes", "filhote", "adultos", "adulto", "todos", "todas", "raças", "racas",
}


def _petz_search_term(query: str, brand: Optional[str] = None) -> str:
    raw = " ".join((query or "").split())
    # corta variante/tamanho depois de "–", "—", "|" ou " - " seguido de dígito
    raw = re.split(r"\s[–—|]\s|\s-\s(?=\d)", raw)[0]
    raw = re.sub(r"\(.*?\)", " ", raw)
    raw = _PETZ_SIZE_RE.sub(" ", raw)

    brand_clean = " ".join((brand or "").split())
    if brand_clean:
        # remove a marca (1+ palavras) de qualquer posição do título
        raw = re.sub(rf"\b{re.escape(brand_clean)}\b", " ", raw, flags=re.IGNORECASE)

    words = raw.split()
    meaningful = [
        w for w in words
        if w.lower() not in _PETZ_FILLER and not re.fullmatch(r"\d+([.,]\d+)?", w)
    ] or words

    limit = 3 if brand_clean else 5
    term = " ".join(meaningful[:limit])
    if brand_clean:
        term = f"{brand_clean} {term}".strip()
    return " ".join(term.split())[:80]


def petz_site_search_url(query: str, brand: Optional[str] = None) -> str:
    term = _petz_search_term(query, brand)
    return f"{PETZ_SITE_SEARCH_BASE}?q={quote_plus(term)}" if term else PETZ_PARTNER_STORE_URL


def petz_search_url_from_term(term: str) -> str:
    """Monta /busca?q= com um termo JÁ pronto (curado/deslugado) — sem
    passar pela heurística de encurtamento de `petz_site_search_url`."""
    clean = " ".join((term or "").split())[:80]
    return f"{PETZ_SITE_SEARCH_BASE}?q={quote_plus(clean)}" if clean else PETZ_PARTNER_STORE_URL


def deslug_petz_product_url(product_url: str) -> str:
    """Deriva um termo de busca da própria URL do produto Petz: pega o
    slug depois de `/produto/`, tira o `-<id>` final e troca `-` por
    espaço. O slug costuma trazer o produto no topo de /busca — melhor
    que a heurística por nome do catálogo."""
    try:
        path = urlsplit(product_url or "").path
    except ValueError:
        return ""
    if "/produto/" not in path:
        return ""
    seg = path.split("/produto/", 1)[1].strip("/")
    seg = re.sub(r"-\d+$", "", seg)
    return " ".join(seg.replace("-", " ").split())[:80]


# Buscas curadas — verificadas manualmente em petz.com.br/busca (30/08/2026):
# trazem o produto mapeado no topo dos resultados. Chave = petz_product_id
# do PetzProductMapping. Usadas antes do deslug/heurística. "Ver na Petz"
# nunca abre /produto/* (a AASA da Petz entrega ao app — ver
# docs/PETZ_COMMISSION_VALIDATION.md), então a qualidade da busca é o que
# faz o cliente achar o produto certo.
PETZ_CURATED_SEARCH: dict[str, str] = {
    "100223": "racao royal canin urinary small dog",
    "99446": "racao royal canin mini indoor",
    "biscoito-pedigree-biscrok-multi-para-caes-adultos": "biscoito pedigree biscrok multi",
    "83755": "drontal plus para caes de 10 kg",
    "94808": "nexgard caes 4,1 a 10",
    "81288": "coleira antiparasitas scalibor",
}

# GTIN (do catálogo PETMOL) → id do produto na loja da Petz. Curado e
# verificado à mão em petz.com.br (`?json=product` → `barcode`/`id`,
# 09/09/2026). É o que faz o "carrinho pré-montado" (flag
# `petz_cart_prefill`) funcionar SEM depender de um PetzProductMapping
# confirmado no banco — o /commerce/petz-direct-link usa isto como
# fallback quando o produto ainda não foi mapeado pelo admin. Só
# adicione um par aqui depois de conferir na Petz que o `prod=<id>`
# adiciona EXATAMENTE esse GTIN/tamanho ao carrinho.
PETZ_GTIN_PRODUCT_ID: dict[str, str] = {
    "7896181298083": "100223",   # Royal Canin Veterinary Urinary Small Dog 2 kg
    "7896181212454": "71705",    # Royal Canin Mini Indoor Adult 7,5 kg
    "7896181212430": "71703",    # Royal Canin Mini Indoor Adult 1 kg
    "7891106903714": "83755",    # Drontal Plus Cães 10 kg — 2 comprimidos
    "7896029041956": "72452",    # Biscoito Pedigree Biscrok Multi 1 kg
    "7896029041932": "72451",    # Biscoito Pedigree Biscrok Multi 500 g
    "7896185907004": "81287",    # Coleira Scalibor M
    "8713184142108": "81288",    # Coleira Scalibor G
}


def petz_product_id_for_gtin(gtin_normalized: Optional[str]) -> Optional[str]:
    """id do produto Petz pra um GTIN do catálogo PETMOL, do mapa curado
    `PETZ_GTIN_PRODUCT_ID`. Usado como fallback pro carrinho pré-montado
    quando não há PetzProductMapping confirmado."""
    if not gtin_normalized:
        return None
    return PETZ_GTIN_PRODUCT_ID.get(gtin_normalized.strip())

STOREFRONT_AFFILIATE_URLS: dict[str, str] = {
    "cobasi": "https://minhaloja.cobasi.com.br?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol",
    "petz": PETZ_PARTNER_STORE_URL,
}

_BLOCKED_SCHEMES = {"javascript", "data", "file"}


class InvalidAffiliateUrlError(ValueError):
    pass


def validate_affiliate_url(url: str) -> None:
    """HTTPS obrigatório; bloqueia javascript:/data:/file: e estrutura inválida."""
    if not url or not url.strip():
        raise InvalidAffiliateUrlError("URL vazia")
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "").lower()
    if scheme in _BLOCKED_SCHEMES:
        raise InvalidAffiliateUrlError(f"Esquema de URL não permitido: {scheme}:")
    if scheme != "https":
        raise InvalidAffiliateUrlError("URL deve ser https://")
    if not parts.netloc:
        raise InvalidAffiliateUrlError("URL inválida (sem host)")


class ProductAffiliateLink(Base):
    """Deep link afiliado de um produto (products_catalog) para um merchant.

    Papel: override/cache manual da estratégia "cached" de monetização
    (ver CobasiProvider.monetize) — não é pré-requisito de descoberta.
    Desde 15/08/2026 o padrão de cobasi_affiliate_mode é "disabled" (MAIS
    totalmente desativado, decisão de produto — ver config.py); um link
    aqui só volta a valer quando o modo for religado explicitamente pra
    "cached" ou "utm". A arquitetura em si nunca dependeu desta tabela
    para buscar produto/preço — só para a etapa de monetização.
    """

    __tablename__ = "product_affiliate_links"
    __table_args__ = (UniqueConstraint("product_id", "merchant", name="uq_affiliate_link_product_merchant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products_catalog.id"), nullable=False, index=True)
    merchant: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    affiliate_product_url: Mapped[str] = mapped_column(Text, nullable=False)
    direct_product_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    affiliate_program: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


def get_active_link(db: Session, product_id: int, merchant: str) -> Optional[ProductAffiliateLink]:
    return db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product_id,
            ProductAffiliateLink.merchant == merchant,
            ProductAffiliateLink.active.is_(True),
        )
    )


class MarketplaceOffer(Base):
    """Oferta/publicação de um vendedor em um marketplace (Shopee, ML) para
    um produto — NÃO é o mesmo conceito que ProductAffiliateLink.

    Diferença deliberada: um retailer (Cobasi) tem UM deep link estável por
    produto+merchant (por isso o UniqueConstraint em ProductAffiliateLink);
    um marketplace pode ter VÁRIAS ofertas concorrentes para o mesmo produto
    (vendedores diferentes) e cada uma pode expirar/mudar de preço/sumir de
    estoque sem que o produto PETMOL deixe de existir — por isso não há
    UniqueConstraint(product_id, merchant) aqui.

    Nenhuma integração real popula esta tabela ainda (Shopee/ML não estão
    ativos — ver docs/AFFILIATES.md). Existe apenas para a arquitetura já
    suportar o conceito quando os programas forem aprovados, sem precisar
    de crawler/job/fila nesta tarefa.

    Papel: cache/estado operacional de uma oferta descoberta (por um
    futuro MarketplaceProvider, no mesmo formato de CobasiProvider) — NÃO
    é uma tabela para preenchimento manual em massa. Ativar um
    marketplace não deve significar cadastrar milhares de linhas aqui.
    """

    __tablename__ = "marketplace_offers"
    __table_args__ = (Index("ix_marketplace_offers_product_merchant", "product_id", "merchant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("products_catalog.id"), nullable=False, index=True)
    merchant: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    external_listing_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    seller_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    merchant_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    merchant_gtin: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    affiliate_url: Mapped[str] = mapped_column(Text, nullable=False)
    direct_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_available: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    match_decision: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    match_confidence: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    match_reasons_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    match_attributes_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price_refresh_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    price_refresh_error: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    # Taxa de comissão do anúncio (0..1) — Shopee productOfferV2.commissionRate.
    commission_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_checked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


def get_active_marketplace_offer(db: Session, product_id: int, merchant: str) -> Optional[MarketplaceOffer]:
    """Melhor oferta ativa (menor preço primeiro; sem preço, a mais recente)."""
    return db.scalar(
        select(MarketplaceOffer)
        .where(
            MarketplaceOffer.product_id == product_id,
            MarketplaceOffer.merchant == merchant,
            MarketplaceOffer.active.is_(True),
        )
        .order_by(MarketplaceOffer.price.is_(None), MarketplaceOffer.price.asc(), MarketplaceOffer.verified_at.desc())
    )


def get_monetized_offer(
    db: Session,
    merchant: str,
    context: str = "product",
    product_id: Optional[int] = None,
) -> Optional[dict]:
    """Implementa a ordem de resolução comercial (ver docs/AFFILIATES.md):

    context="product": só retorna oferta se existir deep link ativo daquele
    produto específico — nunca cai para a storefront genérica (recompra de
    um produto não deve mandar o tutor procurar de novo numa loja genérica).

    context="store": só retorna a storefront afiliada fixa do merchant,
    quando existir — usada na área geral "Lojas", sem produto específico.

    context="marketplace": só retorna oferta se existir MarketplaceOffer
    ativa daquele produto+merchant. Diferente de "product": a oferta é uma
    publicação/vendedor que pode expirar sem afetar o produto PETMOL (ver
    MarketplaceOffer). Nenhum merchant popula isso ainda — Shopee/ML não
    integrados nesta tarefa (ver docs/AFFILIATES.md).

    Petz (25/08/2026): gate único extra — is_petz_publicly_servable()
    exige tanto petz_affiliate_enabled quanto
    petz_coupon_attribution_verified (prova comercial validada com
    compra real em 29/08/2026, ver docs/PETZ_COMMISSION_VALIDATION.md —
    ambas ligadas explicitamente em produção via env, default no código
    continua False). Nenhum dos três contextos retorna nada pra
    merchant="petz" sem isso — mesmo que STOREFRONT_AFFILIATE_URLS/
    ProductAffiliateLink já tenham dado real cadastrado. Import local
    pra evitar ciclo (petz_provider importa deste módulo).

    Cobasi/Shopee/Mercado Livre (25/08/2026): esta função só verificava
    se a LINHA existia (ProductAffiliateLink/MarketplaceOffer), nunca se
    o mecanismo de monetização daquele merchant estava realmente ligado
    — mesma classe de bug do gap Petz original, fechada aqui pelo mesmo
    padrão de defesa em profundidade. Um link cadastrado no banco não é
    prova de que o modo comercial que o originou continua ativo (ex:
    cobasi_affiliate_mode virou "disabled" em 15/08/2026 sem apagar as
    linhas antigas de ProductAffiliateLink/STOREFRONT_AFFILIATE_URLS).
    """
    if merchant == "petz":
        from .petz_provider import is_petz_publicly_servable
        if not is_petz_publicly_servable():
            return None

    if merchant == "cobasi" and get_settings().cobasi_affiliate_mode == "disabled":
        return None

    if merchant in ("shopee", "mercadolivre"):
        from .marketplace_offer_provider import is_marketplace_merchant_publicly_servable
        if not is_marketplace_merchant_publicly_servable(merchant):
            return None

    if context == "product":
        if product_id is None:
            return None
        link = get_active_link(db, product_id, merchant)
        if not link:
            return None
        return {"merchant": merchant, "url": link.affiliate_product_url, "link_type": "affiliate_product"}

    if context == "store":
        url = STOREFRONT_AFFILIATE_URLS.get(merchant)
        if not url:
            return None
        return {"merchant": merchant, "url": url, "link_type": "affiliate_store"}

    if context == "marketplace":
        if product_id is None:
            return None
        offer = get_active_marketplace_offer(db, product_id, merchant)
        if not offer:
            return None
        return {"merchant": merchant, "url": offer.affiliate_url, "link_type": "affiliate_marketplace_offer"}

    return None

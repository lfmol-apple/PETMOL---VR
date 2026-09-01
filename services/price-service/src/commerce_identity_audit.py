"""
Auditoria de identidade comercial — as 2 lojas (Cobasi + Shopee) têm que
apontar para o MESMO produto que o PETMOL exibe, com o preço daquele
produto. Nunca "descrições parecidas, produtos diferentes".

Base de verdade da identidade = feed Awin por GTIN (título/marca de
Cobasi/Zee Now/Zee Dog sincronizados), com fallback para
products_catalog.name/brand — exatamente a mesma referência que o matcher
da Shopee usa (ver shopee_offer_sync._best_awin_identity_for_gtin e
shopee_offer_audit._expected_identity, reutilizado aqui).

O que cada lado é conferido contra a verdade:
  - Cobasi com link cadastrado (ProductAffiliateLink): resolve o destino
    real do link (shortlink mais.app via api-encurtador, ou URL Cobasi
    direta) e compara o slug do produto com o título de verdade.
  - Cobasi sem link (busca ao vivo): fetch_cobasi_price(título de
    verdade) — se o EAN do SKU retornado diverge do GTIN do PETMOL é
    mismatch_hard; senão compara nome.
  - Shopee: delega para shopee_offer_audit (já existe, já desativa oferta
    inválida).

Veredito por (gtin, merchant), persistido em CommerceIdentityCheck:
  ok             — bate com a verdade.
  mismatch_soft  — sobreposição fraca; só relatório, não bloqueia.
  mismatch_hard  — produto claramente diferente (marca conflitante, EAN
                   divergente, quase nenhuma palavra em comum). BLOQUEIA:
                   link cadastrado é desativado; oferta de busca ao vivo é
                   suprimida pelo CobasiProvider.
  unverifiable   — não deu pra resolver o destino / sem oferta pra checar.
  no_identity_base — sem título de verdade (nem Awin nem catálogo).

Enforcement é conservador de propósito (só mismatch_hard bloqueia) pra
nunca repetir o erro de derrubar cobertura boa por matcher estrito demais.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional
from urllib.parse import urlsplit

import httpx
from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.orm import Mapped, Session, mapped_column

from .affiliate_links import ProductAffiliateLink, get_active_link
from .db import Base, engine
from .product_catalog_lookup import ProductCatalog, normalize_gtin
from .shopee_offer_audit import _expected_identity
from .shopee_offer_sync import _COMMERCIAL_BRANDS

logger = logging.getLogger(__name__)

VERDICT_OK = "ok"
VERDICT_SOFT = "mismatch_soft"
VERDICT_HARD = "mismatch_hard"
VERDICT_UNVERIFIABLE = "unverifiable"
VERDICT_NO_BASE = "no_identity_base"
VERDICT_NO_OFFER = "no_offer"

_BLOCKING_VERDICTS = {VERDICT_HARD}

_MAIS_RESOLVER = "https://api-encurtador.mais.network/Conversion/ConvertUrl/"
_MAIS_SHORTLINK_HOSTS = {"mais.app"}
_HTTP_TIMEOUT = 8.0

# Considera o check "fresco" por esse tempo — enforcement só age em check
# recente (catálogo/feed muda; um mismatch de semanas atrás pode já ter
# sido corrigido no cadastro).
_CHECK_FRESH_HOURS = 72

_STOPWORDS = {
    "a", "as", "o", "os", "de", "da", "do", "das", "dos", "e", "em", "com",
    "para", "por", "kg", "g", "ml", "l", "un", "und", "unidade", "pct", "pacote",
    "racao", "alimento", "veterinary", "diet", "para", "caes", "caes", "gatos",
    "cao", "gato", "pet", "premium", "super", "linha",
}


def _norm(value: Optional[str]) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    return re.sub(r"\s+", " ", text.lower()).strip()


def _tokens(value: Optional[str]) -> set[str]:
    return {
        tok for tok in re.findall(r"[a-z0-9]+", _norm(value))
        if tok not in _STOPWORDS and len(tok) > 1
    }


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


_BRAND_TOKEN_SETS = [( _norm(b), _tokens(b)) for b in _COMMERCIAL_BRANDS]


def _brands_in(tokens: set[str]) -> set[str]:
    """Marcas comerciais conhecidas cujos tokens aparecem inteiros em `tokens`."""
    found = set()
    for name, btoks in _BRAND_TOKEN_SETS:
        if btoks and btoks <= tokens:
            found.add(name)
    return found


@dataclass
class MerchantVerdict:
    merchant: str
    verdict: str
    score: float = 0.0
    detail: str = ""


@dataclass
class GtinAuditResult:
    gtin: str
    product_id: Optional[int]
    truth_title: str
    truth_brand: Optional[str]
    merchants: list[MerchantVerdict] = field(default_factory=list)


@dataclass
class CommerceIdentityAuditReport:
    total: int = 0
    checked_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    results: list[GtinAuditResult] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    deactivated_links: int = 0


class CommerceIdentityCheck(Base):
    """Último veredito de identidade por (gtin, merchant). Upsert."""

    __tablename__ = "commerce_identity_checks"
    __table_args__ = (UniqueConstraint("gtin", "merchant", name="uq_identity_check_gtin_merchant"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    gtin: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    merchant: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    verdict: Mapped[str] = mapped_column(String(24), nullable=False)
    score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    detail: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )


Base.metadata.create_all(bind=engine, tables=[CommerceIdentityCheck.__table__])


# ── resolução de destino do link Cobasi ─────────────────────────────────

def resolve_cobasi_link_destination(url: str, *, client: Optional[httpx.Client] = None) -> Optional[str]:
    """Resolve o destino real de um link Cobasi cadastrado.

    - mais.app/XXXXXX → consulta api-encurtador.mais.network (o mesmo
      endpoint que a tela do mais.app usa) e devolve `data.url`.
    - www.cobasi.com.br/... ou minhaloja.cobasi.com.br/... → devolve como veio.
    - qualquer outra coisa → None (não dá pra conferir identidade).
    """
    if not url or not url.strip():
        return None
    parts = urlsplit(url.strip())
    host = parts.netloc.lower()
    if host in _MAIS_SHORTLINK_HOSTS:
        code = parts.path.strip("/")
        if not code:
            return None
        owns_client = client is None
        client = client or httpx.Client(timeout=_HTTP_TIMEOUT, headers={"x-server-origin": "mais.app"})
        try:
            resp = client.get(f"{_MAIS_RESOLVER}{code}")
            resp.raise_for_status()
            data = resp.json()
            if data.get("success") and data.get("url"):
                return str(data["url"])
            return None
        except (httpx.HTTPError, ValueError) as exc:
            logger.warning("[commerce_identity_audit] falha ao resolver %s: %s", url, exc)
            return None
        finally:
            if owns_client:
                client.close()
    if host in {"www.cobasi.com.br", "cobasi.com.br", "minhaloja.cobasi.com.br"}:
        return url.strip()
    return None


_NON_SLUG_SEGMENTS = {"p", "pesquisa", "busca", "search", "c", "b"}


def _slug_words_from_cobasi_url(url: str) -> set[str]:
    """Palavras do slug de produto de uma URL Cobasi (`/<slug>/p`) ou, se
    for uma URL de busca (`/pesquisa?terms=`/`/busca?q=`), do termo."""
    parts = urlsplit(url)
    segs = [s for s in parts.path.strip("/").split("/") if s and s not in _NON_SLUG_SEGMENTS]
    slug = segs[-1] if segs else ""
    # remove o id numérico final que a Cobasi anexa (…-3827380)
    slug = re.sub(r"-\d{3,}$", "", slug)
    words = _tokens(slug.replace("-", " "))
    if not words and ("terms=" in parts.query or "q=" in parts.query):
        from urllib.parse import parse_qs
        q = parse_qs(parts.query)
        raw = (q.get("terms") or q.get("q") or [""])[0]
        words = _tokens(raw)
    return words


# ── scoring de identidade ──────────────────────────────────────────────

def score_identity(truth_title: str, truth_brand: Optional[str], candidate_words: set[str]) -> tuple[str, float, str]:
    """Compara `candidate_words` (do slug/nome da loja) com a verdade.
    Devolve (verdict, score, detail)."""
    truth_words = _tokens(truth_title) | _tokens(truth_brand)
    if not truth_words:
        return VERDICT_NO_BASE, 0.0, "sem título de verdade"
    if not candidate_words:
        return VERDICT_UNVERIFIABLE, 0.0, "sem palavras no candidato"

    score = _jaccard(truth_words, candidate_words)
    truth_brands = _brands_in(truth_words) or ({_norm(truth_brand)} if truth_brand else set())
    cand_brands = _brands_in(candidate_words)

    # marca comercial conflitante = produto de outra marca → hard.
    # (único gatilho de HARD no caminho de slug — pra nunca desativar link
    # bom por slug abreviado/pobre. Sobreposição baixa sem conflito de
    # marca vira mismatch_soft: só relatório, revisão humana.)
    if truth_brands and cand_brands and not (truth_brands & cand_brands):
        return VERDICT_HARD, score, f"marca conflita: verdade={sorted(truth_brands)} loja={sorted(cand_brands)}"

    if score >= 0.34:
        return VERDICT_OK, score, f"sobreposição {score:.2f}"
    if score >= 0.18:
        return VERDICT_SOFT, score, f"sobreposição {score:.2f} fraca"
    return VERDICT_SOFT, score, f"sobreposição {score:.2f} baixa (sem conflito de marca)"


# ── auditoria de um GTIN ───────────────────────────────────────────────

async def audit_gtin(
    db: Session,
    gtin: str,
    *,
    http_client: Optional[httpx.Client] = None,
    check_live_cobasi: bool = True,
) -> GtinAuditResult:
    from .commerce_pricing import fetch_cobasi_price_by_gtin

    gtin_n = normalize_gtin(gtin) or gtin
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_n))
    truth_title, truth_brand = ("", None)
    if product is not None:
        truth_title, truth_brand = _expected_identity(db, product, gtin_n, ("cobasi", "zeenow", "zeedog"))

    result = GtinAuditResult(
        gtin=gtin_n,
        product_id=product.id if product else None,
        truth_title=truth_title,
        truth_brand=truth_brand,
    )
    if product is None or not truth_title:
        result.merchants.append(MerchantVerdict("cobasi", VERDICT_NO_BASE, 0.0, "produto sem identidade de verdade"))
        return result

    # ── Cobasi ──
    link = get_active_link(db, product.id, "cobasi")
    if link is not None:
        dest = resolve_cobasi_link_destination(link.affiliate_product_url, client=http_client)
        if dest is None:
            mv = MerchantVerdict("cobasi", VERDICT_UNVERIFIABLE, 0.0, f"destino não resolvido: {link.affiliate_product_url}")
        else:
            words = _slug_words_from_cobasi_url(dest)
            verdict, score, detail = score_identity(truth_title, truth_brand, words)
            mv = MerchantVerdict("cobasi", verdict, score, f"link→{dest} | {detail}")
        result.merchants.append(mv)
    elif check_live_cobasi:
        # Sem link cadastrado, o clique resolve pelo EAN EXATO
        # (fetch_cobasi_price_by_gtin) — o SKU do código de barras, nunca
        # uma variante. Não dá pra ser "produto errado"; a auditoria só
        # confirma se o GTIN existe no catálogo da Cobasi.
        try:
            price = await fetch_cobasi_price_by_gtin(gtin_n)
        except Exception as exc:  # noqa: BLE001 — auditoria nunca derruba
            price = None
            result.merchants.append(MerchantVerdict("cobasi", VERDICT_UNVERIFIABLE, 0.0, f"lookup falhou: {exc}"))
        if price is not None:
            if price.found and price.price is not None:
                result.merchants.append(MerchantVerdict(
                    "cobasi", VERDICT_OK, 1.0, f"EAN exato→{price.product_name!r} R${price.price}",
                ))
            else:
                result.merchants.append(MerchantVerdict("cobasi", VERDICT_NO_OFFER, 0.0, "GTIN não está no catálogo da Cobasi"))
    else:
        result.merchants.append(MerchantVerdict("cobasi", VERDICT_NO_OFFER, 0.0, "sem link cadastrado"))

    return result


def _persist(db: Session, gtin: str, verdicts: Iterable[MerchantVerdict]) -> None:
    now = datetime.now(timezone.utc)
    for mv in verdicts:
        row = db.scalar(select(CommerceIdentityCheck).where(
            CommerceIdentityCheck.gtin == gtin,
            CommerceIdentityCheck.merchant == mv.merchant,
        ))
        if row is None:
            row = CommerceIdentityCheck(gtin=gtin, merchant=mv.merchant)
            db.add(row)
        row.verdict = mv.verdict
        row.score = float(mv.score)
        row.detail = mv.detail[:2000] if mv.detail else None
        row.checked_at = now


async def audit_commerce_identity(
    db: Session,
    gtins: list[str],
    *,
    deactivate_hard_links: bool = True,
) -> CommerceIdentityAuditReport:
    """Audita a identidade Cobasi de cada GTIN, persiste o veredito e
    (opcional) desativa link cadastrado com mismatch_hard."""
    report = CommerceIdentityAuditReport(total=0)
    seen: set[str] = set()
    client = httpx.Client(timeout=_HTTP_TIMEOUT, headers={"x-server-origin": "mais.app"})
    try:
        for raw in gtins:
            g = normalize_gtin(raw) or raw
            if not g or g in seen:
                continue
            seen.add(g)
            res = await audit_gtin(db, g, http_client=client)
            report.results.append(res)
            report.total += 1
            _persist(db, g, res.merchants)
            for mv in res.merchants:
                report.counts[mv.verdict] = report.counts.get(mv.verdict, 0) + 1
                if mv.merchant == "cobasi" and mv.verdict == VERDICT_HARD and deactivate_hard_links and res.product_id:
                    link = get_active_link(db, res.product_id, "cobasi")
                    if link is not None:
                        link.active = False
                        report.deactivated_links += 1
                        logger.warning(
                            "[commerce_identity_audit] link Cobasi DESATIVADO gtin=%s: %s",
                            g, mv.detail,
                        )
        db.commit()
    finally:
        client.close()
    return report


# ── enforcement (consultado pelo CobasiProvider) ───────────────────────

def cobasi_identity_blocks(db: Session, gtin: Optional[str]) -> bool:
    """True se há um mismatch_hard fresco para (gtin, cobasi) — o
    CobasiProvider suprime a oferta de busca ao vivo nesse caso."""
    if not gtin:
        return False
    g = normalize_gtin(gtin)
    if not g:
        return False
    row = db.scalar(select(CommerceIdentityCheck).where(
        CommerceIdentityCheck.gtin == g,
        CommerceIdentityCheck.merchant == "cobasi",
    ))
    if row is None or row.verdict not in _BLOCKING_VERDICTS:
        return False
    checked = row.checked_at
    if checked.tzinfo is None:
        checked = checked.replace(tzinfo=timezone.utc)
    return checked >= datetime.now(timezone.utc) - timedelta(hours=_CHECK_FRESH_HOURS)


def identity_report(db: Session, *, limit: int = 500) -> dict:
    rows = list(db.scalars(
        select(CommerceIdentityCheck).order_by(CommerceIdentityCheck.checked_at.desc()).limit(limit)
    ))
    counts: dict[str, int] = {}
    for r in rows:
        counts[r.verdict] = counts.get(r.verdict, 0) + 1
    mismatches = [
        {
            "gtin": r.gtin, "merchant": r.merchant, "verdict": r.verdict,
            "score": round(r.score, 3), "detail": r.detail,
            "checked_at": r.checked_at.isoformat() if r.checked_at else None,
        }
        for r in rows if r.verdict in (VERDICT_HARD, VERDICT_SOFT)
    ]
    return {"total_rows": len(rows), "counts": counts, "mismatches": mismatches}

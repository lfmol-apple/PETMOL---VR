"""Registro AGREGADO da demanda de busca da Loja (o que as pessoas procuram e onde ainda não há link comissionável).

Princípios (aprovados pelo dono em 14/11/2026):
  · NUNCA guarda tutor, e-mail, IP, sessão, identificador de aparelho, user-agent, horário exato nem texto bruto digitado.
  · Granularidade = DIA + termo filtrado (ou GTIN válido). Sem chave para `users`, sem timestamp fino.
  · O texto só é guardado se TODAS as palavras existem no vocabulário do catálogo (marcas/produtos do feed) ou numa lista pequena
    de palavras de pet; nome de pessoa/pet/endereço cai no balde "other" (só contagem, sem texto). Dado pessoal óbvio
    (e-mail, URL, telefone/CPF/CEP…) cai em `rejected:<motivo>` (só contagem, sem texto).
  · Coleta atrás da flag `search_demand_enabled` (DESLIGADA por padrão), depois da resposta e dentro de try/except: nunca altera
    a resposta da busca nem as lojas.
  · Retenção: diária 90 dias; resumo mensal de 24 meses só com termos de 5+ buscas (nada de contagem baixa sobrevive ao resumo).
  · "Tem link comissionável?" NÃO é gravado: é calculado na hora do relatório, para refletir o estado atual.
"""
from __future__ import annotations

import logging
import re
import threading
import time
import unicodedata
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Iterable, Optional
from zoneinfo import ZoneInfo

from sqlalchemy import Column, Date, Index, Integer, String, UniqueConstraint, delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .config import get_settings
from .db import Base, SessionLocal

log = logging.getLogger(__name__)

_BR = ZoneInfo("America/Sao_Paulo")

DAILY_RETENTION_DAYS = 90
MONTHLY_RETENTION_MONTHS = 24
MONTHLY_MIN_SEARCHES = 5
REPORT_MIN_SEARCHES = 3
MAX_DISTINCT_TERMS_PER_DAY = 2000
MAX_PER_TERM_PER_MINUTE = 20
MAX_WORDS = 6
MAX_CHARS = 60
MAX_WORD_LETTERS = 25

KEY_TERM = "term"
KEY_GTIN = "gtin"
KEY_OTHER = "other"  # termo com palavra fora do vocabulário: só contagem, sem texto
KEY_REJECTED = "rejected:"  # prefixo; motivo depois dos dois pontos

REJECT_REASONS = {
    "contact": "e-mail, endereço de internet ou site",
    "digits": "sequência longa de números",
    "personal": "palavra de contexto pessoal",
    "long_word": "palavra longa demais",
    "empty": "vazio",
    "cap": "limite de termos do dia",
}


def enabled() -> bool:
    return bool(get_settings().search_demand_enabled)


# ── Tabelas ──────────────────────────────────────────────────────────────────


class SearchDemandDaily(Base):
    """Uma linha por (dia, tipo, chave). Sem usuário, sem aparelho, sem horário. `key_value` = '' nos baldes sem texto."""

    __tablename__ = "search_demand_daily"
    __table_args__ = (UniqueConstraint("day", "key_type", "key_value", name="uq_search_demand_daily"), Index("ix_search_demand_daily_day", "day"))

    id = Column(Integer, primary_key=True, autoincrement=True)
    day = Column(Date, nullable=False)
    key_type = Column(String(40), nullable=False)
    key_value = Column(String(64), nullable=False, default="")
    searches = Column(Integer, nullable=False, default=0)
    zero_results = Column(Integer, nullable=False, default=0)


class SearchDemandMonthly(Base):
    """Resumo mensal: só termos/GTINs com MONTHLY_MIN_SEARCHES+ buscas no mês. `month` = 1º dia do mês."""

    __tablename__ = "search_demand_monthly"
    __table_args__ = (UniqueConstraint("month", "key_type", "key_value", name="uq_search_demand_monthly"),)

    id = Column(Integer, primary_key=True, autoincrement=True)
    month = Column(Date, nullable=False, index=True)
    key_type = Column(String(40), nullable=False)
    key_value = Column(String(64), nullable=False, default="")
    searches = Column(Integer, nullable=False, default=0)
    zero_results = Column(Integer, nullable=False, default=0)


# ── Normalização e filtro de dados pessoais ──────────────────────────────────


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def normalize(q: str) -> str:
    s = _strip_accents(str(q or "")).lower()
    s = re.sub(r"\s+", " ", s).strip()
    return s


_CONTACT_RX = re.compile(r"@|https?|www\.|\.com|\.br\b|\.net|\.org|://")
_LONG_DIGITS_RX = re.compile(r"\d{6,}")
_NUM_UNIT_RX = re.compile(r"^\d{1,4}([.,]\d{1,2})?(kg|g|mg|ml|l|un|und|cm|m)?$")
_WORD_RX = re.compile(r"[a-z0-9]+(?:[.,][0-9]+)?")

# Palavras que denotam contexto pessoal (nome/endereço/contato/credencial): se aparecerem, o termo é rejeitado.
PERSONAL_WORDS = frozenset(
    {
        "meu", "minha", "meus", "minhas", "moro", "mora", "nome", "chamo", "chama", "rua", "avenida", "av", "bairro", "cep",
        "cpf", "cnpj", "rg", "tel", "telefone", "fone", "celular", "whatsapp", "zap", "senha", "login", "email", "e-mail",
        "endereco", "casa", "apto", "apartamento", "cartao", "conta", "pix",
    }
)

# Vocabulário mínimo de pet (some ao vocabulário do catálogo): palavras comuns de busca que podem não estar no feed.
PET_WORDS = frozenset(
    {
        "racao", "gato", "gatos", "cao", "caes", "cachorro", "cachorros", "filhote", "filhotes", "adulto", "adultos", "senior",
        "castrado", "castrados", "castrada", "vermifugo", "antipulgas", "antipulga", "carrapato", "carrapatos", "coleira",
        "shampoo", "petisco", "petiscos", "areia", "sache", "biscoito", "brinquedo", "cama", "caminha", "comedouro", "bebedouro",
        "vacina", "remedio", "suplemento", "vitamina", "osso", "bolinha", "arranhador", "tapete", "higienico", "fralda",
        "pequeno", "pequena", "medio", "media", "grande", "mini", "raca", "racas", "pet", "pets", "kg", "gr", "gramas",
        "para", "de", "e", "com", "sem", "para", "gourmet", "natural", "premium", "special", "light", "ultra", "plus",
        "umida", "umido", "seca", "seco", "pacote", "caixa", "frasco", "tablete", "tabletes", "comprimido", "comprimidos",
        "pipeta", "spray", "pomada", "colar", "peitoral", "guia", "roupa", "casinha", "transporte", "bolsa",
    }
)


def luhn_free_gtin_ok(code: str) -> bool:
    """GTIN-8/12/13/14 com dígito verificador correto (mod 10 ponderado 3/1 da direita para a esquerda)."""
    if not code.isdigit() or len(code) not in (8, 12, 13, 14):
        return False
    digits = [int(c) for c in code]
    check = digits[-1]
    total = 0
    for i, d in enumerate(reversed(digits[:-1])):
        total += d * (3 if i % 2 == 0 else 1)
    return (10 - total % 10) % 10 == check


def classify(q: str, vocabulary: Optional[frozenset[str]]) -> tuple[str, str]:
    """(key_type, key_value). Nunca devolve texto digitado quando o tipo é `other`/`rejected:*`.

    `vocabulary=None` significa "vocabulário indisponível": por segurança NADA de texto é guardado (balde `other`).
    """
    s = normalize(q)
    if not s:
        return KEY_REJECTED + "empty", ""
    digits_only = re.sub(r"[\s.\-]", "", s)
    if digits_only.isdigit() and luhn_free_gtin_ok(digits_only):
        return KEY_GTIN, digits_only
    if _CONTACT_RX.search(s):
        return KEY_REJECTED + "contact", ""
    if _LONG_DIGITS_RX.search(re.sub(r"[\s.\-]", "", s)) or _LONG_DIGITS_RX.search(s):
        return KEY_REJECTED + "digits", ""
    s = s[:MAX_CHARS].strip()
    words = _WORD_RX.findall(s)
    if not words:
        return KEY_REJECTED + "empty", ""
    words = words[:MAX_WORDS]
    if any(w in PERSONAL_WORDS for w in words):
        return KEY_REJECTED + "personal", ""
    if any(len(w) > MAX_WORD_LETTERS for w in words):
        return KEY_REJECTED + "long_word", ""
    if vocabulary is None:
        return KEY_OTHER, ""
    for w in words:
        if _NUM_UNIT_RX.match(w):
            continue
        if w in PET_WORDS or w in vocabulary:
            continue
        return KEY_OTHER, ""
    return KEY_TERM, " ".join(words)


# ── Vocabulário do catálogo (cache em memória) ───────────────────────────────

_VOCAB_TTL = 6 * 3600
_vocab_lock = threading.Lock()
_vocab_cache: dict = {"at": 0.0, "words": None}


def build_vocabulary(db: Session) -> frozenset[str]:
    from .affiliate_feed import AffiliateFeedOffer

    words: set[str] = set()
    rows = db.execute(select(AffiliateFeedOffer.title, AffiliateFeedOffer.brand).where(AffiliateFeedOffer.active.is_(True))).all()
    for title, brand in rows:
        for txt in (title, brand):
            if txt:
                words.update(w for w in _WORD_RX.findall(normalize(txt)) if 2 <= len(w) <= MAX_WORD_LETTERS)
    return frozenset(words)


def get_vocabulary(db: Session) -> Optional[frozenset[str]]:
    now = time.time()
    with _vocab_lock:
        if _vocab_cache["words"] is not None and now - _vocab_cache["at"] < _VOCAB_TTL:
            return _vocab_cache["words"]
    try:
        words = build_vocabulary(db)
    except Exception:  # noqa: BLE001 — sem vocabulário, nada de texto é guardado
        log.warning("search_demand: vocabulário indisponível", exc_info=True)
        return None
    with _vocab_lock:
        _vocab_cache.update(at=now, words=words)
    return words


def reset_caches_for_tests() -> None:
    with _vocab_lock:
        _vocab_cache.update(at=0.0, words=None)
    with _rate_lock:
        _rate.clear()
    _state.update(last_retention=None)


# ── Teto por termo/minuto (anti-spam) e gravação ─────────────────────────────

_rate_lock = threading.Lock()
_rate: dict[str, list[float]] = {}
_state: dict = {"last_retention": None}


def _rate_ok(key: str) -> bool:
    now = time.time()
    with _rate_lock:
        lst = [t for t in _rate.get(key, []) if now - t < 60]
        if len(lst) >= MAX_PER_TERM_PER_MINUTE:
            _rate[key] = lst
            return False
        lst.append(now)
        _rate[key] = lst
        if len(_rate) > 5000:  # evita crescimento ilimitado
            for k in [k for k, v in _rate.items() if not v or now - v[-1] > 60]:
                _rate.pop(k, None)
        return True


def today_br() -> date:
    return datetime.now(_BR).date()


def _upsert(db: Session, day: date, key_type: str, key_value: str, zero: bool) -> None:
    """Soma 1 busca. Portátil (Postgres/SQLite): tenta atualizar; se não existir, insere; em corrida, atualiza de novo."""
    t = SearchDemandDaily
    values = {"searches": t.searches + 1, "zero_results": t.zero_results + (1 if zero else 0)}
    res = db.execute(t.__table__.update().where(t.day == day, t.key_type == key_type, t.key_value == key_value).values(**values))
    if res.rowcount:
        return
    try:
        with db.begin_nested():
            db.add(t(day=day, key_type=key_type, key_value=key_value, searches=1, zero_results=1 if zero else 0))
            db.flush()
    except IntegrityError:
        db.execute(t.__table__.update().where(t.day == day, t.key_type == key_type, t.key_value == key_value).values(**values))


def record_search(q: Optional[str], gtin: Optional[str], result_count: Optional[int]) -> None:
    """Chamado DEPOIS de montar a resposta. Nunca levanta: qualquer falha é engolida (a busca segue igual).

    `result_count=None` = resultado ainda indeterminado (ex.: enriquecimento pendente) → não conta como "sem resultado".
    """
    try:
        if not enabled():
            return
        raw = gtin or q
        if not raw:
            return
        zero = result_count == 0
        with SessionLocal() as db:
            vocab = get_vocabulary(db)
            key_type, key_value = classify(raw, vocab)
            if key_type == KEY_TERM and not _rate_ok(key_value):
                return
            day = today_br()
            if key_type == KEY_TERM:
                distinct = db.scalar(select(func.count()).select_from(SearchDemandDaily).where(SearchDemandDaily.day == day, SearchDemandDaily.key_type == KEY_TERM))
                exists = db.scalar(select(SearchDemandDaily.id).where(SearchDemandDaily.day == day, SearchDemandDaily.key_type == KEY_TERM, SearchDemandDaily.key_value == key_value))
                if not exists and (distinct or 0) >= MAX_DISTINCT_TERMS_PER_DAY:
                    key_type, key_value = KEY_REJECTED + "cap", ""
            _upsert(db, day, key_type, key_value, zero)
            db.commit()
            _maybe_run_retention(db, day)
    except Exception:  # noqa: BLE001
        log.warning("search_demand: falha ao registrar (ignorada)", exc_info=True)


# ── Retenção ─────────────────────────────────────────────────────────────────


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _months_ago(d: date, n: int) -> date:
    y, m = d.year, d.month - n
    while m <= 0:
        m += 12
        y -= 1
    return date(y, m, 1)


def run_retention(db: Session, today: Optional[date] = None) -> dict:
    """1) resume meses completos que ainda têm linhas diárias (só termos com 5+ buscas); 2) apaga diárias > 90 dias;
    3) apaga resumos > 24 meses. Idempotente."""
    today = today or today_br()
    cutoff = today - timedelta(days=DAILY_RETENTION_DAYS)
    D, M = SearchDemandDaily, SearchDemandMonthly
    months = {_month_start(r[0]) for r in db.execute(select(D.day).where(D.day < cutoff).distinct()).all()}
    summarized = 0
    for month in sorted(months):
        nxt = _months_ago(month, -1)
        rows = db.execute(
            select(D.key_type, D.key_value, func.sum(D.searches), func.sum(D.zero_results))
            .where(D.day >= month, D.day < nxt, D.key_type.in_([KEY_TERM, KEY_GTIN]))
            .group_by(D.key_type, D.key_value)
            .having(func.sum(D.searches) >= MONTHLY_MIN_SEARCHES)
        ).all()
        for kt, kv, s, z in rows:
            row = db.scalar(select(M).where(M.month == month, M.key_type == kt, M.key_value == kv))
            if row:
                row.searches, row.zero_results = int(s), int(z or 0)
            else:
                db.add(M(month=month, key_type=kt, key_value=kv, searches=int(s), zero_results=int(z or 0)))
            summarized += 1
    deleted = db.execute(delete(D).where(D.day < cutoff)).rowcount or 0
    deleted_m = db.execute(delete(M).where(M.month < _months_ago(_month_start(today), MONTHLY_RETENTION_MONTHS))).rowcount or 0
    db.commit()
    return {"summarized": summarized, "deleted_daily": deleted, "deleted_monthly": deleted_m}


def _maybe_run_retention(db: Session, day: date) -> None:
    if _state.get("last_retention") == day:
        return
    _state["last_retention"] = day
    try:
        run_retention(db, day)
    except Exception:  # noqa: BLE001
        db.rollback()
        log.warning("search_demand: retenção falhou (ignorada)", exc_info=True)


# ── Relatório (calculado na hora) ────────────────────────────────────────────

ML_MERCHANT = "mercadolivre"


def _term_gtins(db: Session, term: str, cap: int = 200) -> list[str]:
    """GTINs do feed cujo título/marca contém TODAS as palavras do termo (acento-insensível só em Postgres; suficiente p/ o relatório)."""
    from .affiliate_feed import AffiliateFeedOffer

    words = term.split()
    if not words:
        return []
    is_pg = db.bind.dialect.name == "postgresql"
    conds = []
    for w in words:
        like = f"%{w}%"
        if is_pg:
            conds.append(func.unaccent(AffiliateFeedOffer.title).ilike(func.unaccent(like)) | func.unaccent(AffiliateFeedOffer.brand).ilike(func.unaccent(like)))
        else:
            conds.append(AffiliateFeedOffer.title.ilike(like) | AffiliateFeedOffer.brand.ilike(like))
    q = select(AffiliateFeedOffer.gtin).where(AffiliateFeedOffer.gtin.isnot(None), AffiliateFeedOffer.active.is_(True), *conds).distinct().limit(cap)
    return [g for (g,) in db.execute(q).all() if g]


def _commission_status(db: Session, gtins: list[str]) -> dict:
    """Por loja: há link COMISSIONÁVEL hoje para algum desses GTINs? (Cobasi = feed Awin ativo com link; Mercado Livre = oferta
    de marketplace ativa; Amazon = curadoria manual no app, não consultável por GTIN → None; Shopee é só vitrine → não conta.)"""
    from .affiliate_feed import AffiliateFeedOffer
    from .affiliate_links import MarketplaceOffer
    from .product_catalog_lookup import ProductCatalog

    out = {"cobasi": False, "mercadolivre": False, "amazon": None}
    if not gtins:
        return out
    out["cobasi"] = bool(
        db.scalar(
            select(AffiliateFeedOffer.id)
            .where(
                AffiliateFeedOffer.gtin.in_(gtins), AffiliateFeedOffer.merchant == "cobasi", AffiliateFeedOffer.active.is_(True),
                AffiliateFeedOffer.in_stock.is_(True), AffiliateFeedOffer.affiliate_url.isnot(None), AffiliateFeedOffer.affiliate_url != "",
            )
            .limit(1)
        )
    )
    out["mercadolivre"] = bool(
        db.scalar(
            select(MarketplaceOffer.id)
            .join(ProductCatalog, ProductCatalog.id == MarketplaceOffer.product_id)
            .where(ProductCatalog.barcode_normalized.in_(gtins), MarketplaceOffer.merchant == ML_MERCHANT, MarketplaceOffer.active.is_(True))
            .limit(1)
        )
    )
    return out


def build_report(db: Session, days: int = 30, today: Optional[date] = None) -> dict:
    days = 7 if days <= 7 else 30
    today = today or today_br()
    since = today - timedelta(days=days - 1)
    D = SearchDemandDaily
    rows = db.execute(
        select(D.key_type, D.key_value, func.sum(D.searches), func.sum(D.zero_results)).where(D.day >= since, D.day <= today).group_by(D.key_type, D.key_value)
    ).all()

    total = 0
    unrecognized = 0
    rejected: dict[str, int] = defaultdict(int)
    items = []
    for kt, kv, s, z in rows:
        s, z = int(s), int(z or 0)
        total += s
        if kt == KEY_OTHER:
            unrecognized += s
        elif kt.startswith(KEY_REJECTED):
            rejected[kt.split(":", 1)[1]] += s
        elif s >= REPORT_MIN_SEARCHES:  # abaixo do piso nunca aparece
            items.append((kt, kv, s, z))

    gtin_names = _gtin_names(db, [kv for kt, kv, _, _ in items if kt == KEY_GTIN])
    out_items = []
    for kt, kv, s, z in sorted(items, key=lambda r: -r[2]):
        gtins = [kv] if kt == KEY_GTIN else _term_gtins(db, kv)
        comm = _commission_status(db, gtins)
        found = bool(gtins) if kt == KEY_TERM else True
        no_result = z * 2 >= s or (kt == KEY_TERM and not found)  # maioria das buscas sem resultado
        out_items.append(
            {
                "kind": kt, "label": gtin_names.get(kv) or kv, "key": kv, "searches": s, "zero_results": z,
                "zero_pct": round(100 * z / s) if s else 0, "matched_products": len(gtins),
                "no_result": no_result,
                "commission": comm,
                # "oportunidade": há demanda e (ainda) nenhuma loja comissionável conhecida nesse produto
                "no_commissionable_link": (not no_result) and not (comm["cobasi"] or comm["mercadolivre"]),
                "ml_gap": (not no_result) and not comm["mercadolivre"],
            }
        )
    return {
        "days": days, "since": since.isoformat(), "min_searches": REPORT_MIN_SEARCHES, "total_searches": total,
        "unrecognized_searches": unrecognized,
        "rejected_searches": [{"reason": r, "label": REJECT_REASONS.get(r, r), "searches": n} for r, n in sorted(rejected.items(), key=lambda x: -x[1])],
        "rejected_total": sum(rejected.values()),
        "no_result": [i for i in out_items if i["no_result"]],
        "no_commissionable_link": [i for i in out_items if i["no_commissionable_link"]],
        "opportunities": sorted([i for i in out_items if i["ml_gap"] or i["no_result"]], key=lambda i: -i["searches"]),
        "items": out_items,
    }


def _gtin_names(db: Session, gtins: Iterable[str]) -> dict[str, str]:
    from .affiliate_feed import AffiliateFeedOffer

    gtins = list(gtins)
    if not gtins:
        return {}
    rows = db.execute(select(AffiliateFeedOffer.gtin, func.min(AffiliateFeedOffer.title)).where(AffiliateFeedOffer.gtin.in_(gtins)).group_by(AffiliateFeedOffer.gtin)).all()
    return {g: t for g, t in rows if t}

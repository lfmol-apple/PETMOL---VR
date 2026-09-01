"""
Agrupamento de SKU cross-GTIN — o MESMO produto físico com EANs
diferentes (ex.: "Scalibor M" 7896185907004 e "Scalibor Pequenos e
Médios 48 cm" 7896185957009).

Determinístico e auditável. NUNCA por nome parecido: a associação só nasce
de (R1) confirmação de admin, (R2) MPN GS1 compartilhado, ou (R3)
discriminadores estruturais idênticos (marca normalizada + espécie +
peso/volume/cm/pack/faixa) com concordância. Qualquer CONFLICT estrutural
veta (R0). Dado faltando → sem grupo. Dois grupos possíveis pro mesmo
GTIN → sem grupo.

Espelha o estilo de catalog_enrichment.py — só banco, sem rede, sem LLM.
"""
from __future__ import annotations

import hashlib
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from .affiliate_feed import AffiliateFeedOffer
from .product_catalog_lookup import ProductCatalog, SkuGroupMember, normalize_gtin
from .product_identity import (
    ProductIdentity,
    _normalize_text,
    _tokenize_text,
    compare_structural,
    normalize_brand,
    structural_agreement,
    structural_conflict,
)

# tokens genéricos que não contam como "mesmo tipo de produto"
_GENERIC_NAME_TOKENS = {
    "racao", "raça", "para", "de", "com", "e", "adulto", "adultos", "caes", "cao",
    "gato", "gatos", "pet", "pets", "kg", "g", "ml", "l", "un", "und", "sabor",
    "premium", "super", "natural", "seca", "umida", "premium", "the", "of", "cm",
}

logger = logging.getLogger(__name__)

_PROTECTED_STATUS = {"rejected"}
_DETERMINISTIC_EVIDENCE_SOURCES = {"AWIN_FEED", "MANUAL", "ADMIN", "PETMOL_VALIDATED"}
# Discriminador "forte" de SKU — pelo menos um precisa BATER pros dois lados.
# animal_weight_range entra porque, pra medicamento (pipeta/comprimido), a
# faixa de peso do animal É a apresentação; nesses não há peso de embalagem.
_PRIMARY_DISCRIMINATORS = ("length_cm", "weight_kg", "volume_ml", "pack_count", "animal_weight_range")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _brand_slug(value: Optional[str], *, name_hint: Optional[str] = None) -> str:
    norm = normalize_brand(value, name_hint=name_hint) or value or ""
    return "".join(ch for ch in _normalize_text(norm) if ch.isalnum())


def _identity(product: ProductCatalog) -> ProductIdentity:
    return ProductIdentity.from_catalog(product)


def _feed_mpns(db: Session, gtin: str) -> set[str]:
    rows = db.execute(
        select(AffiliateFeedOffer.mpn).where(
            AffiliateFeedOffer.gtin == gtin,
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.mpn.isnot(None),
        )
    ).all()
    return {m.strip().lower() for (m,) in rows if m and m.strip()}


def _evidence_field_ok(product: ProductCatalog, field_name: str) -> bool:
    """O campo estrutural foi escrito por fonte determinística (não LLM,
    não ambíguo)."""
    raw = getattr(product, "identity_evidence_json", None)
    if not raw:
        return True  # sem log — herda de #154, tratado como determinístico
    try:
        log = json.loads(raw)
    except Exception:  # noqa: BLE001
        return True
    entry = log.get(field_name)
    if not entry:
        return True
    if entry.get("ambiguous"):
        return False
    return entry.get("source", "AWIN_FEED") in _DETERMINISTIC_EVIDENCE_SOURCES


@dataclass
class PairDecision:
    grouped: bool
    basis: Optional[str] = None            # ADMIN_CONFIRMED | SHARED_MPN | STRUCTURED_IDENTICAL | REFUSED
    confidence: float = 0.0
    matched_keys: list[str] = field(default_factory=list)
    reason: Optional[str] = None           # motivo da recusa


def evaluate_pair(db: Session, gtin_a: str, gtin_b: str) -> PairDecision:
    a = normalize_gtin(gtin_a)
    b = normalize_gtin(gtin_b)
    if not a or not b or a == b:
        return PairDecision(False, reason="gtin_invalido")

    # confirmação/rejeição de admin manda em tudo
    existing = db.scalars(
        select(SkuGroupMember).where(
            SkuGroupMember.member_gtin.in_([a, b]),
            SkuGroupMember.confirmed_by.isnot(None),
        )
    ).all()
    keys_a = {m.group_key for m in existing if m.member_gtin == a}
    keys_b = {m.group_key for m in existing if m.member_gtin == b}
    if keys_a & keys_b:
        rej = [m for m in existing if (keys_a & keys_b).intersection({m.group_key}) and m.status == "rejected"]
        if rej:
            return PairDecision(False, basis="REFUSED", reason="admin_rejected")
        return PairDecision(True, basis="ADMIN_CONFIRMED", confidence=1.0, matched_keys=["admin"])

    pa = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == a))
    pb = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == b))
    if pa is None or pb is None:
        return PairDecision(False, reason="catalogo_ausente")

    ia, ib = _identity(pa), _identity(pb)

    # R0 — veto estrutural
    conflict = structural_conflict(ia, ib)
    if conflict:
        return PairDecision(False, basis="REFUSED", reason=conflict)

    slug_a = _brand_slug(pa.canonical_brand or pa.brand, name_hint=pa.canonical_name or pa.name)
    slug_b = _brand_slug(pb.canonical_brand or pb.brand, name_hint=pb.canonical_name or pb.name)
    if not slug_a or slug_a != slug_b:
        return PairDecision(False, reason="marca_divergente")
    if ia.species and ib.species and ia.species != ib.species:
        return PairDecision(False, basis="REFUSED", reason="SPECIES_CONFLICT")

    # R2 — MPN compartilhado (MPN é a chave GS1 do fabricante; R0 já vetou)
    mpns_a = _feed_mpns(db, a)
    mpns_b = _feed_mpns(db, b)
    if mpns_a and mpns_b and (mpns_a & mpns_b):
        return PairDecision(True, basis="SHARED_MPN", confidence=0.95, matched_keys=["mpn", "brand"])

    # R3 — discriminadores estruturais idênticos + concordância
    # Espécie precisa ser conhecida e igual dos dois lados (não "não conflita").
    if not (ia.species and ib.species and ia.species == ib.species):
        return PairDecision(False, reason="especie_indefinida")
    # os nomes precisam compartilhar algum token de TIPO de produto (guarda
    # negativa contra "Ração Peixes" vs "Ração Roedores" da mesma marca).
    toks_a = _tokenize_text(pa.canonical_name or pa.name or "") - _GENERIC_NAME_TOKENS - _tokenize_text(slug_a)
    toks_b = _tokenize_text(pb.canonical_name or pb.name or "") - _GENERIC_NAME_TOKENS - _tokenize_text(slug_b)
    if toks_a and toks_b and not (toks_a & toks_b):
        return PairDecision(False, reason="tipos_de_produto_divergentes")

    agree = structural_agreement(ia, ib)
    has_primary = any(k in agree for k in _PRIMARY_DISCRIMINATORS)
    if not has_primary:
        return PairDecision(False, reason="sem_discriminador_primario_concordante")
    for k in agree:
        if k in ("species", "breed_size", "animal_weight_range"):
            continue
        if not (_evidence_field_ok(pa, k) and _evidence_field_ok(pb, k)):
            return PairDecision(False, reason=f"evidencia_nao_deterministica:{k}")
    conf = 0.9 if len(agree) >= 3 else 0.85
    return PairDecision(True, basis="STRUCTURED_IDENTICAL", confidence=conf, matched_keys=["brand", *agree])


def group_key_for(basis: str, slug: str, ident: ProductIdentity) -> str:
    if basis == "SHARED_MPN":
        return f"mpn:{slug}:{ident.gtin or ''}"[:180]
    parts = [
        slug, ident.species or "",
        f"{ident.weight_kg:g}" if ident.weight_kg else "",
        f"{ident.volume_ml:g}" if ident.volume_ml else "",
        f"{ident.length_cm:g}" if ident.length_cm else "",
        str(ident.pack_count or ""),
        f"{ident.animal_weight_range[0]:g}-{ident.animal_weight_range[1]:g}" if ident.animal_weight_range else "",
        ident.breed_size or "",
    ]
    digest = hashlib.sha1("|".join(parts).encode("utf-8")).hexdigest()[:16]
    return f"disc:{slug}:{digest}"


@dataclass
class GroupResult:
    gtin: str
    group_key: Optional[str] = None
    members: list[str] = field(default_factory=list)
    basis: Optional[str] = None
    changed: bool = False
    skipped_reason: Optional[str] = None


_bucket_cache: dict[int, dict[str, list[str]]] = {}


def _brand_bucket(db: Session, *, refresh: bool = False) -> dict[str, list[str]]:
    """Mapa brand_slug -> [gtins]. Cache por sessão pra evitar O(n²) no batch."""
    key = id(db)
    if refresh or key not in _bucket_cache:
        buckets: dict[str, list[str]] = {}
        for g, cb, br, cn, nm in db.execute(
            select(ProductCatalog.barcode_normalized, ProductCatalog.canonical_brand,
                   ProductCatalog.brand, ProductCatalog.canonical_name, ProductCatalog.name)
            .where(ProductCatalog.barcode_normalized.isnot(None),
                   ProductCatalog.canonical_brand.isnot(None))
        ).all():
            slug = _brand_slug(cb or br, name_hint=cn or nm)
            if slug:
                buckets.setdefault(slug, []).append(g)
        _bucket_cache[key] = buckets
    return _bucket_cache[key]


def _candidate_gtins(db: Session, product: ProductCatalog, slug: str) -> list[str]:
    bucket = _brand_bucket(db).get(slug, [])
    if len(bucket) > 1:
        return [g for g in bucket if g != product.barcode_normalized]
    # bucket vazio/desatualizado — varredura direcionada
    ident = _identity(product)
    stmt = select(ProductCatalog.barcode_normalized, ProductCatalog.canonical_brand,
                  ProductCatalog.brand, ProductCatalog.canonical_name, ProductCatalog.name).where(
        ProductCatalog.barcode_normalized != product.barcode_normalized,
        ProductCatalog.canonical_brand.isnot(None),
    )
    if ident.species:
        stmt = stmt.where(ProductCatalog.species.in_([ident.species, None]))
    return [g for g, cb, br, cn, nm in db.execute(stmt).all()
            if _brand_slug(cb or br, name_hint=cn or nm) == slug]


def rebuild_groups_for_gtin(db: Session, gtin: str, *, dry_run: bool = False) -> GroupResult:
    g = normalize_gtin(gtin)
    if not g:
        return GroupResult(gtin=gtin, skipped_reason="gtin_invalido")
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == g))
    if product is None:
        return GroupResult(gtin=g, skipped_reason="catalogo_ausente")

    ident = _identity(product)
    slug = _brand_slug(product.canonical_brand or product.brand, name_hint=product.canonical_name or product.name)
    if not slug or not (ident.species or ident.weight_kg or ident.length_cm or ident.volume_ml):
        return GroupResult(gtin=g, skipped_reason="identidade_insuficiente")

    admin_rows = db.scalars(
        select(SkuGroupMember).where(SkuGroupMember.member_gtin == g, SkuGroupMember.confirmed_by.isnot(None))
    ).all()
    locked_key = next((m.group_key for m in admin_rows if m.status == "active"), None)

    raw_eligible: dict[str, PairDecision] = {}
    for cand in _candidate_gtins(db, product, slug):
        d = evaluate_pair(db, g, cand)
        if d.grouped:
            raw_eligible[cand] = d

    # clique: um peer só entra se casa com TODOS os já dentro (sem
    # fechamento transitivo — A~B e B~C não implica A~C).
    eligible: dict[str, PairDecision] = {}
    for cand in sorted(raw_eligible, key=lambda c: -raw_eligible[c].confidence):
        if all(evaluate_pair(db, cand, other).grouped for other in eligible):
            eligible[cand] = raw_eligible[cand]

    if not eligible and locked_key is None:
        # limpa qualquer associação automática obsoleta deste GTIN
        changed = _clear_auto_memberships(db, g, keep_key=None, dry_run=dry_run)
        return GroupResult(gtin=g, changed=changed, skipped_reason="sem_par_elegivel")

    # define o group_key
    if locked_key:
        key = locked_key
        basis = "ADMIN_CONFIRMED"
    else:
        bases = {d.basis for d in eligible.values()}
        basis = "SHARED_MPN" if bases == {"SHARED_MPN"} else "STRUCTURED_IDENTICAL"
        key = group_key_for(basis, slug, ident)
        # ambiguidade: peers que já pertencem a outro grupo determinístico
        peer_keys = set(db.scalars(
            select(SkuGroupMember.group_key).where(
                SkuGroupMember.member_gtin.in_(list(eligible)),
                SkuGroupMember.status == "active",
                SkuGroupMember.source == "SKU_GROUPER",
            )
        ).all())
        if peer_keys - {key}:
            _clear_auto_memberships(db, g, keep_key=None, dry_run=dry_run)
            return GroupResult(gtin=g, skipped_reason="ambiguo_multiplos_grupos")

    members = [g, *sorted(eligible)]
    changed = _write_group(db, key, basis, ident, slug, members, eligible, dry_run=dry_run)
    return GroupResult(gtin=g, group_key=key, members=members, basis=basis, changed=changed)


def _clear_auto_memberships(db: Session, gtin: str, *, keep_key: Optional[str], dry_run: bool) -> bool:
    rows = db.scalars(
        select(SkuGroupMember).where(
            SkuGroupMember.member_gtin == gtin,
            SkuGroupMember.source == "SKU_GROUPER",
            SkuGroupMember.confirmed_by.is_(None),
        )
    ).all()
    changed = False
    for r in rows:
        if keep_key and r.group_key == keep_key:
            continue
        if not dry_run:
            db.delete(r)
        changed = True
    return changed


def _write_group(db: Session, key: str, basis: str, ident: ProductIdentity, slug: str,
                 members: list[str], eligible: dict[str, PairDecision], *, dry_run: bool) -> bool:
    canonical = _canonical_gtin(db, members)
    changed = False
    now = _now()
    for gtin in members:
        _clear_auto_memberships(db, gtin, keep_key=key, dry_run=dry_run)
        row = db.scalar(
            select(SkuGroupMember).where(SkuGroupMember.group_key == key, SkuGroupMember.member_gtin == gtin)
        )
        dec = eligible.get(gtin)
        conf = 1.0 if gtin == members[0] and basis == "ADMIN_CONFIRMED" else (dec.confidence if dec else 0.9)
        ev = json.dumps({
            "basis": basis,
            "matched_keys": sorted({k for d in eligible.values() for k in d.matched_keys}),
            "peers": [p for p in members if p != gtin],
            "at": now.isoformat(),
        }, ensure_ascii=False)
        if row is None:
            if not dry_run:
                db.add(SkuGroupMember(
                    group_key=key, member_gtin=gtin, canonical_gtin=canonical,
                    match_basis=basis, status="active", confidence=conf,
                    evidence_json=ev, source="SKU_GROUPER",
                ))
            changed = True
        elif row.confirmed_by is None and (row.canonical_gtin != canonical or row.match_basis != basis or abs(row.confidence - conf) > 0.001):
            if not dry_run:
                row.canonical_gtin = canonical
                row.match_basis = basis
                row.confidence = conf
                row.evidence_json = ev
                row.status = "active"
                row.updated_at = now
            changed = True
    return changed


def _canonical_gtin(db: Session, members: list[str]) -> str:
    best, best_score = members[0], -1
    for g in members:
        p = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == g))
        if p is None:
            continue
        score = sum(1 for f in ("weight_kg", "volume_ml", "length_cm", "pack_count",
                                "animal_weight_min_kg", "species", "breed_size")
                    if getattr(p, f, None) is not None)
        if score > best_score or (score == best_score and g < best):
            best, best_score = g, score
    return best


def resolve_sku_group_members(db: Session, gtin: str) -> list[SkuGroupMember]:
    """Membros ATIVOS do grupo do GTIN, exceto ele mesmo. Caminho de
    leitura do /commerce/offers."""
    g = normalize_gtin(gtin)
    if not g:
        return []
    keys = db.scalars(
        select(SkuGroupMember.group_key).where(
            SkuGroupMember.member_gtin == g, SkuGroupMember.status == "active"
        )
    ).all()
    if not keys:
        return []
    rows = db.scalars(
        select(SkuGroupMember).where(
            SkuGroupMember.group_key.in_(list(keys)),
            SkuGroupMember.status == "active",
            SkuGroupMember.member_gtin != g,
        )
    ).all()
    seen: set[str] = set()
    out: list[SkuGroupMember] = []
    for r in sorted(rows, key=lambda x: -x.confidence):
        if r.member_gtin in seen:
            continue
        seen.add(r.member_gtin)
        out.append(r)
    return out


def confirm_membership(db: Session, gtin_a: str, gtin_b: str, confirmed_by: str) -> str:
    a, b = normalize_gtin(gtin_a), normalize_gtin(gtin_b)
    if not a or not b or a == b:
        raise ValueError("gtins inválidos")
    key = f"manual:{min(a, b)}:{max(a, b)}"
    now = _now()
    for g in (a, b):
        row = db.scalar(select(SkuGroupMember).where(SkuGroupMember.group_key == key, SkuGroupMember.member_gtin == g))
        if row is None:
            db.add(SkuGroupMember(
                group_key=key, member_gtin=g, canonical_gtin=min(a, b),
                match_basis="ADMIN_CONFIRMED", status="active", confidence=1.0,
                evidence_json=json.dumps({"basis": "ADMIN_CONFIRMED", "by": confirmed_by, "at": now.isoformat()}),
                source="ADMIN", confirmed_by=confirmed_by,
            ))
        else:
            row.status = "active"
            row.match_basis = "ADMIN_CONFIRMED"
            row.confidence = 1.0
            row.confirmed_by = confirmed_by
            row.updated_at = now
    return key


def reject_pair(db: Session, gtin_a: str, gtin_b: str, confirmed_by: str) -> str:
    a, b = normalize_gtin(gtin_a), normalize_gtin(gtin_b)
    if not a or not b or a == b:
        raise ValueError("gtins inválidos")
    key = f"manual:{min(a, b)}:{max(a, b)}"
    now = _now()
    for g in (a, b):
        row = db.scalar(select(SkuGroupMember).where(SkuGroupMember.group_key == key, SkuGroupMember.member_gtin == g))
        if row is None:
            db.add(SkuGroupMember(
                group_key=key, member_gtin=g, canonical_gtin=min(a, b),
                match_basis="REFUSED", status="rejected", confidence=0.0,
                evidence_json=json.dumps({"basis": "REFUSED", "by": confirmed_by, "at": now.isoformat()}),
                source="ADMIN", confirmed_by=confirmed_by,
            ))
        else:
            row.status = "rejected"
            row.match_basis = "REFUSED"
            row.confirmed_by = confirmed_by
            row.updated_at = now
    # remove qualquer associação automática entre os dois
    for g in (a, b):
        _clear_auto_memberships(db, g, keep_key=None, dry_run=False)
    return key


@dataclass
class GroupBatchSummary:
    processed: int = 0
    grouped: int = 0
    ungrouped: int = 0
    changed: int = 0
    errors: int = 0
    remaining: int = 0


def rebuild_groups_batch(db: Session, *, max_products: int = 500, gtins: Optional[list[str]] = None) -> GroupBatchSummary:
    summary = GroupBatchSummary()
    if gtins is not None:
        queue = [n for x in gtins if (n := normalize_gtin(x or ""))]
    else:
        queue = [
            g for (g,) in db.execute(
                select(ProductCatalog.barcode_normalized).where(
                    ProductCatalog.canonical_brand.isnot(None),
                    ProductCatalog.barcode_normalized.isnot(None),
                )
            ).all() if g
        ]
    _brand_bucket(db, refresh=True)  # aquece o cache uma vez
    total = len(queue)
    for g in queue[:max_products]:
        summary.processed += 1
        try:
            r = rebuild_groups_for_gtin(db, g)
            db.commit()
            if r.group_key:
                summary.grouped += 1
            else:
                summary.ungrouped += 1
            if r.changed:
                summary.changed += 1
        except Exception as exc:  # noqa: BLE001
            db.rollback()
            summary.errors += 1
            logger.warning("[sku_grouping] gtin=%s falhou: %s", g, exc)
    summary.remaining = max(total - max_products, 0)
    _bucket_cache.pop(id(db), None)
    return summary

"""Admin — Petz: aprendizado de mapeamento produto↔Petz por produto (ver
petz_mapping.py). Endpoints simples, mesmo padrão de
admin/affiliate_links_router.py — sem painel administrativo completo.
"""
import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..affiliate_links import (
    PETZ_AFFILIATE_PROGRAM,
    PETZ_COUPON_CODE,
    PETZ_PARTNER_STORE_URL,
    ProductAffiliateLink,
)
from ..db import get_db
from ..petz_link_validator import InvalidPetzAffiliateUrlError, validate_petz_affiliate_url, validate_petz_product_url
from ..petz_mapping import (
    PetzProductMapping,
    PetzVariantConflictError,
    _pending_match_query,
    confirm_petz_mapping,
    coverage_stats,
    find_petz_id_conflicts,
    get_mapping,
    DIRECT_LINK_ELIGIBLE_STATUSES,
    reject_petz_candidate,
    suggest_petz_candidate,
)
from ..product_catalog_lookup import ProductCatalog, normalize_gtin
from .deps import get_current_admin, get_current_admin_or_readonly_key
from .schemas import (
    DeletedOut,
    PetzAttrCompare,
    PetzAuditOut,
    PetzCoverageOut,
    PetzEvaluateOut,
    PetzEvaluateRequest,
    PetzMappingConfirmRequest,
    PetzMappingOut,
    PetzMappingRejectRequest,
    PetzMappingSuggestOut,
    PetzQueueItem,
    PetzQueueOut,
    PetzSetAffiliateLinkRequest,
)

router = APIRouter(prefix="/v1/admin/petz", tags=["Admin Petz"])

# Status que já passaram por confirmação de PRODUTO. Usado só pelo
# endpoint legado/futuro de affiliate-link caso a Petz forneça deep-link
# oficial por produto algum dia.
_CONFIRMABLE_FOR_AFFILIATE = ("confirmed", "affiliate_pending", "affiliate_ready")


def _resolve_product(db: Session, gtin: str) -> ProductCatalog:
    gtin_normalized = normalize_gtin(gtin)
    if not gtin_normalized:
        raise HTTPException(status_code=400, detail="GTIN inválido")
    product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
    if not product:
        raise HTTPException(status_code=404, detail=f"Produto com GTIN {gtin_normalized} não encontrado em products_catalog")
    return product


def _to_out(mapping: Optional[PetzProductMapping], gtin: str) -> PetzMappingOut:
    if mapping is None:
        return PetzMappingOut(
            gtin=gtin,
            match_status="unknown",
            partner_store_url=PETZ_PARTNER_STORE_URL,
            coupon_code=PETZ_COUPON_CODE,
            affiliate_program=PETZ_AFFILIATE_PROGRAM,
            partner_ready=False,
            requires_affiliate_product_url=False,
        )
    return PetzMappingOut(
        id=mapping.id,
        product_id=mapping.product_id,
        gtin=gtin,
        petz_product_id=mapping.petz_product_id,
        product_url=mapping.product_url,
        direct_product_url=mapping.product_url,
        search_query=mapping.search_query,
        match_status=mapping.match_status,
        match_confidence=mapping.match_confidence,
        variant_label=mapping.variant_label,
        variant_weight_kg=mapping.variant_weight_kg,
        partner_store_url=PETZ_PARTNER_STORE_URL,
        coupon_code=PETZ_COUPON_CODE,
        affiliate_program=PETZ_AFFILIATE_PROGRAM,
        partner_ready=mapping.match_status in DIRECT_LINK_ELIGIBLE_STATUSES,
        requires_affiliate_product_url=False,
        rejection_reason=mapping.rejection_reason,
        last_verified_at=mapping.last_verified_at,
        created_at=mapping.created_at,
        updated_at=mapping.updated_at,
    )


@router.get("/coverage", response_model=PetzCoverageOut)
def get_coverage(db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    return PetzCoverageOut(**coverage_stats(db))


@router.get("/audit/conflicts", response_model=PetzAuditOut)
def get_id_conflicts(db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    """Auditoria permanente: acha todo petz_product_id compartilhado por
    produtos de peso/tamanho diferente (mapeamento garantidamente errado
    pra pelo menos um deles) + todo petz_product_id não-numérico
    (carrinho pré-montado nunca funciona pra esse item). Não faz nenhuma
    chamada à Petz — só leitura no banco. Ver incidentes coleira Scalibor
    e ração Royal Canin Urinary Small Dog."""
    return find_petz_id_conflicts(db)


@router.get("/queue", response_model=PetzQueueOut)
def get_match_queue(
    limit: int = 50,
    offset: int = 0,
    only_cobasi: bool = True,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    """Fila do painel de casamento assistido: produtos do catálogo (por
    padrão só os que a Cobasi — loja irmã, maior cobertura — tem) que a
    Petz ainda não casou (`unknown`/`candidate`/`ambiguous`). Ordenada por
    popularidade real (nº de scans do tutor). Só leitura — aceita
    ADMIN_OPS_API_KEY.

    Cada item traz a ficha da Cobasi (título, descrição, categoria, imagem,
    preço) — é o que o humano lê pra saber o que procurar na Petz. Não
    busca nada na Petz (a busca é 403 Akamai server-side); devolve o link
    `/busca?q=` pronto pro humano abrir e o termo sugerido separado."""
    from ..affiliate_feed import AffiliateFeedOffer
    from ..affiliate_links import petz_site_search_url, petz_size_hint_for_product
    from ..petz_mapping import build_petz_search_query

    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    base = _pending_match_query(db, only_cobasi=only_cobasi)
    total = db.scalar(select(func.count()).select_from(base.subquery())) or 0

    # Cobertura no universo escolhido (só Cobasi por padrão).
    cobasi_gtins = select(AffiliateFeedOffer.gtin).where(
        AffiliateFeedOffer.merchant == "cobasi",
        AffiliateFeedOffer.active.is_(True),
        AffiliateFeedOffer.gtin.is_not(None),
    )
    catalog_q = select(func.count()).select_from(ProductCatalog)
    matched_q = select(func.count(func.distinct(PetzProductMapping.product_id))).select_from(PetzProductMapping).join(
        ProductCatalog, ProductCatalog.id == PetzProductMapping.product_id
    ).where(PetzProductMapping.match_status.in_(tuple(DIRECT_LINK_ELIGIBLE_STATUSES)))
    rejected_q = select(func.count(func.distinct(PetzProductMapping.product_id))).select_from(PetzProductMapping).join(
        ProductCatalog, ProductCatalog.id == PetzProductMapping.product_id
    ).where(PetzProductMapping.match_status == "rejected")
    if only_cobasi:
        catalog_q = catalog_q.where(ProductCatalog.barcode_normalized.in_(cobasi_gtins))
        matched_q = matched_q.where(ProductCatalog.barcode_normalized.in_(cobasi_gtins))
        rejected_q = rejected_q.where(ProductCatalog.barcode_normalized.in_(cobasi_gtins))
    catalog_total = db.scalar(catalog_q) or 0
    matched = db.scalar(matched_q) or 0
    rejected = db.scalar(rejected_q) or 0

    items: list[PetzQueueItem] = []
    for product, scans in db.execute(base.offset(offset).limit(limit)).all():
        mapping = get_mapping(db, product.id)
        name = product.name or product.canonical_name or ""
        hint = petz_size_hint_for_product(product)
        term = build_petz_search_query(
            brand=product.brand,
            name=(product.canonical_name or name),
            weight_kg=product.weight_kg,
        ) or (product.canonical_name or name)
        if hint and not product.weight_kg and hint not in term:
            term = f"{term} {hint}"
        cobasi = db.scalar(
            select(AffiliateFeedOffer)
            .where(
                AffiliateFeedOffer.merchant == "cobasi",
                AffiliateFeedOffer.gtin == product.barcode_normalized,
                AffiliateFeedOffer.active.is_(True),
            )
            .order_by(AffiliateFeedOffer.last_synced_at.desc().nullslast())
            .limit(1)
        )
        items.append(
            PetzQueueItem(
                gtin=product.barcode_normalized,
                product_id=product.id,
                name=name,
                canonical_name=product.canonical_name,
                brand=product.brand,
                weight_kg=product.weight_kg,
                volume_ml=getattr(product, "volume_ml", None),
                pack_count=getattr(product, "pack_count", None),
                species=getattr(product, "species", None),
                product_line=getattr(product, "product_line", None),
                product_family=getattr(product, "product_family", None),
                flavor=getattr(product, "flavor", None),
                breed_size=getattr(product, "breed_size", None),
                animal_weight_min_kg=getattr(product, "animal_weight_min_kg", None),
                animal_weight_max_kg=getattr(product, "animal_weight_max_kg", None),
                thumbnail_url=getattr(product, "thumbnail_url", None) or (cobasi.image_url if cobasi else None),
                scans=int(scans or 0),
                match_status=mapping.match_status if mapping else "unknown",
                rejection_reason=mapping.rejection_reason if mapping else None,
                petz_search_url=petz_site_search_url(
                    (product.canonical_name or name), product.brand, size_hint=hint
                ),
                suggested_search_term=term,
                cobasi_title=cobasi.title if cobasi else None,
                cobasi_description=(cobasi.description[:600] if cobasi and cobasi.description else None),
                cobasi_category=cobasi.category if cobasi else None,
                cobasi_url=(cobasi.merchant_url or cobasi.affiliate_url) if cobasi else None,
                cobasi_image_url=cobasi.image_url if cobasi else None,
                cobasi_price=cobasi.price if cobasi else None,
            )
        )
    return PetzQueueOut(
        total=total, limit=limit, offset=offset, only_cobasi=only_cobasi,
        catalog_total=catalog_total, matched=matched, rejected=rejected, items=items,
    )


@router.get("/backfill/catalog")
def backfill_catalog(
    limit: int = 1000,
    offset: int = 0,
    only_unmapped: bool = True,
    source: Optional[str] = None,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    """Dump paginado do catálogo (GTIN + nome + marca + peso) pra alimentar
    o matching GTIN→id Petz do carrinho pré-montado. Só leitura — aceita
    ADMIN_OPS_API_KEY. `only_unmapped` pula produtos que já têm mapping
    confirmado. `source=cobasi` (ou outro merchant) restringe aos produtos
    que têm oferta ativa desse feed — a "lista Cobasi".
    Ver docs/PETZ_COMMISSION_VALIDATION.md."""
    limit = max(1, min(limit, 5000))
    q = select(ProductCatalog).order_by(ProductCatalog.id)
    if only_unmapped:
        mapped_ids = select(PetzProductMapping.product_id).where(
            PetzProductMapping.match_status.in_(tuple(DIRECT_LINK_ELIGIBLE_STATUSES))
        )
        q = q.where(ProductCatalog.id.not_in(mapped_ids))
    if source:
        from ..affiliate_feed import AffiliateFeedOffer

        feed_gtins = select(AffiliateFeedOffer.gtin).where(
            AffiliateFeedOffer.merchant == source.strip().lower(),
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.gtin.is_not(None),
        )
        q = q.where(ProductCatalog.barcode_normalized.in_(feed_gtins))
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.scalars(q.offset(offset).limit(limit)).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "products": [
            {
                "gtin": r.barcode_normalized,
                "name": r.name,
                "brand": r.brand,
                "weight_kg": r.weight_kg,
            }
            for r in rows
        ],
    }


@router.get("/products/{gtin}/status", response_model=PetzMappingOut)
def get_status(gtin: str, db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    product = _resolve_product(db, gtin)
    mapping = get_mapping(db, product.id)
    return _to_out(mapping, product.barcode_normalized)


@router.get("/products/{gtin}/suggest", response_model=PetzMappingSuggestOut)
def get_suggestion(gtin: str, db: Session = Depends(get_db), current=Depends(get_current_admin_or_readonly_key)):
    """Gera/atualiza a query de busca sugerida — NUNCA busca na Petz, só
    monta o texto pra um humano pesquisar manualmente (ver
    petz_mapping.build_petz_search_query)."""
    product = _resolve_product(db, gtin)
    mapping = suggest_petz_candidate(
        db, product.id, gtin=product.barcode_normalized, brand=product.brand, name=product.name,
    )
    return PetzMappingSuggestOut(
        gtin=product.barcode_normalized,
        search_query=mapping.search_query,
        current_status=mapping.match_status,
    )


@router.post("/products/{gtin}/evaluate", response_model=PetzEvaluateOut)
def evaluate_candidate_url(
    gtin: str,
    payload: PetzEvaluateRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin_or_readonly_key),
):
    """Pontua uma URL de produto da Petz colada pelo humano contra a
    identidade do produto do catálogo (âncora Cobasi). NÃO grava nada —
    é o passo de revisão antes do /confirm. Usa o MESMO motor
    (`structural_conflict` / `evaluate_identity`) da guarda de #333.

    verdict: "match" (pode confirmar) · "weak" (confirme com cuidado) ·
    "conflict" (peso/pack diverge — o /confirm vai recusar) · "invalid"
    (não é URL de produto da Petz)."""
    from ..affiliate_links import PETZ_COUPON_APPLY_URL, deslug_petz_product_url, petz_cart_add_url
    from ..product_identity import (
        AttributeStatus,
        IdentityDecision,
        MerchantCandidate,
        ProductIdentity,
        evaluate_identity,
        structural_conflict,
    )
    from ..shopee_offer_matcher import extract_weight_kg

    product = _resolve_product(db, gtin)

    raw_url = (payload.product_url or "").strip()
    try:
        clean_url = validate_petz_product_url(raw_url)
    except InvalidPetzAffiliateUrlError as exc:
        return PetzEvaluateOut(verdict="invalid", reason=str(exc), would_confirm=False)

    deslug = deslug_petz_product_url(clean_url) or None
    petz_pid_match = re.search(r"-(\d+)/?$", clean_url)
    petz_pid = petz_pid_match.group(1) if petz_pid_match else None
    extracted_weight = extract_weight_kg(deslug) if deslug else None

    cat_id = ProductIdentity.from_catalog(product)
    probe_id = ProductIdentity.build(canonical_name=deslug or "", weight_kg=extracted_weight)
    conflict = structural_conflict(cat_id, probe_id)
    result = evaluate_identity(
        cat_id, MerchantCandidate.build(merchant="petz", title=deslug, brand=product.brand)
    )

    # Tabela lado a lado: só os atributos que aparecem em algum dos dois.
    _LABELS = {
        "weight_kg": "Peso", "brand": "Marca", "pack_count": "Unidades",
        "flavor": "Sabor", "species": "Espécie", "volume_ml": "Volume",
        "breed_size": "Porte", "animal_weight_range": "Faixa de peso do pet",
        "life_stage": "Fase", "product_family": "Família",
    }
    _STATUS = {AttributeStatus.MATCH: "match", AttributeStatus.CONFLICT: "conflict", AttributeStatus.UNKNOWN: "unknown"}
    comparison = [
        PetzAttrCompare(
            attribute=_LABELS.get(a.attribute, a.attribute),
            catalog=None if a.expected is None else str(a.expected),
            petz=None if a.observed is None else str(a.observed),
            status=_STATUS.get(a.status, "unknown"),
        )
        for a in result.attributes
        if a.attribute in _LABELS and (a.expected is not None or a.observed is not None)
    ]

    if conflict:
        verdict, reason, would_confirm = "conflict", conflict, False
    elif result.decision in (IdentityDecision.EXACT, IdentityDecision.HIGH_CONFIDENCE):
        verdict, would_confirm = "match", True
        reason = ", ".join(result.reasons) or None
    else:
        verdict, would_confirm = "weak", True
        reason = f"{result.decision.value.lower()} — {', '.join(result.reasons) or 'sem sinal forte de identidade'}"

    return PetzEvaluateOut(
        verdict=verdict,
        reason=reason,
        would_confirm=would_confirm,
        deslug_text=deslug,
        extracted_weight_kg=extracted_weight,
        petz_product_id=petz_pid,
        catalog_weight_kg=product.weight_kg,
        cart_test_url=petz_cart_add_url(petz_pid) if petz_pid else None,
        coupon_apply_url=PETZ_COUPON_APPLY_URL if petz_pid else None,
        comparison=comparison,
    )


@router.post("/products/{gtin}/confirm", response_model=PetzMappingOut)
def confirm(
    gtin: str,
    payload: PetzMappingConfirmRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    """Confirmação humana do PRODUTO (petz_product_id + URL direta +
    variante) — não vincula link afiliado nem publica oferta sozinho."""
    product = _resolve_product(db, gtin)
    try:
        validate_petz_product_url(payload.product_url)
    except InvalidPetzAffiliateUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    try:
        mapping = confirm_petz_mapping(
            db,
            product.id,
            petz_product_id=payload.petz_product_id,
            product_url=payload.product_url,
            variant_label=payload.variant_label,
            variant_weight_kg=payload.variant_weight_kg,
            match_confidence=payload.match_confidence,
        )
    except PetzVariantConflictError as exc:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Variante não confere com o produto do catálogo ({exc}). "
                "O mapeamento foi marcado como ambíguo — reveja o tamanho antes de confirmar."
            ),
        )
    return _to_out(mapping, product.barcode_normalized)


@router.post("/products/{gtin}/reject", response_model=PetzMappingOut)
def reject(
    gtin: str,
    payload: PetzMappingRejectRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    product = _resolve_product(db, gtin)
    mapping = reject_petz_candidate(db, product.id, reason=payload.reason)
    return _to_out(mapping, product.barcode_normalized)


@router.post("/products/{gtin}/affiliate-link", response_model=PetzMappingOut)
def set_affiliate_link(
    gtin: str,
    payload: PetzSetAffiliateLinkRequest,
    db: Session = Depends(get_db),
    current=Depends(get_current_admin),
):
    """Endpoint legado/futuro para deep-link Petz oficial por produto.
    O modelo atual de lançamento é Petz Partner storefront + cupom
    PETMOL; este endpoint não é necessário para produto confirmado
    ficar pronto no caminho /commerce/petz-direct-link."""
    product = _resolve_product(db, gtin)
    mapping = get_mapping(db, product.id)
    if mapping is None or mapping.match_status not in _CONFIRMABLE_FOR_AFFILIATE:
        raise HTTPException(
            status_code=409,
            detail="Produto precisa estar com match_status=confirmed antes de vincular link afiliado",
        )

    try:
        validate_petz_affiliate_url(payload.affiliate_product_url)
    except InvalidPetzAffiliateUrlError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    link = db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product.id,
            ProductAffiliateLink.merchant == "petz",
        )
    )
    if link is None:
        link = ProductAffiliateLink(
            product_id=product.id,
            merchant="petz",
            affiliate_product_url=payload.affiliate_product_url,
            direct_product_url=mapping.product_url,
            affiliate_program="petz_partner",
            active=True,
        )
        db.add(link)
    else:
        link.affiliate_product_url = payload.affiliate_product_url
        link.direct_product_url = mapping.product_url
        link.affiliate_program = "petz_partner"
        link.active = True
    link.verified_at = datetime.now(timezone.utc)

    mapping.match_status = "affiliate_ready"
    mapping.last_verified_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(mapping)
    return _to_out(mapping, product.barcode_normalized)


@router.delete("/products/{gtin}/affiliate-link", response_model=DeletedOut)
def remove_affiliate_link(gtin: str, db: Session = Depends(get_db), current=Depends(get_current_admin)):
    """Remove o link afiliado (ex: comissão nunca comprovada por venda
    real) — o mapping de produto (confirmed) permanece, só a
    monetização é desfeita, voltando o produto a 'confirmed'."""
    product = _resolve_product(db, gtin)
    link = db.scalar(
        select(ProductAffiliateLink).where(
            ProductAffiliateLink.product_id == product.id,
            ProductAffiliateLink.merchant == "petz",
        )
    )
    if link:
        db.delete(link)

    mapping = get_mapping(db, product.id)
    if mapping and mapping.match_status == "affiliate_ready":
        mapping.match_status = "confirmed"

    db.commit()
    return DeletedOut()

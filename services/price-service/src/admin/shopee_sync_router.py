"""
Gatilho HTTP pro sync em lote da Shopee (shopee_offer_sync.py) — existe
pra poder disparar e acompanhar isso via HTTPS, sem precisar de uma
sessão SSH toda vez (ver docs/AFFILIATES.md, seção Shopee).

Roda em thread própria (threading.Thread, nunca asyncio.BackgroundTasks
puro) de propósito: sync_shopee_offer_for_gtin faz chamada de rede e de
banco BLOQUEANTES; se isto rodasse na mesma event loop do FastAPI,
travaria o servidor inteiro pelos ~40 minutos que o lote inteiro leva.
Uma thread daemon separada mantém o resto da API respondendo normalmente
enquanto o sync roda.

Autenticação: token dedicado (SHOPEE_SYNC_TRIGGER_TOKEN), separado do
ADMIN_OPS_API_KEY — aquele é só leitura por design (ver admin/deps.py,
"nunca em rota de escrita"); este endpoint tem efeito colateral real
(grava MarketplaceOffer), então nunca reaproveita a chave read-only.
"""
from __future__ import annotations

import hmac
import logging
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from ..affiliate_feed import AffiliateFeedSyncRun
from ..affiliate_links import MarketplaceOffer
from ..config import get_settings
from ..db import SessionLocal
from ..product_catalog_lookup import ProductCatalog
from ..shopee_offer_sync import (
    has_active_shopee_offer_for_gtin,
    iter_active_product_gtins,
    iter_active_shopee_offer_gtins,
    iter_awin_feed_products,
    iter_launch_coverage_queue,
    iter_unified_awin_feed_products,
    sync_shopee_offer_for_gtin,
    sync_shopee_offer_from_feed_row,
)
from ..shopee_offer_audit import audit_active_shopee_offers
from ..shopee_discovery_attempt import ShopeeDiscoveryAttempt, record_attempt, should_attempt_discovery
from .deps import get_current_admin_or_readonly_key
from .shopee_sync_state import STATE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/v1/admin/shopee-sync", tags=["Admin Shopee Sync"])

DEFAULT_CATEGORIES = ["food", "antiparasite", "medication", "hygiene", "dewormer", "collar"]
# "active_products": fila noturna em prioridades (ofertas Shopee ativas →
# GTINs usados pelos tutores → catálogo Awin fresco), deduplicada por GTIN,
# com teto por execução. É o source do job da madrugada a partir do RC 1.0.
ALLOWED_SOURCES = {"categories", "awin_feed", "awin_feed_all", "active_products"}
DEFAULT_AUDIT_MAX_ROWS = 500


class RunRequest(BaseModel):
    categories: Optional[list[str]] = None
    # "categories": products_catalog filtrado por categoria (só o que já
    #   foi escaneado por algum tutor).
    # "awin_feed": catálogo real do feed Awin/Cobasi (milhares de produtos,
    #   independente do que qualquer tutor específico já cadastrou —
    #   cria a entrada em products_catalog quando ainda não existir).
    # "awin_feed_all": catálogo unificado Cobasi + Zee Now + Zee Dog,
    #   deduplicado por GTIN e incremental por padrão.
    source: str = "categories"
    feed_merchant: str = "cobasi"
    feed_merchants: Optional[list[str]] = None
    skip_existing_shopee: bool = True
    audit_existing_shopee: bool = True
    deactivate_invalid_shopee: bool = True
    audit_max_rows: Optional[int] = DEFAULT_AUDIT_MAX_ROWS


def _require_token(x_sync_token: Optional[str]) -> None:
    settings = get_settings()
    if not settings.shopee_sync_trigger_token or not x_sync_token or not hmac.compare_digest(
        x_sync_token, settings.shopee_sync_trigger_token
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")


def _last_successful_awin_sync(db, merchant: str) -> Optional[datetime]:
    return db.scalar(
        select(AffiliateFeedSyncRun.finished_at)
        .where(
            AffiliateFeedSyncRun.network == "awin",
            AffiliateFeedSyncRun.merchant == merchant,
            AffiliateFeedSyncRun.status == "success",
        )
        .order_by(AffiliateFeedSyncRun.finished_at.desc())
        .limit(1)
    )


def _assert_awin_source_fresh(db, merchants: tuple[str, ...]) -> None:
    """Shopee enrichment depends on Awin as the product identity source.

    If Shopee keeps refreshing while Awin is stale, /commerce/offers can
    show only Shopee because AwinFeedProvider correctly blocks stale feeds.
    Refuse that run loudly instead of making marketplace data the only
    fresh commercial source.
    """
    settings = get_settings()
    cutoff = datetime.now(timezone.utc) - timedelta(hours=settings.awin_stale_after_hours)
    stale: list[str] = []
    for merchant in merchants:
        last_success = _last_successful_awin_sync(db, merchant)
        if last_success is None:
            stale.append(f"{merchant}:never_synced")
            continue
        if last_success.tzinfo is None:
            last_success = last_success.replace(tzinfo=timezone.utc)
        if last_success < cutoff:
            stale.append(f"{merchant}:{last_success.isoformat()}")
    if stale:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Awin feed stale; run petmol-awin-sync before Shopee sync "
                f"(stale={', '.join(stale)})"
            ),
        )


def _run_sync(
    categories: list[str],
    source: str = "categories",
    feed_merchant: str = "cobasi",
    feed_merchants: Optional[list[str]] = None,
    skip_existing_shopee: bool = True,
    audit_existing_shopee: bool = True,
    deactivate_invalid_shopee: bool = True,
    audit_max_rows: Optional[int] = DEFAULT_AUDIT_MAX_ROWS,
) -> None:
    db = SessionLocal()
    try:
        source_merchants = tuple(feed_merchants or ["cobasi", "zeenow", "zeedog"])
        if source == "awin_feed_all":
            _assert_awin_source_fresh(db, source_merchants)
        elif source == "awin_feed":
            _assert_awin_source_fresh(db, (feed_merchant,))

        if source == "awin_feed_all" and audit_existing_shopee:
            with STATE.lock:
                STATE.phase = "auditing_existing_shopee"
                STATE.total = 0
                STATE.processed = 0

            def _audit_progress(processed: int, audit_result) -> None:
                with STATE.lock:
                    STATE.audit_total = audit_result.total
                    STATE.audit_processed = processed
                    STATE.audit_invalid = audit_result.invalid
                    STATE.audit_deactivated = audit_result.deactivated
                    # Enquanto estamos auditando, reaproveita os campos
                    # principais para a barra de progresso existente.
                    STATE.total = audit_result.total
                    STATE.processed = processed

            audit = audit_active_shopee_offers(
                db,
                source_merchants=source_merchants,
                deactivate_invalid=deactivate_invalid_shopee,
                max_rows=audit_max_rows,
                progress_callback=_audit_progress,
            )
            with STATE.lock:
                STATE.audit_total = audit.total
                STATE.audit_processed = audit.total
                STATE.audit_invalid = audit.invalid
                STATE.audit_deactivated = audit.deactivated

        with STATE.lock:
            STATE.phase = "building_queue"

        settings = get_settings()
        remaining_after_cap = 0
        if source == "awin_feed_all":
            items: list[tuple[str, Optional[str], Optional[str]]] = iter_unified_awin_feed_products(
                db,
                merchants=source_merchants,
                skip_existing_shopee=skip_existing_shopee,
            )
        elif source == "awin_feed":
            items = iter_awin_feed_products(
                db,
                merchant=feed_merchant,
                skip_existing_shopee=skip_existing_shopee,
            )
        elif source == "active_products":
            # Fila noturna determinística em prioridades (A: ofertas Shopee
            # ativas → B: GTINs usados pelos tutores → C: catálogo Awin
            # fresco), deduplicada por GTIN, cortada no teto por execução.
            items, total_available = iter_launch_coverage_queue(
                db,
                max_products=max(settings.shopee_sync_max_products_per_run, 1),
                feed_merchants=source_merchants,
            )
            remaining_after_cap = max(total_available - len(items), 0)
        else:
            rows = db.query(ProductCatalog.barcode_normalized).filter(
                ProductCatalog.category.in_(categories),
                ProductCatalog.name.isnot(None),
                ProductCatalog.brand.isnot(None),
            ).all()
            items = [(r[0], None, None) for r in rows]

        with STATE.lock:
            STATE.total = len(items)
            STATE.processed = 0
            STATE.matched = 0
            STATE.refreshed_existing = 0
            STATE.new_matches = 0
            STATE.misses = 0
            STATE.errors = 0
            STATE.skipped_cooldown = 0
            STATE.remaining_after_cap = remaining_after_cap
            STATE.duration_seconds = 0.0
            STATE.error = None
            STATE.finished_at = None
            STATE.phase = "syncing"

        if source == "active_products":
            started_monotonic = time.monotonic()
            delay_seconds = max(settings.shopee_sync_request_delay_seconds, 0.0)
            for gtin, _name, _brand in items:
                had_offer = has_active_shopee_offer_for_gtin(db, gtin)
                # Cooldown por GTIN só vale pra descoberta nova (miss
                # recente); oferta ativa é sempre revalidada.
                if not had_offer and not should_attempt_discovery(db, gtin):
                    with STATE.lock:
                        STATE.processed += 1
                        STATE.skipped_cooldown += 1
                    continue
                try:
                    result = sync_shopee_offer_for_gtin(db, gtin)
                    reason = (result.reason or "").lower()
                    if "erro na api" in reason:
                        outcome = "error"
                    elif result.matched:
                        outcome = "refresh" if had_offer else "new"
                    else:
                        outcome = "miss"
                except Exception as exc:  # noqa: BLE001 — um GTIN ruim nunca derruba o lote
                    logger.warning("shopee sync (active_products): erro em gtin=%s: %s", gtin, exc)
                    db.rollback()
                    outcome = "error"

                if not had_offer:
                    # Persiste o cooldown só pra descoberta nova; refresh de
                    # oferta existente não entra na tabela de tentativas.
                    _result_map = {"new": "matched", "miss": "no_match", "error": "api_error"}
                    try:
                        record_attempt(db, gtin, _result_map[outcome])
                    except Exception:  # noqa: BLE001 — cooldown é best-effort
                        db.rollback()

                with STATE.lock:
                    STATE.processed += 1
                    if outcome == "refresh":
                        STATE.refreshed_existing += 1
                        STATE.matched += 1
                    elif outcome == "new":
                        STATE.new_matches += 1
                        STATE.matched += 1
                    elif outcome == "miss":
                        STATE.misses += 1
                    else:
                        STATE.errors += 1
                if delay_seconds:
                    time.sleep(delay_seconds)

            duration = round(time.monotonic() - started_monotonic, 1)
            with STATE.lock:
                STATE.duration_seconds = duration
                summary = (
                    f"existing_refreshed={STATE.refreshed_existing} "
                    f"new_matches={STATE.new_matches} misses={STATE.misses} "
                    f"errors={STATE.errors} skipped_cooldown={STATE.skipped_cooldown} "
                    f"processed={STATE.processed} remaining={STATE.remaining_after_cap} "
                    f"duration_seconds={duration}"
                )
            logger.info("shopee sync (active_products) concluído: %s", summary)
            return

        sync_from_feed_source = source in {"awin_feed", "awin_feed_all"}
        for gtin, name, brand in items:
            try:
                if sync_from_feed_source:
                    result = sync_shopee_offer_from_feed_row(db, gtin, name or "", brand)
                else:
                    result = sync_shopee_offer_for_gtin(db, gtin)
                matched = result.matched
            except Exception as exc:  # noqa: BLE001 — um GTIN ruim não pode derrubar o lote inteiro
                logger.warning("shopee sync (admin trigger): erro inesperado em gtin=%s: %s", gtin, exc)
                matched = False
            with STATE.lock:
                STATE.processed += 1
                if matched:
                    STATE.matched += 1
            time.sleep(0.4)
    except Exception as exc:  # noqa: BLE001 — job em background, precisa registrar erro em vez de sumir calado
        logger.exception("shopee sync (admin trigger): erro fatal no lote")
        with STATE.lock:
            STATE.error = str(exc)
    finally:
        db.close()
        with STATE.lock:
            STATE.running = False
            STATE.phase = "finished" if STATE.error is None else "error"
            STATE.finished_at = datetime.now(timezone.utc).isoformat()


@router.post("/run")
def run_sync(payload: RunRequest, x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _require_token(x_sync_token)
    if payload.source not in ALLOWED_SOURCES:
        raise HTTPException(status_code=400, detail=f"source inválido: {payload.source}")
    source_merchants = tuple(payload.feed_merchants or ["cobasi", "zeenow", "zeedog"])
    if payload.source in {"awin_feed", "awin_feed_all"}:
        db = SessionLocal()
        try:
            if payload.source == "awin_feed_all":
                _assert_awin_source_fresh(db, source_merchants)
            else:
                _assert_awin_source_fresh(db, (payload.feed_merchant,))
        finally:
            db.close()
    with STATE.lock:
        if STATE.running:
            return {"started": False, "reason": "already_running"}
        STATE.running = True
        STATE.started_at = datetime.now(timezone.utc).isoformat()
        STATE.phase = "starting"
        STATE.audit_total = 0
        STATE.audit_processed = 0
        STATE.audit_invalid = 0
        STATE.audit_deactivated = 0

    categories = payload.categories or DEFAULT_CATEGORIES
    thread = threading.Thread(
        target=_run_sync,
        args=(
            categories,
            payload.source,
            payload.feed_merchant,
            payload.feed_merchants,
            payload.skip_existing_shopee,
            payload.audit_existing_shopee,
            payload.deactivate_invalid_shopee,
            payload.audit_max_rows,
        ),
        daemon=True,
    )
    thread.start()
    return {
        "started": True,
        "categories": categories,
        "source": payload.source,
        "feed_merchant": payload.feed_merchant,
        "feed_merchants": payload.feed_merchants,
        "skip_existing_shopee": payload.skip_existing_shopee,
        "audit_existing_shopee": payload.audit_existing_shopee,
        "deactivate_invalid_shopee": payload.deactivate_invalid_shopee,
        "audit_max_rows": payload.audit_max_rows,
    }


@router.get("/status")
def get_status(x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token")):
    _require_token(x_sync_token)
    return _status_payload()


@router.get("/progress")
def get_progress(_current=Depends(get_current_admin_or_readonly_key)):
    return _status_payload()


@router.get("/coverage")
def get_coverage(
    x_sync_token: Optional[str] = Header(default=None, alias="X-Sync-Token"),
    include_feed_scan: bool = Query(
        default=False,
        description="Inclui a prioridade C (varredura do feed Awin sem oferta Shopee) — "
        "mais lento (N+1 por linha de feed). Sem isso, `queue` só cobre A e B.",
    ),
):
    """Foto da cobertura Shopee no banco (não é o progresso do último sync —
    isso é /status). Read-only, agregado, sem token no payload. Serve para
    responder 'quantos produtos ainda não têm oferta' e 'em quantas noites
    o job zera a fila'."""
    _require_token(x_sync_token)
    db = SessionLocal()
    try:
        return _coverage_payload(db, include_feed_scan=include_feed_scan)
    finally:
        db.close()


def _coverage_payload(db, *, include_feed_scan: bool) -> dict:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    stale_cutoff = now - timedelta(hours=settings.marketplace_offer_stale_after_hours)
    miss_cutoff = now - timedelta(hours=settings.shopee_miss_retry_hours)
    api_err_cutoff = now - timedelta(hours=1)

    def _count(*where) -> int:
        return int(db.scalar(select(func.count()).select_from(MarketplaceOffer).where(*where)) or 0)

    active = MarketplaceOffer.merchant == "shopee", MarketplaceOffer.active.is_(True)
    active_total = _count(*active)
    active_with_price = _count(*active, MarketplaceOffer.price.isnot(None))
    active_stale = _count(
        *active,
        (MarketplaceOffer.last_checked_at.is_(None)) | (MarketplaceOffer.last_checked_at < stale_cutoff),
    )
    inactive_total = _count(MarketplaceOffer.merchant == "shopee", MarketplaceOffer.active.is_(False))
    distinct_products_covered = int(
        db.scalar(
            select(func.count(func.distinct(MarketplaceOffer.product_id))).where(*active)
        ) or 0
    )

    # Tentativas de discovery on-demand (uma linha por GTIN).
    attempt_rows = db.execute(
        select(ShopeeDiscoveryAttempt.last_result, func.count(), func.sum(ShopeeDiscoveryAttempt.attempts))
        .group_by(ShopeeDiscoveryAttempt.last_result)
    ).all()
    attempts = {"matched": 0, "no_match": 0, "api_error": 0}
    total_attempt_events = 0
    for result, cnt, ev in attempt_rows:
        attempts[result] = int(cnt)
        total_attempt_events += int(ev or 0)
    in_cooldown_now = int(
        db.scalar(
            select(func.count()).select_from(ShopeeDiscoveryAttempt).where(
                ((ShopeeDiscoveryAttempt.last_result == "no_match") & (ShopeeDiscoveryAttempt.last_attempt_at >= miss_cutoff))
                | ((ShopeeDiscoveryAttempt.last_result == "api_error") & (ShopeeDiscoveryAttempt.last_attempt_at >= api_err_cutoff))
            )
        ) or 0
    )

    priority_a = len(iter_active_shopee_offer_gtins(db))
    priority_b = len(iter_active_product_gtins(db))
    queue: dict = {
        "priority_a_active_refresh": priority_a,
        "priority_b_scanned_product_gtins": priority_b,
    }
    total_pending: Optional[int] = None
    if include_feed_scan:
        _q, total_pending = iter_launch_coverage_queue(db, max_products=10**9)
        priority_c = len(iter_unified_awin_feed_products(db, skip_existing_shopee=True))
        queue["priority_c_awin_fresh_without_offer"] = priority_c
        queue["total_pending_deduped"] = total_pending
    else:
        queue["note"] = "priority C (feed scan) omitida — chame com ?include_feed_scan=true"

    with STATE.lock:
        last_run = {
            "processed": STATE.processed,
            "new_matches": STATE.new_matches,
            "refreshed_existing": STATE.refreshed_existing,
            "misses": STATE.misses,
            "errors": STATE.errors,
            "skipped_cooldown": STATE.skipped_cooldown,
            "remaining_after_cap": STATE.remaining_after_cap,
            "duration_seconds": STATE.duration_seconds,
            "finished_at": STATE.finished_at,
        }

    cap = settings.shopee_sync_max_products_per_run
    # Ritmo efetivo por noite: quanto o último run realmente descobriu de
    # oferta nova (não conta refresh de oferta que já existia). Só dá pra
    # estimar noites se houver um run recente com sinal.
    effective_new_per_run = last_run["new_matches"] if last_run["processed"] else None
    estimated_nights = None
    if include_feed_scan and total_pending and effective_new_per_run:
        estimated_nights = round(total_pending / max(effective_new_per_run, 1), 1)

    return {
        "generated_at": now.isoformat(),
        "config": {
            "shopee_affiliate_enabled": settings.shopee_affiliate_enabled,
            "max_products_per_run": cap,
            "miss_retry_hours": settings.shopee_miss_retry_hours,
            "stale_after_hours": settings.marketplace_offer_stale_after_hours,
        },
        "offers": {
            "active_total": active_total,
            "active_with_price": active_with_price,
            "active_without_current_price_stale": active_stale,
            "inactive_total": inactive_total,
            "distinct_products_covered": distinct_products_covered,
        },
        "discovery_attempts": {
            "gtins_tried": attempts["matched"] + attempts["no_match"] + attempts["api_error"],
            "matched": attempts["matched"],
            "no_match": attempts["no_match"],
            "api_error": attempts["api_error"],
            "attempt_events_total": total_attempt_events,
            "in_cooldown_now": in_cooldown_now,
        },
        "queue": queue,
        "pace": {
            "per_run_cap": cap,
            "last_run": last_run,
            "estimated_new_matches_per_run": effective_new_per_run,
            "estimated_nights_to_clear_pending": estimated_nights,
            "formula": "estimated_nights = total_pending_deduped / new_matches_do_ultimo_run",
        },
    }


def _status_payload():
    with STATE.lock:
        total = STATE.total
        processed = STATE.processed
        matched = STATE.matched
        percent = round((processed / total) * 100, 2) if total else 0.0
        match_rate = round((matched / processed) * 100, 2) if processed else 0.0
        return {
            "running": STATE.running,
            "phase": STATE.phase,
            "total": total,
            "processed": processed,
            "matched": matched,
            "audit_total": STATE.audit_total,
            "audit_processed": STATE.audit_processed,
            "audit_invalid": STATE.audit_invalid,
            "audit_deactivated": STATE.audit_deactivated,
            "percent": percent,
            "remaining": max(total - processed, 0),
            "match_rate": match_rate,
            # Fila noturna em prioridades (source=active_products)
            "refreshed_existing": STATE.refreshed_existing,
            "new_matches": STATE.new_matches,
            "misses": STATE.misses,
            "errors": STATE.errors,
            "skipped_cooldown": STATE.skipped_cooldown,
            "remaining_after_cap": STATE.remaining_after_cap,
            "duration_seconds": STATE.duration_seconds,
            "started_at": STATE.started_at,
            "finished_at": STATE.finished_at,
            "error": STATE.error,
        }

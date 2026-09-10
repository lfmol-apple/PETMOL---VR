"""
PETMOL Price Service API

FastAPI application for searching and comparing pet product prices.
"""
import hashlib
import os
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from fastapi import FastAPI, HTTPException, Query, Request, File, UploadFile, Form, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import get_settings
from .rate_limit import rate_limit
from .models import (
    Currency,
    ErrorResponse,
    HealthResponse,
    PackSizeUnit,
    Provider,
    SearchQuery,
    SearchResult,
    UnitSystem,
    CatalogCandidate,
    CatalogSearchResult,
    CanonicalProduct,
    NormalizeResult,
    CatalogPackSize,
)
from .search import clear_cache, search_offers
from .utils.weights import parse_weight_to_kg, calculate_price_per_kg
from .auth import ml_oauth_router
from .auth.ml_oauth import debug_router as ml_debug_router
from sqlalchemy import case, func, or_, select
from sqlalchemy.orm import Session
from .db import Base, engine, SessionLocal, get_db
from .user_auth import user_auth_router
from .pets import pets_router
from .pets import models as _pets_models
from .pets.vaccine_models import VaccineRecord as _  # Import to register with Base
from .pets.parasite_models import ParasiteControlRecord as _pcr  # register with Base
from .pets.grooming_models import GroomingRecord as _gr  # register with Base
from .health import models as _health_models  # Import health models to register with Base
from .admin import admin_router
from .admin import affiliate_links_admin_router
from .admin import affiliate_feed_metrics_admin_router
from .admin import marketplace_offers_admin_router, shopee_sync_admin_router
from .admin import petz_admin_router
from .admin import monetization_coverage_admin_router
from .admin import commerce_identity_admin_router
from .admin import shopee_coverage_admin_router
from .admin import admin_debug_router
from .admin import admin_analytics_router
from .admin import models as _admin_models
from .affiliate_links import ProductAffiliateLink as _product_affiliate_link_model  # noqa: F401 — register with Base
from .affiliate_links import MarketplaceOffer as _marketplace_offer_model  # noqa: F401 — register with Base
from .affiliate_feed import AffiliateFeedOffer as _affiliate_feed_offer_model  # noqa: F401 — register with Base
from .petz_mapping import PetzProductMapping as _petz_product_mapping_model  # noqa: F401 — register with Base
from .admin.models import AdminUser
from .user_auth.models import PasswordResetToken as _password_reset_token_model  # noqa: F401
from .user_auth.models import User
from .user_auth.deps import get_current_user
from .user_auth.security import hash_password
from .version import get_version_info
from .product_lookup import router as product_lookup_router
from .gtin_router import router as gtin_router
# SLICE 1: Import new services models to register with Base
from .services import models as _services_models

# SLICE 3: Import events models to register with Base
from .events import models as _events_models

# OSM pet places — register with Base (offline, no Google)
from .places import models as _places_models  # noqa: F401

# Monthly check-in reminders
from .checkin import models as _checkin_models  # noqa: F401
from .checkin.router import router as checkin_router

# Lightweight cache to avoid repeated paid vision calls for the same image.
try:
    from cachetools import TTLCache

    _vaccine_card_ai_cache: TTLCache = TTLCache(maxsize=512, ttl=60 * 60 * 24)  # 24h
except Exception:
    _vaccine_card_ai_cache = None

# Load local env files (secrets first), so keys like GEMINI_API_KEY/OPENAI_API_KEY
# are available via os.environ.
try:
    from dotenv import load_dotenv

    load_dotenv(".secrets/.env")
    load_dotenv(".env")
except Exception:
    # dotenv is optional at runtime; settings can still come from the process ENV.
    pass

settings = get_settings()

app = FastAPI(
    title="PETMOL Price Service",
    description="API for searching and comparing pet product prices across multiple providers.",
    version="0.1.0",
    docs_url=None if settings.env == "prod" else "/docs",
    redoc_url=None if settings.env == "prod" else "/redoc",
)

# ========================================
# Structured request logging (100K+ users)
# ========================================
# One JSON line per request — request_id/user_id/latency/status/ip — instead
# of ad-hoc f-strings only for slow requests. A single unstructured "SLOW
# REQUEST" message can't be correlated across a request's own error logs or
# grepped/aggregated once there's real traffic volume; request_id fixes both.
import json
import time
import uuid
import logging

logger = logging.getLogger(__name__)


def _client_ip_for_log(request: Request) -> str:
    # Same precedence as rate_limit.py's _get_client_ip — this app runs
    # behind Cloudflare/nginx, so REMOTE_ADDR alone is the proxy, not the user.
    cf_ip = request.headers.get("CF-Connecting-IP") or request.headers.get("True-Client-IP")
    if cf_ip:
        return cf_ip.split(",")[0].strip()
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "unknown"


def _user_id_for_log(request: Request) -> str:
    # Best-effort only — logging must never fail or block a request over a
    # missing/expired/malformed token. Full auth still happens per-route via
    # get_current_user; this just gives logs something to correlate by.
    try:
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else request.cookies.get("petmol_session")
        if not token:
            return "anonymous"
        from .user_auth.security import decode_token
        data = decode_token(token)
        return data.user_id if data and data.user_id else "anonymous"
    except Exception:
        return "anonymous"


@app.middleware("http")
async def structured_request_logging(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
    start_time = time.time()

    try:
        response = await call_next(request)
        status_code = response.status_code
    except Exception:
        duration_ms = round((time.time() - start_time) * 1000, 1)
        logger.error(json.dumps({
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status": 500,
            "latency_ms": duration_ms,
            "user_id": _user_id_for_log(request),
            "ip": _client_ip_for_log(request),
            "unhandled_exception": True,
        }))
        raise

    duration_ms = round((time.time() - start_time) * 1000, 1)
    log_entry = {
        "request_id": request_id,
        "method": request.method,
        "path": request.url.path,
        "status": status_code,
        "latency_ms": duration_ms,
        "user_id": _user_id_for_log(request),
        "ip": _client_ip_for_log(request),
    }

    if duration_ms > 3000:
        logger.error(json.dumps(log_entry))
    elif duration_ms > 1000 or status_code >= 500:
        logger.warning(json.dumps(log_entry))
    else:
        logger.info(json.dumps(log_entry))

    try:
        from .runtime_metrics import record_request_metric

        record_request_metric(request.method, request.url.path, status_code, duration_ms)
    except Exception:
        pass

    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{duration_ms / 1000:.3f}"
    return response

# Custom exception handler for 429 (Rate Limit)
@app.exception_handler(429)
async def rate_limit_exception_handler(request: Request, exc: HTTPException):
    """Return clean JSON for rate limit errors instead of ugly detail message."""
    retry_after = exc.headers.get("Retry-After", "60") if hasattr(exc, 'headers') and exc.headers else "60"
    return JSONResponse(
        status_code=429,
        headers={"Retry-After": str(retry_after)},
        content={
            "error": "rate_limited",
            "message": "Too many requests. Please try again later.",
            "retry_after": int(retry_after)
        }
    )

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=settings.cors_origin_regex_full,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include OAuth routers
app.include_router(ml_oauth_router)
app.include_router(ml_debug_router)
app.include_router(user_auth_router)

# SMS 2FA OTP router (logout confirmation)
from .user_auth.otp_router import router as otp_router
app.include_router(otp_router)

# Users API compatibility router
from .user_auth.users_router import router as users_router
app.include_router(users_router)

app.include_router(pets_router)
app.include_router(product_lookup_router)
app.include_router(product_lookup_router, prefix="/api")
app.include_router(gtin_router)
app.include_router(gtin_router, prefix="/api")

# Vision AI (vaccine card OCR)
from .vision.router import router as vision_router
app.include_router(vision_router)

# OSM Pet Places (offline, sem Google)
from .places.router import router as pet_places_router
app.include_router(pet_places_router)

# Monthly check-in reminders
app.include_router(checkin_router)

# Admin (master)
app.include_router(admin_router)
app.include_router(affiliate_links_admin_router)
app.include_router(affiliate_feed_metrics_admin_router)
app.include_router(marketplace_offers_admin_router)
app.include_router(shopee_sync_admin_router)
app.include_router(petz_admin_router)
app.include_router(monetization_coverage_admin_router)
app.include_router(commerce_identity_admin_router)
app.include_router(shopee_coverage_admin_router)
app.include_router(admin_debug_router)
app.include_router(admin_analytics_router)
# Some deployments forward /api/* without stripping the prefix.
app.include_router(admin_router, prefix="/api")
app.include_router(affiliate_links_admin_router, prefix="/api")
app.include_router(affiliate_feed_metrics_admin_router, prefix="/api")
app.include_router(marketplace_offers_admin_router, prefix="/api")
app.include_router(shopee_sync_admin_router, prefix="/api")
app.include_router(petz_admin_router, prefix="/api")
app.include_router(monetization_coverage_admin_router, prefix="/api")
app.include_router(commerce_identity_admin_router, prefix="/api")
app.include_router(shopee_coverage_admin_router, prefix="/api")
app.include_router(admin_analytics_router, prefix="/api")

# Servir arquivos estáticos (fotos de pets) — sempre que storage for local
# Em prod com R2/S3: as fotos têm URL pública direta, sem precisar deste mount
os.makedirs("uploads/pets", exist_ok=True)
os.makedirs("uploads/pet_documents", exist_ok=True)
if settings.storage_backend == "local":
    app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.on_event("startup")
def init_db():
    # Production guard — fails fast with clear message, no secrets logged
    settings.validate_prod()

    Base.metadata.create_all(bind=engine)

    # Additive column migrations (idempotent, safe for both SQLite and PostgreSQL).
    # Intentionally NOT wrapped in try/except: a failed migration must not let
    # the app start on a half-migrated schema and fail mysteriously hours later
    # when some user hits the missing column/table. With the atomic-release
    # pipeline, an exception here fails this startup event, activate.sh's
    # health check never gets a response, and it rolls back to the previous
    # release automatically — the safe failure mode is "deploy doesn't go
    # live", not "goes live half-broken and silent".
    if settings.database_url.startswith("sqlite"):
        from .migrations import run_sqlite_migrations
        run_sqlite_migrations(engine)
    else:
        from .migrations import run_pg_migrations
        run_pg_migrations(engine)

    # Funde linhas de ProductReliableCatalog que colidem depois de recalcular
    # canonical_key com a normalização atual (idempotente — vira no-op depois
    # da primeira fusão real).
    try:
        from .product_catalog_lookup import reconcile_reliable_catalog_keys
        _reconcile_db = SessionLocal()
        try:
            reconcile_reliable_catalog_keys(_reconcile_db)
        finally:
            _reconcile_db.close()
    except Exception:
        logging.getLogger(__name__).exception("[startup] reconcile_reliable_catalog_keys failed")

    # ── Auto-backup SQLite a cada startup ────────────────────────────────
    # Garante que nenhum reinício do servidor apague dados dos pets.
    # Mantém os últimos 7 backups; backups mais antigos são removidos.
    if settings.database_url.startswith("sqlite"):
        try:
            import sqlite3 as _sqlite3
            import shutil as _shutil
            import glob as _glob

            _db_path = settings.database_url.replace("sqlite:///", "").replace("sqlite://", "")
            if not os.path.isabs(_db_path):
                _db_path = os.path.join(os.getcwd(), _db_path)

            if os.path.exists(_db_path):
                _backup_dir = os.path.join(os.path.dirname(_db_path), "backups")
                os.makedirs(_backup_dir, exist_ok=True)

                _ts = __import__('datetime').datetime.now().strftime("%Y%m%d_%H%M%S")
                _backup_path = os.path.join(_backup_dir, f"petmol_backup_{_ts}.db")

                # .backup() usa a API nativa do SQLite — é seguro mesmo com WAL ativo
                _src = _sqlite3.connect(_db_path)
                _dst = _sqlite3.connect(_backup_path)
                _src.backup(_dst)
                _dst.close()
                _src.close()

                # Remove backups excedentes, mantendo 7 mais recentes
                _all = sorted(_glob.glob(os.path.join(_backup_dir, "petmol_backup_*.db")))
                for _old in _all[:-7]:
                    try:
                        os.remove(_old)
                    except Exception:
                        pass

                print(f"[PETMOL] ✅ Backup automático criado: {os.path.basename(_backup_path)}")
        except Exception as _e:
            print(f"[PETMOL] ⚠️  Backup automático falhou (não crítico): {_e}")

    # Ensure the master admin (settings.admin_master_email, hardcoded default
    # leonardofmol@gmail.com) has an AdminUser row. If that account already
    # exists (the normal app signup), we just grant the row — no password
    # touched. Only create a brand-new User if one doesn't exist yet AND a
    # password was explicitly provided for that bootstrap case.
    if settings.admin_master_email:
        db = SessionLocal()
        try:
            email = settings.admin_master_email.strip().lower()
            user = db.query(User).filter(User.email == email).first()
            if not user and settings.admin_master_password:
                user = User(email=email, password_hash=hash_password(settings.admin_master_password), name=settings.admin_master_name or "Admin")
                db.add(user)
                db.commit()
                db.refresh(user)

            if user:
                admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
                if not admin:
                    admin = AdminUser(user_id=str(user.id), role=settings.admin_master_role)
                    db.add(admin)
                    db.commit()
        finally:
            db.close()


@app.on_event("startup")
def start_push_scheduler():
    """Inicia o scheduler de lembretes de push."""
    push_logger = __import__("logging").getLogger(__name__)
    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from .notifications import send_due_reminders

        scheduler = BackgroundScheduler()
        scheduler.add_job(send_due_reminders, "cron", second=0, id="send_due_reminders")
        scheduler.start()
        push_logger.info("[PETMOL] Push scheduler iniciado")
    except Exception as e:
        push_logger.error(f"[PETMOL] Push scheduler não iniciado: {e}")


# Include autocomplete router
from .autocomplete import router as autocomplete_router
app.include_router(autocomplete_router, tags=["Autocomplete"])

# Include canonical suggestion router
from .suggest import router as suggest_router
app.include_router(suggest_router)

# Include notifications router
from .notifications import router as notifications_router
app.include_router(notifications_router)
# Some deployments forward /api/* without stripping the prefix (direct access).
app.include_router(notifications_router, prefix="/api")

from .family import family_router
app.include_router(family_router)
app.include_router(family_router, prefix="/api")

# Include health events router
from .health import router as health_router
app.include_router(health_router)

# Include health v1 router (PETMOL MUNDO integration - feeding control + snapshot)
from .health.router import router as health_v1_router
app.include_router(health_v1_router)
app.include_router(health_v1_router, prefix="/api")
app.include_router(health_v1_router, prefix="/api/api")

# Include analytics router (Motor de Intenção)
from .analytics.router import router as analytics_router
app.include_router(analytics_router)

# Include product metrics router (food funnel summaries)
from .metrics.router import router as metrics_router
app.include_router(metrics_router)
app.include_router(metrics_router, prefix="/api")

# Include partner handoff router (shop/doglife)
from .handoff_partner import router as handoff_partner_router
app.include_router(handoff_partner_router)

# Include vaccine sync router
from .pets.vaccine_router import router as vaccine_router
app.include_router(vaccine_router)

# Include parasite + grooming CRUD routers
from .pets.parasite_router import router as parasite_router
from .pets.grooming_router import router as grooming_router
app.include_router(parasite_router)
app.include_router(grooming_router)

# Include vaccine suggestions router (global vaccine database)
from .vaccines import router as vaccine_suggestions_router
app.include_router(vaccine_suggestions_router)

# SLICE 1: Include services router (partners, places, handoff)
from .services.router import router as services_router
app.include_router(services_router)

# SLICE 3: Include Establishments portal router
from .establishments import router as establishments_router
app.include_router(establishments_router)

# SLICE 3.4: Include Establishments admin router
from .establishments.admin_router import router as establishments_admin_router
app.include_router(establishments_admin_router)

# Include Feedback/Learning System router (vaccine-OCR correction learning
# — not the same as support_router below)
from .feedback.router import router as feedback_router
app.include_router(feedback_router)

# "Fale com o PETMOL" — general user support/suggestion/bug intake
from .support import support_router  # noqa: E402
app.include_router(support_router)
from .support.models import SupportFeedback as _support_feedback_model  # noqa: F401,E402 — register with Base


# SLICE 3 (REFACTOR): Events router - DESATIVADO (simplificação)
from .events import router as events_router
app.include_router(events_router)

# Pet Sumido — missing pet alerts + push broadcast
from .missing_pets import MissingPet as _missing_pet_model  # noqa: F401 – registers with Base
from .missing_pets import router as missing_pets_router, sighting_router as pet_sightings_router
app.include_router(missing_pets_router)
app.include_router(missing_pets_router, prefix="/api")
app.include_router(pet_sightings_router)
app.include_router(pet_sightings_router, prefix="/api")

# SLICE 5: Vigia AI router - DESATIVADO (simplificação)
# from .vigia import router as vigia_router
# app.include_router(vigia_router)

# SLICE 8: Vigia Simulator - DESATIVADO (simplificação)
# from .vigia.simulator import router as vigia_simulator_router
# app.include_router(vigia_simulator_router)


# Webhook endpoint for ML notifications (required by DevCenter)
@app.post("/webhooks/ml", tags=["Webhooks"])
async def ml_webhook(request: Request):
    """Receive Mercado Livre notifications. Required for app configuration."""
    # Just acknowledge - we don't process notifications yet
    return {"status": "received"}


@app.get("/", response_model=HealthResponse, tags=["Health"])
async def root():
    """Health check and API info."""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        providers=[p.value for p in Provider],
    )


@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="ok",
        version="0.1.0",
        providers=[p.value for p in Provider],
    )


# Overpass API Proxy (to avoid CORS issues in browser)
class OverpassProxyRequest(BaseModel):
    query: str

@app.post("/api/overpass-proxy", tags=["Proxy"])
async def overpass_proxy(request: OverpassProxyRequest):
    """Proxy requests to Overpass API to avoid CORS issues."""
    import httpx
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                "https://overpass-api.de/api/interpreter",
                content=request.query,
                headers={"Content-Type": "text/plain"},
            )
            return JSONResponse(content=response.json())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Overpass API error: {str(e)}")


@app.get("/api/nominatim-search", tags=["Proxy"])
async def nominatim_search(
    q: str = Query(..., description="Search query"),
    lat: float = Query(..., description="Latitude"),
    lon: float = Query(..., description="Longitude"),
    limit: int = Query(50, description="Max results"),
):
    """Proxy requests to Nominatim to avoid rate limits and CORS."""
    import httpx
    
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            url = (
                f"https://nominatim.openstreetmap.org/search?"
                f"q={q}&lat={lat}&lon={lon}&format=json&limit={limit}"
                f"&addressdetails=1&extratags=1"
            )
            response = await client.get(
                url,
                headers={"User-Agent": "PETMOL/1.0 (contact: petmol@example.com)"},
            )
            return JSONResponse(content=response.json())
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Nominatim error: {str(e)}")


@app.get("/version", tags=["Health"])
async def version():
    """Get version information with build metadata."""
    info = get_version_info()
    return info


@app.get("/info", tags=["Health"])
async def info():
    """Get API information and status."""
    from .version import get_version_info
    version_info = get_version_info()
    return {
        "status": "ok",
        "service": "PETMOL Price Service",
        "version": version_info.get("version", "0.1.0"),
        "build_date": version_info.get("build_date"),
        "environment": settings.env,
        "features": {
            "price_search": True,
            "health_v1": True,
            "feeding_control": True,
            "vaccine_tracking": True,
        },
    }


class CoverageResponse(BaseModel):
    """Coverage response showing supported countries."""
    prices_enabled: List[str]
    services_enabled: bool
    emergency_enabled: bool
    languages: List[str]


@app.get("/coverage", response_model=CoverageResponse, tags=["Health"])
async def get_coverage():
    """Get service coverage by country."""
    return CoverageResponse(
        prices_enabled=list(settings.prices_enabled_countries_set),
        services_enabled=settings.google_maps_api_key_resolved is not None,
        emergency_enabled=settings.google_maps_api_key_resolved is not None,
        languages=["pt-BR", "es", "en"],
    )


# ================================
# Debug / Observability Endpoints
# ================================

from .providers import (
    # get_active_providers,
    get_global_errors,
    clear_global_errors,
    # aggregate_search,
    google_places_provider,
    ProviderStatus,
)


class ProviderInfo(BaseModel):
    """Provider status info."""
    name: str
    display_name: str
    status: str
    configured: bool
    last_error: Optional[dict] = None


class ProvidersResponse(BaseModel):
    """Active providers response."""
    catalog_providers: List[ProviderInfo]
    places_provider: Optional[ProviderInfo]
    timestamp: str


class ErrorEntry(BaseModel):
    """A single error entry."""
    provider: str
    error_type: str
    message: str
    timestamp: str
    request_id: Optional[str] = None
    status_code: Optional[int] = None


class ErrorsResponse(BaseModel):
    """Recent errors response."""
    errors: List[ErrorEntry]
    count: int


@app.get("/debug/providers", response_model=ProvidersResponse, tags=["Debug"])
async def debug_providers(current_user: User = Depends(get_current_user)):
    """
    List all providers and their current status.
    Useful for debugging connectivity issues.
    """
    catalog_providers = []
    for provider in get_active_providers():
        info = provider.get_info()
        catalog_providers.append(ProviderInfo(
            name=info["name"],
            display_name=info["display_name"],
            status=info["status"],
            configured=info.get("configured", True),
            last_error=info.get("last_error"),
        ))
    
    places_info = google_places_provider.get_info()
    places_provider = ProviderInfo(
        name=places_info["name"],
        display_name=places_info["display_name"],
        status=places_info["status"],
        configured=places_info.get("configured", False),
        last_error=places_info.get("last_error"),
    )
    
    return ProvidersResponse(
        catalog_providers=catalog_providers,
        places_provider=places_provider,
        timestamp=datetime.utcnow().isoformat(),
    )


@app.get("/debug/last-errors", response_model=ErrorsResponse, tags=["Debug"])
async def debug_last_errors(
    limit: int = Query(20, ge=1, le=100, description="Max errors to return"),
    current_user: User = Depends(get_current_user),
):
    """
    Get recent errors from all providers.
    Useful for debugging integration issues.
    """
    errors = get_global_errors(limit=limit)
    return ErrorsResponse(
        errors=[
            ErrorEntry(
                provider=e.provider,
                error_type=e.error_type,
                message=e.message,
                timestamp=e.timestamp.isoformat(),
                request_id=e.request_id,
                status_code=e.status_code,
            )
            for e in errors
        ],
        count=len(errors),
    )


@app.post("/debug/clear-errors", tags=["Debug"])
async def debug_clear_errors(current_user: User = Depends(get_current_user)):
    """Clear all stored errors."""
    clear_global_errors()
    return {"cleared": True}


class SelfTestResponse(BaseModel):
    """Self-test response."""
    ok: bool
    api_time: str
    env: str
    providers: List[str]
    errors_count: int
    products_cached: int
    message: str


@app.get("/debug/self-test", response_model=SelfTestResponse, tags=["Debug"])
async def debug_self_test(current_user: User = Depends(get_current_user)):
    """
    Quick self-test endpoint.
    Confirms the API is alive and shows status.
    """
    import time
    start = time.time()
    
    providers = [p.name for p in get_active_providers()]
    errors = get_global_errors(limit=10)
    
    elapsed_ms = int((time.time() - start) * 1000)
    
    return SelfTestResponse(
        ok=True,
        api_time=f"{elapsed_ms}ms",
        env=settings.env,
        providers=providers,
        errors_count=len(errors),
        products_cached=len(_product_cache),
        message="PETMOL API funcionando! 🐾",
    )


# ================================
# Suggest API - Quick autocomplete with prices (REAL aggregation)
# ================================

from datetime import datetime as dt
import hashlib

# Simple in-memory cache for suggest
_suggest_cache: dict = {}

# In-memory popularity counter (resets on restart, ok for MVP)
_popularity_counter: dict[str, int] = {}
_popularity_products: dict[str, dict] = {}  # product_id -> product data


def _increment_popularity(product_id: str, product_data: dict):
    """Increment popularity counter for a product."""
    _popularity_counter[product_id] = _popularity_counter.get(product_id, 0) + 1
    _popularity_products[product_id] = product_data


class SuggestItem(BaseModel):
    """A product suggestion with price range."""
    id: str  # source:source_item_id for debug
    product_id: str  # canonical stable ID (what gets saved)
    title: str
    brand: Optional[str] = None
    image_url: Optional[str] = None
    size_text: Optional[str] = None
    pack_weight_kg: Optional[float] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    price_per_kg: Optional[float] = None
    currency: str = "BRL"
    source: str
    url: Optional[str] = None
    fetched_at: str  # ISO datetime


class SuggestResponse(BaseModel):
    """Suggest endpoint response."""
    suggestions: List[SuggestItem]
    query: str
    country: str
    cached: bool = False
    fetched_at: str  # ISO datetime
    providers_used: List[str] = []
    warning: Optional[str] = None
    shopping_handoff_url: Optional[str] = None


def _generate_product_id(brand: Optional[str], title: str, pack_size: Optional[str] = None) -> str:
    """Generate stable canonical product ID."""
    parts = []
    if brand:
        parts.append(brand.lower().strip())
    parts.append(title.lower().strip()[:50])
    if pack_size:
        parts.append(pack_size.lower().strip())
    key = ":".join(parts)
    hash_val = hashlib.md5(key.encode()).hexdigest()[:12]
    return f"prod_{hash_val}"


@app.get("/suggest", response_model=SuggestResponse, tags=["Suggest"])
@rate_limit(max_requests=60, window_seconds=60)
async def suggest_products(
    request: Request,
    q: Optional[str] = Query(None, min_length=2, max_length=100, description="Search query"),
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    limit: int = Query(8, ge=1, le=20, description="Max results"),
    force: bool = Query(False, description="Force refresh, bypass cache"),
):
    """
    Quick autocomplete endpoint for product search.
    Returns suggestions with images and price ranges.
    Uses Mercado Livre official API.
    
    INFALÍVEL: nunca retorna 422/500, sempre 200 com fallback.
    """
    # Fallback: se q vazio/None, retorna vazio com shopping_handoff_url
    if not q or len(q.strip()) < 2:
        return SuggestResponse(
            suggestions=[],
            query=q or "",
            country=country.upper(),
            cached=False,
            fetched_at=dt.utcnow().isoformat() + "Z",
            providers_used=[],
            warning="Digite pelo menos 2 caracteres para buscar.",
            shopping_handoff_url=f"/api/handoff/shopping?query={q or ''}&country={country}" if q else None,
        )
    
    country = country.upper()
    cache_key = f"suggest:{q.lower()}:{country}:{limit}"
    cache_ttl = settings.suggest_cache_ttl
    now = dt.utcnow()

    # Check cache (unless force=true)
    if not force and cache_key in _suggest_cache:
        cached_time, cached_result = _suggest_cache[cache_key]
        if (now - cached_time).total_seconds() < cache_ttl:
            cached_result["cached"] = True
            # Adiciona shopping_handoff_url sempre
            cached_result["shopping_handoff_url"] = f"/api/handoff/shopping?query={q}&country={country}"
            return SuggestResponse(**cached_result)

    # Use real aggregation from Mercado Livre, mas nunca bloquear
    candidates = []
    aggregation_error = None
    # Sistema de comparação de preços desabilitado - redirecionamos para Google Shopping
    # try:
    #     candidates = await aggregate_search(q, country, "food", limit)
    # except Exception as e:
    #     print(f"[suggest] Aggregation error: {e}")
    #     aggregation_error = str(e)

    providers_used = []  # [p.name for p in get_active_providers()]
    global_errors = get_global_errors()
    warning = None

    # Set warning baseado em erro
    if aggregation_error:
        warning = "Busca temporariamente indisponível. Tente novamente."
    elif len(candidates) == 0:
        if global_errors:
            config_errors = [e for e in global_errors if e.get("error_type") in ("missing_config", "auth_error")]
            if config_errors:
                warning = "Serviço de busca em configuração."
            else:
                warning = "Nenhum resultado encontrado. Tente outro termo."
        else:
            warning = "Nenhum resultado para esta busca."
    elif global_errors:
        warning = "Alguns resultados podem estar incompletos."
    
    # Import catalog_cache to store canonical products
    from .catalog import catalog_cache
    
    # Convert candidates to suggestions
    suggestions = []
    fetched_at_iso = now.isoformat() + "Z"
    
    for c in candidates:
        # Format size text from pack_sizes
        size_text = None
        pack_weight_kg = None
        if c.pack_sizes:
            if len(c.pack_sizes) == 1:
                size_text = f"{c.pack_sizes[0].value}{c.pack_sizes[0].unit}"
            elif len(c.pack_sizes) > 1:
                sizes = sorted([ps.value for ps in c.pack_sizes])
                size_text = f"{sizes[0]}-{sizes[-1]}{c.pack_sizes[0].unit}"
        
        # Parse weight to kg
        if size_text:
            pack_weight_kg = parse_weight_to_kg(size_text)
        
        # Calculate price per kg
        price_per_kg = calculate_price_per_kg(c.price, pack_weight_kg)
        
        # Generate stable product_id
        product_id = _generate_product_id(c.brand, c.title, size_text)
        
        # Store canonical product in cache for /product/{id} endpoint
        canonical_product = {
            "id": product_id,
            "name": c.title,
            "brand": c.brand,
            "variant": c.variant if hasattr(c, 'variant') else None,
            "image_url": c.image_url,
            "pack_sizes": [{"value": ps.value, "unit": ps.unit} for ps in c.pack_sizes] if c.pack_sizes else [],
            "species": c.species if hasattr(c, 'species') else None,
            "source_query": q,  # Save original query for offers
            "size_text": size_text,
            "pack_weight_kg": pack_weight_kg,
            "source": c.source,  # e.g., "ml", "cobasi"
            "source_item_id": c.source_item_id,  # e.g., "MLB16127657" for catalog lookup
            # Store price/URL from suggest for immediate offer display
            "price": c.price,
            "currency": c.currency or "BRL",
            "url": c.url,
            "seller": c.seller if hasattr(c, 'seller') else c.source.upper(),
        }
        _product_cache[product_id] = canonical_product
        
        # Also store alias mapping
        catalog_cache.set_alias(c.source, c.source_item_id, product_id)
        
        suggestions.append(SuggestItem(
            id=f"{c.source}:{c.source_item_id}",
            product_id=product_id,
            title=c.title,
            brand=c.brand,
            image_url=c.image_url,
            size_text=size_text,
            pack_weight_kg=pack_weight_kg,
            min_price=c.price,
            max_price=c.price,
            price_per_kg=price_per_kg,
            currency=c.currency or "BRL",
            source=c.source,
            url=c.url,
            fetched_at=fetched_at_iso,
        ))
    
    # Increment popularity for top results (top 3)
    for s in suggestions[:3]:
        product_data = {
            "product_id": s.product_id,
            "title": s.title,
            "brand": s.brand,
            "image_url": s.image_url,
            "size_text": s.size_text,
            "pack_weight_kg": s.pack_weight_kg,
            "min_price": s.min_price,
            "max_price": s.max_price,
            "price_per_kg": s.price_per_kg,
            "currency": s.currency,
            "fetched_at": s.fetched_at,
        }
        _increment_popularity(s.product_id, product_data)
    
    result = {
        "suggestions": [s.model_dump() for s in suggestions],
        "query": q,
        "country": country.upper(),
        "cached": False,
        "fetched_at": fetched_at_iso,
        "providers_used": providers_used,
        "warning": warning,
        "shopping_handoff_url": f"/api/handoff/shopping?query={q}&country={country}"
    }

    # Cache result
    _suggest_cache[cache_key] = (now, result)

    return SuggestResponse(**result)


# ================================
# Popular Today API - Based on recent searches
# ================================

class PopularItem(BaseModel):
    """A popular product for "Populares hoje" section."""
    product_id: str
    title: str
    brand: Optional[str] = None
    image_url: Optional[str] = None
    size_text: Optional[str] = None
    pack_weight_kg: Optional[float] = None
    min_price: Optional[float] = None
    max_price: Optional[float] = None
    price_per_kg: Optional[float] = None
    currency: str = "BRL"
    fetched_at: str


class PopularResponse(BaseModel):
    """Popular products response."""
    items: List[PopularItem]
    fetched_at: str


@app.get("/popular", response_model=PopularResponse, tags=["Popular"])
async def get_popular_products(
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    limit: int = Query(6, ge=1, le=20, description="Max results"),
):
    """
    Get popular products based on recent searches.
    Used for "Populares hoje" section on the web.
    Returns products with price ranges and freshness info.
    """
    now = dt.utcnow()
    fetched_at_iso = now.isoformat() + "Z"
    
    if not _popularity_counter:
        # No data yet, return empty
        return PopularResponse(items=[], fetched_at=fetched_at_iso)
    
    # Sort by popularity count
    sorted_products = sorted(
        _popularity_counter.items(),
        key=lambda x: x[1],
        reverse=True
    )[:limit]
    
    items = []
    for product_id, _ in sorted_products:
        product_data = _popularity_products.get(product_id)
        if product_data:
            items.append(PopularItem(
                product_id=product_data.get("product_id", product_id),
                title=product_data.get("title", "Produto"),
                brand=product_data.get("brand"),
                image_url=product_data.get("image_url"),
                size_text=product_data.get("size_text"),
                pack_weight_kg=product_data.get("pack_weight_kg"),
                min_price=product_data.get("min_price"),
                max_price=product_data.get("max_price"),
                price_per_kg=product_data.get("price_per_kg"),
                currency=product_data.get("currency", "BRL"),
                fetched_at=product_data.get("fetched_at", fetched_at_iso),
            ))
    
    return PopularResponse(items=items, fetched_at=fetched_at_iso)


# ================================
# Product API - For web pages
# ================================

class ProductInfo(BaseModel):
    """Canonical product info."""
    id: str
    name: str
    brand: Optional[str] = None
    variant: Optional[str] = None
    image_url: Optional[str] = None
    pack_sizes: List[dict] = []
    species: Optional[str] = None
    size_text: Optional[str] = None
    pack_weight_kg: Optional[float] = None


class ProductResponse(BaseModel):
    """Product detail response."""
    product: ProductInfo
    fetched_at: str


class Offer(BaseModel):
    """Product offer from a source."""
    id: str
    title: str
    price: float
    currency: str = "BRL"
    seller: Optional[str] = None
    url: Optional[str] = None
    source: str
    image_url: Optional[str] = None
    in_stock: bool = True
    size_text: Optional[str] = None
    pack_weight_kg: Optional[float] = None
    price_per_kg: Optional[float] = None
    fetched_at: str


class OffersResponse(BaseModel):
    """Offers list response."""
    product_id: str
    offers: List[Offer]
    fetched_at: str
    cached: bool = False
    warning: Optional[str] = None


# Simple product cache
_product_cache: dict = {}


@app.get("/product/{product_id}", response_model=ProductResponse, tags=["Product"])
async def get_product(product_id: str):
    """
    Get canonical product info by ID.
    Used by web pages to render product details.
    """
    # Check cache
    if product_id in _product_cache:
        product_data = _product_cache[product_id]
        return ProductResponse(
            product=ProductInfo(**product_data),
            fetched_at=dt.utcnow().isoformat() + "Z",
        )
    
    # Product not found - return 404
    raise HTTPException(
        status_code=404,
        detail=f"Produto não encontrado: {product_id}. Talvez precise buscar primeiro via /suggest."
    )


@app.get("/product/{product_id}/offers", response_model=OffersResponse, tags=["Product"])
@rate_limit(max_requests=30, window_seconds=60)
async def get_product_offers(
    request: Request,
    product_id: str,
    country: str = Query("BR", min_length=2, max_length=2),
    limit: int = Query(10, ge=1, le=50),
    force: bool = Query(False, description="Force refresh"),
):
    """
    Get current offers for a product.
    Returns cached offer from suggest, plus additional offers if available.
    """
    now = dt.utcnow()
    fetched_at_iso = now.isoformat() + "Z"
    
    # Try to get product info from cache
    product_data = _product_cache.get(product_id)
    
    if not product_data:
        return OffersResponse(
            product_id=product_id,
            offers=[],
            fetched_at=fetched_at_iso,
            cached=False,
            warning="Produto não encontrado. Busque primeiro via autocomplete.",
        )
    
    offers = []
    
    # FIRST: Add the cached offer from suggest (always has price if product was shown)
    cached_price = product_data.get('price')
    if cached_price is not None:
        offers.append(Offer(
            id=f"{product_data.get('source', 'cache')}:{product_data.get('source_item_id', product_id)}",
            title=product_data.get('name', 'Produto'),
            price=cached_price,
            currency=product_data.get('currency', 'BRL'),
            seller=product_data.get('seller', product_data.get('source', 'Loja').upper()),
            url=product_data.get('url', ''),
            source=product_data.get('source', 'cache'),
            image_url=product_data.get('image_url'),
            in_stock=True,
            size_text=product_data.get('size_text'),
            pack_weight_kg=product_data.get('pack_weight_kg'),
            price_per_kg=calculate_price_per_kg(cached_price, product_data.get('pack_weight_kg')),
            fetched_at=fetched_at_iso,
        ))
    
    # SECOND: Try to get more offers from ML if it's a ML catalog product
    source = product_data.get('source')
    source_item_id = product_data.get('source_item_id')  # e.g., "MLB16127657"
    product_name = product_data.get('name', '')
    product_brand = product_data.get('brand', '')
    
    # Sistema de comparação de preços (MercadoLivre) desabilitado
    # Código legado comentado - sistema migrado para Google Shopping
    # offers continuam apenas com os offers diretos do catalog (se houver)
    
    # Sort by price
    offers.sort(key=lambda o: o.price)
    
    # Check for warnings
    warning = None
    if not offers:
        warning = "No offers found for this product."
    
    return OffersResponse(
        product_id=product_id,
        offers=offers[:limit],
        fetched_at=fetched_at_iso,
        cached=False,
        warning=warning,
    )



@app.get(
    "/search",
    response_model=SearchResult,
    responses={
        400: {"model": ErrorResponse},
        500: {"model": ErrorResponse},
    },
    tags=["Search"],
)
async def search(
    q: str = Query(..., min_length=2, max_length=200, description="Search query (product name, brand)"),
    country: str = Query(..., min_length=2, max_length=2, description="Country code (BR, US, etc)"),
    currency: Currency = Query(Currency.USD, description="Currency for prices"),
    units: UnitSystem = Query(UnitSystem.METRIC, description="Unit system for weights"),
    postal_code: Optional[str] = Query(None, max_length=20, description="Postal code for shipping calculation"),
    brand: Optional[str] = Query(None, max_length=100, description="Filter by brand"),
    category: Optional[str] = Query(None, max_length=50, description="Filter by category"),
    min_size: Optional[float] = Query(None, ge=0, description="Minimum pack size"),
    max_size: Optional[float] = Query(None, ge=0, description="Maximum pack size"),
    size_unit: Optional[PackSizeUnit] = Query(None, description="Pack size unit"),
    limit: int = Query(20, ge=1, le=100, description="Maximum results to return"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
):
    """
    Search for pet product offers across multiple providers.
    
    Returns offers sorted by total cost (price + shipping), along with
    highlighted "best" offers for different criteria.
    """
    try:
        query = SearchQuery(
            query=q,
            country_code=country.upper(),
            currency=currency,
            unit_system=units,
            postal_code=postal_code,
            brand=brand,
            category=category,
            min_pack_size=min_size,
            max_pack_size=max_size,
            pack_size_unit=size_unit,
            limit=limit,
            offset=offset,
        )
        
        result = search_offers(query)
        return result
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")


@app.post("/cache/clear", tags=["Admin"])
async def clear_search_cache():
    """Clear the search cache."""
    count = clear_cache()
    return {"cleared": count}


# ================================
# Catalog API - for autocomplete
# ================================

from .catalog import (
    CatalogProduct,
    search_catalog as search_catalog_db,
    lookup_by_barcode as lookup_barcode_db,
    search_catalog_candidates,
    normalize_candidate as normalize_candidate_db,
    get_popular_brands as get_popular_brands_db,
    catalog_cache,
)


class CatalogItem(BaseModel):
    """Catalog item for autocomplete suggestions."""
    id: str
    name: str
    brand: str
    variant: Optional[str] = None
    image_url: Optional[str] = None
    size_suggestions: List[dict] = []
    species: Optional[str] = None
    life_stage: Optional[str] = None
    barcodes: List[str] = []


def _product_to_catalog_item(product: CatalogProduct) -> CatalogItem:
    """Convert CatalogProduct to CatalogItem response."""
    return CatalogItem(
        id=product.id,
        name=product.name,
        brand=product.brand,
        variant=product.variant,
        image_url=product.image_url,
        size_suggestions=[{"value": s.value, "unit": s.unit} for s in product.pack_sizes],
        species=product.species,
        life_stage=product.life_stage,
        barcodes=product.barcodes,
    )


# ================================
# New Trivago-style Catalog Endpoints
# ================================

@app.get("/catalog/search/v2", response_model=CatalogSearchResult, tags=["Catalog"])
async def search_catalog_v2(
    q: str = Query(..., min_length=2, max_length=100, description="Search query"),
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    type: str = Query("food", description="Product type: food or product"),
    limit: int = Query(10, ge=1, le=50, description="Max results"),
):
    """
    Search the product catalog for candidates (trivago-style).
    Returns candidates from multiple sources with images and pack sizes.
    """
    # Check if results are from cache
    cached = catalog_cache.get(q, country, type)
    is_cached = cached is not None

    candidates_raw = search_catalog_candidates(q, country.upper(), type, limit)

    # Convert to model
    candidates = [
        CatalogCandidate(
            source=c["source"],
            source_item_id=c["source_item_id"],
            title=c["title"],
            brand=c.get("brand"),
            variant=c.get("variant"),
            species=c.get("species"),
            life_stage=c.get("life_stage"),
            port=c.get("port"),
            neutered=c.get("neutered"),
            pack_sizes=[CatalogPackSize(value=ps["value"], unit=ps["unit"]) for ps in c.get("pack_sizes", [])],
            image_url=c.get("image_url"),
            price=c.get("price"),
            currency=c.get("currency"),
            url=c.get("url"),
        )
        for c in candidates_raw
    ]

    return CatalogSearchResult(
        candidates=candidates,
        query=q,
        country=country.upper(),
        cached=is_cached,
    )


@app.get("/commerce/product-price", tags=["Catalog"])
async def commerce_product_price(
    q: str = Query(..., min_length=2, max_length=150, description="Product search query"),
):
    """
    Preço real de um produto na Cobasi (Loja do Baby, seção "Comprar
    novamente") — ver commerce_pricing.py para detalhes e limitações.
    """
    from .commerce_pricing import fetch_cobasi_price
    return await fetch_cobasi_price(q)


@app.get("/commerce/product-offer", tags=["Catalog"])
async def commerce_product_offer(
    q: Optional[str] = Query(default=None, min_length=2, max_length=150, description="Product search query"),
    weight_kg: Optional[float] = Query(default=None, description="Peso real do pacote (ex: 7.5) para escolher o SKU certo entre variantes de tamanho"),
    gtin: Optional[str] = Query(default=None, description="GTIN do produto, quando já conhecido (ex: escaneado) — preferido para providers estruturados"),
    db: Session = Depends(get_db),
):
    """
    Oferta monetizável real para "Comprar novamente" — casa o preço da
    Cobasi (por EAN) com o link afiliado cadastrado daquele produto. Ver
    commerce_offers.py. `found=False` significa "não ofereça este
    merchant para este produto", nunca "use o link direto sem comissão"
    (exceto em dev, sinalizado por link_type="direct").

    `weight_kg`: a Cobasi agrupa vários tamanhos de pacote sob o mesmo
    produto — sem isso, o item padrão deles (não necessariamente o
    tamanho real do tutor) é usado. `gtin`: opcional, usado por providers
    estruturados (ex: futuro AwinFeedProvider) que não dependem de busca
    textual — `q` continua funcionando exatamente como antes.
    """
    if not q and not gtin:
        raise HTTPException(status_code=400, detail="informe ao menos q ou gtin")
    from .commerce_offers import resolve_cobasi_product_offer
    return await resolve_cobasi_product_offer(db, q, target_weight_kg=weight_kg, gtin=gtin)


@app.get("/commerce/offers", tags=["Catalog"])
async def commerce_offers(
    q: Optional[str] = Query(default=None, min_length=2, max_length=150, description="Product search query"),
    weight_kg: Optional[float] = Query(default=None, description="Peso real do pacote, quando aplicável"),
    gtin: Optional[str] = Query(default=None, description="GTIN do produto, quando já conhecido (ex: escaneado) — preferido para providers estruturados"),
    db: Session = Depends(get_db),
):
    """
    Lista de ofertas monetizáveis para um produto, menor preço primeiro —
    ver commerce_offers.py/commerce_provider.py. Hoje só a Cobasi está
    ativa (0 ou 1 item); a forma já é multi-provider — Shopee/ML/
    Petz entram sem mudar este contrato quando aprovados.

    Nunca inclui oferta sem link monetizável: lista vazia = "estamos
    buscando opções", nunca "use o link direto sem comissão" (exceto em
    dev, sinalizado por link_type="direct"). `gtin`: opcional — o
    frontend deve enviar quando souber (ex: produto já escaneado);
    providers de busca textual (Cobasi/VTEX) continuam usando `q`.
    """
    if not q and not gtin:
        raise HTTPException(status_code=400, detail="informe ao menos q ou gtin")
    from .commerce_offers import CommerceOfferOut, get_commerce_offers
    offers = await get_commerce_offers(db, q, target_weight_kg=weight_kg, gtin=gtin)
    return {"offers": [CommerceOfferOut(**vars(o)) for o in offers]}


@app.get("/commerce/awin-click", tags=["Catalog"])
async def commerce_awin_click(
    u: str = Query(..., min_length=8, description="URL Awin codificada pelo backend"),
):
    """Redirect interno para cliques Awin.

    O parâmetro `u` só aceita URLs Awin geradas por AwinFeedProvider.
    Advertisers que exigem atribuição/cookie no navegador seguem browser-side.
    Cobasi é resolvida server-side para a URL web final do produto com `awc`,
    evitando o OneLink abrir a home/app da Cobasi em vez do produto.
    """
    from fastapi.responses import RedirectResponse
    from .awin_click_redirect import decode_awin_click_url, resolve_awin_click_target, should_redirect_awin_in_browser

    try:
        awin_url = decode_awin_click_url(u)
        if should_redirect_awin_in_browser(awin_url):
            return RedirectResponse(url=awin_url, status_code=302)
        target = await resolve_awin_click_target(awin_url)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="falha ao resolver clique Awin") from exc

    return RedirectResponse(url=target, status_code=302)


@app.get("/commerce/monetized-offer", tags=["Catalog"])
async def commerce_monetized_offer(
    merchant: str = Query(..., description="cobasi, petz, etc."),
    context: str = Query("product", pattern="^(product|store|marketplace)$", description="product | store | marketplace"),
    gtin: Optional[str] = Query(default=None, description="Obrigatório quando context=product ou marketplace"),
    db: Session = Depends(get_db),
):
    """
    Resolve se existe caminho monetizável (afiliado) para um merchant, no
    contexto de um produto específico (deep link) ou da loja em geral
    (storefront) — ver affiliate_links.py / docs/AFFILIATES.md.

    Nunca retorna link comum sem comissão: `offer: null` significa "este
    merchant deve ficar invisível aqui", não "use um link de busca direto".
    """
    from .affiliate_links import get_monetized_offer
    from .product_catalog_lookup import ProductCatalog, normalize_gtin

    merchant_normalized = merchant.strip().lower()
    product_id = None
    if context in ("product", "marketplace"):
        if not gtin:
            raise HTTPException(status_code=400, detail="gtin é obrigatório quando context=product ou marketplace")
        gtin_normalized = normalize_gtin(gtin)
        product = db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
        product_id = product.id if product else None

    offer = get_monetized_offer(db, merchant=merchant_normalized, context=context, product_id=product_id)
    return {"offer": offer}


@app.get("/commerce/petz-direct-link", tags=["Catalog"])
async def commerce_petz_direct_link(
    gtin: Optional[str] = Query(None, description="GTIN do produto — quando conhecido, permite a página exata via PetzProductMapping"),
    q: Optional[str] = Query(None, description="Nome do produto — usado na busca da Petz (fallback universal, funciona sem GTIN)"),
    brand: Optional[str] = Query(None, description="Marca do produto — melhora a busca da Petz"),
    db: Session = Depends(get_db),
):
    """
    "Ver na Petz" — caminho DELIBERADAMENTE separado do CommerceEngine/
    MonetizedOffer (ver commerce_provider.py, petz_provider.py). Gated pelo
    mesmo master gate (petz_provider.is_petz_publicly_servable): as duas
    flags `petz_affiliate_enabled` E `petz_coupon_attribution_verified`
    (prova comercial — compra real testada em 29/08/2026, ver
    docs/PETZ_COMMISSION_VALIDATION.md).

    MECANISMO DE COMISSÃO (Parceiro Petz): é o CUPOM `PETMOL` aplicado no
    checkout — "7% em cima de todas as vendas no site/app utilizando o
    seu código" (doc oficial Petz). A URL de chegada NÃO importa para a
    atribuição. Por isso, quando o master gate está ligado, este endpoint
    sempre devolve `partner_program_active: true` e um destino utilizável:

    - `direct_product_url`: página real do produto, quando existe um
      `PetzProductMapping` confirmado (DIRECT_LINK_ELIGIBLE_STATUSES).
    - `search_url`: busca do site da Petz pelo nome do produto (`q`),
      fallback universal quando não há mapping confirmado.
    - `partner_store_url`: vitrine da Loja Parceira (último fallback).

    `url` = melhor destino disponível nessa ordem. `link_type:
    "affiliate_store"` — nunca entra na comparação de preço
    (/commerce/offers), não existe fonte de preço Petz por produto.
    """
    from .affiliate_links import (
        PETZ_AFFILIATE_PROGRAM,
        PETZ_COUPON_CODE,
        PETZ_CURATED_SEARCH,
        PETZ_PARTNER_STORE_URL,
        deslug_petz_product_url,
        petz_search_url_from_term,
        petz_site_search_url,
        petz_cart_add_url,
        PETZ_COUPON_APPLY_URL,
    )
    from .petz_mapping import DIRECT_LINK_ELIGIBLE_STATUSES, get_mapping
    from .petz_provider import is_petz_publicly_servable
    from .product_catalog_lookup import ProductCatalog, normalize_gtin

    if not is_petz_publicly_servable():
        return {
            "available": False,
            "partner_program_active": False,
            "url": None,
            "direct_product_url": None,
            "search_url": None,
            "partner_store_url": PETZ_PARTNER_STORE_URL,
            "coupon_code": PETZ_COUPON_CODE,
            "affiliate_program": PETZ_AFFILIATE_PROGRAM,
            "destination": "store",
            "petz_product_id": None,
            "coupon_apply_url": None,
            "cart_add_url": None,
        }

    gtin_raw = (gtin or "").strip()
    gtin_normalized = normalize_gtin(gtin_raw) if gtin_raw else None
    if gtin_raw and not gtin_normalized:
        raise HTTPException(status_code=400, detail="GTIN inválido")

    # Sem GTIN → sem página exata (o mapping é por produto do catálogo),
    # mas a busca da Petz pelo nome ainda funciona: "Ver na Petz" aparece
    # pra qualquer produto que tenha ao menos um nome.
    product = (
        db.scalar(select(ProductCatalog).where(ProductCatalog.barcode_normalized == gtin_normalized))
        if gtin_normalized
        else None
    )

    direct_product_url: Optional[str] = None
    curated_search: Optional[str] = None
    petz_product_id: Optional[str] = None
    cart_add_url: Optional[str] = None
    if product is not None:
        mapping = get_mapping(db, product.id)
        if mapping and mapping.match_status in DIRECT_LINK_ELIGIBLE_STATUSES and mapping.product_url:
            direct_product_url = mapping.product_url
            petz_product_id = (mapping.petz_product_id or "").strip() or None
            # `petz_cart_prefill` (default OFF): quando ON e o mapping tem
            # petz_product_id, o bridge pode montar o carrinho da Petz com
            # o produto + cupom PETMOL já aplicado (2 navegações Struts —
            # ver affiliate_links.py / comentário do flag em config.py).
            if petz_product_id and bool(get_settings().petz_cart_prefill):
                cart_add_url = petz_cart_add_url(petz_product_id)
            # Produto confirmado → busca curada (verificada) > deslug da
            # URL do produto. "Ver na Petz" abre /busca (a AASA da Petz
            # sequestra /produto/*), então a busca tem que trazer ESTE
            # produto no topo. Ver docs/PETZ_COMMISSION_VALIDATION.md.
            curated_search = (
                PETZ_CURATED_SEARCH.get((mapping.petz_product_id or "").strip())
                or deslug_petz_product_url(mapping.product_url)
                or None
            )

    # Fallback do carrinho pré-montado SEM PetzProductMapping confirmado:
    # mapa GTIN → id do produto Petz (`petz_product_id_for_gtin`, ver
    # affiliate_links.py: seed embutido + data/petz_gtin_product_id.json).
    # Só quando a flag `petz_cart_prefill` está ON. Não mexe em
    # `direct_product_url` (isso continua exigindo mapping confirmado).
    if cart_add_url is None and bool(get_settings().petz_cart_prefill):
        from .affiliate_links import petz_product_id_for_gtin

        fallback_pid = petz_product_id_for_gtin(gtin_normalized)
        if fallback_pid:
            petz_product_id = petz_product_id or fallback_pid
            cart_add_url = petz_cart_add_url(fallback_pid)
            if curated_search is None:
                curated_search = PETZ_CURATED_SEARCH.get(fallback_pid) or None

    search_brand = (brand or "").strip() or (product.brand if product and getattr(product, "brand", None) else None)
    if curated_search:
        search_url = petz_search_url_from_term(curated_search)
    else:
        search_term = (q or "").strip() or (product.name if product and product.name else "")
        search_url = petz_site_search_url(search_term, search_brand) if search_term else None

    # `petz_product_search_link` (default OFF): quando ON e há uma busca
    # utilizável, o destino passa a ser a BUSCA da Petz pelo produto
    # (produto na tela) em vez da vitrine fixa. Rollback = env var + restart.
    # Ver o comentário do flag em config.py. `get_settings()` fresco (não o
    # `settings` de módulo) pra o flip da flag valer sem reimportar o módulo.
    coupon_apply_url: Optional[str] = PETZ_COUPON_APPLY_URL if cart_add_url else None

    prefer_search = bool(get_settings().petz_product_search_link) and bool(search_url)
    if cart_add_url:
        # Carrinho pré-montado tem prioridade: o bridge navega
        # coupon_apply_url → cart_add_url (que já cai no /checkout/cart).
        destination = "cart"
        url = cart_add_url
    elif prefer_search:
        destination = "search"
        url = search_url
    else:
        destination = "store"
        url = direct_product_url or search_url or PETZ_PARTNER_STORE_URL

    return {
        "available": True,
        "partner_program_active": True,
        "url": url,
        "direct_product_url": direct_product_url,
        "search_url": search_url,
        "partner_store_url": PETZ_PARTNER_STORE_URL,
        "coupon_code": PETZ_COUPON_CODE,
        "affiliate_program": PETZ_AFFILIATE_PROGRAM,
        "link_type": "affiliate_store",
        "destination": destination,
        "petz_product_id": petz_product_id,
        "coupon_apply_url": coupon_apply_url,
        "cart_add_url": cart_add_url,
    }


@app.get("/commerce/product-candidates", tags=["Catalog"])
async def commerce_product_candidates(
    q: str = Query(..., min_length=2, max_length=150, description="Product search query"),
    limit: int = Query(6, ge=1, le=10),
):
    """
    Candidatos reais da Cobasi no mesmo formato de /catalog/search/v2, para
    o resolver de fotos (apps/web) mesclar com o catálogo estático — ver
    commerce_pricing.py para detalhes e limitações.
    """
    from .commerce_pricing import search_cobasi_candidates
    candidates = await search_cobasi_candidates(q, limit=limit)
    return {"candidates": candidates, "query": q}


@app.get("/commerce/awin-search", tags=["Catalog"])
async def commerce_awin_search(
    q: str = Query(..., min_length=2, max_length=150, description="Busca por nome/marca no catálogo sincronizado"),
    merchant: Optional[str] = Query(None, description="Filtra por um merchant específico — por padrão busca em todos os merchants Awin habilitados"),
    limit: int = Query(50, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """
    Busca textual dentro do catálogo já sincronizado da Awin
    (AffiliateFeedOffer — ver awin_feed_sync.py), agrupada por GTIN — um
    mesmo produto pode estar no feed de mais de um merchant, mas este
    endpoint público só retorna merchants Awin liberados para compra no
    PETMOL. Zee Now/Zee Dog podem seguir como fonte interna de catálogo/
    GTIN, mas não aparecem como loja/opção de venda.

    Existe pra dar ao tutor um jeito de encontrar um produto real com GTIN
    conhecido dentro do app — sem GTIN, nenhuma tela hoje consegue
    exercitar AwinFeedProvider (ver docs/AFFILIATES.md). O GTIN de cada
    resultado é pra ser passado em GET /commerce/offers na hora de comprar
    — esse endpoint (não este) decide o link final por loja, respeitando
    link cadastrado manualmente (ver commerce_provider.py::_dedupe_by_merchant).

    Mercado Livre/Shopee NÃO entram aqui — não têm feed/catálogo
    estruturado. Amazon está desativada desde 22/08/2026.

    Master gate: só busca merchants em awin_merchants_publicly_searchable()
    (subset comercial público + awin_enabled=True, awin_shadow_mode=False,
    merchant individualmente enabled=True — ver awin_advertisers.py). Isto
    é sobre APARECER na busca (nome/foto/preço), não sobre vender — Awin
    nunca gera o link de compra (ver AWIN_SELLABLE_MERCHANTS, sempre
    vazio). Um `merchant=` explícito NUNCA contorna isto — se o merchant
    pedido não estiver na lista buscável, retorna lista vazia sem
    consultar nenhuma linha daquele merchant.

    Agrupamento por GTIN e "menor preço" são calculados no PRÓPRIO SQL
    (window functions ROW_NUMBER/COUNT, Postgres e SQLite — nunca
    Elasticsearch/Redis) — não materializa em Python todas as linhas que
    baterem no ILIKE antes de agrupar, só as `limit` vencedoras.

    Só busca local (sem chamada à Awin) — mesmo princípio de
    AwinFeedProvider: sync em lote, leitura local rápida.
    """
    from .affiliate_feed import AffiliateFeedOffer
    from .awin_advertisers import awin_merchants_publicly_searchable

    allowed = set(awin_merchants_publicly_searchable())
    if merchant:
        merchants = [merchant] if merchant in allowed else []
    else:
        merchants = list(allowed)
    if not merchants:
        return {"results": []}

    # Uma condição por palavra digitada. A listagem é propositalmente
    # "democrática": qualquer termo digitado pode trazer candidato, e quem
    # casa mais termos sobe primeiro. Isso evita o vazio ruim quando o tutor
    # refina com palavras que o feed não trouxe exatamente, mas mantém
    # relevância por score. Cada termo usa "%termo%", então pedaços do meio
    # ("ontal" -> "Drontal") também funcionam.
    words = [w for w in q.strip().split() if w]
    if not words:
        return {"results": []}
    is_postgres = db.bind.dialect.name == "postgresql"
    word_matches = []
    match_score_terms = []
    for word in words:
        like = f"%{word}%"
        if is_postgres:
            title_match = func.unaccent(AffiliateFeedOffer.title).ilike(func.unaccent(like))
            brand_match = func.unaccent(AffiliateFeedOffer.brand).ilike(func.unaccent(like))
        else:
            title_match = AffiliateFeedOffer.title.ilike(like)
            brand_match = AffiliateFeedOffer.brand.ilike(like)
        word_match = title_match | brand_match
        word_matches.append(word_match)
        match_score_terms.append(case((word_match, 1), else_=0))

    phrase_like = f"%{q.strip()}%"
    if is_postgres:
        phrase_match = (
            func.unaccent(AffiliateFeedOffer.title).ilike(func.unaccent(phrase_like))
            | func.unaccent(AffiliateFeedOffer.brand).ilike(func.unaccent(phrase_like))
        )
    else:
        phrase_match = AffiliateFeedOffer.title.ilike(phrase_like) | AffiliateFeedOffer.brand.ilike(phrase_like)
    match_score = case((phrase_match, 3), else_=0)
    for score_term in match_score_terms:
        match_score = match_score + score_term

    # Uma linha por (gtin, merchant) que bate no filtro; rn=1 é a mais
    # barata daquele gtin entre TODOS os merchants liberados, offer_count
    # é quantas lojas (liberadas) têm aquele gtin — tudo calculado pelo
    # Postgres, nunca em Python. A busca só lista candidatos que podem
    # virar compra monetizada: estoque, preço e affiliate_url precisam
    # existir já no feed. Se não, o tutor vê "produto" que depois vira
    # "Indisponível" no botão, que foi exatamente o bug observado.
    ranked = (
        select(
            AffiliateFeedOffer.gtin,
            AffiliateFeedOffer.title,
            AffiliateFeedOffer.brand,
            AffiliateFeedOffer.price,
            AffiliateFeedOffer.list_price,
            AffiliateFeedOffer.image_url,
            AffiliateFeedOffer.merchant,
            match_score.label("match_score"),
            func.row_number().over(
                partition_by=AffiliateFeedOffer.gtin,
                order_by=(match_score.desc(), AffiliateFeedOffer.price.asc()),
            ).label("rn"),
            func.count().over(partition_by=AffiliateFeedOffer.gtin).label("offer_count"),
        )
        .where(
            AffiliateFeedOffer.network == "awin",
            AffiliateFeedOffer.merchant.in_(merchants),
            AffiliateFeedOffer.active.is_(True),
            AffiliateFeedOffer.in_stock.is_(True),
            AffiliateFeedOffer.price.isnot(None),
            AffiliateFeedOffer.affiliate_url.isnot(None),
            AffiliateFeedOffer.affiliate_url != "",
            AffiliateFeedOffer.gtin.isnot(None),
            or_(*word_matches),
        )
        .subquery()
    )
    final_stmt = (
        select(ranked)
        .where(ranked.c.rn == 1)
        .order_by(ranked.c.match_score.desc(), ranked.c.price.asc())
        .limit(limit)
    )
    rows = db.execute(final_stmt).all()

    return {
        "results": [
            {
                "gtin": row.gtin,
                "title": row.title,
                "brand": row.brand,
                "price": row.price,
                "list_price": row.list_price,
                "image_url": row.image_url,
                "merchant": row.merchant,
                "offer_count": row.offer_count,
            }
            for row in rows
        ],
    }


@app.get("/catalog/normalize", response_model=NormalizeResult, tags=["Catalog"])
async def normalize_catalog_candidate(
    source: str = Query(..., description="Source of the candidate (ml, amazon, etc.)"),
    source_item_id: str = Query(..., description="Source-specific item ID"),
):
    """
    Normalize a catalog candidate to a canonical product.
    Returns a stable product ID that can be saved in the app.
    """
    product = normalize_candidate_db(source, source_item_id)
    
    if product is None:
        raise HTTPException(
            status_code=404,
            detail=f"Candidate not found: {source}:{source_item_id}",
        )
    
    return NormalizeResult(
        product=CanonicalProduct(
            id=product["id"],
            name=product["name"],
            brand=product["brand"],
            pack_size=CatalogPackSize(**product["pack_size"]) if product.get("pack_size") else None,
            image_url=product.get("image_url"),
            species=product.get("species"),
        )
    )


@app.get("/catalog/brands", response_model=List[str], tags=["Catalog"])
async def get_popular_brands(
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    limit: int = Query(10, ge=1, le=50, description="Max results"),
):
    """
    Get popular brands for a country.
    Useful for offline suggestions.
    """
    return get_popular_brands_db(country.upper(), limit)


# New endpoint: GET /catalog/product?product_id=...
class CatalogProductResponse(BaseModel):
    """Canonical product info from catalog."""
    id: str
    name: str
    brand: Optional[str] = None
    variant: Optional[str] = None
    image_url: Optional[str] = None
    pack_sizes: List[dict] = []
    species: Optional[str] = None
    size_text: Optional[str] = None
    pack_weight_kg: Optional[float] = None
    source_query: Optional[str] = None


@app.get("/catalog/product", response_model=CatalogProductResponse, tags=["Catalog"])
async def get_catalog_product(
    product_id: str = Query(..., description="Canonical product ID"),
):
    """
    Get canonical product by ID.
    Returns product info from cache, 404 if not found.
    Use /suggest first to populate the cache.
    """
    if product_id in _product_cache:
        product_data = _product_cache[product_id]
        return CatalogProductResponse(**product_data)
    
    raise HTTPException(
        status_code=404,
        detail=f"Product not found: {product_id}. Search first via /suggest to populate cache.",
    )


# Legacy endpoint for backward compatibility
@app.get("/catalog/search", response_model=List[CatalogItem], tags=["Catalog"])
async def search_catalog(
    q: str = Query(..., min_length=2, max_length=100, description="Search query"),
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    limit: int = Query(10, ge=1, le=50, description="Max results"),
):
    """
    Search the product catalog for autocomplete suggestions.
    Returns product names, brands, and images without prices.
    """
    products = search_catalog_db(q, country.upper(), limit)
    return [_product_to_catalog_item(p) for p in products]


@app.get("/catalog/lookup", response_model=CatalogItem, tags=["Catalog"])
async def lookup_barcode(
    barcode: str = Query(..., min_length=8, max_length=13, description="Barcode (EAN-13 or UPC)"),
    country: str = Query("BR", min_length=2, max_length=2, description="Country code hint"),
):
    """
    Look up a product by its barcode (EAN-13 or UPC).
    Returns product info if found.
    """
    product = lookup_barcode_db(barcode, country.upper())
    
    if product is None:
        raise HTTPException(
            status_code=404,
            detail=f"Product with barcode '{barcode}' not found",
        )
    
    return _product_to_catalog_item(product)


# ================================
# Places API - Establishment autocomplete
# ================================

from .providers import PlacePrediction, PlaceDetails


class PlacePredictionResponse(BaseModel):
    """A place prediction."""
    place_id: str
    name: str
    address: str
    types: List[str] = []


class PlaceDetailsResponse(BaseModel):
    """Detailed place info."""
    place_id: str
    name: str
    address: str
    lat: float
    lng: float
    phone: Optional[str] = None
    website: Optional[str] = None
    rating: Optional[float] = None
    types: List[str] = []


class PlacesSearchResult(BaseModel):
    """Places search result."""
    predictions: List[PlacePredictionResponse]
    available: bool
    cached: bool = False


class PlacesStatusResponse(BaseModel):
    """Places service status."""
    available: bool
    reason: Optional[str] = None


# ============================================================
# VACCINE CARD OCR - MODELS
# ============================================================

@app.get("/places/status", response_model=PlacesStatusResponse, tags=["Places"])
async def places_status():
    """
    Check if Places API is available.
    Returns availability status and reason if not available.
    """
    info = google_places_provider.get_info()
    
    if info["status"] == ProviderStatus.ACTIVE.value:
        return PlacesStatusResponse(available=True)
    
    reason = "Unknown"
    if info["status"] == ProviderStatus.MISSING_CONFIG.value:
        reason = "GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY not configured"
    elif info["status"] == ProviderStatus.DISABLED.value:
        reason = "Provider disabled"
    
    return PlacesStatusResponse(available=False, reason=reason)


@app.get("/places/autocomplete", response_model=PlacesSearchResult, tags=["Places"])
async def places_autocomplete(
    q: str = Query(..., min_length=2, max_length=100, description="Search query"),
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    lat: Optional[float] = Query(None, description="Latitude for location bias"),
    lng: Optional[float] = Query(None, description="Longitude for location bias"),
    limit: int = Query(5, ge=1, le=10, description="Max results"),
):
    """
    Autocomplete for establishment names (pet stores, clinics, etc.).

    Requires GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY environment variable.
    Falls back to empty results if not configured.
    Requires PLACES_ENABLED=true (default: false).
    """
    from .services_old import is_places_enabled
    if not is_places_enabled():
        logger.info("[Places] PLACES_DISABLED — returning empty for /places/autocomplete")
        return PlacesSearchResult(predictions=[], available=False)
    if not google_places_provider.is_available:
        return PlacesSearchResult(predictions=[], available=False)
    
    predictions = await google_places_provider.autocomplete(
        query=q,
        country=country.upper(),
        lat=lat,
        lng=lng,
        limit=limit,
    )
    
    return PlacesSearchResult(
        predictions=[
            PlacePredictionResponse(
                place_id=p.place_id,
                name=p.name,
                address=p.address,
                types=p.types,
            )
            for p in predictions
        ],
        available=True,
    )


@app.get("/places/details", response_model=PlaceDetailsResponse, tags=["Places"])
async def places_details(
    place_id: str = Query(..., description="Google Place ID"),
):
    """
    Get detailed information about a place.

    Requires GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY environment variable.
    Requires PLACES_ENABLED=true (default: false).
    """
    from .services_old import is_places_enabled
    if not is_places_enabled():
        logger.info("[Places] PLACES_DISABLED — returning 503 for /places/details")
        raise HTTPException(
            status_code=503,
            detail={"disabled": True, "message": "Busca de locais desativada para reduzir custos."},
        )
    if not google_places_provider.is_available:
        raise HTTPException(
            status_code=501,
            detail="Places service not available: GOOGLE_PLACES_KEY/GOOGLE_MAPS_API_KEY not configured",
        )
    
    details = await google_places_provider.get_details(place_id)
    
    if details is None:
        raise HTTPException(
            status_code=404,
            detail=f"Place not found: {place_id}",
        )
    
    return PlaceDetailsResponse(
        place_id=details.place_id,
        name=details.name,
        address=details.address,
        lat=details.lat,
        lng=details.lng,
        phone=details.phone,
        website=details.website,
        rating=details.rating,
        types=details.types,
    )


# ================================
# Vision API - AI food identification
# ================================

import os
import hashlib
from functools import lru_cache
from pathlib import Path


class VisionCandidate(BaseModel):
    """A candidate food product identified by vision."""
    name: str
    brand: Optional[str] = None
    confidence: float  # 0.0 to 1.0
    catalog_id: Optional[str] = None  # matched catalog product id


class VisionResult(BaseModel):
    """Result from vision identification."""
    candidates: List[VisionCandidate]
    image_hash: str
    processing_time_ms: int


class VaccineCardOcrRecord(BaseModel):
    """Registro normalizado para o Card de Vacina (schema público em PT-BR)."""
    tipo_vacina: Optional[str] = None  # Pode ser None se não detectado
    nome_comercial: Optional[str] = None
    data_aplicacao: Optional[str] = None
    data_revacina: Optional[str] = None
    lote: Optional[str] = None
    veterinario_responsavel: Optional[str] = None


class VaccineCardOcrResponse(BaseModel):
    """Resposta do motor de OCR/Extração do Card de Vacina."""
    sucesso: bool
    leitura_confiavel: bool
    registros: List[VaccineCardOcrRecord]
    motor_usado: Optional[str] = None  # openai|gemini|tesseract|none
    motores_usados: List[str] = []
    ia_usada: bool = False
    ia_tentada: bool = False
    motivo_fallback: Optional[str] = None
    api_calls: int = 0
    cache_hits: int = 0


class VisionStatusResponse(BaseModel):
    """Vision service status."""
    available: bool
    reason: Optional[str] = None


def _get_openai_api_key() -> Optional[str]:
    """Get OpenAI API key from environment."""
    return os.environ.get("OPENAI_API_KEY")


def _get_gemini_api_key() -> Optional[str]:
    """Get Gemini API key from environment."""
    return os.environ.get("GEMINI_API_KEY")


def _get_gemini_model() -> str:
    """Get Gemini model name from environment."""
    return os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"


@app.get("/vision/status", response_model=VisionStatusResponse, tags=["Vision"])
async def vision_status():
    """
    Check if vision service is available.
    Returns availability status and reason if not available.
    """
    openai_key = _get_openai_api_key()
    gemini_key = _get_gemini_api_key()

    if openai_key or gemini_key:
        return VisionStatusResponse(available=True)

    return VisionStatusResponse(
        available=False,
        reason="Vision not configured. Set OPENAI_API_KEY or GEMINI_API_KEY environment variable.",
    )


@app.post("/vision/identify-food", response_model=VisionResult, tags=["Vision"])
async def identify_food(
    image_base64: str,
    country: str = Query("BR", min_length=2, max_length=2, description="Country for product matching"),
    hint: Optional[str] = Query(None, max_length=100, description="User hint about the product"),
    current_user: User = Depends(get_current_user),
):
    """
    Identify pet food from a photo using AI vision.
    
    Requires OPENAI_API_KEY environment variable to be set.
    Returns candidate products with confidence scores.
    """
    import time
    
    api_key = _get_openai_api_key()
    
    if not api_key:
        raise HTTPException(
            status_code=501,
            detail="Vision service not available: OpenAI API key not configured",
        )
    
    start_time = time.time()
    
    # Calculate image hash for caching
    image_hash = hashlib.sha256(image_base64.encode()).hexdigest()[:16]
    
    try:
        import openai
        
        client = openai.OpenAI(api_key=api_key)
        
        # Build the prompt
        system_prompt = """You are a pet food identification expert. 
Analyze the image and identify the pet food product shown.
Return your answer as JSON with the following structure:
{
  "candidates": [
    {"name": "Full Product Name", "brand": "Brand Name", "confidence": 0.95}
  ]
}
Only include candidates you are reasonably confident about (>0.3).
If you cannot identify the product, return an empty candidates array.
Focus on dog food, cat food, and other pet food products."""

        user_content = "Identify the pet food product in this image."
        if hint:
            user_content += f" Hint from user: {hint}"

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_content},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_base64}",
                                "detail": "low",  # Use low detail for faster processing
                            },
                        },
                    ],
                },
            ],
            max_tokens=500,
            response_format={"type": "json_object"},
        )
        
        import json
        result_json = json.loads(response.choices[0].message.content)
        
        candidates = []
        for c in result_json.get("candidates", []):
            # Try to match to catalog
            catalog_id = None
            if c.get("brand"):
                matches = search_catalog_db(c["brand"], country, limit=1)
                if matches:
                    catalog_id = matches[0].id
            
            candidates.append(VisionCandidate(
                name=c.get("name", "Unknown"),
                brand=c.get("brand"),
                confidence=float(c.get("confidence", 0.5)),
                catalog_id=catalog_id,
            ))
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return VisionResult(
            candidates=candidates,
            image_hash=image_hash,
            processing_time_ms=processing_time,
        )
        
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Vision service not available: openai package not installed",
        )
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Vision processing error: {str(e)}",
        )


@app.post("/vision/extract-vaccine-card-files", response_model=VaccineCardOcrResponse, tags=["Vision"])
async def extract_vaccine_card_files(
    files: List[UploadFile] = File(...),
    hint: Optional[str] = Form(None),
    prefer_local: bool = Form(True),
    force_ai: bool = Form(False),
    max_ai_images: int = Form(8),
):
    """Lê uma ou mais fotos da carteirinha e devolve os registros de vacina.

    Um caminho só: VisionService (Gemini 2.5 Flash, temperature=0 + JSON mode,
    imagem reduzida antes do envio, dedupe + normalização de datas em Python).
    Em qualquer falha devolve lista vazia — o app mostra "nenhuma vacina".
    """
    import time

    start_time = time.time()

    if not files:
        return VaccineCardOcrResponse(
            sucesso=True, leitura_confiavel=False, registros=[], motor_usado="none",
            motores_usados=[], ia_usada=False, ia_tentada=False, motivo_fallback=None,
            api_calls=0, cache_hits=0,
        )
    if len(files) > 12:
        raise HTTPException(status_code=400, detail="Too many files (max 12)")

    try:
        gemini_key = _get_gemini_api_key()
        if not gemini_key:
            raise RuntimeError("GEMINI_API_KEY não configurada")

        images_bytes: List[bytes] = []
        for file in files:
            images_bytes.append(await file.read())
            await file.seek(0)
        images_bytes = images_bytes[: max(1, max_ai_images)]

        from .vision.service import VisionService

        vision_service = VisionService(gemini_key)
        result = await vision_service.extract_vaccine_data_multi(images_bytes, pet_id="import")

        registros_convertidos = [
            VaccineCardOcrRecord(
                tipo_vacina=v.get("name") or "Desconhecida",
                nome_comercial=v.get("commercial_brand") or v.get("name") or "",
                data_aplicacao=v.get("date"),
                data_revacina=v.get("next_date"),
                lote=(v.get("notes") or None),
                veterinario_responsavel=v.get("veterinarian"),
            )
            for v in result.get("vaccines", [])
        ]
        confidence = float(result.get("confidence") or 0)
        logger.info(
            "vision-service: %d vacinas, conf=%.2f, %dms",
            len(registros_convertidos), confidence, int((time.time() - start_time) * 1000),
        )
        return VaccineCardOcrResponse(
            sucesso=True,
            leitura_confiavel=confidence >= 0.70,
            registros=registros_convertidos,
            motor_usado="vision-service",
            motores_usados=["gemini-2.5-flash"],
            ia_usada=True, ia_tentada=True, motivo_fallback=None,
            api_calls=len(images_bytes), cache_hits=0,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("❌ Leitura de carteirinha falhou: %s", e, exc_info=True)
        return VaccineCardOcrResponse(
            sucesso=True, leitura_confiavel=False, registros=[], motor_usado="vision-service",
            motores_usados=[], ia_usada=True, ia_tentada=True, motivo_fallback=str(e)[:200],
            api_calls=0, cache_hits=0,
        )


# ================================
# i18n & GeoContext Endpoints
# ================================

from .i18n import (
    GeoContext,
    Locale,
    t,
    parse_accept_language,
    PRICES_ENABLED_COUNTRIES,
)


class GeoContextRequest(BaseModel):
    """Request to resolve geo context."""
    country: Optional[str] = None
    locale: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None


class GeoContextResponse(BaseModel):
    """Resolved geo context."""
    country: str
    locale: str
    units: str
    prices_enabled: bool
    timezone: Optional[str] = None


class TranslationsResponse(BaseModel):
    """Translations for a locale."""
    locale: str
    translations: Dict[str, str]


@app.post("/geo/context", response_model=GeoContextResponse, tags=["i18n"])
async def resolve_geo_context(
    request: GeoContextRequest,
    accept_language: Optional[str] = None,
):
    """
    Resolve geographic context for a user.
    
    Priority:
    1. Explicit country/locale in request
    2. Geolocation (lat/lng) -> country (TODO: implement reverse geocoding)
    3. Accept-Language header
    4. Default to US/English
    """
    # Try explicit country first
    if request.country:
        ctx = GeoContext.from_country(request.country)
        # Override locale if specified
        if request.locale:
            try:
                ctx.locale = Locale(request.locale)
            except ValueError:
                pass
        return GeoContextResponse(**ctx.to_dict())
    
    # Try to parse Accept-Language
    if accept_language:
        parsed_locale = parse_accept_language(accept_language)
        if parsed_locale:
            # Map locale to country (rough approximation)
            if parsed_locale.startswith("pt"):
                ctx = GeoContext.from_country("BR")
            elif parsed_locale.startswith("es"):
                ctx = GeoContext.from_country("MX")
            else:
                ctx = GeoContext.default()
            return GeoContextResponse(**ctx.to_dict())
    
    # Default
    ctx = GeoContext.default()
    return GeoContextResponse(**ctx.to_dict())


@app.get("/geo/translations/{locale}", response_model=TranslationsResponse, tags=["i18n"])
async def get_translations(locale: str):
    """
    Get all translations for a locale.
    """
    from .i18n import TRANSLATIONS
    
    translations = {}
    for key, values in TRANSLATIONS.items():
        translations[key] = t(key, locale)
    
    return TranslationsResponse(locale=locale, translations=translations)


@app.get("/geo/prices-enabled", tags=["i18n"])
async def get_prices_enabled_countries():
    """Get list of countries where price comparison is enabled."""
    return {"countries": list(PRICES_ENABLED_COUNTRIES)}


# ================================
# Services Endpoints (Google Places) - OLD
# ================================

from .services_old import (
    services_provider,
    ServiceCategory,
    ServicePlace,
    PlacesApiError,
)


class ServicePlaceResponse(BaseModel):
    """A service place."""
    place_id: str
    name: str
    address: str
    lat: float
    lng: float
    category: str
    phone: Optional[str] = None
    website: Optional[str] = None
    rating: Optional[float] = None
    rating_count: Optional[int] = None
    open_now: Optional[bool] = None
    distance_meters: Optional[int] = None
    distance_text: Optional[str] = None
    photos: List[str] = []


class ServicesSearchResponse(BaseModel):
    """Services search response."""
    places: List[ServicePlaceResponse]
    category: str
    query_lat: float
    query_lng: float
    radius: int
    attribution: str = "Dados de locais por Google"


class EmergencyResponse(BaseModel):
    """Emergency vet response."""
    has_open: bool
    open_place: Optional[ServicePlaceResponse] = None
    open_places: List[ServicePlaceResponse] = []
    nearby_places: List[ServicePlaceResponse] = []
    attribution: str = "Dados de locais por Google"


def _place_to_response(place: ServicePlace) -> ServicePlaceResponse:
    """Convert ServicePlace to response model."""
    return ServicePlaceResponse(
        place_id=place.place_id,
        name=place.name,
        address=place.address,
        lat=place.lat,
        lng=place.lng,
        category=place.category.value,
        phone=place.phone,
        website=place.website,
        rating=place.rating,
        rating_count=place.rating_count,
        open_now=place.open_now,
        distance_meters=place.distance_meters,
        distance_text=place.distance_text,
        photos=place.photos,
    )


@app.get("/services/nearby", response_model=ServicesSearchResponse, tags=["Services"])
@rate_limit(max_requests=240, window_seconds=60)
async def search_services_nearby(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    category: str = Query(..., description="Category: petshop, vet_clinic, grooming, hotel, trainer"),
    radius: Optional[int] = Query(None, ge=1000, le=50000, description="Radius in meters"),
    radius_m: Optional[int] = Query(None, ge=1000, le=50000, description="Legacy: Radius in meters"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
    locale: str = Query("en", description="BCP-47 locale (e.g., pt-BR, en-US, es, fr, it)"),
    country: str = Query("US", description="ISO-3166 alpha-2 country code (e.g., BR, US, FR)"),
):
    """
    Search for nearby pet services - MUNDIAL support.
    
    Categories:
    - petshop: Pet stores
    - vet_clinic: Veterinary clinics
    - grooming: Grooming (Banho & Tosa)
    - hotel: Pet hotels / Daycare
    - trainer: Dog trainers
    
    Multi-language support via locale parameter.
    Multi-country support via country parameter.
    """
    from .services_old import is_places_enabled
    if not is_places_enabled():
        logger.info("[Places] PLACES_DISABLED — returning empty for /services/nearby")
        return ServicesSearchResponse(
            places=[], category=category, query_lat=lat, query_lng=lng,
            radius=radius_m or radius or 10000,
        )
    if not services_provider.is_available:
        return ServicesSearchResponse(
            places=[],
            category=category,
            query_lat=lat,
            query_lng=lng,
            radius=radius_m or radius or 10000,
        )
    
    # Support both radius and radius_m (legacy)
    effective_radius = radius_m or radius or 10000
    
    try:
        cat = ServiceCategory(category)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Use: petshop, vet_clinic, grooming, hotel, trainer",
        )
    
    places = await services_provider.search_nearby(
        lat, lng, cat, effective_radius, limit, locale=locale, country=country
    )
    
    return ServicesSearchResponse(
        places=[_place_to_response(p) for p in places],
        category=category,
        query_lat=lat,
        query_lng=lng,
        radius=effective_radius,
    )


# Alias for frontend: /places/nearby
@app.get("/places/nearby", response_model=ServicesSearchResponse, tags=["Services"])
@rate_limit(max_requests=240, window_seconds=60)
async def places_nearby(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    category: str = Query(..., description="Category: petshop, vet_clinic, grooming, hotel, trainer"),
    radius: Optional[int] = Query(None, ge=1000, le=50000, description="Radius in meters"),
    radius_m: Optional[int] = Query(None, ge=1000, le=50000, description="Legacy: Radius in meters"),
    limit: int = Query(20, ge=1, le=50, description="Max results"),
    locale: str = Query("en", description="BCP-47 locale (e.g., pt-BR, en-US, es, fr, it)"),
    country: str = Query("US", description="ISO-3166 alpha-2 country code (e.g., BR, US, FR)"),
):
    """
    Alias for /services/nearby. Search for nearby pet services - MUNDIAL.
    
    Categories:
    - petshop: Pet stores
    - vet_clinic: Veterinary clinics
    - grooming: Grooming (Banho & Tosa)
    - hotel: Pet hotels / Daycare
    - trainer: Dog trainers
    
    Multi-language and multi-country support.
    """
    from .services_old import is_places_enabled
    if not is_places_enabled():
        logger.info("[Places] PLACES_DISABLED — returning empty for /places/nearby")
        effective_r = radius_m or radius or 10000
        return ServicesSearchResponse(
            places=[], category=category, query_lat=lat, query_lng=lng,
            radius=effective_r,
        )
    # Support both radius and radius_m (legacy)
    effective_radius = radius_m or radius or 10000
    
    result = await search_services_nearby(
        request, lat, lng, category, None, effective_radius, limit, locale, country
    )
    
    # If no results, add attribution explaining why
    if not result.places:
        result.attribution = "No establishments found in this radius. Google Places API may have restrictions."
    
    return result


@app.get("/services/place/{place_id}", response_model=ServicePlaceResponse, tags=["Services"])
async def get_service_place(place_id: str):
    """Get detailed information about a service place."""
    if not services_provider.is_available:
        raise HTTPException(
            status_code=503,
            detail="Services not available. Google Places API not configured.",
        )
    
    place = await services_provider.get_place_details(place_id)
    
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")
    
    return _place_to_response(place)


@app.get("/services/emergency", response_model=EmergencyResponse, tags=["Services"])
@rate_limit(max_requests=240, window_seconds=60)
async def find_emergency_vet(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: Optional[int] = Query(None, ge=1000, le=50000, description="Search radius in meters"),
    radius_m: Optional[int] = Query(None, ge=1000, le=50000, description="Legacy: Search radius in meters"),
    open_now: bool = Query(True, description="Filter by open now"),
    locale: str = Query("pt-BR", description="Language/locale (pt-BR, en-US, etc)"),
):
    """
    Find nearest emergency veterinarians with MUNDIAL multi-pass search.
    
    Returns real establishments from Google Places API.
    If none found, returns empty list (no mock data).
    Exposes API errors to frontend for proper debugging.
    """
    if not services_provider.is_available:
        raise HTTPException(
            status_code=503,
            detail="Google Places API not configured. Check GOOGLE_MAPS_API_KEY.",
        )
    
    # Support both radius and radius_m (legacy)
    effective_radius = radius_m or radius or 30000
    
    try:
        result = await services_provider.find_emergency_vet(
            lat, lng, effective_radius, open_now=open_now, locale=locale
        )
        
        return EmergencyResponse(
            has_open=result["has_open"],
            open_place=_place_to_response(result["open_place"]) if result["open_place"] else None,
            open_places=[_place_to_response(p) for p in result.get("open_places", [])],
            nearby_places=[_place_to_response(p) for p in result.get("nearby_places", [])],
        )
    except PlacesApiError as e:
        # Expose Places API errors to frontend (do NOT hide)
        raise HTTPException(
            status_code=503,
            detail=f"Google Places API error: {e.message}",
        )

@app.get("/emergency/nearest", response_model=EmergencyResponse, tags=["Services"])
@rate_limit(max_requests=240, window_seconds=60)
async def emergency_nearest(
    request: Request,
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    country: str = Query("BR", description="Country code (for logging)"),
    locale: str = Query("pt-BR", description="Locale"),
    radius: Optional[int] = Query(None, ge=1000, le=50000, description="Search radius in meters"),
    radius_m: Optional[int] = Query(None, ge=1000, le=50000, description="Legacy: Search radius in meters"),
    open_now: bool = Query(True, description="Filter by open now"),
):
    """
    Alias for /services/emergency. Used by frontend "Socorro Agora".
    """
    # Support both radius and radius_m (legacy)
    effective_radius = radius_m or radius or 30000
    
    result = await find_emergency_vet(
        request=request,
        lat=lat,
        lng=lng,
        radius=effective_radius,
        radius_m=None,
        open_now=open_now,
        locale=locale,
    )
    
    return result


# ================================
# Handoff Endpoints (Lead Attribution)
# ================================

from fastapi.responses import RedirectResponse
from .handoff import (
    handoff_service,
    HandoffType,
    ServiceCategory as HandoffServiceCategory,
)
from .i18n import t as translate


class HandoffRequest(BaseModel):
    """Handoff request."""
    place_id: str
    service_category: str
    country: str = "BR"
    locale: str = "pt-BR"
    phone: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    place_name: Optional[str] = None


class HandoffResponse(BaseModel):
    """Handoff response with redirect URL."""
    lead_id: str
    redirect_url: str
    handoff_type: str


# ================================
# GET Handoff Endpoints (302 Redirects)
# These work as <a href> links without JS
# ================================

# --- SHOPPING HANDOFF (Google Shopping redirect, seguro) ---
import random
import string
import logging
from fastapi.responses import RedirectResponse

logger = logging.getLogger(__name__)

def _generate_lead_id():
    return f"PM-{''.join(random.choices(string.digits, k=6))}"

def _log_handoff_event(lead_id, channel, category, country, locale):
    logging.info({
        "lead_id": lead_id,
        "channel": channel,
        "category": category,
        "ts": datetime.utcnow().isoformat() + "Z",
        "country": country,
        "locale": locale,
    })

@app.get("/handoff/shopping", tags=["Handoff"])
@app.head("/handoff/shopping", tags=["Handoff"], include_in_schema=False)
async def handoff_shopping(
    request: Request,
    query: Optional[str] = Query(None, description="Search query"),
    country: str = Query("BR", min_length=2, max_length=2, description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    source: str = Query("home", description="Source page"),
):
    """
    Shopping handoff with pet-only validation.
    INFALÍVEL: sempre retorna 302 (nunca 422/500).

    Auditoria de monetização (25/08/2026): a bridge /go/shopping abre uma
    busca PURA do Google Shopping — sem afiliado, sem comissão nenhuma
    (ver externalShopping.ts/go/shopping/page.tsx). Isso violava o
    princípio central "NO MONETIZATION PROOF → NO BUY BUTTON" (ver
    docs/AFFILIATES.md) — era o único comportamento deste endpoint, não
    um fallback. Em produção (affiliate_only_commerce_enforced), este
    endpoint agora recusa fail-closed em vez de mandar pro Google
    Shopping; o frontend (FoodControlTab.tsx) já esconde a CTA
    "Recomprar" sob a mesma flag, mas o endpoint precisa recusar por si
    só — é público e pode ser chamado direto, sem passar pela UI.
    """
    settings = get_settings()
    if settings.affiliate_only_commerce_enforced:
        return RedirectResponse(url="/go/error?reason=not_monetized&source=shopping", status_code=302)

    # Generate lead_id
    lead_id = _generate_lead_id()

    # Validate query
    if not query or not isinstance(query, str) or len(query.strip()) < 2:
        # Redirect to error page
        from urllib.parse import quote
        return RedirectResponse(
            url=f"/go/error?reason=invalid_query&source=shopping",
            status_code=302
        )
    
    # Apply pet guard
    from .petguard import pet_guard
    guard_result = pet_guard(query.strip(), locale)
    
    # If blocked, redirect to error with suggestions
    if guard_result["action"] == "block":
        from urllib.parse import quote
        suggestions_str = ",".join(guard_result.get("suggestions", [])[:6])
        return RedirectResponse(
            url=f"/go/error?reason=non_pet&query={quote(query)}&suggestions={quote(suggestions_str)}",
            status_code=302
        )
    
    # Use rewritten query (if applicable)
    q_final = guard_result["q_final"]
    
    # Log event (sem PII)
    logger.info({
        "event": "shopping_handoff",
        "lead_id": lead_id,
        "channel": "shopping",
        "action": guard_result["action"],
        "confidence": guard_result.get("confidence", 0),
        "q_original": query.strip(),
        "q_final": q_final,
        "country": country.upper(),
        "locale": locale,
        "source": source,
        "ts": datetime.utcnow().isoformat()
    })
    
    # Redirect to bridge page (web)
    from urllib.parse import quote
    bridge_url = (
        f"/go/shopping"
        f"?lead_id={lead_id}"
        f"&q={quote(q_final)}"
        f"&q_original={quote(query.strip())}"
        f"&country={country.upper()}"
        f"&locale={locale}"
        f"&source={source}"
    )
    return RedirectResponse(url=bridge_url, status_code=302)

@app.get("/handoff/whatsapp", tags=["Handoff"])
@app.head("/handoff/whatsapp", tags=["Handoff"], include_in_schema=False)
async def handoff_whatsapp_get(
    request: Request,
    phone: Optional[str] = Query(None, description="Phone number with country code"),
    place_id: str = Query("unknown", description="Google Place ID (optional)"),
    service_category: str = Query("other", description="Service category"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale for message"),
    partner_slug: Optional[str] = Query(None, description="BH partner slug"),
    campaign_id: Optional[int] = Query(None, description="Campaign ID for tracking"),
    utm_source: Optional[str] = Query(None, description="UTM source"),
    utm_medium: Optional[str] = Query(None, description="UTM medium"),
    utm_campaign: Optional[str] = Query(None, description="UTM campaign"),
    source: str = Query("unknown", description="Traffic source"),
):
    """
    GET redirect for WhatsApp handoff.
    INFALÍVEL: sempre retorna 302 (nunca 422).
    """
    # Generate simple lead_id
    from datetime import datetime
    import random
    timestamp = datetime.utcnow().strftime("%y%m%d%H%M%S")
    random_suffix = random.randint(10, 99)
    lead_id = f"PM-{timestamp[-6:]}{random_suffix}"
    
    # Validate phone
    if not phone or not isinstance(phone, str) or len(phone.strip()) < 8:
        error_params = f"reason=missing_phone&channel=whatsapp&lead_id={lead_id}"
        return RedirectResponse(
            url=f"/go/error?{error_params}",
            status_code=302
        )
    
    try:
        cat = HandoffServiceCategory(service_category)
    except Exception:
        cat = HandoffServiceCategory.OTHER
    
    service_name = translate(f"services.{service_category}", locale)
    if service_name == f"services.{service_category}":
        service_name = service_category
    
    message_template = translate("handoff.whatsapp", locale, service=service_name, lead_id=lead_id)
    if message_template == f"handoff.whatsapp":
        message_template = f"Encontrei pelo PETMOL — Lead {lead_id}"
    
    result = handoff_service.process_handoff(
        handoff_type=HandoffType.WHATSAPP,
        place_id=place_id,
        service_category=cat,
        country=country,
        locale=locale,
        phone=phone.strip(),
        message_template=message_template,
    )
    
    return RedirectResponse(url=result["redirect_url"], status_code=302)


@app.get("/handoff/call", tags=["Handoff"])
@app.head("/handoff/call", tags=["Handoff"], include_in_schema=False)
async def handoff_call_get(
    request: Request,
    phone: Optional[str] = Query(None, description="Phone number"),
    place_id: str = Query("unknown", description="Google Place ID (optional)"),
    service_category: str = Query("other", description="Service category"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    partner_slug: Optional[str] = Query(None, description="BH partner slug"),
    campaign_id: Optional[int] = Query(None, description="Campaign ID for tracking"),
    utm_source: Optional[str] = Query(None, description="UTM source"),
    utm_medium: Optional[str] = Query(None, description="UTM medium"),
    utm_campaign: Optional[str] = Query(None, description="UTM campaign"),
    source: str = Query("unknown", description="Traffic source"),
):
    """
    GET redirect for phone call handoff.
    INFALÍVEL: sempre retorna 302 (nunca 422).
    Tracks lead_id in BH database if partner_slug provided.
    """
    # Validate phone
    if not phone or not isinstance(phone, str) or len(phone.strip()) < 8:
        error_params = "reason=missing_phone&channel=call"
        return RedirectResponse(
            url=f"/go/error?{error_params}",
            status_code=302
        )
    
    try:
        cat = HandoffServiceCategory(service_category)
    except Exception:
        cat = HandoffServiceCategory.OTHER
    
    result = handoff_service.process_handoff(
        handoff_type=HandoffType.CALL,
        place_id=place_id,
        service_category=cat,
        country=country,
        locale=locale,
        phone=phone.strip(),
    )
    
    return RedirectResponse(url=result["redirect_url"], status_code=302)


@app.get("/handoff/directions", tags=["Handoff"])
@app.head("/handoff/directions", tags=["Handoff"], include_in_schema=False)
async def handoff_directions_get(
    request: Request,
    place_id: str = Query("unknown", description="Google Place ID (optional)"),
    service_category: str = Query("other", description="Service category"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    lat: Optional[float] = Query(None, description="Latitude"),
    lng: Optional[float] = Query(None, description="Longitude"),
    place_name: Optional[str] = Query(None, description="Place name for display"),
    provider: str = Query("gmaps", description="Provider: waze, gmaps, or apple"),
    partner_slug: Optional[str] = Query(None, description="BH partner slug"),
    campaign_id: Optional[int] = Query(None, description="Campaign ID for tracking"),
    utm_source: Optional[str] = Query(None, description="UTM source"),
    utm_medium: Optional[str] = Query(None, description="UTM medium"),
    utm_campaign: Optional[str] = Query(None, description="UTM campaign"),
    source: str = Query("unknown", description="Traffic source"),
):
    """
    GET redirect for directions handoff.
    INFALÍVEL: sempre retorna 302 (mesmo sem lat/lng, busca genérica).
    Suporta providers: waze, gmaps (default), apple
    """
    
    try:
        cat = HandoffServiceCategory(service_category)
    except Exception:
        cat = HandoffServiceCategory.OTHER
    
    # Validate provider
    valid_providers = ["waze", "gmaps", "apple"]
    if provider not in valid_providers:
        provider = "gmaps"
    
    # If no coordinates and no place_id, create fallback search query
    if not lat and not lng and place_id == "unknown":
        # Translate "veterinary 24h near me" based on locale
        lang = locale.split('-')[0] if '-' in locale else 'pt'
        search_terms = {
            'pt': 'veterinário 24 horas perto de mim',
            'en': 'veterinary 24h near me',
            'es': 'veterinario 24 horas cerca de mí',
            'fr': 'vétérinaire 24h près de moi',
            'it': 'veterinario 24 ore vicino a me'
        }
        search_query = search_terms.get(lang, search_terms['en'])
        
        # Route based on provider
        if provider == "waze":
            from urllib.parse import quote
            maps_url = f"https://waze.com/ul?q={quote(search_query)}&navigate=yes"
        elif provider == "apple":
            from urllib.parse import quote
            maps_url = f"http://maps.apple.com/?q={quote(search_query)}"
        else:  # gmaps
            from urllib.parse import quote
            maps_url = f"https://www.google.com/maps/search/{quote(search_query)}"
        
        return RedirectResponse(url=maps_url, status_code=302)
    
    result = handoff_service.process_handoff(
        handoff_type=HandoffType.DIRECTIONS,
        place_id=place_id,
        service_category=cat,
        country=country,
        locale=locale,
        lat=lat,
        lng=lng,
        place_name=place_name or "Destino",
        provider=provider,
    )
    
    return RedirectResponse(url=result["redirect_url"], status_code=302)


# ================================
# POST Handoff Endpoints (JSON Response)
# ================================

@app.post("/handoff/whatsapp", response_model=HandoffResponse, tags=["Handoff"])
async def handoff_whatsapp(request: HandoffRequest):
    """
    Create WhatsApp handoff with lead tracking.
    
    Returns URL that opens WhatsApp with pre-filled message including lead_id.
    """
    if not request.phone:
        raise HTTPException(status_code=400, detail="Phone number required for WhatsApp")
    
    try:
        cat = HandoffServiceCategory(request.service_category)
    except ValueError:
        cat = HandoffServiceCategory.OTHER
    
    # Get translated message template
    service_name = translate(f"services.{request.service_category}", request.locale)
    if service_name == f"services.{request.service_category}":
        service_name = request.service_category
    
    message_template = translate("handoff.whatsapp", request.locale, service=service_name, lead_id="{lead_id}")
    
    result = handoff_service.process_handoff(
        handoff_type=HandoffType.WHATSAPP,
        place_id=request.place_id,
        service_category=cat,
        country=request.country,
        locale=request.locale,
        phone=request.phone,
        message_template=message_template,
    )
    
    return HandoffResponse(**result)


@app.post("/handoff/call", response_model=HandoffResponse, tags=["Handoff"])
async def handoff_call(request: HandoffRequest):
    """
    Create phone call handoff with lead tracking.
    
    Returns tel: URL for calling.
    """
    if not request.phone:
        raise HTTPException(status_code=400, detail="Phone number required for call")
    
    try:
        cat = HandoffServiceCategory(request.service_category)
    except ValueError:
        cat = HandoffServiceCategory.OTHER
    
    result = handoff_service.process_handoff(
        handoff_type=HandoffType.CALL,
        place_id=request.place_id,
        service_category=cat,
        country=request.country,
        locale=request.locale,
        phone=request.phone,
    )
    
    return HandoffResponse(**result)


@app.post("/handoff/directions", response_model=HandoffResponse, tags=["Handoff"])
async def handoff_directions(request: HandoffRequest):
    """
    Create directions handoff with lead tracking.
    
    Returns Google Maps directions URL.
    """
    try:
        cat = HandoffServiceCategory(request.service_category)
    except ValueError:
        cat = HandoffServiceCategory.OTHER
    
    result = handoff_service.process_handoff(
        handoff_type=HandoffType.DIRECTIONS,
        place_id=request.place_id,
        service_category=cat,
        country=request.country,
        locale=request.locale,
        lat=request.lat,
        lng=request.lng,
        place_name=request.place_name,
    )
    
    return HandoffResponse(**result)


@app.get("/handoff/stats", tags=["Handoff"])
async def handoff_stats():
    """Get handoff statistics (for internal use)."""
    return handoff_service.get_stats()


# ===== PLACES API ROUTES =====

@app.get("/api/places/nearby", tags=["Places"])
async def get_nearby_places(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    category: str = Query(..., description="Service category"),
    radius_m: int = Query(2000, description="Search radius in meters (default: 2km)"),
    limit: int = Query(10, description="Max results (default: 10)"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    open_now: bool = Query(False, description="Only show open places"),
    quality: str = Query("eco", description="Quality mode: eco (1 pass, sem details) | normal (2 passes, top-5 details)"),
):
    """Search for nearby pet service places."""
    from .services_old import search_nearby_places, ServiceCategory, is_places_enabled

    # Killswitch
    if not is_places_enabled():
        return {
            "places": [],
            "count": 0,
            "disabled": True,
            "message": "Busca de locais temporariamente desativada para reduzir custos.",
        }
    
    # Map category string to enum
    category_map = {
        "petshop": ServiceCategory.PETSHOP,
        "vet_clinic": ServiceCategory.VET_CLINIC,
        "vet_emergency": ServiceCategory.VET_EMERGENCY,
        "grooming": ServiceCategory.GROOMING,
        "hotel": ServiceCategory.HOTEL,
        "trainer": ServiceCategory.TRAINER,
    }
    
    service_category = category_map.get(category)
    if not service_category:
        raise HTTPException(status_code=400, detail=f"Invalid category: {category}")
    
    try:
        places = await search_nearby_places(
            lat=lat,
            lng=lng,
            category=service_category,
            radius_meters=radius_m,
            limit=limit,
            locale=locale,
            country=country,
            open_now=open_now,
            quality_mode=quality,
        )
        
        return {
            "places": [p.to_dict() for p in places],
            "count": len(places),
            "category": category,
            "location": {"lat": lat, "lng": lng},
            "radius_m": radius_m,
        }
    except Exception as e:
        logger.error(f"Error searching places: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/places/nearby", tags=["Places"])
async def get_nearby_places_legacy(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    category: str = Query(..., description="Service category"),
    radius_m: int = Query(2000, description="Search radius in meters"),
    limit: int = Query(10, description="Max results"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    open_now: bool = Query(False, description="Only show open places"),
    quality: str = Query("eco", description="eco | normal"),
):
    return await get_nearby_places(
        lat=lat,
        lng=lng,
        category=category,
        radius_m=radius_m,
        limit=limit,
        country=country,
        locale=locale,
        open_now=open_now,
        quality=quality,
    )


@app.get("/api/emergency/nearest", tags=["Emergency"])
async def get_nearest_emergency(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius_m: int = Query(10000, description="Search radius in meters"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    open_now: bool = Query(False, description="Only show open places"),
):
    """Find nearest 24h emergency veterinary clinics."""
    from .services_old import services_provider
    
    try:
        result = await services_provider.find_emergency_vet(
            lat=lat,
            lng=lng,
            radius=radius_m,
            open_now=open_now,
            locale=locale,
        )

        def to_dict(place):
            return place.to_dict() if place else None

        return {
            "has_open": result.get("has_open", False),
            "open_place": to_dict(result.get("open_place")),
            "open_places": [p.to_dict() for p in result.get("open_places", [])],
            "nearby_places": [p.to_dict() for p in result.get("nearby_places", [])],
        }
    except Exception as e:
        logger.error(f"Error searching emergency vets: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/emergency/nearest", tags=["Emergency"])
async def get_nearest_emergency_legacy(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius_m: int = Query(10000, description="Search radius in meters"),
    country: str = Query("BR", description="Country code"),
    locale: str = Query("pt-BR", description="Locale"),
    open_now: bool = Query(False, description="Only show open places"),
):
    return await get_nearest_emergency(
        lat=lat,
        lng=lng,
        radius_m=radius_m,
        country=country,
        locale=locale,
        open_now=open_now,
    )



if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

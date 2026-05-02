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
from .db import Base, engine, SessionLocal
from .user_auth import user_auth_router
from .pets import pets_router
from .pets import models as _pets_models
from .pets.vaccine_models import VaccineRecord as _  # Import to register with Base
from .pets.parasite_models import ParasiteControlRecord as _pcr  # register with Base
from .pets.grooming_models import GroomingRecord as _gr  # register with Base
from .health import models as _health_models  # Import health models to register with Base
from .admin import admin_router
from .admin import models as _admin_models
from .admin.models import AdminUser
from .user_auth.models import PasswordResetToken as _password_reset_token_model  # noqa: F401
from .user_auth.models import User
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

# Sistema Robusto de Leitura de Cartões de Vacina
try:
    import sys
    from pathlib import Path
    _vision_path = Path(__file__).parent / "vision"
    if str(_vision_path) not in sys.path:
        sys.path.insert(0, str(_vision_path.parent))
    from vision.robust_reader import RobustVaccineCardReader
    _ROBUST_SYSTEM_AVAILABLE = True
except Exception as e:
    logger = __import__("logging").getLogger(__name__)
    logger.warning(f"Sistema Robusto não disponível: {e}")
    _ROBUST_SYSTEM_AVAILABLE = False

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
    docs_url="/docs",
    redoc_url="/redoc",
)

# ========================================
# Performance Monitoring (100K+ users)
# ========================================
import time
import logging

logger = logging.getLogger(__name__)

@app.middleware("http")
async def log_slow_requests(request: Request, call_next):
    """Monitor and log slow requests for performance optimization."""
    start_time = time.time()
    
    response = await call_next(request)
    
    duration = time.time() - start_time
    
    # Log requests lentos (>1s) para investigação
    if duration > 1.0:
        logger.warning(
            f"SLOW REQUEST: {request.method} {request.url.path} "
            f"took {duration:.2f}s | status={response.status_code}"
        )
    
    # Log requests muito lentos (>3s) como ERROR
    if duration > 3.0:
        logger.error(
            f"VERY SLOW REQUEST: {request.method} {request.url.path} "
            f"took {duration:.2f}s | status={response.status_code}"
        )
    
    # Adicionar header de tempo de resposta
    response.headers["X-Process-Time"] = f"{duration:.3f}"
    
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

# Pet Documents (cofre documental)
from .pets.document_router import router as pet_documents_router
app.include_router(pet_documents_router)

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
# Some deployments forward /api/* without stripping the prefix.
app.include_router(admin_router, prefix="/api")

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

    # Additive column migrations (idempotent, safe for both SQLite and PostgreSQL)
    try:
        if settings.database_url.startswith("sqlite"):
            from .migrations import run_sqlite_migrations
            run_sqlite_migrations(engine)
        else:
            from .migrations import run_pg_migrations
            run_pg_migrations(engine)
    except Exception:
        pass

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

    # Optional: seed first master admin via environment variables.
    # Only runs if configured AND there are no admins yet.
    if settings.admin_master_email and settings.admin_master_password:
        db = SessionLocal()
        try:
            existing_admins = db.query(AdminUser).count()
            if existing_admins == 0:
                email = settings.admin_master_email.strip().lower()
                user = db.query(User).filter(User.email == email).first()
                if not user:
                    user = User(email=email, password_hash=hash_password(settings.admin_master_password), name=settings.admin_master_name or "Admin")
                    db.add(user)
                    db.commit()
                    db.refresh(user)

                admin = db.query(AdminUser).filter(AdminUser.user_id == user.id).first()
                if not admin:
                    admin = AdminUser(user_id=str(user.id), role=settings.admin_master_role)
                    db.add(admin)
                    db.commit()
        finally:
            db.close()


@app.on_event("startup")
def start_push_scheduler():
    """Start APScheduler for PETMOL notification jobs (4-layer model)."""
    from .config import get_settings
    settings = get_settings()
    
    if not settings.feature_reminders_push:
        logger = __import__("logging").getLogger(__name__)
        logger.info("[PETMOL] Push scheduler desativado via FEATURE_REMINDERS_PUSH")
        return

    try:
        from apscheduler.schedulers.background import BackgroundScheduler
        from .notifications import (
            send_medication_pushes,
            send_care_pushes,
            send_food_reminder_pushes,
        )

        scheduler = BackgroundScheduler()
        # Camada 1 (crítico): medicação continua no horário exato configurado
        scheduler.add_job(send_medication_pushes, "interval", minutes=1, id="medication_pushes")
        # Lembretes de cuidado baseados no cadastro do tutor (vacina/parasita/grooming)
        scheduler.add_job(send_care_pushes, "interval", minutes=1, id="care_pushes")
        # Camadas 1/2 (ração): cron 11:00 BRT garante disparo mesmo após restart
        scheduler.add_job(
            send_food_reminder_pushes,
            "cron",
            hour=11,
            minute=0,
            timezone="America/Sao_Paulo",
            id="food_reminder_pushes",
            misfire_grace_time=300,
        )
        scheduler.start()
        logger = __import__("logging").getLogger(__name__)
        logger.info("[PETMOL] Push scheduler iniciado (verifica a cada minuto)")
    except Exception as e:
        logger = __import__("logging").getLogger(__name__)
        logger.error(f"[PETMOL] Push scheduler nao iniciado: {e}")


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

# Include notification pendencies router (persistent in-app alerts)
from .notifications.pendencies import router as pendencies_router
app.include_router(pendencies_router)
app.include_router(pendencies_router, prefix="/api")

# Family sharing router — SILENCIADO: desativar compartilhamento entre contas.
# Para reativar: descomentar as 3 linhas abaixo.
# from .family import family_router
# app.include_router(family_router)
# app.include_router(family_router, prefix="/api")

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

# SLICE 2: Include RG router (pet ID card viral sharing)
from .rg.router import router as rg_router
app.include_router(rg_router)

# SLICE 3: Include Establishments portal router
from .establishments import router as establishments_router
app.include_router(establishments_router)

# SLICE 3.4: Include Establishments admin router
from .establishments.admin_router import router as establishments_admin_router
app.include_router(establishments_admin_router)

# Include Feedback/Learning System router
from .feedback.router import router as feedback_router
app.include_router(feedback_router)

# Secure upload / attachment endpoints
from .uploads.router import router as uploads_router
app.include_router(uploads_router)

# SLICE 3 (REFACTOR): Events router - DESATIVADO (simplificação)
from .events import router as events_router
app.include_router(events_router)

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
async def debug_providers():
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
async def debug_clear_errors():
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
async def debug_self_test():
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

class VaccineCardOcrFieldConfidence(BaseModel):
    """Confiança individual por campo extraído."""
    marca_vacina: float = 1.0  # 0.0 a 1.0
    data_aplicacao: float = 1.0
    data_revacina: float = 1.0
    veterinario: float = 1.0


class VaccineCardOcrRecord(BaseModel):
    """Registro normalizado para o Card de Vacina (schema público em PT-BR)."""
    tipo_vacina: Optional[str] = None  # Pode ser None se não detectado
    nome_comercial: Optional[str] = None
    data_aplicacao: Optional[str] = None
    data_revacina: Optional[str] = None
    lote: Optional[str] = None
    veterinario_responsavel: Optional[str] = None
    confianca_por_campo: Optional[VaccineCardOcrFieldConfidence] = None
    missing_fields: List[str] = []  # NOVO: Lista de campos em branco
    confianca_score: float = 0.0  # NOVO: Score geral de confiança (0-1)


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


class VaccineCardVaccine(BaseModel):
    """A vaccine detected from a vaccination card."""
    type: str  # vaccine type
    name: str  # vaccine name
    date_administered: str  # YYYY-MM-DD format
    next_dose_date: Optional[str] = None  # YYYY-MM-DD format
    veterinarian: Optional[str] = None
    clinic_name: Optional[str] = None
    batch_number: Optional[str] = None
    confidence: float  # 0.0 to 1.0


class VaccineCardAnalysis(BaseModel):
    """Result from vaccination card analysis."""
    detected_vaccines: List[VaccineCardVaccine]
    warnings: List[str]
    recommendations: List[str]
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


@lru_cache(maxsize=1)
def _load_world_vaccine_name_catalog() -> List[dict]:
    """Load a worldwide vaccine names catalog (versioned in the repo).

    This is used ONLY as a recognition aid (aliases), never to invent fields.
    """

    try:
        root = Path(__file__).resolve().parents[3]
        path = root / "shared" / "vaccines" / "vaccine_names.json"
        if not path.exists():
            return []
        raw = path.read_text(encoding="utf-8")
        obj = json.loads(raw)
        if isinstance(obj, list):
            return [x for x in obj if isinstance(x, dict)]
    except Exception:
        return []
    return []


def _world_vaccine_aliases_for_prompt(max_items: int = 60) -> List[str]:
    catalog = _load_world_vaccine_name_catalog() or []
    out: List[str] = []
    for item in catalog:
        c = str(item.get("canonical") or "").strip()
        if c:
            out.append(c)
        aliases = item.get("aliases") or []
        if isinstance(aliases, list):
            for a in aliases:
                s = str(a or "").strip()
                if s:
                    out.append(s)
    # unique + preserve order
    seen = set()
    uniq: List[str] = []
    for x in out:
        k = x.lower()
        if k in seen:
            continue
        seen.add(k)
        uniq.append(x)
        if len(uniq) >= max_items:
            break
    return uniq


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
    return os.environ.get("GEMINI_MODEL") or "gemini-2.0-flash"


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


@app.post("/vision/analyze-vaccine-card", response_model=VaccineCardAnalysis, tags=["Vision"])
async def analyze_vaccine_card(
    image_base64: str,
    hint: Optional[str] = Query(None, max_length=200, description="Additional context about the vaccination card"),
):
    """
    Analyze a vaccination card image using AI to extract vaccine information.
    
    Requires OPENAI_API_KEY environment variable to be set.
    Returns detected vaccines with dates, veterinarian info, and recommendations.
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
        
        # Build the specialized prompt for vaccine cards
        system_prompt = """You are a veterinary vaccination card analysis expert. 
Analyze the vaccination card image and extract all vaccine information with high accuracy.

Return your answer as JSON with the following structure:
{
  "detected_vaccines": [
    {
      "type": "rabies|multiple|leptospirosis|parvovirus|distemper|adenovirus|parainfluenza|bordetella|other",
      "name": "Full Vaccine Name",
      "date_administered": "YYYY-MM-DD",
      "next_dose_date": "YYYY-MM-DD",
      "veterinarian": "Dr. Name",
      "confidence": 0.95
    }
  ],
  "warnings": [
    "List any concerning findings like overdue vaccines"
  ],
  "recommendations": [
    "List recommendations based on the vaccination history"
  ]
}

Focus on:
- Vaccine names and types (rabies, multiple vaccines, leptospirosis, etc.)
- Dates (administered and next due dates)
- Veterinarian name (if visible)
- Current vaccination status
- Identify overdue vaccines
- Provide health recommendations

Only include vaccines you can clearly identify (confidence > 0.3).
For dates, use YYYY-MM-DD format. If year is abbreviated (like '25), assume 2025."""

        user_content = "Extract all vaccination information from this veterinary vaccination card."
        if hint:
            user_content += f" Additional context: {hint}"

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
                                "detail": "high",  # Use high detail for vaccine cards
                            },
                        },
                    ],
                },
            ],
            max_tokens=1000,
            response_format={"type": "json_object"},
        )
        
        import json
        result_json = json.loads(response.choices[0].message.content)
        
        # Parse detected vaccines
        detected_vaccines = []
        for v in result_json.get("detected_vaccines", []):
            detected_vaccines.append(VaccineCardVaccine(
                type=v.get("type", "other"),
                name=v.get("name", "Unknown Vaccine"),
                date_administered=v.get("date_administered", ""),
                next_dose_date=v.get("next_dose_date"),
                veterinarian=v.get("veterinarian"),
                clinic_name=v.get("clinic_name"),
                batch_number=v.get("batch_number"),
                confidence=float(v.get("confidence", 0.5)),
            ))
        
        processing_time = int((time.time() - start_time) * 1000)
        
        return VaccineCardAnalysis(
            detected_vaccines=detected_vaccines,
            warnings=result_json.get("warnings", []),
            recommendations=result_json.get("recommendations", []),
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
    max_ai_images: int = Form(6),
):
    """Extrai registros estruturados de vacinação a partir de múltiplas imagens.

    Estratégia:
    - **PRIORITÁRIO**: Sistema Robusto Multi-AI (quando USE_ROBUST_SYSTEM=true)
    - Preferencial: Gemini 2.5 Flash (quando GEMINI_API_KEY estiver configurada).
    - Alternativa: OpenAI Vision (quando OPENAI_API_KEY estiver configurada).
    - Fallback: OCR local com Tesseract (pytesseract) quando possível.
    
    Pipeline Avançado:
    - Post-AI Validation com fuzzy matching 75%
    - Global Veterinary Ontology (26+ marcas)
    - Normalização de datas e deduplicação inteligente
    """
    import time
    import base64
    import json

    start_time = time.time()

    # ========== SISTEMA ROBUSTO (PRIORIDADE) ==========
    USE_ROBUST_SYSTEM = os.getenv("USE_ROBUST_VACCINE_READER", "true").lower() == "true"
    
    if USE_ROBUST_SYSTEM and _ROBUST_SYSTEM_AVAILABLE:
        try:
            logger.info("🚀 Usando Sistema Robusto para leitura de cartão de vacina")
            
            # Preparar imagens
            images_bytes = []
            for file in files:
                content = await file.read()
                images_bytes.append(content)
                await file.seek(0)  # Reset para uso posterior se necessário
            
            # Obter API keys
            gemini_key = _get_gemini_api_key()
            openai_key = _get_openai_api_key()
            
            if not gemini_key:
                logger.warning("⚠️ GEMINI_API_KEY não configurada, sistema robusto desabilitado")
                raise Exception("GEMINI_API_KEY não configurada")
            
            # Inicializar sistema robusto
            reader = RobustVaccineCardReader(
                google_api_key=gemini_key,
                openai_api_key=openai_key,
                enable_preprocessing=True,
                enable_cross_validation=openai_key is not None
            )
            
            # Processar imagens
            if len(images_bytes) == 1:
                result = await reader.extract_vaccines_from_image(
                    image_bytes=images_bytes[0],
                    pet_id="import",
                    options={
                        "aggressive_preprocessing": False,
                        "force_cross_validation": bool(openai_key)
                    }
                )
            else:
                result = await reader.extract_from_multiple_images(
                    images=images_bytes,
                    pet_id="import",
                    options={
                        "aggressive_preprocessing": False,
                        "force_cross_validation": bool(openai_key)
                    }
                )
            
            # DEBUG: Verificar se result é None
            if result is None:
                logger.error("❌ Sistema Robusto retornou None!")
                raise Exception("Sistema Robusto retornou None")
            
            logger.info(f"🔍 Result type: {type(result)}, keys: {result.keys() if isinstance(result, dict) else 'N/A'}")
            
            # Converter resultado para formato VaccineCardOcrResponse
            registros_convertidos = []
            for vaccine in result.get("vaccines", []):
                # Mapear campos do sistema robusto para o formato atual
                registro = VaccineCardOcrRecord(
                    tipo_vacina=vaccine.get("name", "Desconhecida"),
                    nome_comercial=vaccine.get("commercial_brand", vaccine.get("name", "")),
                    data_aplicacao=vaccine.get("date"),
                    data_revacina=vaccine.get("next_date"),
                    lote=None,
                    veterinario_responsavel=vaccine.get("veterinarian"),
                    confianca_por_campo=VaccineCardOcrFieldConfidence(
                        marca_vacina=vaccine.get("field_confidence", {}).get("name", 0.85),
                        data_aplicacao=vaccine.get("field_confidence", {}).get("date", 0.85),
                        data_revacina=vaccine.get("field_confidence", {}).get("next_date", 0.85),
                        veterinario=vaccine.get("field_confidence", {}).get("veterinarian", 0.75),
                    ) if vaccine.get("field_confidence") else None
                )
                registros_convertidos.append(registro)
            
            processing_time_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                f"✅ Sistema Robusto: {len(registros_convertidos)} vacinas, "
                f"confiança={result.get('confidence', 0):.1%}, "
                f"tempo={processing_time_ms}ms"
            )
            
            # Retornar resultado
            metadata = result.get("metadata", {})
            cross_val_metadata = metadata.get("cross_validation_metadata") or {}
            engines_used = cross_val_metadata.get("engines_used", ["robust-system"])
            
            return VaccineCardOcrResponse(
                sucesso=True,
                leitura_confiavel=result.get("is_reliable", True),
                registros=registros_convertidos,
                motor_usado="robust-system",
                motores_usados=engines_used,
                ia_usada=True,
                ia_tentada=True,
                motivo_fallback=None,
                api_calls=1,
                cache_hits=0,
            )
            
        except Exception as e:
            logger.error(f"❌ Erro no Sistema Robusto, usando fallback: {e}", exc_info=True)
            # Continua para o sistema legado abaixo
    
    # ========== SISTEMA LEGADO (FALLBACK) ==========

    # Verificar se API keys estão configuradas
    api_key = _get_openai_api_key()
    gemini_key = _get_gemini_api_key()
    
    # Variáveis para controle do pipeline
    registros: List[VaccineCardOcrRecord] = []
    reliable_votes: List[bool] = []
    engines_used: List[str] = []
    ia_tentada = False
    motivo_fallback: Optional[str] = None
    gemini_enabled = True
    api_calls = 0
    cache_hits = 0
    motivos_need_ai: List[str] = []
    imagens_recebidas = len(files)
    imagens_usadas_ia = 0
    imagens_usadas_ocr = 0

    # Guardrails
    if not files:
        return VaccineCardOcrResponse(
            sucesso=True,
            leitura_confiavel=False,
            registros=[],
            motor_usado="none",
            motores_usados=[],
            ia_usada=False,
            ia_tentada=False,
            motivo_fallback=None,
            api_calls=0,
            cache_hits=0,
        )
    if len(files) > 12:
        raise HTTPException(status_code=400, detail="Too many files (max 12)")

    api_key = _get_openai_api_key()
    gemini_key = _get_gemini_api_key()

    registros: List[VaccineCardOcrRecord] = []
    reliable_votes: List[bool] = []
    engines_used: List[str] = []
    ia_tentada = False
    motivo_fallback: Optional[str] = None
    gemini_enabled = True
    api_calls = 0
    cache_hits = 0

    # Guardrail for cost control
    if max_ai_images < 0:
        max_ai_images = 0
    if max_ai_images > 12:
        max_ai_images = 12

    repo_terms = ", ".join(_world_vaccine_aliases_for_prompt(50))

    system_prompt = f"""Atue como um Extrator de Dados Veterinários Sênior (OCR Multimodal).

CONTEXTO:
A imagem anexa contém o histórico vacinal completo de um animal.

⚠️ CRÍTICO - VARREDURA COMPLETA:
1. A página pode ter MÚLTIPLAS COLUNAS (esquerda, centro, direita)
2. A página pode ter MÚLTIPLAS LINHAS (do topo até o final)
3. Algumas páginas contêm 10+ vacinas distribuídas em toda a área
4. NUNCA pare na primeira vacina ou no primeiro bloco
5. Faça uma varredura sistemática: TOPO → BAIXO, ESQUERDA → DIREITA
6. Procure por TODOS os adesivos/etiquetas de vacina na imagem
7. CONTE os adesivos visíveis e garanta que extraiu TODOS

TAREFA DE EXTRAÇÃO:
Para CADA bloco de vacina (adesivo + data manuscrita + carimbo/assinatura), extraia um objeto JSON.

REGRAS DE OURO:
1. TIPOS DE VACINA: Identifique TODAS as marcas e suas variações:
   - Nobivac: Nobivac, Nobivac Raiva, Nobivac Rabies, Nobivac R, Nobivac DHPPi, Nobivac KC
   - Duramune: Duramune, Duramune Max, Duramune Max 5, Duramune DHPP, Duramune DA2PP
   - Vanguard: Vanguard, Vanguard Plus, Vanguard Plus 5, Vanguard 7
   - Outras: Rabisin, Canigen, Defensor, Recombitek, Eurican
   - ATENÇÃO: Variações de escrita (nobivac/NOBIVAC/Nobivac) devem ser reconhecidas
2. IGNORAR VALIDADE DO FRASCO: Nos adesivos, ignore datas pequenas rotuladas como "VENC", "FABR", "VAL".
3. DATAS MANUSCRITAS - TÉCNICAS DE LEITURA:
   ⚠️ ATENÇÃO ESPECIAL: Datas manuscritas requerem cuidado extra!
   
   a) POSICIONAMENTO (CRÍTICO PARA REVACINA):
      - Cada vacina tem DUAS datas manuscritas distintas:
        * Primeira data (geralmente acima/ao lado do adesivo) = "data_aplicacao_iso"
        * Segunda data (geralmente abaixo, à direita, ou logo após) = "data_revacina_iso"
      - A data de REVACINA é geralmente 1 mês ou 1 ano DEPOIS da aplicação
      - Se você vê apenas UMA data, deixe data_revacina_iso = null (não invente!)
      - Se você vê DUAS datas, a segunda SEMPRE é a revacina
   
   b) FORMATO COMUM: dd/mm/aa ou dd/mm/aaaa
      - Exemplos: "15/03/24", "15/3/24", "15.03.24", "15-03-24"
      - Ano abreviado: "18" = "2018", "22" = "2022", "24" = "2024", "25" = "2025", "26" = "2026"
   
   c) RECONHECIMENTO DE NÚMEROS MANUSCRITOS:
      - "1" pode parecer "l" ou "|"
      - "2" pode ter loop no topo
      - "3" pode ter pontas abertas
      - "4" pode ser fechado ou aberto
      - "5" pode parecer "S"
      - "6" pode ter loop pequeno
      - "7" pode ter risquinho no meio
      - "8" pode ter loops desiguais
      - "9" pode parecer "g" ou "q"
      - "0" pode ser oval ou circular
   
   d) SEPARADORES: podem ser "/", ".", "-", ou até pequeno espaço
   
   e) ANOS PROBLEMÁTICOS:
      - Se ler "2026" ou "2027" mas o contexto é vacina antiga → provavelmente é "2016" ou "2017"
      - Se ler "2029" → provavelmente é "2019"
      - Vacinas aplicadas geralmente são de 2015-2026
   
   f) FORMATOS ALTERNATIVOS:
      - Alguns veterinários escrevem por extenso: "15 Mar 24", "15/Marco/2024"
      - Alguns escrevem sem separador: "150324"
      - Alguns escrevem só o dia e mês se o ano está no carimbo
   
   g) SE NÃO CONSEGUIR LER:
      - Tente ao menos identificar se há UMA data ou DUAS datas
      - Se houver dúvida, use null e deixe para revisão humana
      - NUNCA invente ou "adivinhe" uma data

4. VETERINÁRIO: Extraia o nome do carimbo para cada vacina individualmente.
5. NÃO EXTRAIR LOTE/CLÍNICA: Ignore campo de lote/batch e nome de clínica, pois são opcionais e confundem a leitura.
6. NÃO PERDER REGISTROS: Se você enxergar uma marca/nome (ex: "Nobivac", "Duramune Max", "Rabisin") mas não conseguir as datas, ainda assim crie o registro com datas = null.
7. REGISTROS REPETIDOS DA MESMA VACINA: Se houver múltiplas aplicações da mesma marca (ex: 3 doses de "Nobivac Raiva"), crie UM registro para CADA aplicação.

VOCABULÁRIO (para ajudar a reconhecer nomes/sinônimos; use o que estiver escrito no cartão):
- Raiva: raiva, antirrábica, rabies, Rabisin, Defensor, Nobivac Raiva, Nobivac Rabies, Nobivac R
- Múltipla canina (DHPP/DAPP/V8/V10/V12): V8, V10, V12, múltipla, polivalente, DHPP, DAPP, DHPPi, DA2PP, cinomose, parvovirose, adenovirose/hepatite, parainfluenza, Vanguard, Vanguard Plus, Duramune, Duramune Max, Nobivac DHPPi
- Leptospirose: lepto, leptospirose
- Bordetelose/Tosse dos Canis: bordetella, kennel cough, tosse dos canis
- Giardia: giárdia, giardia
- Leishmaniose: leishmania, leishmaniose
- Coronavírus (canino): coronavírus, coronavirus, CCoV, canine coronavirus
- Influenza canina: influenza, flu, H3N2, H3N8
- Lyme (borreliose): lyme, borrelia
- Felinos (quando aplicável): FVRCP (tríplice felina), panleucopenia, rinotraqueíte, calicivirose, FeLV (leucemia felina), chlamydia

IMPORTANTE:
- EM HIPÓTESE ALGUMA suponha/invente qualquer campo.
    - Se você não tiver certeza, use null e deixe para o usuário revisar/editar/adicionar.
    - Não 'complete' datas, não deduza revacina, não chute marca.
- Preserve a marca/nome comercial exatamente como aparece quando possível.

REPOSITÓRIO MUNDIAL DE NOMES (APENAS para reconhecimento de texto visível; NÃO é para preencher campos):
{repo_terms if repo_terms else "(catálogo indisponível)"}

FORMATO JSON (Strict Array):
Retorne APENAS o JSON abaixo contendo TODAS as vacinas encontradas na imagem.

{{
  "total_encontrado": integer,
  "vacinas": [
    {{
      "marca_vacina": "string (ex: Rabisin-I, Vanguard Plus)",
      "data_aplicacao_iso": "YYYY-MM-DD ou null",
      "data_revacina_iso": "YYYY-MM-DD ou null",
      "veterinario_responsavel": "string ou null"
    }}
  ]
}}
"""

    def _normalize_date_to_iso(value: Optional[str], *, kind: str = "unknown") -> Optional[str]:
        """Normalize various handwritten/ocr date formats to ISO (YYYY-MM-DD).

        Heuristics:
        - Prefer pt-BR ordering (dd/mm/yyyy) when ambiguous.
        - Accept mm/dd/yyyy when dd/mm is invalid.
        - Fix common OCR year drift (e.g. 2029 instead of 2019).
        - For application dates, avoid far-future results.
        - Handle common OCR errors in handwritten dates (1→l, 5→S, 0→O, etc.)
        """

        if not value:
            return None
        s = str(value).strip()
        if not s:
            return None
        
        # Pre-process: fix common OCR errors in handwritten dates
        # Replace common letter misreads with numbers
        char_fixes = {
            'l': '1', 'I': '1', '|': '1',  # lowercase L, uppercase i, pipe → 1
            'O': '0', 'o': '0',             # letter O → zero
            'S': '5', 's': '5',             # letter S → 5 (when in date context)
            'G': '6', 'g': '9',             # G can be 6, lowercase g can be 9
            'Z': '2', 'z': '2',             # Z → 2
            'B': '8',                       # B → 8
        }
        
        # Only fix if pattern looks like a date (has separators or is numeric-ish)
        if any(sep in s for sep in ['/', '.', '-']) or any(c.isdigit() for c in s):
            for old_char, new_char in char_fixes.items():
                s = s.replace(old_char, new_char)

        from datetime import date, datetime, timedelta
        import re
        import unicodedata

        today = date.today()
        max_future = today + (timedelta(days=7) if kind == "aplicacao" else timedelta(days=365 * 5))
        min_year = 1900
        max_year = today.year + (1 if kind == "aplicacao" else 5)

        def _adjust_year(y: int) -> Optional[int]:
            if y < 100:
                y = 2000 + y
            if y < min_year:
                return None
            if y > max_year:
                for delta in (10, 20, 30):
                    cand = y - delta
                    if min_year <= cand <= max_year:
                        return cand
                return None
            return y

        def _try_dt(y: int, m: int, d: int) -> Optional[date]:
            try:
                return date(y, m, d)
            except Exception:
                return None

        # Already ISO-ish
        m_iso = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", s)
        if m_iso:
            try:
                y = _adjust_year(int(m_iso.group(1)))
                if y is None:
                    return None
                dt = _try_dt(y, int(m_iso.group(2)), int(m_iso.group(3)))
                if not dt:
                    return None
                if dt > max_future:
                    return None
                return dt.strftime("%Y-%m-%d")
            except Exception:
                return None

        # Formats with month names in multiple languages (e.g. 15 Mar 2026, 15 Março 26, Jan 5 2024)
        def _strip_accents(text: str) -> str:
            return "".join(
                ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
            )

        months = {
            # jan
            "jan": 1,
            "janeiro": 1,
            "january": 1,
            "enero": 1,
            "janvier": 1,
            "gennaio": 1,
            "januar": 1,
            # feb
            "feb": 2,
            "fev": 2,
            "fevereiro": 2,
            "february": 2,
            "febrero": 2,
            "fevrier": 2,
            "fevrier": 2,
            "fevrier": 2,
            "febbraio": 2,
            "februar": 2,
            # mar
            "mar": 3,
            "marco": 3,
            "março": 3,
            "march": 3,
            "marzo": 3,
            "mars": 3,
            "marz": 3,
            # apr
            "apr": 4,
            "abr": 4,
            "abril": 4,
            "april": 4,
            "abril": 4,
            "avril": 4,
            "aprile": 4,
            # may
            "may": 5,
            "mai": 5,
            "maio": 5,
            "mayo": 5,
            "maggio": 5,
            # jun
            "jun": 6,
            "junho": 6,
            "june": 6,
            "junio": 6,
            "juin": 6,
            "giugno": 6,
            # jul
            "jul": 7,
            "julho": 7,
            "july": 7,
            "julio": 7,
            "juillet": 7,
            "luglio": 7,
            # aug
            "aug": 8,
            "ago": 8,
            "agosto": 8,
            "august": 8,
            "aout": 8,
            "août": 8,
            "agosto": 8,
            # sep
            "sep": 9,
            "set": 9,
            "setembro": 9,
            "september": 9,
            "septiembre": 9,
            "septembre": 9,
            "settembre": 9,
            # oct
            "oct": 10,
            "out": 10,
            "outubro": 10,
            "october": 10,
            "octubre": 10,
            "octobre": 10,
            "ottobre": 10,
            # nov
            "nov": 11,
            "novembro": 11,
            "november": 11,
            "noviembre": 11,
            "novembre": 11,
            # dec
            "dec": 12,
            "dez": 12,
            "dezembro": 12,
            "december": 12,
            "diciembre": 12,
            "decembre": 12,
            "dicembre": 12,
        }

        s_norm = _strip_accents(s.lower())
        s_norm = re.sub(r"[\.,]", " ", s_norm)
        s_norm = re.sub(r"\s+", " ", s_norm).strip()

        # dd mon yyyy
        m_dmy = re.search(r"\b(\d{1,2})[\s\-\/](\w{3,})[\s\-\/](\d{2,4})\b", s_norm)
        if m_dmy:
            d = int(m_dmy.group(1))
            mon = m_dmy.group(2).strip().lower()
            y_raw = int(m_dmy.group(3))
            y = _adjust_year(y_raw)
            m_num = months.get(mon)
            if y is not None and m_num is not None:
                dt = _try_dt(y, m_num, d)
                if dt and dt <= max_future:
                    return dt.strftime("%Y-%m-%d")

        # mon dd yyyy
        m_mdy = re.search(r"\b(\w{3,})[\s\-\/](\d{1,2})[\s\-\/](\d{2,4})\b", s_norm)
        if m_mdy:
            mon = m_mdy.group(1).strip().lower()
            d = int(m_mdy.group(2))
            y_raw = int(m_mdy.group(3))
            y = _adjust_year(y_raw)
            m_num = months.get(mon)
            if y is not None and m_num is not None:
                dt = _try_dt(y, m_num, d)
                if dt and dt <= max_future:
                    return dt.strftime("%Y-%m-%d")

        # dd/mm/yyyy or mm/dd/yyyy (and variations with . or -)
        m = re.search(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b", s)
        if not m:
            # Try compact format without separators: ddmmyy or ddmmyyyy
            # Examples: "150324" → 15/03/24, "15032024" → 15/03/2024
            m_compact = re.search(r"\b(\d{6}|\d{8})\b", s)
            if m_compact:
                compact = m_compact.group(1)
                if len(compact) == 6:  # ddmmyy
                    try:
                        d, m_val, y_raw = int(compact[0:2]), int(compact[2:4]), int(compact[4:6])
                        y = _adjust_year(y_raw)
                        if y is not None:
                            dt = _try_dt(y, m_val, d)
                            if dt and dt <= max_future:
                                return dt.strftime("%Y-%m-%d")
                    except Exception:
                        pass
                elif len(compact) == 8:  # ddmmyyyy
                    try:
                        d, m_val, y_raw = int(compact[0:2]), int(compact[2:4]), int(compact[4:8])
                        y = _adjust_year(y_raw)
                        if y is not None:
                            dt = _try_dt(y, m_val, d)
                            if dt and dt <= max_future:
                                return dt.strftime("%Y-%m-%d")
                    except Exception:
                        pass
            return None

        a = int(m.group(1))
        b = int(m.group(2))
        y_raw = int(m.group(3))
        y = _adjust_year(y_raw)
        if y is None:
            return None

        # Candidate interpretations
        candidates: List[date] = []
        # pt-BR: dd/mm
        dt_br = _try_dt(y, b, a)
        if dt_br:
            candidates.append(dt_br)
        # US: mm/dd
        dt_us = _try_dt(y, a, b)
        if dt_us and dt_us not in candidates:
            candidates.append(dt_us)

        if not candidates:
            return None

        # Filter out clearly impossible futures
        candidates = [dt for dt in candidates if dt <= max_future]
        if not candidates:
            return None

        # If ambiguous (both valid), prefer BR unless it looks like a future drift
        if dt_br in candidates and dt_us in candidates:
            # For application, prefer a date not in the future (if possible)
            if kind == "aplicacao":
                past = [dt for dt in candidates if dt <= today]
                if past:
                    # pick the most recent past date
                    best = sorted(past)[-1]
                    return best.strftime("%Y-%m-%d")
            # Default BR
            return dt_br.strftime("%Y-%m-%d")

        return candidates[0].strftime("%Y-%m-%d")

    def _map_strict_array_to_records(obj: dict) -> List[dict]:
        vacinas = obj.get("vacinas") or []
        out: List[dict] = []
        for v in vacinas:
            if not isinstance(v, dict):
                continue
            marca = (v.get("marca_vacina") or "").strip() or None
            data_apl = _normalize_date_to_iso(v.get("data_aplicacao_iso"), kind="aplicacao")
            data_rev = _normalize_date_to_iso(v.get("data_revacina_iso"), kind="revacina")

            # If both are present but inverted, swap them.
            # With ISO strings, lexical order matches chronological order.
            if data_apl and data_rev and data_rev < data_apl:
                data_apl, data_rev = data_rev, data_apl

            vet = (v.get("veterinario_responsavel") or "").strip() or None
            # We keep compatibility with existing UI/API schema
            out.append(
                {
                    "tipo_vacina": marca or "Vacina",
                    "nome_comercial": marca,
                    "data_aplicacao": data_apl,
                    "data_revacina": data_rev,
                    "lote": None,
                    "veterinario_responsavel": vet,
                }
            )
        return out

    def _dedupe_records(items: List[dict]) -> List[dict]:
        seen = set()
        out: List[dict] = []
        for r in items or []:
            tipo = (str(r.get("tipo_vacina") or "").strip().lower())
            nome = (str(r.get("nome_comercial") or "").strip().lower())
            data_apl = (str(r.get("data_aplicacao") or "").strip())
            data_rev = (str(r.get("data_revacina") or "").strip())
            vet = (str(r.get("veterinario_responsavel") or "").strip().lower())

            # IMPORTANT: don't dedupe aggressively when we don't have strong identifiers.
            # Many OCR/LLM extractions may miss dates, and collapsing these would drop vaccines.
            has_strong_id = bool(data_apl or data_rev)
            if not has_strong_id:
                out.append(r)
                continue

            key = (tipo, nome, data_apl, data_rev, vet)
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        return out

    async def _extract_with_openai(image_b64: str, mime: str) -> dict:
        import openai

        client = openai.OpenAI(api_key=api_key)

        user_content = "Extraia todos os registros de vacinação desta imagem."
        if hint:
            user_content += f" Contexto adicional: {hint}"

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
                                "url": f"data:{mime};base64,{image_b64}",
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
            max_tokens=1200,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    async def _extract_with_openai_multi(images: List[dict]) -> dict:
        import openai

        client = openai.OpenAI(api_key=api_key)

        user_content = "Extraia TODAS as vacinas considerando TODAS as imagens (pode haver informação espalhada entre fotos)."
        user_content += "\nVarra a página inteira (topo ao fim, esquerda e direita)."
        user_content += "\nRetorne estritamente o JSON do schema (total_encontrado + vacinas[])."
        if hint:
            user_content += f"\nContexto adicional: {hint}"

        content_parts: List[dict] = [{"type": "text", "text": user_content}]
        for img in images:
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{img['mime']};base64,{img['b64']}",
                        "detail": "high",
                    },
                }
            )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content_parts},
            ],
            max_tokens=1400,
            response_format={"type": "json_object"},
        )

        obj = json.loads(response.choices[0].message.content)
        # Normalize to legacy shape expected by the rest of the endpoint
        if isinstance(obj, dict) and "vacinas" in obj:
            registros_norm = _map_strict_array_to_records(obj)
            obj = {
                "leitura_confiavel": bool(registros_norm),
                "registros": _dedupe_records(registros_norm),
            }
        return obj

    async def _extract_with_gemini(image_b64: str, mime: str) -> dict:
        import httpx
        import asyncio

        model = _get_gemini_model()
        if model.startswith("models/"):
            model = model.split("/", 1)[1]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        user_content = "Extraia todos os registros de vacinação desta imagem."
        if hint:
            user_content += f" Contexto adicional: {hint}"

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": user_content},
                        {"inlineData": {"mimeType": mime, "data": image_b64}},
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            last_error: Optional[Exception] = None
            for attempt in range(1, 4):
                try:
                    resp = await client.post(url, params={"key": gemini_key}, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except httpx.HTTPStatusError as e:
                    last_error = e
                    status = e.response.status_code
                    retry_after = e.response.headers.get("retry-after")
                    if status in (429, 500, 502, 503, 504) and attempt < 3:
                        # Respect Retry-After when present; otherwise exponential backoff.
                        delay = 0.0
                        if retry_after:
                            try:
                                delay = float(retry_after)
                            except Exception:
                                delay = 0.0
                        if delay <= 0:
                            delay = float(2 ** (attempt - 1))  # 1s, 2s
                        await asyncio.sleep(min(delay, 10.0))
                        continue
                    raise
            else:
                # Shouldn't happen, but keep mypy happy.
                raise last_error or RuntimeError("Gemini request failed")

        text = ""
        try:
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
        except Exception:
            text = ""

        if not text:
            raise RuntimeError("Empty Gemini response")

        try:
            return json.loads(text)
        except Exception:
            # Handle occasional wrapping (e.g. markdown) by extracting the first JSON object.
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                return json.loads(text[start : end + 1])
            raise

    async def _extract_with_gemini_multi(images: List[dict]) -> dict:
        import httpx
        import asyncio

        model = _get_gemini_model()
        if model.startswith("models/"):
            model = model.split("/", 1)[1]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        user_content = "Extraia TODAS as vacinas considerando TODAS as imagens (pode haver informação espalhada entre fotos)."
        user_content += "\nVarra a página inteira (topo ao fim, esquerda e direita)."
        user_content += "\nRetorne estritamente o JSON do schema (total_encontrado + vacinas[])."
        if hint:
            user_content += f"\nContexto adicional: {hint}"

        parts: List[dict] = [{"text": user_content}]
        for img in images:
            parts.append({"inlineData": {"mimeType": img["mime"], "data": img["b64"]}})

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            last_error: Optional[Exception] = None
            for attempt in range(1, 4):
                try:
                    resp = await client.post(url, params={"key": gemini_key}, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except httpx.HTTPStatusError as e:
                    last_error = e
                    status = e.response.status_code
                    retry_after = e.response.headers.get("retry-after")
                    if status in (429, 500, 502, 503, 504) and attempt < 3:
                        delay = 0.0
                        if retry_after:
                            try:
                                delay = float(retry_after)
                            except Exception:
                                delay = 0.0
                        if delay <= 0:
                            delay = float(2 ** (attempt - 1))
                        await asyncio.sleep(min(delay, 10.0))
                        continue
                    raise
            else:
                raise last_error or RuntimeError("Gemini request failed")

        text = ""
        try:
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
        except Exception:
            text = ""

        if not text:
            raise RuntimeError("Empty Gemini response")

        try:
            obj = json.loads(text)
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                obj = json.loads(text[start : end + 1])
            else:
                raise

        # Normalize to legacy shape expected by the rest of the endpoint
        if isinstance(obj, dict) and "vacinas" in obj:
            registros_norm = _map_strict_array_to_records(obj)
            obj = {
                "leitura_confiavel": bool(registros_norm),
                "registros": _dedupe_records(registros_norm),
            }
        return obj

    def _extract_with_tesseract(image_bytes: bytes) -> dict:
        # OCR local é fallback; fazemos extração heurística simples.
        from PIL import Image, ImageOps, ImageFilter
        import pytesseract
        import io
        import re
        from datetime import datetime

        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert("L")
        img = ImageOps.autocontrast(img)
        img = img.filter(ImageFilter.MedianFilter(size=3))
        img = img.resize((img.size[0] * 2, img.size[1] * 2))

        text = pytesseract.image_to_string(img, lang="por+eng", config="--psm 6")
        lines = [line.strip() for line in text.splitlines() if line and line.strip()]
        text_norm = "\n".join(lines)

        date_re = re.compile(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b")

        def to_iso(d: str, m: str, y: str) -> Optional[str]:
            try:
                year = int(y)
                if year < 100:
                    year = 2000 + year
                dt = datetime(year, int(m), int(d))
                return dt.strftime("%Y-%m-%d")
            except Exception:
                return None

        # Heurísticas de detecção (conservadoras): somente extrair quando houver evidência direta.
        # Nunca "inferir" múltiplas vacinas a partir de um bloco de datas.
        marker_patterns = [
            (re.compile(r"\bV\s*8\b", re.I), "V8"),
            (re.compile(r"\bV\s*10\b", re.I), "V10"),
            (re.compile(r"\bV\s*12\b", re.I), "V12"),
            # Raiva com todas variações
            (re.compile(r"nobivac\s*(raiva|rabies|r\b)|antirr(a|á)b|\braiva\b|\brabies\b|rabisin", re.I), "Raiva"),
            # Múltiplas/Polivalentes com marcas
            (re.compile(r"duramune\s*(max|dhpp|da2pp)?|vanguard\s*(plus|7)?|nobivac\s*dhppi?|\bdhpp\b|\bdapp\b|\bda2pp\b|polivalente|m[uú]ltipla", re.I), "Múltipla (V8/V10)"),
            (re.compile(r"leish", re.I), "Leishmaniose"),
            (re.compile(r"giardia|gi[aá]rdia", re.I), "Giardia"),
            (re.compile(r"bordetella|kennel\s*cough|bronchi|tosse\s+dos\s+canis|nobivac\s*kc", re.I), "Bordetella"),
            (re.compile(r"lepto|leptospir", re.I), "Leptospirose"),
            (re.compile(r"corona\b|coronav[ií]rus|ccov", re.I), "Coronavírus"),
            (re.compile(r"influenza|\bflu\b|h3n2|h3n8", re.I), "Influenza"),
            (re.compile(r"lyme|borrel", re.I), "Lyme"),
        ]

        # Include worldwide repository aliases as recognition aids
        repo_aliases = _world_vaccine_aliases_for_prompt(80)
        brand_terms = [
            # Marcas principais com variações
            "Nobivac", "Nobivac Raiva", "Nobivac Rabies", "Nobivac R", "Nobivac DHPPi", "Nobivac KC",
            "Duramune", "Duramune Max", "Duramune Max 5", "Duramune DHPP", "Duramune DA2PP",
            "Vanguard", "Vanguard Plus", "Vanguard Plus 5", "Vanguard 7",
            "Defensor", "Defensor 3",
            "Rabisin", "Rabisin-R", "Rabisin-I",
            "Recombitek", "Recombitek C4", "Recombitek C6",
            "Eurican", "Eurican DHPPi",
            "Canigen", "Canigen DHPPi",
            "Virbac",
            "Zoetis",
            "MSD",
            "Biovet",
        ]
        all_terms = [t for t in (brand_terms + repo_aliases) if t]

        vet = None
        m = re.search(r"\b(CRMV\s*[-:]?\s*\w+.*)$", text_norm, re.I | re.M)
        if m:
            vet = m.group(1).strip()
        else:
            m = re.search(r"\bDr\.?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{2,}", text_norm)
            if m:
                vet = m.group(0).strip()

        def find_term_in_line(line: str) -> Optional[str]:
            """Encontra termos de vacinas na linha com tolerância a variações."""
            line_norm = line.lower()
            
            # Detecção específica para marcas comuns com variações
            # Nobivac (qualquer variação)
            if re.search(r'\bnobivac\b', line_norm):
                # Tentar identificar variação específica
                if re.search(r'nobivac.*(?:raiva|rabies|r\b)', line_norm):
                    return "Nobivac Raiva"
                elif re.search(r'nobivac.*(?:dhppi?|plus)', line_norm):
                    return "Nobivac DHPPi"
                elif re.search(r'nobivac.*kc', line_norm):
                    return "Nobivac KC"
                else:
                    return "Nobivac"
            
            # Duramune (qualquer variação)
            if re.search(r'\bduramune\b', line_norm):
                if re.search(r'duramune.*max', line_norm):
                    return "Duramune Max"
                elif re.search(r'duramune.*(?:dhpp|da2pp)', line_norm):
                    return "Duramune DHPP"
                else:
                    return "Duramune"
            
            # Vanguard (qualquer variação)
            if re.search(r'\bvanguard\b', line_norm):
                if re.search(r'vanguard.*(?:plus|7)', line_norm):
                    return "Vanguard Plus"
                else:
                    return "Vanguard"
            
            # Outras marcas específicas
            if re.search(r'\brabisin\b', line_norm):
                return "Rabisin"
            if re.search(r'\bdefensor\b', line_norm):
                return "Defensor"
            if re.search(r'\brecombitek\b', line_norm):
                return "Recombitek"
            if re.search(r'\beurican\b', line_norm):
                return "Eurican"
            if re.search(r'\bcanigen\b', line_norm):
                return "Canigen"
            
            # Busca genérica em todos os termos (fallback)
            for term in all_terms:
                if not term:
                    continue
                if re.search(rf"\b{re.escape(term)}\b", line, re.I):
                    return term
            return None

        registros_out: List[dict] = []
        seen = set()
        for line in lines:
            brand = find_term_in_line(line)
            marker = None
            for rx, label in marker_patterns:
                if rx.search(line):
                    marker = label
                    break

            if not brand and not marker:
                continue

            dates = [to_iso(d, m, y) for d, m, y in date_re.findall(line)]
            dates = [d for d in dates if d]

            # Evidence-based: only attach dates seen on the SAME line.
            data_apl = dates[0] if len(dates) >= 1 else None
            data_rev = dates[1] if len(dates) >= 2 else None

            tipo_vacina = brand or marker or "Vacina"
            nome_comercial = brand

            key = (str(tipo_vacina).lower(), str(nome_comercial or "").lower(), data_apl or "", data_rev or "", (vet or "").lower())
            if key in seen:
                continue
            seen.add(key)

            registros_out.append(
                {
                    "tipo_vacina": tipo_vacina,
                    "nome_comercial": nome_comercial,
                    "data_aplicacao": data_apl,
                    "data_revacina": data_rev,
                    "lote": None,
                    "veterinario_responsavel": vet,
                }
            )

        # Conservador: só considerar confiável se tiver ao menos uma data ligada a um registro.
        leitura_confiavel = any(bool(r.get("data_aplicacao") or r.get("data_revacina")) for r in registros_out)

        return {"leitura_confiavel": leitura_confiavel, "registros": registros_out}

    # Read all files once (UploadFile is a stream). Keep bytes in memory for this request.
    file_items: List[dict] = []
    for f in files:
        content_type = f.content_type or "image/jpeg"
        data = await f.read()
        if not data:
            continue
        image_hash = hashlib.sha256(data).hexdigest()[:16]
        file_items.append(
            {
                "filename": getattr(f, "filename", "") or "",
                "mime": content_type,
                "data": data,
                "b64": base64.b64encode(data).decode("utf-8"),
                "hash": image_hash,
            }
        )

    # 1) Local OCR first (cheap)
    ai_candidates: List[dict] = []
    for item in file_items:
        per_image: Optional[dict] = None
        engine_for_image: str = "none"

        if prefer_local and not force_ai:
            try:
                per_image = _extract_with_tesseract(item["data"])
                engine_for_image = "tesseract"
            except Exception:
                logger.exception(
                    "vaccine_card: tesseract extraction failed for file=%s",
                    item.get("filename", ""),
                )
                per_image = None

        if per_image is not None and (per_image.get("leitura_confiavel") or (per_image.get("registros") or [])):
            if engine_for_image not in engines_used:
                engines_used.append(engine_for_image)
            reliable_votes.append(bool(per_image.get("leitura_confiavel")))
            for r in per_image.get("registros", []) or []:
                tipo_vacina = str(r.get("tipo_vacina") or "").strip()
                if not tipo_vacina:
                    continue
                registros.append(
                    VaccineCardOcrRecord(
                        tipo_vacina=tipo_vacina,
                        nome_comercial=(r.get("nome_comercial") or None),
                        data_aplicacao=(r.get("data_aplicacao") or None),
                        data_revacina=(r.get("data_revacina") or None),
                        lote=None,
                        veterinario_responsavel=(r.get("veterinario_responsavel") or None),
                    )
                )
        else:
            ai_candidates.append(item)

    # 2) If needed, do ONE consolidated AI call with up to max_ai_images (cheaper than per-image calls)
    need_ai = force_ai or (len(registros) == 0)
    selected: List[dict] = []
    if need_ai and max_ai_images > 0 and (gemini_key or api_key):
        selected = (file_items if force_ai else ai_candidates)[:max_ai_images]
        if selected:
            batch_hashes = tuple([i["hash"] for i in selected])
            batch_cache_key = ("batch", batch_hashes, hint or "")

            ai_obj: Optional[dict] = None
            ai_engine: Optional[str] = None

            if _vaccine_card_ai_cache is not None and batch_cache_key in _vaccine_card_ai_cache:
                cached = _vaccine_card_ai_cache.get(batch_cache_key) or {}
                ai_obj = cached.get("result")
                ai_engine = cached.get("engine")
                cache_hits += 1
            else:
                # Prefer Gemini first (cost-conscious) then OpenAI.
                if gemini_key and gemini_enabled:
                    try:
                        ia_tentada = True
                        ai_obj = await _extract_with_gemini_multi(selected)
                        ai_engine = "gemini"
                        api_calls += 1
                    except Exception as e:
                        status = getattr(getattr(e, "response", None), "status_code", None)
                        if status == 429:
                            gemini_enabled = False
                            motivo_fallback = motivo_fallback or "gemini_rate_limited"
                        else:
                            motivo_fallback = motivo_fallback or "gemini_failed"
                        logger.exception("vaccine_card: gemini multi extraction failed")
                        ai_obj = None

                if ai_obj is None and api_key:
                    try:
                        ia_tentada = True
                        ai_obj = await _extract_with_openai_multi(selected)
                        ai_engine = "openai"
                        api_calls += 1
                    except Exception:
                        motivo_fallback = motivo_fallback or "openai_failed"
                        logger.exception("vaccine_card: openai multi extraction failed")
                        ai_obj = None

                if (
                    ai_obj is not None
                    and ai_engine in ("gemini", "openai")
                    and _vaccine_card_ai_cache is not None
                ):
                    _vaccine_card_ai_cache[batch_cache_key] = {"engine": ai_engine, "result": ai_obj}

            if ai_obj is not None:
                if ai_engine and ai_engine not in engines_used:
                    engines_used.append(ai_engine)
                reliable_votes.append(bool(ai_obj.get("leitura_confiavel")))

                for r in _dedupe_records(ai_obj.get("registros") or []):
                    tipo_vacina = str(r.get("tipo_vacina") or "").strip()
                    if not tipo_vacina:
                        continue
                    registros.append(
                        VaccineCardOcrRecord(
                            tipo_vacina=tipo_vacina,
                            nome_comercial=(r.get("nome_comercial") or None),
                            data_aplicacao=(r.get("data_aplicacao") or None),
                            data_revacina=(r.get("data_revacina") or None),
                            lote=None,
                            veterinario_responsavel=(r.get("veterinario_responsavel") or None),
                        )
                    )

    # 3) Never ignore images: if IA analyzed only a subset (max_ai_images), run cheap OCR on the rest.
    # This helps when users upload many photos/pages but keep IA limit low for cost.
    try:
        selected_hashes = set([i.get("hash") for i in (selected or []) if isinstance(i, dict)])
        remaining_items = [i for i in file_items if i.get("hash") not in selected_hashes]
        for item in remaining_items:
            try:
                per_image = _extract_with_tesseract(item["data"])
            except Exception:
                continue
            if per_image is None:
                continue
            # Only add if it found something
            if not (per_image.get("registros") or []):
                continue
            if "tesseract" not in engines_used:
                engines_used.append("tesseract")
            reliable_votes.append(bool(per_image.get("leitura_confiavel")))
            for r in per_image.get("registros", []) or []:
                tipo_vacina = str(r.get("tipo_vacina") or "").strip()
                if not tipo_vacina:
                    continue
                registros.append(
                    VaccineCardOcrRecord(
                        tipo_vacina=tipo_vacina,
                        nome_comercial=(r.get("nome_comercial") or None),
                        data_aplicacao=(r.get("data_aplicacao") or None),
                        data_revacina=(r.get("data_revacina") or None),
                        lote=None,
                        veterinario_responsavel=(r.get("veterinario_responsavel") or None),
                    )
                )
    except Exception:
        # never fail the endpoint due to supplemental OCR
        pass

    # Aplicar normalização e classificação dos registros ANTES da deduplição
    from .vision.pipeline_utils import normalize_vaccine_records
    registros_dict = [r.dict() if hasattr(r, 'dict') else r.__dict__ for r in registros]
    registros_normalized = normalize_vaccine_records(registros_dict)
    
    # Mapear campos normalizados para o schema da API
    temp_registros = []
    for r in registros_normalized:
        temp_registros.append(
            VaccineCardOcrRecord(
                tipo_vacina=r.get("tipo_vacina"),
                nome_comercial=r.get("nome_comercial"),
                data_aplicacao=r.get("data_aplicacao"),
                data_revacina=r.get("data_revacina"),
                lote=r.get("lote"),
                veterinario_responsavel=r.get("vet"),  # Mapear "vet" para "veterinario_responsavel"
            )
        )
    
    # Final dedupe on normalized records
    deduped: List[VaccineCardOcrRecord] = []
    seen2 = set()
    for r in temp_registros:
        tipo = (r.tipo_vacina or "").strip().lower()
        nome = (r.nome_comercial or "").strip().lower()
        data_apl = (r.data_aplicacao or "")
        data_rev = (r.data_revacina or "")
        vet = (r.veterinario_responsavel or "").strip().lower()

        has_strong_id = bool(data_apl or data_rev)
        if not has_strong_id:
            deduped.append(r)
            continue

        key = (tipo, nome, data_apl, data_rev, vet)
        if key in seen2:
            continue
        seen2.add(key)
        deduped.append(r)
    registros = deduped

    # Heurística simples de confiabilidade global
    leitura_confiavel = (any(reliable_votes) and len(registros) > 0)
    processing_time_ms = int((time.time() - start_time) * 1000)

    # Evita “unused variable” se alguém quiser logar no futuro
    _ = processing_time_ms

    # Escolhe um motor principal (prioridade: openai > gemini > tesseract > none)
    motor_usado = "none"
    if "openai" in engines_used:
        motor_usado = "openai"
    elif "gemini" in engines_used:
        motor_usado = "gemini"
    elif "tesseract" in engines_used:
        motor_usado = "tesseract"

    ia_usada = ("openai" in engines_used) or ("gemini" in engines_used)
    logger.info(
        "vaccine_card: processed=%s registros=%s confiavel=%s engines=%s ms=%s",
        len(files),
        len(registros),
        leitura_confiavel,
        ",".join(engines_used),
        processing_time_ms,
    )

    return VaccineCardOcrResponse(
        sucesso=True,
        leitura_confiavel=leitura_confiavel,
        registros=registros,
        motor_usado=motor_usado,
        motores_usados=engines_used,
        ia_usada=ia_usada,
        ia_tentada=ia_tentada,
        motivo_fallback=motivo_fallback,
        api_calls=api_calls,
        cache_hits=cache_hits,
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


@app.post("/vision/extract-vaccine-card-files", response_model=VaccineCardOcrResponse, tags=["Vision"])
async def extract_vaccine_card_files(
    files: List[UploadFile] = File(...),
    hint: Optional[str] = Form(None),
    prefer_local: bool = Form(True),
    force_ai: bool = Form(False),
    max_ai_images: int = Form(2),
):
    """Extrai registros estruturados de vacinação a partir de múltiplas imagens.

    Estratégia:
    - Preferencial: OpenAI Vision (quando OPENAI_API_KEY estiver configurada).
    - Alternativa: Gemini (quando GEMINI_API_KEY estiver configurada).
    - Fallback: OCR local com Tesseract (pytesseract) quando possível.
    """
    import time
    import base64
    import json

    start_time = time.time()

    # Guardrails
    if not files:
        return VaccineCardOcrResponse(
            sucesso=True,
            leitura_confiavel=False,
            registros=[],
            motor_usado="none",
            motores_usados=[],
            ia_usada=False,
            ia_tentada=False,
            motivo_fallback=None,
            api_calls=0,
            cache_hits=0,
        )
    if len(files) > 12:
        raise HTTPException(status_code=400, detail="Too many files (max 12)")

    api_key = _get_openai_api_key()
    gemini_key = _get_gemini_api_key()

    registros: List[VaccineCardOcrRecord] = []
    reliable_votes: List[bool] = []
    engines_used: List[str] = []
    ia_tentada = False
    motivo_fallback: Optional[str] = None
    gemini_enabled = True
    api_calls = 0
    cache_hits = 0

    # Guardrail for cost control
    if max_ai_images < 0:
        max_ai_images = 0
    if max_ai_images > 12:
        max_ai_images = 12

    repo_terms = ", ".join(_world_vaccine_aliases_for_prompt(50))

    system_prompt = f"""Atue como um Extrator de Dados Veterinários Sênior (OCR Multimodal).

CONTEXTO:
A imagem anexa contém o histórico vacinal completo de um animal.

⚠️ CRÍTICO - VARREDURA COMPLETA:
1. A página pode ter MÚLTIPLAS COLUNAS (esquerda, centro, direita)
2. A página pode ter MÚLTIPLAS LINHAS (do topo até o final)
3. Algumas páginas contêm 10+ vacinas distribuídas em toda a área
4. NUNCA pare na primeira vacina ou no primeiro bloco
5. Faça uma varredura sistemática: TOPO → BAIXO, ESQUERDA → DIREITA
6. Procure por TODOS os adesivos/etiquetas de vacina na imagem
7. CONTE os adesivos visíveis e garanta que extraiu TODOS

TAREFA DE EXTRAÇÃO:
Para CADA bloco de vacina (adesivo + data manuscrita + carimbo/assinatura), extraia um objeto JSON.

REGRAS DE OURO:
1. TIPOS DE VACINA: Identifique TODAS as marcas e suas variações:
   - Nobivac: Nobivac, Nobivac Raiva, Nobivac Rabies, Nobivac R, Nobivac DHPPi, Nobivac KC
   - Duramune: Duramune, Duramune Max, Duramune Max 5, Duramune DHPP, Duramune DA2PP
   - Vanguard: Vanguard, Vanguard Plus, Vanguard Plus 5, Vanguard 7
   - Outras: Rabisin, Canigen, Defensor, Recombitek, Eurican
   - ATENÇÃO: Variações de escrita (nobivac/NOBIVAC/Nobivac) devem ser reconhecidas
2. IGNORAR VALIDADE DO FRASCO: Nos adesivos, ignore datas pequenas rotuladas como "VENC", "FABR", "VAL".
3. DATAS MANUSCRITAS - TÉCNICAS DE LEITURA:
   ⚠️ ATENÇÃO ESPECIAL: Datas manuscritas requerem cuidado extra!
   
   a) POSICIONAMENTO (CRÍTICO PARA REVACINA):
      - Cada vacina tem DUAS datas manuscritas distintas:
        * Primeira data (geralmente acima/ao lado do adesivo) = "data_aplicacao_iso"
        * Segunda data (geralmente abaixo, à direita, ou logo após) = "data_revacina_iso"
      - A data de REVACINA é geralmente 1 mês ou 1 ano DEPOIS da aplicação
      - Se você vê apenas UMA data, deixe data_revacina_iso = null (não invente!)
      - Se você vê DUAS datas, a segunda SEMPRE é a revacina
   
   b) FORMATO COMUM: dd/mm/aa ou dd/mm/aaaa
      - Exemplos: "15/03/24", "15/3/24", "15.03.24", "15-03-24"
      - Ano abreviado: "18" = "2018", "22" = "2022", "24" = "2024", "25" = "2025", "26" = "2026"
   
   c) RECONHECIMENTO DE NÚMEROS MANUSCRITOS:
      - "1" pode parecer "l" ou "|"
      - "2" pode ter loop no topo
      - "3" pode ter pontas abertas
      - "4" pode ser fechado ou aberto
      - "5" pode parecer "S"
      - "6" pode ter loop pequeno
      - "7" pode ter risquinho no meio
      - "8" pode ter loops desiguais
      - "9" pode parecer "g" ou "q"
      - "0" pode ser oval ou circular
   
   d) SEPARADORES: podem ser "/", ".", "-", ou até pequeno espaço
   
   e) ANOS PROBLEMÁTICOS:
      - Se ler "2026" ou "2027" mas o contexto é vacina antiga → provavelmente é "2016" ou "2017"
      - Se ler "2029" → provavelmente é "2019"
      - Vacinas aplicadas geralmente são de 2015-2026
   
   f) FORMATOS ALTERNATIVOS:
      - Alguns veterinários escrevem por extenso: "15 Mar 24", "15/Marco/2024"
      - Alguns escrevem sem separador: "150324"
      - Alguns escrevem só o dia e mês se o ano está no carimbo
   
   g) SE NÃO CONSEGUIR LER:
      - Tente ao menos identificar se há UMA data ou DUAS datas
      - Se houver dúvida, use null e deixe para revisão humana
      - NUNCA invente ou "adivinhe" uma data

4. VETERINÁRIO: Extraia o nome do carimbo para cada vacina individualmente.
5. NÃO EXTRAIR LOTE/CLÍNICA: Ignore campo de lote/batch e nome de clínica, pois são opcionais e confundem a leitura.
6. NÃO PERDER REGISTROS: Se você enxergar uma marca/nome (ex: "Nobivac", "Duramune Max", "Rabisin") mas não conseguir as datas, ainda assim crie o registro com datas = null.
7. REGISTROS REPETIDOS DA MESMA VACINA: Se houver múltiplas aplicações da mesma marca (ex: 3 doses de "Nobivac Raiva"), crie UM registro para CADA aplicação.

VOCABULÁRIO (para ajudar a reconhecer nomes/sinônimos; use o que estiver escrito no cartão):
- Raiva: raiva, antirrábica, rabies, Rabisin, Defensor, Nobivac Raiva, Nobivac Rabies, Nobivac R
- Múltipla canina (DHPP/DAPP/V8/V10/V12): V8, V10, V12, múltipla, polivalente, DHPP, DAPP, DHPPi, DA2PP, cinomose, parvovirose, adenovirose/hepatite, parainfluenza, Vanguard, Vanguard Plus, Duramune, Duramune Max, Nobivac DHPPi
- Leptospirose: lepto, leptospirose
- Bordetelose/Tosse dos Canis: bordetella, kennel cough, tosse dos canis
- Giardia: giárdia, giardia
- Leishmaniose: leishmania, leishmaniose
- Coronavírus (canino): coronavírus, coronavirus, CCoV, canine coronavirus
- Influenza canina: influenza, flu, H3N2, H3N8
- Lyme (borreliose): lyme, borrelia
- Felinos (quando aplicável): FVRCP (tríplice felina), panleucopenia, rinotraqueíte, calicivirose, FeLV (leucemia felina), chlamydia

IMPORTANTE:
- EM HIPÓTESE ALGUMA suponha/invente qualquer campo.
    - Se você não tiver certeza, use null e deixe para o usuário revisar/editar/adicionar.
    - Não 'complete' datas, não deduza revacina, não chute marca.
- Preserve a marca/nome comercial exatamente como aparece quando possível.

REPOSITÓRIO MUNDIAL DE NOMES (APENAS para reconhecimento de texto visível; NÃO é para preencher campos):
{repo_terms if repo_terms else "(catálogo indisponível)"}

FORMATO JSON (Strict Array):
Retorne APENAS o JSON abaixo contendo TODAS as vacinas encontradas na imagem.

{{
  "total_encontrado": integer,
  "vacinas": [
    {{
      "marca_vacina": "string (ex: Rabisin-I, Vanguard Plus)",
      "data_aplicacao_iso": "YYYY-MM-DD ou null",
      "data_revacina_iso": "YYYY-MM-DD ou null",
      "veterinario_responsavel": "string ou null"
    }}
  ]
}}
"""

    def _normalize_date_to_iso(value: Optional[str], *, kind: str = "unknown") -> Optional[str]:
        """Normalize various handwritten/ocr date formats to ISO (YYYY-MM-DD).

        Heuristics:
        - Prefer pt-BR ordering (dd/mm/yyyy) when ambiguous.
        - Accept mm/dd/yyyy when dd/mm is invalid.
        - Fix common OCR year drift (e.g. 2029 instead of 2019).
        - For application dates, avoid far-future results.
        - Handle common OCR errors in handwritten dates (1→l, 5→S, 0→O, etc.)
        """

        if not value:
            return None
        s = str(value).strip()
        if not s:
            return None
        
        # Pre-process: fix common OCR errors in handwritten dates
        # Replace common letter misreads with numbers
        char_fixes = {
            'l': '1', 'I': '1', '|': '1',  # lowercase L, uppercase i, pipe → 1
            'O': '0', 'o': '0',             # letter O → zero
            'S': '5', 's': '5',             # letter S → 5 (when in date context)
            'G': '6', 'g': '9',             # G can be 6, lowercase g can be 9
            'Z': '2', 'z': '2',             # Z → 2
            'B': '8',                       # B → 8
        }
        
        # Only fix if pattern looks like a date (has separators or is numeric-ish)
        if any(sep in s for sep in ['/', '.', '-']) or any(c.isdigit() for c in s):
            for old_char, new_char in char_fixes.items():
                s = s.replace(old_char, new_char)

        from datetime import date, datetime, timedelta
        import re
        import unicodedata

        today = date.today()
        max_future = today + (timedelta(days=7) if kind == "aplicacao" else timedelta(days=365 * 5))
        min_year = 1900
        max_year = today.year + (1 if kind == "aplicacao" else 5)

        def _adjust_year(y: int) -> Optional[int]:
            if y < 100:
                y = 2000 + y
            if y < min_year:
                return None
            if y > max_year:
                for delta in (10, 20, 30):
                    cand = y - delta
                    if min_year <= cand <= max_year:
                        return cand
                return None
            return y

        def _try_dt(y: int, m: int, d: int) -> Optional[date]:
            try:
                return date(y, m, d)
            except Exception:
                return None

        # Already ISO-ish
        m_iso = re.search(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b", s)
        if m_iso:
            try:
                y = _adjust_year(int(m_iso.group(1)))
                if y is None:
                    return None
                dt = _try_dt(y, int(m_iso.group(2)), int(m_iso.group(3)))
                if not dt:
                    return None
                if dt > max_future:
                    return None
                return dt.strftime("%Y-%m-%d")
            except Exception:
                return None

        # Formats with month names in multiple languages (e.g. 15 Mar 2026, 15 Março 26, Jan 5 2024)
        def _strip_accents(text: str) -> str:
            return "".join(
                ch for ch in unicodedata.normalize("NFKD", text) if not unicodedata.combining(ch)
            )

        months = {
            # jan
            "jan": 1,
            "janeiro": 1,
            "january": 1,
            "enero": 1,
            "janvier": 1,
            "gennaio": 1,
            "januar": 1,
            # feb
            "feb": 2,
            "fev": 2,
            "fevereiro": 2,
            "february": 2,
            "febrero": 2,
            "fevrier": 2,
            "fevrier": 2,
            "fevrier": 2,
            "febbraio": 2,
            "februar": 2,
            # mar
            "mar": 3,
            "marco": 3,
            "março": 3,
            "march": 3,
            "marzo": 3,
            "mars": 3,
            "marz": 3,
            # apr
            "apr": 4,
            "abr": 4,
            "abril": 4,
            "april": 4,
            "abril": 4,
            "avril": 4,
            "aprile": 4,
            # may
            "may": 5,
            "mai": 5,
            "maio": 5,
            "mayo": 5,
            "maggio": 5,
            # jun
            "jun": 6,
            "junho": 6,
            "june": 6,
            "junio": 6,
            "juin": 6,
            "giugno": 6,
            # jul
            "jul": 7,
            "julho": 7,
            "july": 7,
            "julio": 7,
            "juillet": 7,
            "luglio": 7,
            # aug
            "aug": 8,
            "ago": 8,
            "agosto": 8,
            "august": 8,
            "aout": 8,
            "août": 8,
            "agosto": 8,
            # sep
            "sep": 9,
            "set": 9,
            "setembro": 9,
            "september": 9,
            "septiembre": 9,
            "septembre": 9,
            "settembre": 9,
            # oct
            "oct": 10,
            "out": 10,
            "outubro": 10,
            "october": 10,
            "octubre": 10,
            "octobre": 10,
            "ottobre": 10,
            # nov
            "nov": 11,
            "novembro": 11,
            "november": 11,
            "noviembre": 11,
            "novembre": 11,
            # dec
            "dec": 12,
            "dez": 12,
            "dezembro": 12,
            "december": 12,
            "diciembre": 12,
            "decembre": 12,
            "dicembre": 12,
        }

        s_norm = _strip_accents(s.lower())
        s_norm = re.sub(r"[\.,]", " ", s_norm)
        s_norm = re.sub(r"\s+", " ", s_norm).strip()

        # dd mon yyyy
        m_dmy = re.search(r"\b(\d{1,2})[\s\-\/](\w{3,})[\s\-\/](\d{2,4})\b", s_norm)
        if m_dmy:
            d = int(m_dmy.group(1))
            mon = m_dmy.group(2).strip().lower()
            y_raw = int(m_dmy.group(3))
            y = _adjust_year(y_raw)
            m_num = months.get(mon)
            if y is not None and m_num is not None:
                dt = _try_dt(y, m_num, d)
                if dt and dt <= max_future:
                    return dt.strftime("%Y-%m-%d")

        # mon dd yyyy
        m_mdy = re.search(r"\b(\w{3,})[\s\-\/](\d{1,2})[\s\-\/](\d{2,4})\b", s_norm)
        if m_mdy:
            mon = m_mdy.group(1).strip().lower()
            d = int(m_mdy.group(2))
            y_raw = int(m_mdy.group(3))
            y = _adjust_year(y_raw)
            m_num = months.get(mon)
            if y is not None and m_num is not None:
                dt = _try_dt(y, m_num, d)
                if dt and dt <= max_future:
                    return dt.strftime("%Y-%m-%d")

        # dd/mm/yyyy or mm/dd/yyyy (and variations with . or -)
        m = re.search(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b", s)
        if not m:
            # Try compact format without separators: ddmmyy or ddmmyyyy
            # Examples: "150324" → 15/03/24, "15032024" → 15/03/2024
            m_compact = re.search(r"\b(\d{6}|\d{8})\b", s)
            if m_compact:
                compact = m_compact.group(1)
                if len(compact) == 6:  # ddmmyy
                    try:
                        d, m_val, y_raw = int(compact[0:2]), int(compact[2:4]), int(compact[4:6])
                        y = _adjust_year(y_raw)
                        if y is not None:
                            dt = _try_dt(y, m_val, d)
                            if dt and dt <= max_future:
                                return dt.strftime("%Y-%m-%d")
                    except Exception:
                        pass
                elif len(compact) == 8:  # ddmmyyyy
                    try:
                        d, m_val, y_raw = int(compact[0:2]), int(compact[2:4]), int(compact[4:8])
                        y = _adjust_year(y_raw)
                        if y is not None:
                            dt = _try_dt(y, m_val, d)
                            if dt and dt <= max_future:
                                return dt.strftime("%Y-%m-%d")
                    except Exception:
                        pass
            return None

        a = int(m.group(1))
        b = int(m.group(2))
        y_raw = int(m.group(3))
        y = _adjust_year(y_raw)
        if y is None:
            return None

        # Candidate interpretations
        candidates: List[date] = []
        # pt-BR: dd/mm
        dt_br = _try_dt(y, b, a)
        if dt_br:
            candidates.append(dt_br)
        # US: mm/dd
        dt_us = _try_dt(y, a, b)
        if dt_us and dt_us not in candidates:
            candidates.append(dt_us)

        if not candidates:
            return None

        # Filter out clearly impossible futures
        candidates = [dt for dt in candidates if dt <= max_future]
        if not candidates:
            return None

        # If ambiguous (both valid), prefer BR unless it looks like a future drift
        if dt_br in candidates and dt_us in candidates:
            # For application, prefer a date not in the future (if possible)
            if kind == "aplicacao":
                past = [dt for dt in candidates if dt <= today]
                if past:
                    # pick the most recent past date
                    best = sorted(past)[-1]
                    return best.strftime("%Y-%m-%d")
            # Default BR
            return dt_br.strftime("%Y-%m-%d")

        return candidates[0].strftime("%Y-%m-%d")

    def _map_strict_array_to_records(obj: dict) -> List[dict]:
        vacinas = obj.get("vacinas") or []
        out: List[dict] = []
        for v in vacinas:
            if not isinstance(v, dict):
                continue
            marca = (v.get("marca_vacina") or "").strip() or None
            data_apl = _normalize_date_to_iso(v.get("data_aplicacao_iso"), kind="aplicacao")
            data_rev = _normalize_date_to_iso(v.get("data_revacina_iso"), kind="revacina")

            # If both are present but inverted, swap them.
            # With ISO strings, lexical order matches chronological order.
            if data_apl and data_rev and data_rev < data_apl:
                data_apl, data_rev = data_rev, data_apl

            vet = (v.get("veterinario_responsavel") or "").strip() or None
            # We keep compatibility with existing UI/API schema
            out.append(
                {
                    "tipo_vacina": marca or "Vacina",
                    "nome_comercial": marca,
                    "data_aplicacao": data_apl,
                    "data_revacina": data_rev,
                    "lote": None,
                    "veterinario_responsavel": vet,
                }
            )
        return out

    def _dedupe_records(items: List[dict]) -> List[dict]:
        seen = set()
        out: List[dict] = []
        for r in items or []:
            tipo = (str(r.get("tipo_vacina") or "").strip().lower())
            nome = (str(r.get("nome_comercial") or "").strip().lower())
            data_apl = (str(r.get("data_aplicacao") or "").strip())
            data_rev = (str(r.get("data_revacina") or "").strip())
            vet = (str(r.get("veterinario_responsavel") or "").strip().lower())

            # IMPORTANT: don't dedupe aggressively when we don't have strong identifiers.
            # Many OCR/LLM extractions may miss dates, and collapsing these would drop vaccines.
            has_strong_id = bool(data_apl or data_rev)
            if not has_strong_id:
                out.append(r)
                continue

            key = (tipo, nome, data_apl, data_rev, vet)
            if key in seen:
                continue
            seen.add(key)
            out.append(r)
        return out

    async def _extract_with_openai(image_b64: str, mime: str) -> dict:
        import openai

        client = openai.OpenAI(api_key=api_key)

        user_content = "Extraia todos os registros de vacinação desta imagem."
        if hint:
            user_content += f" Contexto adicional: {hint}"

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
                                "url": f"data:{mime};base64,{image_b64}",
                                "detail": "high",
                            },
                        },
                    ],
                },
            ],
            max_tokens=1200,
            response_format={"type": "json_object"},
        )

        return json.loads(response.choices[0].message.content)

    async def _extract_with_openai_multi(images: List[dict]) -> dict:
        import openai

        client = openai.OpenAI(api_key=api_key)

        user_content = "Extraia TODAS as vacinas considerando TODAS as imagens (pode haver informação espalhada entre fotos)."
        user_content += "\nVarra a página inteira (topo ao fim, esquerda e direita)."
        user_content += "\nRetorne estritamente o JSON do schema (total_encontrado + vacinas[])."
        if hint:
            user_content += f"\nContexto adicional: {hint}"

        content_parts: List[dict] = [{"type": "text", "text": user_content}]
        for img in images:
            content_parts.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{img['mime']};base64,{img['b64']}",
                        "detail": "high",
                    },
                }
            )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": content_parts},
            ],
            max_tokens=1400,
            response_format={"type": "json_object"},
        )

        obj = json.loads(response.choices[0].message.content)
        # Normalize to legacy shape expected by the rest of the endpoint
        if isinstance(obj, dict) and "vacinas" in obj:
            registros_norm = _map_strict_array_to_records(obj)
            obj = {
                "leitura_confiavel": bool(registros_norm),
                "registros": _dedupe_records(registros_norm),
            }
        return obj

    async def _extract_with_gemini(image_b64: str, mime: str) -> dict:
        import httpx
        import asyncio

        model = _get_gemini_model()
        if model.startswith("models/"):
            model = model.split("/", 1)[1]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        user_content = "Extraia todos os registros de vacinação desta imagem."
        if hint:
            user_content += f" Contexto adicional: {hint}"

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": user_content},
                        {"inlineData": {"mimeType": mime, "data": image_b64}},
                    ],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.1,
            },
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            last_error: Optional[Exception] = None
            for attempt in range(1, 4):
                try:
                    resp = await client.post(url, params={"key": gemini_key}, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except httpx.HTTPStatusError as e:
                    last_error = e
                    status = e.response.status_code
                    retry_after = e.response.headers.get("retry-after")
                    if status in (429, 500, 502, 503, 504) and attempt < 3:
                        # Respect Retry-After when present; otherwise exponential backoff.
                        delay = 0.0
                        if retry_after:
                            try:
                                delay = float(retry_after)
                            except Exception:
                                delay = 0.0
                        if delay <= 0:
                            delay = float(2 ** (attempt - 1))  # 1s, 2s
                        await asyncio.sleep(min(delay, 10.0))
                        continue
                    raise
            else:
                # Shouldn't happen, but keep mypy happy.
                raise last_error or RuntimeError("Gemini request failed")

        text = ""
        try:
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
        except Exception:
            text = ""

        if not text:
            raise RuntimeError("Empty Gemini response")

        try:
            return json.loads(text)
        except Exception:
            # Handle occasional wrapping (e.g. markdown) by extracting the first JSON object.
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                return json.loads(text[start : end + 1])
            raise

    async def _extract_with_gemini_multi(images: List[dict]) -> dict:
        import httpx
        import asyncio

        model = _get_gemini_model()
        if model.startswith("models/"):
            model = model.split("/", 1)[1]
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

        user_content = "Extraia TODAS as vacinas considerando TODAS as imagens (pode haver informação espalhada entre fotos)."
        user_content += "\nVarra a página inteira (topo ao fim, esquerda e direita)."
        user_content += "\nRetorne estritamente o JSON do schema (total_encontrado + vacinas[])."
        if hint:
            user_content += f"\nContexto adicional: {hint}"

        parts: List[dict] = [{"text": user_content}]
        for img in images:
            parts.append({"inlineData": {"mimeType": img["mime"], "data": img["b64"]}})

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            last_error: Optional[Exception] = None
            for attempt in range(1, 4):
                try:
                    resp = await client.post(url, params={"key": gemini_key}, json=payload)
                    resp.raise_for_status()
                    data = resp.json()
                    break
                except httpx.HTTPStatusError as e:
                    last_error = e
                    status = e.response.status_code
                    retry_after = e.response.headers.get("retry-after")
                    if status in (429, 500, 502, 503, 504) and attempt < 3:
                        delay = 0.0
                        if retry_after:
                            try:
                                delay = float(retry_after)
                            except Exception:
                                delay = 0.0
                        if delay <= 0:
                            delay = float(2 ** (attempt - 1))
                        await asyncio.sleep(min(delay, 10.0))
                        continue
                    raise
            else:
                raise last_error or RuntimeError("Gemini request failed")

        text = ""
        try:
            text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
        except Exception:
            text = ""

        if not text:
            raise RuntimeError("Empty Gemini response")

        try:
            obj = json.loads(text)
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                obj = json.loads(text[start : end + 1])
            else:
                raise

        # Normalize to legacy shape expected by the rest of the endpoint
        if isinstance(obj, dict) and "vacinas" in obj:
            registros_norm = _map_strict_array_to_records(obj)
            obj = {
                "leitura_confiavel": bool(registros_norm),
                "registros": _dedupe_records(registros_norm),
            }
        return obj

    def _extract_with_tesseract(image_bytes: bytes) -> dict:
        # OCR local é fallback; fazemos extração heurística simples.
        from PIL import Image, ImageOps, ImageFilter
        import pytesseract
        import io
        import re
        from datetime import datetime

        img = Image.open(io.BytesIO(image_bytes))
        img = ImageOps.exif_transpose(img)
        img = img.convert("L")
        img = ImageOps.autocontrast(img)
        img = img.filter(ImageFilter.MedianFilter(size=3))
        img = img.resize((img.size[0] * 2, img.size[1] * 2))

        text = pytesseract.image_to_string(img, lang="por+eng", config="--psm 6")
        lines = [line.strip() for line in text.splitlines() if line and line.strip()]
        text_norm = "\n".join(lines)

        date_re = re.compile(r"\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b")

        def to_iso(d: str, m: str, y: str) -> Optional[str]:
            try:
                year = int(y)
                if year < 100:
                    year = 2000 + year
                dt = datetime(year, int(m), int(d))
                return dt.strftime("%Y-%m-%d")
            except Exception:
                return None

        # Heurísticas de detecção (conservadoras): somente extrair quando houver evidência direta.
        # Nunca "inferir" múltiplas vacinas a partir de um bloco de datas.
        marker_patterns = [
            (re.compile(r"\bV\s*8\b", re.I), "V8"),
            (re.compile(r"\bV\s*10\b", re.I), "V10"),
            (re.compile(r"\bV\s*12\b", re.I), "V12"),
            # Raiva com todas variações
            (re.compile(r"nobivac\s*(raiva|rabies|r\b)|antirr(a|á)b|\braiva\b|\brabies\b|rabisin", re.I), "Raiva"),
            # Múltiplas/Polivalentes com marcas
            (re.compile(r"duramune\s*(max|dhpp|da2pp)?|vanguard\s*(plus|7)?|nobivac\s*dhppi?|\bdhpp\b|\bdapp\b|\bda2pp\b|polivalente|m[uú]ltipla", re.I), "Múltipla (V8/V10)"),
            (re.compile(r"leish", re.I), "Leishmaniose"),
            (re.compile(r"giardia|gi[aá]rdia", re.I), "Giardia"),
            (re.compile(r"bordetella|kennel\s*cough|bronchi|tosse\s+dos\s+canis|nobivac\s*kc", re.I), "Bordetella"),
            (re.compile(r"lepto|leptospir", re.I), "Leptospirose"),
            (re.compile(r"corona\b|coronav[ií]rus|ccov", re.I), "Coronavírus"),
            (re.compile(r"influenza|\bflu\b|h3n2|h3n8", re.I), "Influenza"),
            (re.compile(r"lyme|borrel", re.I), "Lyme"),
        ]

        # Include worldwide repository aliases as recognition aids
        repo_aliases = _world_vaccine_aliases_for_prompt(80)
        brand_terms = [
            # Marcas principais com variações
            "Nobivac", "Nobivac Raiva", "Nobivac Rabies", "Nobivac R", "Nobivac DHPPi", "Nobivac KC",
            "Duramune", "Duramune Max", "Duramune Max 5", "Duramune DHPP", "Duramune DA2PP",
            "Vanguard", "Vanguard Plus", "Vanguard Plus 5", "Vanguard 7",
            "Defensor", "Defensor 3",
            "Rabisin", "Rabisin-R", "Rabisin-I",
            "Recombitek", "Recombitek C4", "Recombitek C6",
            "Eurican", "Eurican DHPPi",
            "Canigen", "Canigen DHPPi",
            "Virbac",
            "Zoetis",
            "MSD",
            "Biovet",
        ]
        all_terms = [t for t in (brand_terms + repo_aliases) if t]

        vet = None
        m = re.search(r"\b(CRMV\s*[-:]?\s*\w+.*)$", text_norm, re.I | re.M)
        if m:
            vet = m.group(1).strip()
        else:
            m = re.search(r"\bDr\.?\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ][^\n]{2,}", text_norm)
            if m:
                vet = m.group(0).strip()

        def find_term_in_line(line: str) -> Optional[str]:
            """Encontra termos de vacinas na linha com tolerância a variações."""
            line_norm = line.lower()
            
            # Detecção específica para marcas comuns com variações
            # Nobivac (qualquer variação)
            if re.search(r'\bnobivac\b', line_norm):
                # Tentar identificar variação específica
                if re.search(r'nobivac.*(?:raiva|rabies|r\b)', line_norm):
                    return "Nobivac Raiva"
                elif re.search(r'nobivac.*(?:dhppi?|plus)', line_norm):
                    return "Nobivac DHPPi"
                elif re.search(r'nobivac.*kc', line_norm):
                    return "Nobivac KC"
                else:
                    return "Nobivac"
            
            # Duramune (qualquer variação)
            if re.search(r'\bduramune\b', line_norm):
                if re.search(r'duramune.*max', line_norm):
                    return "Duramune Max"
                elif re.search(r'duramune.*(?:dhpp|da2pp)', line_norm):
                    return "Duramune DHPP"
                else:
                    return "Duramune"
            
            # Vanguard (qualquer variação)
            if re.search(r'\bvanguard\b', line_norm):
                if re.search(r'vanguard.*(?:plus|7)', line_norm):
                    return "Vanguard Plus"
                else:
                    return "Vanguard"
            
            # Outras marcas específicas
            if re.search(r'\brabisin\b', line_norm):
                return "Rabisin"
            if re.search(r'\bdefensor\b', line_norm):
                return "Defensor"
            if re.search(r'\brecombitek\b', line_norm):
                return "Recombitek"
            if re.search(r'\beurican\b', line_norm):
                return "Eurican"
            if re.search(r'\bcanigen\b', line_norm):
                return "Canigen"
            
            # Busca genérica em todos os termos (fallback)
            for term in all_terms:
                if not term:
                    continue
                if re.search(rf"\b{re.escape(term)}\b", line, re.I):
                    return term
            return None

        registros_out: List[dict] = []
        seen = set()
        for line in lines:
            brand = find_term_in_line(line)
            marker = None
            for rx, label in marker_patterns:
                if rx.search(line):
                    marker = label
                    break

            if not brand and not marker:
                continue

            dates = [to_iso(d, m, y) for d, m, y in date_re.findall(line)]
            dates = [d for d in dates if d]

            # Evidence-based: only attach dates seen on the SAME line.
            data_apl = dates[0] if len(dates) >= 1 else None
            data_rev = dates[1] if len(dates) >= 2 else None

            tipo_vacina = brand or marker or "Vacina"
            nome_comercial = brand

            key = (str(tipo_vacina).lower(), str(nome_comercial or "").lower(), data_apl or "", data_rev or "", (vet or "").lower())
            if key in seen:
                continue
            seen.add(key)

            registros_out.append(
                {
                    "tipo_vacina": tipo_vacina,
                    "nome_comercial": nome_comercial,
                    "data_aplicacao": data_apl,
                    "data_revacina": data_rev,
                    "lote": None,
                    "veterinario_responsavel": vet,
                }
            )

        # Conservador: só considerar confiável se tiver ao menos uma data ligada a um registro.
        leitura_confiavel = any(bool(r.get("data_aplicacao") or r.get("data_revacina")) for r in registros_out)

        return {"leitura_confiavel": leitura_confiavel, "registros": registros_out}

    # Read all files once (UploadFile is a stream). Keep bytes in memory for this request.
    file_items: List[dict] = []
    for f in files:
        content_type = f.content_type or "image/jpeg"
        data = await f.read()
        if not data:
            continue
        image_hash = hashlib.sha256(data).hexdigest()[:16]
        file_items.append(
            {
                "filename": getattr(f, "filename", "") or "",
                "mime": content_type,
                "data": data,
                "b64": base64.b64encode(data).decode("utf-8"),
                "hash": image_hash,
            }
        )

    # 1) Local OCR first (cheap)
    ai_candidates: List[dict] = []
    for item in file_items:
        per_image: Optional[dict] = None
        engine_for_image: str = "none"

        if prefer_local and not force_ai:
            try:
                per_image = _extract_with_tesseract(item["data"])
                engine_for_image = "tesseract"
            except Exception:
                logger.exception(
                    "vaccine_card: tesseract extraction failed for file=%s",
                    item.get("filename", ""),
                )
                per_image = None

        if per_image is not None and (per_image.get("leitura_confiavel") or (per_image.get("registros") or [])):
            if engine_for_image not in engines_used:
                engines_used.append(engine_for_image)
            reliable_votes.append(bool(per_image.get("leitura_confiavel")))
            for r in per_image.get("registros", []) or []:
                tipo_vacina = str(r.get("tipo_vacina") or "").strip()
                if not tipo_vacina:
                    continue
                registros.append(
                    VaccineCardOcrRecord(
                        tipo_vacina=tipo_vacina,
                        nome_comercial=(r.get("nome_comercial") or None),
                        data_aplicacao=(r.get("data_aplicacao") or None),
                        data_revacina=(r.get("data_revacina") or None),
                        lote=None,
                        veterinario_responsavel=(r.get("veterinario_responsavel") or None),
                    )
                )
        else:
            ai_candidates.append(item)

    # 2) If needed, do ONE consolidated AI call with up to max_ai_images (cheaper than per-image calls)
    need_ai = force_ai or (len(registros) == 0)
    selected: List[dict] = []
    if need_ai and max_ai_images > 0 and (gemini_key or api_key):
        selected = (file_items if force_ai else ai_candidates)[:max_ai_images]
        if selected:
            batch_hashes = tuple([i["hash"] for i in selected])
            batch_cache_key = ("batch", batch_hashes, hint or "")

            ai_obj: Optional[dict] = None
            ai_engine: Optional[str] = None

            if _vaccine_card_ai_cache is not None and batch_cache_key in _vaccine_card_ai_cache:
                cached = _vaccine_card_ai_cache.get(batch_cache_key) or {}
                ai_obj = cached.get("result")
                ai_engine = cached.get("engine")
                cache_hits += 1
            else:
                # Prefer Gemini first (cost-conscious) then OpenAI.
                if gemini_key and gemini_enabled:
                    try:
                        ia_tentada = True
                        ai_obj = await _extract_with_gemini_multi(selected)
                        ai_engine = "gemini"
                        api_calls += 1
                    except Exception as e:
                        status = getattr(getattr(e, "response", None), "status_code", None)
                        if status == 429:
                            gemini_enabled = False
                            motivo_fallback = motivo_fallback or "gemini_rate_limited"
                        else:
                            motivo_fallback = motivo_fallback or "gemini_failed"
                        logger.exception("vaccine_card: gemini multi extraction failed")
                        ai_obj = None

                if ai_obj is None and api_key:
                    try:
                        ia_tentada = True
                        ai_obj = await _extract_with_openai_multi(selected)
                        ai_engine = "openai"
                        api_calls += 1
                    except Exception:
                        motivo_fallback = motivo_fallback or "openai_failed"
                        logger.exception("vaccine_card: openai multi extraction failed")
                        ai_obj = None

                if (
                    ai_obj is not None
                    and ai_engine in ("gemini", "openai")
                    and _vaccine_card_ai_cache is not None
                ):
                    _vaccine_card_ai_cache[batch_cache_key] = {"engine": ai_engine, "result": ai_obj}

            if ai_obj is not None:
                if ai_engine and ai_engine not in engines_used:
                    engines_used.append(ai_engine)
                reliable_votes.append(bool(ai_obj.get("leitura_confiavel")))

                for r in _dedupe_records(ai_obj.get("registros") or []):
                    tipo_vacina = str(r.get("tipo_vacina") or "").strip()
                    if not tipo_vacina:
                        continue
                    registros.append(
                        VaccineCardOcrRecord(
                            tipo_vacina=tipo_vacina,
                            nome_comercial=(r.get("nome_comercial") or None),
                            data_aplicacao=(r.get("data_aplicacao") or None),
                            data_revacina=(r.get("data_revacina") or None),
                            lote=None,
                            veterinario_responsavel=(r.get("veterinario_responsavel") or None),
                        )
                    )

    # 3) Never ignore images: if IA analyzed only a subset (max_ai_images), run cheap OCR on the rest.
    # This helps when users upload many photos/pages but keep IA limit low for cost.
    try:
        selected_hashes = set([i.get("hash") for i in (selected or []) if isinstance(i, dict)])
        remaining_items = [i for i in file_items if i.get("hash") not in selected_hashes]
        for item in remaining_items:
            try:
                per_image = _extract_with_tesseract(item["data"])
            except Exception:
                continue
            if per_image is None:
                continue
            # Only add if it found something
            if not (per_image.get("registros") or []):
                continue
            if "tesseract" not in engines_used:
                engines_used.append("tesseract")
            reliable_votes.append(bool(per_image.get("leitura_confiavel")))
            for r in per_image.get("registros", []) or []:
                tipo_vacina = str(r.get("tipo_vacina") or "").strip()
                if not tipo_vacina:
                    continue
                registros.append(
                    VaccineCardOcrRecord(
                        tipo_vacina=tipo_vacina,
                        nome_comercial=(r.get("nome_comercial") or None),
                        data_aplicacao=(r.get("data_aplicacao") or None),
                        data_revacina=(r.get("data_revacina") or None),
                        lote=None,
                        veterinario_responsavel=(r.get("veterinario_responsavel") or None),
                    )
                )
    except Exception:
        # never fail the endpoint due to supplemental OCR
        pass

    # Aplicar normalização e classificação dos registros ANTES da deduplição
    from .vision.pipeline_utils import normalize_vaccine_records
    registros_dict = [r.dict() if hasattr(r, 'dict') else r.__dict__ for r in registros]
    registros_normalized = normalize_vaccine_records(registros_dict)
    
    # Mapear campos normalizados para o schema da API
    temp_registros = []
    for r in registros_normalized:
        temp_registros.append(
            VaccineCardOcrRecord(
                tipo_vacina=r.get("tipo_vacina"),
                nome_comercial=r.get("nome_comercial"),
                data_aplicacao=r.get("data_aplicacao"),
                data_revacina=r.get("data_revacina"),
                lote=r.get("lote"),
                veterinario_responsavel=r.get("vet"),  # Mapear "vet" para "veterinario_responsavel"
            )
        )
    
    # Final dedupe on normalized records
    deduped: List[VaccineCardOcrRecord] = []
    seen2 = set()
    for r in temp_registros:
        tipo = (r.tipo_vacina or "").strip().lower()
        nome = (r.nome_comercial or "").strip().lower()
        data_apl = (r.data_aplicacao or "")
        data_rev = (r.data_revacina or "")
        vet = (r.veterinario_responsavel or "").strip().lower()

        has_strong_id = bool(data_apl or data_rev)
        if not has_strong_id:
            deduped.append(r)
            continue

        key = (tipo, nome, data_apl, data_rev, vet)
        if key in seen2:
            continue
        seen2.add(key)
        deduped.append(r)
    registros = deduped

    # Heurística simples de confiabilidade global
    leitura_confiavel = (any(reliable_votes) and len(registros) > 0)
    processing_time_ms = int((time.time() - start_time) * 1000)

    # Evita “unused variable” se alguém quiser logar no futuro
    _ = processing_time_ms

    # Escolhe um motor principal (prioridade: openai > gemini > tesseract > none)
    motor_usado = "none"
    if "openai" in engines_used:
        motor_usado = "openai"
    elif "gemini" in engines_used:
        motor_usado = "gemini"
    elif "tesseract" in engines_used:
        motor_usado = "tesseract"

    ia_usada = ("openai" in engines_used) or ("gemini" in engines_used)
    logger.info(
        "vaccine_card: processed=%s registros=%s confiavel=%s engines=%s ms=%s",
        len(files),
        len(registros),
        leitura_confiavel,
        ",".join(engines_used),
        processing_time_ms,
    )

    return VaccineCardOcrResponse(
        sucesso=True,
        leitura_confiavel=leitura_confiavel,
        registros=registros,
        motor_usado=motor_usado,
        motores_usados=engines_used,
        ia_usada=ia_usada,
        ia_tentada=ia_tentada,
        motivo_fallback=motivo_fallback,
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
    """
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


# ================================
# ENDPOINT MELHORADO COM PIPELINE AVANÇADO
# ================================

@app.post("/vision/extract-vaccine-card-files-v2", response_model=VaccineCardOcrResponse, tags=["Vision"])
async def extract_vaccine_card_files_v2(
    files: List[UploadFile] = File(...),
    hint: Optional[str] = Form(None),
    prefer_local: bool = Form(False),  # Default mudado para False
    force_ai: bool = Form(True),       # Default mudado para True
    max_ai_images: int = Form(6),      # Default melhorado para 6
):
    """
    ENDPOINT MELHORADO: Extrai registros estruturados de vacinação com pipeline avançado.

    Melhorias implementadas:
    - Pipeline de Post-AI Validation com fuzzy matching 75%
    - Global Veterinary Ontology (26+ marcas)
    - Normalização inteligente de datas
    - Schema padronizado com campos consistentes
    - Suporte real a múltiplas imagens (até 12)
    - Erro claro quando IA não configurada
    - Melhores critérios para need_ai

    Schema de Resposta:
    - produto: nome da vacina normalizado
    - categoria: raiva|polivalente|coronavirus|lepto|outro
    - data_aplicacao/data_revacina: formato YYYY-MM-DD ou null
    - confianca_score: 0.0-1.0 (consistente)
    """
    import time
    import base64
    from .vision.pipeline_utils import (
        apply_advanced_pipeline, convert_to_legacy_schema, evaluate_need_ai
    )

    start_time = time.time()
    imagens_recebidas = len(files)
    imagens_usadas_ia = 0
    imagens_usadas_ocr = 0
    motivos_need_ai = []

    # Guardrails
    if not files:
        return VaccineCardOcrResponse(
            sucesso=True,
            leitura_confiavel=False,
            registros=[],
            motor_usado="none",
            motores_usados=[],
            ia_usada=False,
            ia_tentada=False,
            motivo_fallback=None,
            api_calls=0,
            cache_hits=0,
        )
    if len(files) > 12:
        raise HTTPException(status_code=400, detail="Too many files (max 12)")

    # Force AI overrides prefer_local
    if force_ai:
        prefer_local = False
        motivos_need_ai.append("force_ai_enabled")

    # Melhorar suporte a múltiplas imagens
    if max_ai_images <= 0:
        max_ai_images = max(6, min(len(files), 6))  # Default 6 imagens
    if max_ai_images > 12:
        max_ai_images = 12
    
    # Use todas as imagens possíveis com IA
    max_ai_images = min(len(files), max_ai_images)
    
    # Erro claro quando IA é necessária mas não configurada
    need_ai_conditions = force_ai or (not prefer_local)
    if need_ai_conditions and not (_get_gemini_api_key() or _get_openai_api_key()):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "AI_NOT_CONFIGURED",
                "message": "IA não configurada (missing GEMINI_API_KEY/OPENAI_API_KEY). Configure no .env e reinicie o serviço."
            }
        )

    # Processar imagens
    raw_records = []
    engines_used = []
    api_calls = 0
    ia_tentada = False

    # Read all files
    file_items = []
    for f in files:
        content_type = f.content_type or "image/jpeg"
        data = await f.read()
        if not data:
            continue
        file_items.append({
            "filename": getattr(f, "filename", "") or "",
            "mime": content_type,
            "data": data,
            "b64": base64.b64encode(data).decode("utf-8")
        })

    # Usar IA para processar máximo de imagens
    if file_items and (_get_gemini_api_key() or _get_openai_api_key()):
        selected = file_items[:max_ai_images]
        imagens_usadas_ia = len(selected)
        
        try:
            if _get_gemini_api_key():
                # Usar VisionService avançado implementado
                from .vision.service import VisionService
                vision_service = VisionService(_get_gemini_api_key())
                
                # Processar cada imagem
                ia_tentada = True
                for item in selected:
                    try:
                        result = await vision_service.extract_vaccine_data(
                            item["data"], 
                            f"test-pet-{item['filename']}"
                        )
                        
                        # Mapear resultado do VisionService
                        logger.info(f"🔍 VisionService resultado: {result}")
                        if result and "vaccines" in result:
                            logger.info(f"📊 {len(result['vaccines'])} vacinas encontradas pelo VisionService")
                            for vaccine in result["vaccines"]:
                                logger.info(f"🩹 Vacina raw do VisionService: {vaccine}")
                                raw_records.append({
                                    "marca_comercial": vaccine.get("marca_comercial"),
                                    "tipo_vacina": vaccine.get("tipo_vacina"),
                                    "data_aplicacao": vaccine.get("data_aplicacao"),
                                    "data_revacina": vaccine.get("data_revacina"),
                                    "crmv_veterinario": vaccine.get("crmv_veterinario"),
                                    "lote": vaccine.get("lote"),
                                    "observacoes": vaccine.get("observacoes"),
                                    "fonte": "ai",
                                    "confianca_score": vaccine.get("confidence", 0.8),
                                    "texto_origem": vaccine.get("text_origin", "")
                                })
                        
                        engines_used.append("gemini")
                        api_calls += 1
                        break  # Sucesso, parar tentativas
                        
                    except Exception as e:
                        logger.warning(f"Erro com VisionService na imagem {item['filename']}: {e}")
                        continue
                        
            elif _get_openai_api_key():
                # Fallback para OpenAI (não implementado ainda)
                logger.info("OpenAI não implementado no endpoint v2")
                
        except Exception as e:
            logger.exception(f"Erro no processamento IA: {e}")
            # Continuar com fallback OCR

    # Fallback OCR para imagens não processadas pela IA
    remaining_files = file_items[max_ai_images:] if max_ai_images < len(file_items) else []
    for item in remaining_files:
        try:
            ocr_result = _extract_with_tesseract(item["data"])
            if ocr_result and ocr_result.get("registros"):
                for r in ocr_result["registros"]:
                    r["fonte"] = "ocr"
                    raw_records.append(r)
                engines_used.append("tesseract")
                imagens_usadas_ocr += 1
        except Exception:
            continue

    # PIPELINE AVANÇADO: aplicar processamento completo
    processed_records = apply_advanced_pipeline(raw_records)
    
    # Converter para schema legacy compatível
    legacy_records = convert_to_legacy_schema(processed_records)
    
    # Criar registros finais
    registros = []
    for r in legacy_records:
        registros.append(VaccineCardOcrRecord(**r))

    # Calcular métricas finais
    registros_sem_data = sum(
        1 for r in registros 
        if not r.data_aplicacao and not r.data_revacina
    )
    
    need_ai, ai_motivos = evaluate_need_ai([r.__dict__ for r in registros])
    motivos_need_ai.extend(ai_motivos)

    # Determinar motor usado
    motor_usado = "none"
    if "gemini" in engines_used:
        motor_usado = "gemini"
    elif "openai" in engines_used:
        motor_usado = "openai"
    elif "tesseract" in engines_used:
        motor_usado = "tesseract"

    ia_usada = ("openai" in engines_used) or ("gemini" in engines_used)
    leitura_confiavel = len(registros) > 0 and registros_sem_data == 0
    processing_time_ms = int((time.time() - start_time) * 1000)

    logger.info(
        "vaccine_card_v2: imagens=%s/%s registros=%s confiavel=%s engines=%s ms=%s motivos_need_ai=%s",
        imagens_usadas_ia, imagens_recebidas, len(registros),
        leitura_confiavel, ",".join(engines_used), processing_time_ms, motivos_need_ai,
    )

    return VaccineCardOcrResponse(
        sucesso=True,
        leitura_confiavel=leitura_confiavel,
        registros=registros,
        motor_usado=motor_usado,
        motores_usados=engines_used,
        ia_usada=ia_usada,
        ia_tentada=ia_tentada,
        motivo_fallback=None,
        api_calls=api_calls,
        cache_hits=0,
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )

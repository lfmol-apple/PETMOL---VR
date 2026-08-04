"""
Configuration settings for the price service.

PRODUCTION: All settings via ENV. No hardcoded domains.
"""
import os
import re
from urllib.parse import urlsplit, urlunsplit
from functools import lru_cache
from pathlib import Path
from typing import List, Optional, Set

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


_CONFIG_DIR = Path(__file__).resolve().parent.parent
_ENV_FILES = (
    str(_CONFIG_DIR / ".secrets" / ".env"),
    str(_CONFIG_DIR / ".env"),
)


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_file=_ENV_FILES,
        env_file_encoding="utf-8",
        extra="ignore",
    )
    
    # Environment
    env: str = "dev"  # "dev" or "prod"
    
    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    frontend_url: str = "https://petmol.com.br"
    
    # CORS - Via ENV, no hardcoded domains
    cors_origins: str = "http://localhost:3000,http://localhost:8081"
    cors_origin_regex: str = r"https://.*\.vercel\.app"
    
    # Cache
    cache_ttl: int = 300  # 5 minutes
    suggest_cache_ttl: int = 180  # 3 minutes for suggest autocomplete
    
    # Rate limiting
    rate_limit_requests: int = 100
    rate_limit_window: int = 60  # seconds
    
    # Mercado Livre API (public search works without auth)
    mercadolivre_client_id: Optional[str] = None
    mercadolivre_client_secret: Optional[str] = None
    mercadolivre_access_token: Optional[str] = None
    
    # Google Maps/Places API - unified key
    google_maps_api_key: Optional[str] = None
    google_places_key: Optional[str] = None  # Legacy, maps to google_maps_api_key
    
    # Feature flags - countries with price comparison enabled
    prices_enabled_countries: str = "BR,AR,MX,CO,CL"

    # Feature flag — ativa busca real via MercadoLivreProvider em /search
    # Padrão false: comportamento idêntico ao atual (candidates=[])
    enable_ml_provider: bool = False

    # Preço real da Cobasi (API pública de catálogo VTEX) para a Loja do Baby.
    # Cache longo de propósito — reduz volume de chamadas à Cobasi (evitar
    # bloqueio) e o preço não precisa ser por segundo para o caso de uso.
    commerce_pricing_enabled: bool = True
    commerce_pricing_cache_ttl: int = 21600  # 6 horas

    # Database - usa caminho relativo que funciona local e produção
    database_url: str = f"sqlite:///{os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'petmol.db'))}"

    # Auth / JWT
    jwt_secret: str = "change-me"
    jwt_access_token_expire_minutes: int = 60 * 24 * 7

    # Admin bootstrap (used to promote first admin safely)
    admin_bootstrap_secret: Optional[str] = None

    # Admin master: the ONLY email ever allowed through get_current_admin.
    # Overridable via env var, but defaults to the real value so this holds
    # even if the server's env file doesn't set it.
    admin_master_email: str = "leonardofmol@gmail.com"
    admin_master_password: Optional[str] = None
    admin_master_name: Optional[str] = None
    admin_master_role: str = "master"

    # ── Storage ──────────────────────────────────────────────────────────
    storage_backend: str = "local"     # "local" | "r2"
    uploads_dir: str = "uploads"

    # Cloudflare R2 (S3-compatible)
    r2_endpoint: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket: str = "petmol-uploads"

    # Gemini
    gemini_api_key: Optional[str] = None

    # Cosmos Bluesoft API - backend only.
    cosmos_api_base_url: str = "https://api.cosmos.bluesoft.com.br"
    cosmos_api_token: Optional[str] = None

    # RSC GTIN API - preencha usuário/senha apenas no .env/.secrets do backend.
    gtin_api_base_url: str = "https://gtin.rscsistemas.com.br"
    gtin_api_username: Optional[str] = None
    gtin_api_password: Optional[str] = None

    # Open Food Facts read-only API.
    off_api_base_url: str = "https://world.openfoodfacts.org"
    off_user_agent: Optional[str] = None
    opf_api_base_url: str = "https://world.openproductsfacts.org"

    # ── Web Push Notifications (VAPID) ────────────────────────────────────
    vapid_public_key: Optional[str] = None
    vapid_private_key: Optional[str] = None
    vapid_claims_email: str = "mailto:contato@petmol.app"

    # ── Afiliados / Motor de Intenção ─────────────────────────────────────
    # Deixe vazio para desabilitar redirect (retorna 503 controlado)
    petz_affiliate_url: Optional[str] = None
    cobasi_affiliate_url: Optional[str] = None
    petlove_dog_life_url: Optional[str] = None

    @field_validator("debug", mode="before")
    @classmethod
    def _coerce_bool_like(cls, value):
        if isinstance(value, bool):
            return value
        if value is None:
            return False
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"1", "true", "yes", "y", "on", "enabled", "debug", "dev", "development"}:
                return True
            if normalized in {"0", "false", "no", "n", "off", "disabled", "release", "prod", "production", ""}:
                return False
        return value
    
    @property
    def cors_origins_list(self) -> List[str]:
        """Parse CORS origins from comma-separated string."""
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        expanded: List[str] = []

        for origin in origins:
            if origin not in expanded:
                expanded.append(origin)

            try:
                parts = urlsplit(origin)
            except Exception:
                continue

            hostname = parts.hostname
            if hostname not in {"localhost", "127.0.0.1"}:
                continue

            alternate_host = "127.0.0.1" if hostname == "localhost" else "localhost"
            netloc = alternate_host
            if parts.port is not None:
                netloc = f"{alternate_host}:{parts.port}"

            alternate_origin = urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
            if alternate_origin not in expanded:
                expanded.append(alternate_origin)

        return expanded
    
    @property
    def prices_enabled_countries_set(self) -> Set[str]:
        """Get set of countries with price comparison enabled."""
        return {c.strip().upper() for c in self.prices_enabled_countries.split(",") if c.strip()}
    
    @property
    def google_maps_api_key_resolved(self) -> Optional[str]:
        """Get Google Maps API key (fallback to google_places_key for backward compatibility)."""
        return self.google_maps_api_key or self.google_places_key
    
    @property
    def cors_origin_regex_full(self) -> str:
        """Get full CORS origin regex including ngrok for dev."""
        patterns = [self.cors_origin_regex]
        
        # In dev, allow ngrok domains
        if self.env == "dev":
            patterns.extend([
                r"https://.*\.ngrok-free\.app",
                r"https://.*\.ngrok-free\.dev",
                r"https://.*\.ngrok\.io",
                r"https://.*\.ngrok\.app",
            ])
        
        return "|".join(f"({p})" for p in patterns)

    def validate_prod(self) -> None:
        """Raise RuntimeError with clear message if prod config is invalid.
        Never logs secrets."""
        if self.env != "prod":
            return
        errors = []
        if not self.jwt_secret or self.jwt_secret.lower() in ("change-me", "changeme", ""):
            errors.append("JWT_SECRET must be set to a strong random value in prod")
        if not self.database_url.startswith("postgresql"):
            errors.append("DATABASE_URL must be a PostgreSQL URL in prod (got non-postgres URL)")
        if self.storage_backend not in ("r2", "local"):
            errors.append(f"STORAGE_BACKEND must be 'r2' or 'local', got: {self.storage_backend!r}")
        if self.storage_backend == "r2":
            if not self.r2_access_key_id or self.r2_access_key_id == "CHANGE_ME":
                errors.append("R2_ACCESS_KEY_ID must be set when STORAGE_BACKEND=r2")
            if not self.r2_secret_access_key or self.r2_secret_access_key == "CHANGE_ME":
                errors.append("R2_SECRET_ACCESS_KEY must be set when STORAGE_BACKEND=r2")
            if not self.r2_endpoint or self.r2_endpoint == "CHANGE_ME":
                errors.append("R2_ENDPOINT must be set when STORAGE_BACKEND=r2")
        if errors:
            msg = "STARTUP FAILED — invalid production configuration:\n"
            for e in errors:
                msg += f"  • {e}\n"
            raise RuntimeError(msg)


@lru_cache
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()

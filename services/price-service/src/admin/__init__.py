"""Admin module (master access)."""

from .router import router as admin_router
from .affiliate_links_router import router as affiliate_links_admin_router
from .affiliate_feed_metrics_router import router as affiliate_feed_metrics_admin_router
from .marketplace_offers_router import router as marketplace_offers_admin_router
from .shopee_sync_router import router as shopee_sync_admin_router
from .petz_router import router as petz_admin_router
from .monetization_coverage_router import router as monetization_coverage_admin_router
from .commerce_identity_router import router as commerce_identity_admin_router
from .analytics import admin_analytics_router

__all__ = [
    "admin_router",
    "admin_analytics_router",
    "affiliate_links_admin_router",
    "affiliate_feed_metrics_admin_router",
    "marketplace_offers_admin_router",
    "shopee_sync_admin_router",
    "petz_admin_router",
    "monetization_coverage_admin_router",
    "commerce_identity_admin_router",
]

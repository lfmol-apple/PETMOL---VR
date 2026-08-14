"""Admin module (master access)."""

from .router import router as admin_router
from .affiliate_links_router import router as affiliate_links_admin_router
from .affiliate_feed_metrics_router import router as affiliate_feed_metrics_admin_router
from .marketplace_offers_router import router as marketplace_offers_admin_router

__all__ = [
    "admin_router",
    "affiliate_links_admin_router",
    "affiliate_feed_metrics_admin_router",
    "marketplace_offers_admin_router",
]

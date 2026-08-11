"""Admin module (master access)."""

from .router import router as admin_router
from .affiliate_links_router import router as affiliate_links_admin_router

__all__ = ["admin_router", "affiliate_links_admin_router"]

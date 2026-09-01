"""Admin analytics / BI layer for Mission Control.

Read-only. Never mutates tutor-facing data. Separates OPERATIONAL data
(PETMOL database — pets, feeding, vaccines, ...) from BEHAVIORAL data
(analytics_product_events). No sale attribution, no GPS analytics, no
external analytics suite.
"""

from .router import router as admin_analytics_router

__all__ = ["admin_analytics_router"]

"""Authentication helpers for PETMOL Price Service.

Mercado Livre uses backend-only Client Credentials. The old user OAuth/PKCE
routes are intentionally disabled.
"""
from .ml_oauth import router as ml_oauth_router

__all__ = ["ml_oauth_router"]

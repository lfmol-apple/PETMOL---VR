"""
Price providers package.
Google Places para autocomplete de estabelecimentos veterinários.
"""

# Base classes
from .base import (
    CatalogProvider,
    CatalogCandidate,
    PackSize,
    ProviderStatus,
    ProviderError,
    get_global_errors,
    clear_global_errors,
)

# Places provider (usado para autocomplete de estabelecimentos)
from .places import (
    google_places_provider,
    PlacePrediction,
    PlaceDetails,
)

# MercadoLivre provider (ativado via ENABLE_ML_PROVIDER=true)
from .mercadolivre import mercadolivre_provider, MercadoLivreProvider

__all__ = [
    # Base
    "CatalogProvider",
    "CatalogCandidate",
    "PackSize",
    "ProviderStatus",
    "ProviderError",
    "get_global_errors",
    "clear_global_errors",

    # Places
    "google_places_provider",
    "PlacePrediction",
    "PlaceDetails",

    # MercadoLivre
    "mercadolivre_provider",
    "MercadoLivreProvider",
]

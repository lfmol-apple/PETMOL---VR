"""
Autocomplete endpoint with internet proxy + pet-only filter
Returns suggestions from Google Autocomplete API + local terms + history
"""

import httpx
from fastapi import APIRouter, Query, Request
from typing import List, Optional
from collections import Counter
import time
from datetime import datetime, timedelta
from cachetools import TTLCache

from .rate_limit import rate_limiter
from .config import get_settings
from .petguard import pet_guard

settings = get_settings()

router = APIRouter()

# Cache: 300 seconds TTL, max 1000 entries
autocomplete_cache = TTLCache(maxsize=1000, ttl=300)

# Simple in-memory query history (top 100 most recent)
query_history: Counter = Counter()

# Static BR pet product catalog for offline-first suggestions
_BR_PET_BRANDS = [
    # Rações
    'Fórmula Natural', 'Premier Pet', 'Royal Canin', 'Hills Science Diet',
    'Purina Pro Plan', 'Guabi Natural', 'Magnus Natural', 'Pedigree',
    'Farmina N&D', 'Equilibrio', 'Biofresh', 'Total Alimentos', 'Rações Primor',
    # Antiparasitários
    'Bravecto', 'Nexgard', 'Simparica', 'Frontline Plus', 'Advantage',
    'Advantix', 'Revolution', 'Comfortis', 'Credelio', 'Seresto',
    # Higiene e acessórios
    'Sanol Dog', 'Pet Society', 'Petgroom', 'Pet Clean', 'Tapete Higiênico',
    'Areia Higiênica', 'Areia Sanitária', 'Caixa de areia',
    # Varejistas BR
    'Cobasi', 'PetLove', 'Petz', 'Agro Oeste', 'Casas da Água',
    # Petiscos
    'Petiscos naturais', 'Osso natural', 'Snacks para cães', 'Bifinho',
]


def get_br_brand_suggestions(query: str, limit: int = 4) -> list[str]:
    """Return matching BR pet brand/product names for the given query."""
    q_lower = query.lower().strip()
    import unicodedata
    def normalize(s: str) -> str:
        return ''.join(
            c for c in unicodedata.normalize('NFD', s.lower())
            if unicodedata.category(c) != 'Mn'
        )
    q_norm = normalize(q_lower)
    return [
        brand for brand in _BR_PET_BRANDS
        if q_norm in normalize(brand)
    ][:limit]


def get_local_suggestions(query: str, locale: str, limit: int = 5) -> List[str]:
    """Get suggestions from query history."""
    q_lower = query.lower()
    
    # Get top queries from history that start with or contain the search term
    matching = [
        q for q, count in query_history.most_common(100)
        if q_lower in q.lower() and q.lower() != q_lower
    ]
    
    return matching[:limit]


def record_query(query: str):
    """Record query in history for future suggestions."""
    if len(query.strip()) >= 2:
        query_history[query.strip()] += 1
        # Keep only top 100
        if len(query_history) > 100:
            # Remove least common
            least_common = query_history.most_common()[-1][0]
            del query_history[least_common]


async def fetch_google_autocomplete(query: str, country: str = 'BR', locale: str = 'pt-BR') -> List[str]:
    """
    Fetch autocomplete suggestions from Google (public, no API key needed)
    Uses Google's suggestion API (same used by google.com search box)
    """
    try:
        # Google's autocomplete endpoint (public, no auth)
        url = "https://suggestqueries.google.com/complete/search"
        
        # Parse locale for language
        lang = locale.split('-')[0] if '-' in locale else 'pt'
        
        params = {
            'q': query,
            'client': 'firefox',  # firefox client returns JSON
            'hl': lang,
            'gl': country.upper(),
        }
        
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(url, params=params)
            response.raise_for_status()
            
            # Response format: [query, [suggestions]]
            data = response.json()
            if isinstance(data, list) and len(data) > 1 and isinstance(data[1], list):
                return data[1]
            
            return []
            
    except Exception as e:
        print(f"Autocomplete fetch error: {e}")
        return []


@router.get("/autocomplete")
async def autocomplete(
    request: Request,
    q: str = Query(..., min_length=2, description="Query string"),
    country: str = Query('BR', description="Country code"),
    locale: str = Query('pt-BR', description="Locale"),
    limit: int = Query(8, ge=1, le=15, description="Max suggestions"),
):
    """
    Autocomplete endpoint with internet proxy + pet-only filter
    
    Returns:
        {
            "suggestions": [...],
            "fetched_at": "...",
            "cached": true/false,
            "warning": "..." (optional)
        }
    """
    
    # Check cache FIRST (before rate limit)
    cache_key = f"{q.lower()}:{country}:{locale}"
    if cache_key in autocomplete_cache:
        cached_data = autocomplete_cache[cache_key]
        return {
            **cached_data,
            "cached": True,
        }
    
    # Soft rate limit check - don't block autocomplete UX
    client_ip = request.client.host if request.client else "unknown"
    allowed, remaining, retry_after = rate_limiter.check_rate_limit(
        request,
        max_requests=30,
        window_seconds=60
    )
    
    # If rate limited, return local suggestions only (no external call)
    if not allowed:
        local_suggestions = get_local_suggestions(q, locale, limit=limit)
        
        # If no local suggestions, return generic pet terms
        if not local_suggestions:
            generic_pet_terms = [
                "ração para cães" if locale.startswith('pt') else "dog food",
                "areia higiênica" if locale.startswith('pt') else "cat litter",
                "petiscos" if locale.startswith('pt') else "treats",
                "brinquedos" if locale.startswith('pt') else "toys",
                "coleira" if locale.startswith('pt') else "collar",
            ]
            local_suggestions = [t for t in generic_pet_terms if q.lower() in t.lower()][:limit]
        
        result = {
            "suggestions": local_suggestions,
            "fetched_at": datetime.utcnow().isoformat(),
            "cached": False,
            "filtered": False,
            "warning": "rate_limited_fallback"
        }
        # Cache the fallback result
        autocomplete_cache[cache_key] = result
        return result
    
    # Fetch from Google (only if not rate limited)
    raw_suggestions = await fetch_google_autocomplete(q, country, locale)
    
    # Add local suggestions
    local_suggestions = get_local_suggestions(q, locale, limit=3)
    
    # Add BR brand catalog (only for BR locale/country)
    br_suggestions = get_br_brand_suggestions(q, limit=4) if country.upper() == 'BR' or locale.startswith('pt') else []

    # Combine: history → BR brands → Google
    combined = local_suggestions + br_suggestions + raw_suggestions
    
    # Filter ALL through pet guard
    pet_suggestions = []
    for suggestion in combined:
        result = pet_guard(suggestion, locale)
        # Only include if allow or rewrite
        if result["action"] in ["allow", "rewrite"]:
            # Use final query (rewritten if applicable)
            final = result["q_final"]
            if final not in pet_suggestions:
                pet_suggestions.append(final)
        
        if len(pet_suggestions) >= limit:
            break
    
    # If nothing passed pet guard, return generic pet terms as fallback
    if not pet_suggestions:
        generic_pet_terms = [
            "ração para cães" if locale.startswith('pt') else "dog food",
            "areia higiênica" if locale.startswith('pt') else "cat litter",
            "petiscos" if locale.startswith('pt') else "treats",
            "brinquedos" if locale.startswith('pt') else "toys",
            "coleira" if locale.startswith('pt') else "collar",
        ]
        filtered_generic = [t for t in generic_pet_terms if q.lower() in t.lower()]
        pet_suggestions = (filtered_generic or generic_pet_terms)[:limit]

    # Build response
    result = {
        "suggestions": pet_suggestions,
        "fetched_at": datetime.utcnow().isoformat(),
        "cached": False,
        "filtered": len(combined) > len(pet_suggestions),
        "warning": None if pet_suggestions else "no_pet_suggestions_found"
    }
    
    # Cache result
    autocomplete_cache[cache_key] = result
    
    return result

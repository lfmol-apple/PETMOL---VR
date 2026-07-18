"""
Search service for aggregating and ranking offers.
Sistema de comparação desabilitado - PETMOL redireciona para Google Shopping.
"""
from datetime import datetime, timedelta
import asyncio

from .models import Currency, Offer, PackSizeUnit, SearchQuery, SearchResult, UnitSystem, Provider
# from .providers import aggregate_search
from .config import get_settings
from .utils.weights import parse_weight_to_kg, calculate_price_per_kg


# Simple in-memory cache
_cache: dict[str, tuple[SearchResult, datetime]] = {}


def _cache_key(query: SearchQuery) -> str:
    """Generate cache key from query."""
    return f"{query.query}:{query.country_code}:{query.currency}:{query.unit_system}"


def _get_provider_enum(source: str) -> Provider:
    """Map source string to Provider enum."""
    source_lower = source.lower()
    if source_lower in ("ml", "mercadolivre"):
        return Provider.MERCADOLIVRE
    else:
        # Default to MERCADOLIVRE for unknown sources
        return Provider.MERCADOLIVRE


async def search_offers_async(query: SearchQuery, force: bool = False) -> SearchResult:
    """Search for offers across all providers (async version)."""
    settings = get_settings()
    
    # Check cache (unless force=True)
    cache_key = _cache_key(query)
    if not force and cache_key in _cache:
        result, cached_at = _cache[cache_key]
        if datetime.utcnow() - cached_at < timedelta(seconds=settings.cache_ttl):
            result.cached = True
            result.cache_expires_at = cached_at + timedelta(seconds=settings.cache_ttl)
            return result
    
    # Sistema de comparação de preços desabilitado - retorna lista vazia
    candidates = []
    # try:
    #     candidates = await aggregate_search(
    #         query=query.query,
    #         country=query.country_code,
    #         product_type="food",
    #         limit=query.limit * 2
    #     )
    # except Exception as e:
    #     print(f"[search] Aggregation error: {e}")
    #     candidates = []

    # MercadoLivre provider — ativado via ENABLE_ML_PROVIDER=true
    if settings.enable_ml_provider:
        try:
            from .providers.mercadolivre import mercadolivre_provider
            candidates = await mercadolivre_provider.search(
                query=query.query,
                country=query.country_code,
                product_type="food",
                limit=query.limit * 2,
            )
        except Exception as exc:
            import logging
            logging.getLogger(__name__).error(f"[search] ML provider error: {exc}")
            candidates = []
    
    # Convert candidates to Offer objects
    offers = []
    for c in candidates:
        # Skip candidates without price
        if c.price is None:
            continue
        
        # Parse pack size
        pack_size_value = None
        pack_size_unit = None
        if c.pack_sizes and len(c.pack_sizes) > 0:
            ps = c.pack_sizes[0]
            pack_size_value = ps.value
            unit_str = ps.unit.lower()
            if unit_str == "kg":
                pack_size_unit = PackSizeUnit.KG
            elif unit_str == "g":
                pack_size_unit = PackSizeUnit.G
            elif unit_str == "lb":
                pack_size_unit = PackSizeUnit.LB
            elif unit_str == "oz":
                pack_size_unit = PackSizeUnit.OZ
            else:
                pack_size_unit = PackSizeUnit.UNIT
        
        # Calculate price per unit (kg)
        price_per_unit = None
        if c.price and pack_size_value:
            weight_kg = parse_weight_to_kg(f"{pack_size_value}{pack_size_unit.value if pack_size_unit else 'kg'}")
            if weight_kg and weight_kg > 0:
                price_per_unit = round(c.price / weight_kg, 2)
        
        # Create offer
        offer = Offer(
            id=f"{c.source}:{c.source_item_id}",
            provider=_get_provider_enum(c.source),
            provider_product_id=c.source_item_id,
            name=c.title,
            brand=c.brand,
            variant=c.variant if hasattr(c, 'variant') else None,
            pack_size_value=pack_size_value,
            pack_size_unit=pack_size_unit,
            price=c.price,
            original_price=c.original_price if hasattr(c, 'original_price') else None,
            currency=Currency(c.currency or "BRL"),
            price_per_unit=price_per_unit,
            url=c.url or "",
            image_url=c.image_url,
            in_stock=c.in_stock if hasattr(c, 'in_stock') else True,
            total_cost=c.price,  # No shipping info yet
            fetched_at=c.fetched_at if hasattr(c, 'fetched_at') else datetime.utcnow(),
        )
        offers.append(offer)
    
    # Filter by pack size if specified
    if query.min_pack_size is not None or query.max_pack_size is not None:
        offers = [
            o for o in offers
            if o.pack_size_value is not None
            and (query.min_pack_size is None or o.pack_size_value >= query.min_pack_size)
            and (query.max_pack_size is None or o.pack_size_value <= query.max_pack_size)
        ]
    
    # Filter by brand if specified
    if query.brand:
        brand_lower = query.brand.lower()
        offers = [o for o in offers if o.brand and brand_lower in o.brand.lower()]
    
    # Sort by total cost
    offers_with_total = [o for o in offers if o.total_cost is not None]
    offers_without_total = [o for o in offers if o.total_cost is None]
    
    offers_with_total.sort(key=lambda o: o.total_cost or float("inf"))
    offers = offers_with_total + offers_without_total
    
    # Apply offset and limit
    total_results = len(offers)
    offers = offers[query.offset : query.offset + query.limit]
    
    # Find best offers
    best_total = None
    best_unit_price = None
    fastest_shipping = None
    
    in_stock_offers = [o for o in offers if o.in_stock]
    
    if in_stock_offers:
        # Best total (lowest total cost)
        offers_by_total = [o for o in in_stock_offers if o.total_cost is not None]
        if offers_by_total:
            best_total = min(offers_by_total, key=lambda o: o.total_cost or float("inf"))
        
        # Best unit price (lowest price per kg/lb)
        offers_by_unit = [o for o in in_stock_offers if o.price_per_unit is not None]
        if offers_by_unit:
            best_unit_price = min(offers_by_unit, key=lambda o: o.price_per_unit or float("inf"))
        
        # Fastest shipping
        offers_with_shipping = [
            o for o in in_stock_offers
            if o.shipping and o.shipping.estimated_days is not None
        ]
        if offers_with_shipping:
            fastest_shipping = min(
                offers_with_shipping,
                key=lambda o: o.shipping.estimated_days if o.shipping else float("inf"),
            )
    
    result = SearchResult(
        query=query.query,
        country_code=query.country_code,
        currency=query.currency,
        total_results=total_results,
        offers=offers,
        best_total=best_total,
        best_unit_price=best_unit_price,
        fastest_shipping=fastest_shipping,
        cached=False,
    )
    
    # Cache result
    _cache[cache_key] = (result, datetime.utcnow())
    
    return result


def search_offers(query: SearchQuery, force: bool = False) -> SearchResult:
    """
    Sync wrapper for search_offers_async.
    Used by /search endpoint.
    """
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Already in async context - create task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, search_offers_async(query, force))
                return future.result()
        else:
            return loop.run_until_complete(search_offers_async(query, force))
    except RuntimeError:
        return asyncio.run(search_offers_async(query, force))


def clear_cache() -> int:
    """Clear the search cache. Returns number of entries cleared."""
    count = len(_cache)
    _cache.clear()
    return count

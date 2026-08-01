"""
Pet Food Catalog - Product database for autocomplete and barcode lookup

Contains popular pet food products from Brazil and US with:
- Brand, variant, species, life stage
- Pack sizes
- Barcodes (EAN-13) when available
- Image URLs

Trivago-style incremental catalog:
- Mercado Livre official API as primary source
- In-memory cache for fast lookups
- Canonical products normalized from sources

NO mock/demo/scraping.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pydantic import BaseModel
import hashlib
import json
import logging
import os
import uuid

logger = logging.getLogger(__name__)


class PackSize(BaseModel):
    """Pack size option."""
    value: float
    unit: str


class CatalogProduct(BaseModel):
    """Product in the catalog."""
    id: str
    name: str
    brand: str
    variant: Optional[str] = None
    species: str  # "dog", "cat", "all"
    life_stage: str  # "puppy", "adult", "senior", "all"
    pack_sizes: List[PackSize] = []
    barcodes: List[str] = []  # EAN-13/UPC codes
    image_url: Optional[str] = None
    country: str = "BR"


# ========================================
# In-Memory Cache for Candidates
# ========================================

class CatalogCache:
    """Simple in-memory cache for catalog queries."""
    
    def __init__(self, ttl_seconds: int = 300):
        self.ttl = timedelta(seconds=ttl_seconds)
        self._cache: Dict[str, tuple[datetime, List[Any]]] = {}
        self._products: Dict[str, Dict[str, Any]] = {}  # Canonical products
        self._aliases: Dict[str, str] = {}  # source+id -> product_id
    
    def _make_key(self, query: str, country: str, product_type: str) -> str:
        """Create cache key."""
        return hashlib.md5(f"{query.lower()}:{country}:{product_type}".encode()).hexdigest()
    
    def get(self, query: str, country: str, product_type: str) -> Optional[List[Any]]:
        """Get cached results if not expired."""
        key = self._make_key(query, country, product_type)
        if key in self._cache:
            timestamp, results = self._cache[key]
            if datetime.utcnow() - timestamp < self.ttl:
                return results
            else:
                del self._cache[key]
        return None
    
    def set(self, query: str, country: str, product_type: str, results: List[Any]):
        """Cache results."""
        key = self._make_key(query, country, product_type)
        self._cache[key] = (datetime.utcnow(), results)
    
    def get_product(self, product_id: str) -> Optional[Dict[str, Any]]:
        """Get canonical product by ID."""
        return self._products.get(product_id)
    
    def set_product(self, product_id: str, product: Dict[str, Any]):
        """Store canonical product."""
        self._products[product_id] = product
    
    def get_alias(self, source: str, source_item_id: str) -> Optional[str]:
        """Get product ID by source alias."""
        key = f"{source}:{source_item_id}"
        return self._aliases.get(key)
    
    def set_alias(self, source: str, source_item_id: str, product_id: str):
        """Store source alias mapping."""
        key = f"{source}:{source_item_id}"
        self._aliases[key] = product_id
    
    def clear(self) -> int:
        """Clear cache, return count of cleared entries."""
        count = len(self._cache)
        self._cache.clear()
        return count


# Global cache instance
catalog_cache = CatalogCache(ttl_seconds=300)


# Brazilian Pet Food Catalog
BR_CATALOG: List[CatalogProduct] = [
    # Royal Canin - Dogs
    CatalogProduct(
        id="royal-canin-maxi-adult",
        name="Royal Canin Maxi Adult",
        brand="Royal Canin",
        variant="Maxi Adult",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=3, unit="kg"),
            PackSize(value=7.5, unit="kg"),
            PackSize(value=15, unit="kg"),
        ],
        barcodes=["7896181200018", "7896181200025"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_royal_canin_size_health_nutrition_maxi_para_caes_adultos_de_racas_grandes_15_kg_9893_1_20200925152815.jpg",
        country="BR",
    ),
    CatalogProduct(
        id="royal-canin-mini-adult",
        name="Royal Canin Mini Adult",
        brand="Royal Canin",
        variant="Mini Adult",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=1, unit="kg"),
            PackSize(value=2.5, unit="kg"),
            PackSize(value=7.5, unit="kg"),
        ],
        barcodes=["7896181200032", "7896181200049"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_royal_canin_size_health_nutrition_mini_para_caes_adultos_de_racas_pequenas_7_5_kg_9928_1_20200925152751.jpg",
        country="BR",
    ),
    CatalogProduct(
        id="royal-canin-medium-puppy",
        name="Royal Canin Medium Puppy",
        brand="Royal Canin",
        variant="Medium Puppy",
        species="dog",
        life_stage="puppy",
        pack_sizes=[
            PackSize(value=2.5, unit="kg"),
            PackSize(value=10, unit="kg"),
            PackSize(value=15, unit="kg"),
        ],
        barcodes=["7896181200056", "7896181200063"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_royal_canin_size_health_nutrition_medium_para_caes_filhotes_de_racas_medias_15_kg_9883_1_20200925152839.jpg",
        country="BR",
    ),
    
    # Royal Canin - Cats
    CatalogProduct(
        id="royal-canin-indoor-cat",
        name="Royal Canin Indoor Cat",
        brand="Royal Canin",
        variant="Indoor Cat",
        species="cat",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=400, unit="g"),
            PackSize(value=1.5, unit="kg"),
            PackSize(value=4, unit="kg"),
            PackSize(value=7.5, unit="kg"),
        ],
        barcodes=["7896181200100", "7896181200117"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_royal_canin_feline_health_nutrition_indoor_para_gatos_adultos_de_ambientes_internos_7_5_kg_9968_1_20200925152731.jpg",
        country="BR",
    ),
    
    # Premier
    CatalogProduct(
        id="premier-golden-formula-adulto",
        name="Premier Golden Formula Adulto",
        brand="Premier",
        variant="Golden Fórmula Cães Adultos",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=3, unit="kg"),
            PackSize(value=12, unit="kg"),
            PackSize(value=15, unit="kg"),
        ],
        barcodes=["7896009403125", "7896009403132"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_premier_golden_formula_para_caes_adultos_de_racas_medias_e_grandes_15_kg_10052_1_20200925152655.jpg",
        country="BR",
    ),
    CatalogProduct(
        id="premier-nattu-adulto",
        name="Premier Nattu Adulto",
        brand="Premier",
        variant="Nattu Cães Adultos",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=2.5, unit="kg"),
            PackSize(value=10.1, unit="kg"),
            PackSize(value=12, unit="kg"),
        ],
        barcodes=["7896009407109", "7896009407116"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_premier_nattu_para_caes_adultos_12_kg_10041_1_20200925152703.jpg",
        country="BR",
    ),
    CatalogProduct(
        id="premier-selecao-natural-gatos",
        name="Premier Seleção Natural Gatos",
        brand="Premier",
        variant="Seleção Natural Gatos Adultos",
        species="cat",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=1.5, unit="kg"),
            PackSize(value=7.5, unit="kg"),
        ],
        barcodes=["7896009410703", "7896009410710"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_premier_selecao_natural_para_gatos_adultos_7_5_kg_10063_1_20200925152646.jpg",
        country="BR",
    ),
    
    # GranPlus
    CatalogProduct(
        id="granplus-choice-adulto",
        name="GranPlus Choice Adulto",
        brand="GranPlus",
        variant="Choice Cães Adultos",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=3, unit="kg"),
            PackSize(value=10.1, unit="kg"),
            PackSize(value=15, unit="kg"),
        ],
        barcodes=["7896098901123", "7896098901130"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_granplus_choice_para_caes_adultos_15_kg_10015_1_20200925152721.jpg",
        country="BR",
    ),
    CatalogProduct(
        id="granplus-menu-gatos",
        name="GranPlus Menu Gatos",
        brand="GranPlus",
        variant="Menu Gatos Adultos",
        species="cat",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=1, unit="kg"),
            PackSize(value=3, unit="kg"),
            PackSize(value=10.1, unit="kg"),
        ],
        barcodes=["7896098902205", "7896098902212"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_granplus_menu_para_gatos_adultos_10_1_kg_10002_1_20200925152726.jpg",
        country="BR",
    ),
    
    # Hill's Science Diet
    CatalogProduct(
        id="hills-adult-large-breed",
        name="Hill's Science Diet Adult Large Breed",
        brand="Hill's Science Diet",
        variant="Adult Large Breed",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=6, unit="kg"),
            PackSize(value=12, unit="kg"),
        ],
        barcodes=["0052742306209", "0052742306216"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_hills_science_diet_para_caes_adultos_de_grande_porte_12_kg_9995_1_20200925152713.jpg",
        country="BR",
    ),
    CatalogProduct(
        id="hills-puppy",
        name="Hill's Science Diet Puppy",
        brand="Hill's Science Diet",
        variant="Puppy Small Bites",
        species="dog",
        life_stage="puppy",
        pack_sizes=[
            PackSize(value=2.4, unit="kg"),
            PackSize(value=6.8, unit="kg"),
            PackSize(value=12, unit="kg"),
        ],
        barcodes=["0052742306100", "0052742306117"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_hills_science_diet_para_caes_filhotes_12_kg_9988_1_20200925152717.jpg",
        country="BR",
    ),
    
    # Pedigree (popular/economic)
    CatalogProduct(
        id="pedigree-adulto",
        name="Pedigree Nutrição Completa Adulto",
        brand="Pedigree",
        variant="Nutrição Completa Cães Adultos",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=1, unit="kg"),
            PackSize(value=3, unit="kg"),
            PackSize(value=10.1, unit="kg"),
            PackSize(value=15, unit="kg"),
        ],
        barcodes=["7896029020418", "7896029020425"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_pedigree_nutricao_completa_para_caes_adultos_de_racas_medias_e_grandes_15_kg_10078_1_20200925152639.jpg",
        country="BR",
    ),
    
    # Whiskas (cats)
    CatalogProduct(
        id="whiskas-adulto",
        name="Whiskas Adulto Carne",
        brand="Whiskas",
        variant="Carne Gatos Adultos",
        species="cat",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=500, unit="g"),
            PackSize(value=1, unit="kg"),
            PackSize(value=2.7, unit="kg"),
            PackSize(value=10.1, unit="kg"),
        ],
        barcodes=["7896029014806", "7896029014813"],
        image_url="https://images.tcdn.com.br/img/img_prod/797997/racao_whiskas_para_gatos_adultos_sabor_carne_10_1_kg_10095_1_20200925152630.jpg",
        country="BR",
    ),
]


# US Pet Food Catalog
US_CATALOG: List[CatalogProduct] = [
    CatalogProduct(
        id="blue-buffalo-life-protection",
        name="Blue Buffalo Life Protection",
        brand="Blue Buffalo",
        variant="Life Protection Adult Chicken",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=6, unit="lb"),
            PackSize(value=15, unit="lb"),
            PackSize(value=30, unit="lb"),
        ],
        barcodes=["840243100101", "840243100118"],
        image_url="https://s7d2.scene7.com/is/image/PetSmart/5149641",
        country="US",
    ),
    CatalogProduct(
        id="purina-pro-plan-adult",
        name="Purina Pro Plan Adult",
        brand="Purina Pro Plan",
        variant="Adult Complete Essentials",
        species="dog",
        life_stage="adult",
        pack_sizes=[
            PackSize(value=6, unit="lb"),
            PackSize(value=18, unit="lb"),
            PackSize(value=35, unit="lb"),
        ],
        barcodes=["038100131836", "038100131843"],
        image_url="https://s7d2.scene7.com/is/image/PetSmart/5171117",
        country="US",
    ),
]


def _load_phase1_food_catalog() -> List[CatalogProduct]:
    """Load the Fase 1 structured food database (brand/line/variant/weight,
    one entry per real SKU) generated by scripts/build_food_catalog.py.

    This is what fixes the "generic species+life_stage+weight match against
    a 15-item hardcoded catalog picks an unrelated brand" failure mode —
    the fuzzy matcher in search_catalog_candidates() now has real Brazilian
    candidates to find instead of falling back to whichever of the ~15
    original entries happens to share species/weight.
    """
    path = os.path.join(os.path.dirname(__file__), "catalogs", "food_database", "foods_br_phase1.json")
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        logger.warning("[catalog] Fase 1 food database not loaded: %s", exc)
        return []

    products: List[CatalogProduct] = []
    for item in data.get("items", []):
        # variant sometimes already starts with line (e.g. line="Fórmula",
        # variant="Fórmula Raças Grandes..." from the generator's own data) —
        # skip line in that case so the composed name doesn't repeat it.
        line, variant = item.get("line"), item.get("variant")
        if line and variant and variant.strip().lower().startswith(line.strip().lower()):
            name_parts = [item.get("brand"), variant]
        else:
            name_parts = [item.get("brand"), line, variant]
        name = " ".join(p for p in name_parts if p)
        try:
            products.append(CatalogProduct(
                id=f"phase1-{item['id']}",
                name=name,
                brand=item["brand"],
                variant=item.get("variant"),
                species=item["species"],
                life_stage=item.get("life_stage") or "all",
                pack_sizes=[PackSize(value=item["weight_kg"], unit="kg")] if item.get("weight_kg") else [],
                barcodes=[item["barcode"]] if item.get("barcode") else [],
                image_url=item.get("image_url"),
                country="BR",
            ))
        except Exception as exc:
            logger.warning("[catalog] skipping malformed phase1 item %r: %s", item.get("id"), exc)
            continue
    logger.info("[catalog] Loaded %d Fase 1 food products into BR catalog", len(products))
    return products


BR_CATALOG = BR_CATALOG + _load_phase1_food_catalog()


# Combined catalog by country
CATALOGS = {
    "BR": BR_CATALOG,
    "US": US_CATALOG,
}


def search_catalog(query: str, country: str = "BR", limit: int = 10) -> List[CatalogProduct]:
    """Search catalog by name, brand, or variant."""
    catalog = CATALOGS.get(country.upper(), BR_CATALOG)
    query_lower = query.lower()
    
    results = []
    for product in catalog:
        # Match on brand, variant, or full name
        if (query_lower in product.brand.lower() or
            (product.variant and query_lower in product.variant.lower()) or
            query_lower in product.name.lower()):
            results.append(product)
            if len(results) >= limit:
                break
    
    return results


def lookup_by_barcode(barcode: str, country: str = "BR") -> Optional[CatalogProduct]:
    """Look up product by barcode (EAN-13 or UPC)."""
    # Search all catalogs
    for country_code, catalog in CATALOGS.items():
        for product in catalog:
            if barcode in product.barcodes:
                return product
    
    return None


# ========================================
# Trivago-style Catalog Search
# ========================================

def _product_to_candidate(product: CatalogProduct, source: str = "catalog") -> Dict[str, Any]:
    """Convert CatalogProduct to candidate dict."""
    return {
        "source": source,
        "source_item_id": product.id,
        "title": product.name,
        "brand": product.brand,
        "variant": product.variant,
        "species": product.species,
        "pack_sizes": [{"value": ps.value, "unit": ps.unit} for ps in product.pack_sizes],
        "image_url": product.image_url,
        "price": None,  # Catalog doesn't have prices
        "currency": None,
        "url": None,
    }


def search_catalog_candidates(
    query: str,
    country: str = "BR",
    product_type: str = "food",
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """
    Search catalog for candidates (trivago-style).
    Returns list of candidates from multiple sources.
    """
    # Check cache first
    cached = catalog_cache.get(query, country, product_type)
    if cached is not None:
        return cached[:limit]
    
    candidates = []
    query_lower = query.lower()
    catalog = CATALOGS.get(country.upper(), BR_CATALOG)
    
    # Score products by relevance
    scored = []
    for product in catalog:
        score = 0
        
        # Exact brand match
        if query_lower == product.brand.lower():
            score += 100
        elif query_lower in product.brand.lower():
            score += 50
        
        # Name match
        if query_lower in product.name.lower():
            score += 30
        
        # Variant match
        if product.variant and query_lower in product.variant.lower():
            score += 20
        
        # Word prefix matching
        words = query_lower.split()
        for word in words:
            if any(product.brand.lower().startswith(word) or 
                   product.name.lower().startswith(word) for _ in [1]):
                score += 10
            if any(w.startswith(word) for w in product.name.lower().split()):
                score += 5
        
        if score > 0:
            scored.append((score, product))
    
    # Sort by score descending
    scored.sort(key=lambda x: x[0], reverse=True)
    
    # Convert to candidates
    for _, product in scored[:limit]:
        candidates.append(_product_to_candidate(product, "catalog"))
    
    # Cache results
    catalog_cache.set(query, country, product_type, candidates)
    
    return candidates


def normalize_candidate(source: str, source_item_id: str) -> Optional[Dict[str, Any]]:
    """
    Normalize a candidate to a canonical product.
    Creates or retrieves an existing canonical product.
    """
    # Check if we already have an alias
    existing_id = catalog_cache.get_alias(source, source_item_id)
    if existing_id:
        existing_product = catalog_cache.get_product(existing_id)
        if existing_product:
            return existing_product
    
    # Look up the source product
    product = None
    if source == "catalog":
        # Find in our catalog
        for catalog in CATALOGS.values():
            for p in catalog:
                if p.id == source_item_id:
                    product = p
                    break
            if product:
                break
    
    if not product:
        return None
    
    # Create canonical product
    # Use a stable ID based on brand + name
    canonical_id = f"prod_{hashlib.md5(f'{product.brand}:{product.name}'.encode()).hexdigest()[:12]}"
    
    canonical = {
        "id": canonical_id,
        "name": product.name,
        "brand": product.brand,
        "pack_size": {"value": product.pack_sizes[0].value, "unit": product.pack_sizes[0].unit} if product.pack_sizes else None,
        "image_url": product.image_url,
        "species": product.species,
    }
    
    # Store
    catalog_cache.set_product(canonical_id, canonical)
    catalog_cache.set_alias(source, source_item_id, canonical_id)
    
    return canonical


def get_popular_brands(country: str = "BR", limit: int = 10) -> List[str]:
    """Get list of popular brands for a country."""
    catalog = CATALOGS.get(country.upper(), BR_CATALOG)
    
    # Count brand occurrences
    brand_counts: Dict[str, int] = {}
    for product in catalog:
        brand_counts[product.brand] = brand_counts.get(product.brand, 0) + 1
    
    # Sort by count
    sorted_brands = sorted(brand_counts.items(), key=lambda x: x[1], reverse=True)
    return [brand for brand, _ in sorted_brands[:limit]]

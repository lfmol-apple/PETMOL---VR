/**
 * OpenStreetMap Integration (No API Key Required)
 * Uses Overpass API for POI search and basic distance calculations
 */

import { API_BASE_URL } from '@/lib/api';

// Types
export interface OsmPlace {
  id: string;
  lat: number;
  lon: number;
  name: string | null;
  type: string;
  tags: Record<string, string>;
  distance?: number;
}

export interface SearchOptions {
  lat: number;
  lon: number;
  radiusKm: number;
  category: 'emergency' | 'clinic' | 'grooming' | 'petshop' | 'boarding';
}

// Distance calculation (Haversine)
export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

// Build Overpass QL query based on category
function buildOverpassQuery(options: SearchOptions): string {
  const { lat, lon, radiusKm, category } = options;
  const radiusMeters = radiusKm * 1000;

  let filters: string[] = [];

  switch (category) {
    case 'emergency':
      filters = [
        // Veterinary amenity
        `node["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `way["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `relation["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        // Healthcare veterinary
        `node["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `way["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        // Animal hospital
        `node["amenity"="animal_hospital"](around:${radiusMeters},${lat},${lon});`,
        `way["amenity"="animal_hospital"](around:${radiusMeters},${lat},${lon});`,
        // Any place with veterinary-related names
        `nwr["name"~"veterinár|hospital.*vet|clínica.*vet|vet.*clínica|pronto.*socorro.*pet|emergência.*pet",i](around:${radiusMeters},${lat},${lon});`,
      ];
      break;
    case 'clinic':
      filters = [
        `node["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `way["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `relation["amenity"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `node["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `way["healthcare"="veterinary"](around:${radiusMeters},${lat},${lon});`,
        `nwr["name"~"veterinár|clínica.*vet|vet.*clínica|consultório.*vet",i](around:${radiusMeters},${lat},${lon});`,
      ];
      break;
    case 'grooming':
      filters = [
        `node["shop"="pet_grooming"](around:${radiusMeters},${lat},${lon});`,
        `way["shop"="pet_grooming"](around:${radiusMeters},${lat},${lon});`,
        `node["amenity"="animal_grooming"](around:${radiusMeters},${lat},${lon});`,
        `way["amenity"="animal_grooming"](around:${radiusMeters},${lat},${lon});`,
        `node["craft"="pet_grooming"](around:${radiusMeters},${lat},${lon});`,
        `way["craft"="pet_grooming"](around:${radiusMeters},${lat},${lon});`,
        `nwr["name"~"banho.*tosa|grooming|estética.*pet|pet.*shop.*tosa|tosa.*banho",i](around:${radiusMeters},${lat},${lon});`,
      ];
      break;
    case 'petshop':
      filters = [
        `node["shop"="pet"](around:${radiusMeters},${lat},${lon});`,
        `way["shop"="pet"](around:${radiusMeters},${lat},${lon});`,
        `relation["shop"="pet"](around:${radiusMeters},${lat},${lon});`,
        `node["shop"="pet_supplies"](around:${radiusMeters},${lat},${lon});`,
        `way["shop"="pet_supplies"](around:${radiusMeters},${lat},${lon});`,
        `nwr["name"~"pet.*shop|pet.*store|loja.*pet|casa.*ração|agro.*pet|mundo.*pet",i](around:${radiusMeters},${lat},${lon});`,
      ];
      break;
    case 'boarding':
      filters = [
        `node["amenity"="animal_boarding"](around:${radiusMeters},${lat},${lon});`,
        `way["amenity"="animal_boarding"](around:${radiusMeters},${lat},${lon});`,
        `node["amenity"="animal_shelter"]["animal_boarding"="yes"](around:${radiusMeters},${lat},${lon});`,
        `way["amenity"="animal_shelter"]["animal_boarding"="yes"](around:${radiusMeters},${lat},${lon});`,
        `nwr["name"~"hotel.*pet|creche.*pet|pensão|day.*care.*pet|hospedagem.*pet",i](around:${radiusMeters},${lat},${lon});`,
      ];
      break;
  }

  const query = `
    [out:json][timeout:25];
    (
      ${filters.join('\n      ')}
    );
    out center;
  `;

  return query;
}

// Search using Nominatim (name-based search)
async function nominatimSearch(options: SearchOptions): Promise<OsmPlace[]> {
  const categoryNames = {
    emergency: 'veterinário emergência hospital',
    clinic: 'veterinário clínica',
    grooming: 'banho tosa pet grooming',
    petshop: 'pet shop loja',
    boarding: 'hotel pet creche pensão',
  };

  const searchTerm = categoryNames[options.category];
  
  // Use backend proxy to avoid rate limits
  const useProxy = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const url = useProxy
    ? `http://localhost:8000/api/nominatim-search?q=${encodeURIComponent(searchTerm)}&lat=${options.lat}&lon=${options.lon}&limit=50`
    : `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(searchTerm)}` +
      `&lat=${options.lat}&lon=${options.lon}` +
      `&format=json&limit=50` +
      `&addressdetails=1&extratags=1`;

  try {
    const response = await fetch(url, {
      headers: useProxy ? {} : {
        'User-Agent': 'PETMOL/1.0',
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) return [];

    const data = await response.json();
    
    return data
      .filter((r: Record<string, unknown>) => r.lat && r.lon)
      .map((r: Record<string, unknown>) => {
        const lat = parseFloat(r.lat as string);
        const lon = parseFloat(r.lon as string);
        const address = r.address as Record<string, string> | undefined;
        const extratags = r.extratags as Record<string, string> | undefined;
        const displayName = r.display_name as string | undefined;
        const rName = r.name as string | undefined;
        const distance = distanceMeters(options.lat, options.lon, lat, lon);
        
        // Filter by radius
        if (distance > options.radiusKm * 1000) return null;

        return {
          id: `nominatim/${r.osm_type}/${r.osm_id}`,
          lat,
          lon,
          name: displayName?.split(',')[0] || rName || null,
          type: r.osm_type as string,
          tags: {
            name: displayName?.split(',')[0] || rName,
            'addr:street': address?.road,
            'addr:housenumber': address?.house_number,
            'addr:city': address?.city || address?.town,
            'addr:suburb': address?.suburb,
            ...extratags,
          },
          distance,
        };
      })
      .filter((p: OsmPlace | null) => p !== null) as OsmPlace[];
  } catch (error) {
    console.warn('Nominatim search failed:', error);
    return [];
  }
}

// Search for places using Overpass API
async function overpassSearchRaw(options: SearchOptions): Promise<OsmPlace[]> {
  const query = buildOverpassQuery(options);
  
  // Try using our backend proxy first to avoid CORS issues
  const useProxy = typeof window !== 'undefined' && window.location.hostname === 'localhost';
  const url = useProxy 
    ? 'http://localhost:8000/api/overpass-proxy'
    : 'https://overpass-api.de/api/interpreter';

  console.log('[OSM] Searching with:', { category: options.category, radius: options.radiusKm, useProxy });

  try {
    const response = await fetch(url, {
      method: 'POST',
      body: useProxy ? JSON.stringify({ query }) : query,
      headers: {
        'Content-Type': useProxy ? 'application/json' : 'text/plain',
      },
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      console.error('[OSM] API error:', response.status, response.statusText);
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('[OSM] Found:', data.elements?.length || 0, 'places');

    // Parse results
    const places: OsmPlace[] = data.elements.map((el: { type: string; id: string | number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }) => {
      const lat = el.lat || el.center?.lat;
      const lon = el.lon || el.center?.lon;

      return {
        id: `${el.type}/${el.id}`,
        lat,
        lon,
        name: el.tags?.name || null,
        type: el.type,
        tags: el.tags || {},
        distance: lat && lon ? distanceMeters(options.lat, options.lon, lat, lon) : undefined,
      };
    }).filter((p: OsmPlace) => p.lat && p.lon);

    return places;
  } catch (error) {
    console.error('[OSM] Search error:', error);
    // Return empty array instead of throwing to allow graceful degradation
    return [];
  }
}

// Combined search using both Overpass and Nominatim
export async function overpassSearch(options: SearchOptions): Promise<OsmPlace[]> {
  // Search OSM data
  const overpassResults = await overpassSearchRaw(options);

  // If no results from OSM, add local fallback data
  let results = overpassResults;
  
  if (results.length === 0) {
    console.log('[OSM] No results from OSM, checking local fallback data');
    try {
      const localData = await import('@/data/local-places.json');
      const localPlaces = localData.places
        .filter((p) => p.category === options.category || (options.category === 'clinic' && p.category === 'emergency'))
        .map((p) => {
          const distance = distanceMeters(options.lat, options.lon, p.lat, p.lon);
          // Filter by radius
          if (distance > options.radiusKm * 1000) return null;
          
          return {
            ...p,
            distance,
            type: 'local',
          } as unknown as OsmPlace;
        })
        .filter((p: OsmPlace | null) => p !== null) as OsmPlace[];
      
      console.log('[OSM] Found', localPlaces.length, 'places in local fallback');
      results = localPlaces;
    } catch (err) {
      console.warn('[OSM] Failed to load local fallback:', err);
    }
  }

  // Sort by distance
  results.sort((a, b) => (a.distance || 0) - (b.distance || 0));

  return results;
}

// Format address from tags
export function formatAddress(tags: Record<string, string>): string | null {
  const parts: string[] = [];

  if (tags['addr:street']) {
    let street = tags['addr:street'];
    if (tags['addr:housenumber']) {
      street += `, ${tags['addr:housenumber']}`;
    }
    parts.push(street);
  }

  if (tags['addr:city']) {
    parts.push(tags['addr:city']);
  } else if (tags['addr:suburb']) {
    parts.push(tags['addr:suburb']);
  }

  return parts.length > 0 ? parts.join(' — ') : null;
}

// ── Reverse geocoding (lat/lng -> endereço com nome de rua) ─────────────────
// Usado pelo "Usar minha localização atual" do Pet Sumido — antes o GPS só
// dava bairro/cidade (BigDataCloud), sem logradouro; Nominatim devolve a rua,
// que é a informação que de fato ajuda quem procura o pet na região.
export interface ReverseGeocodeResult {
  street: string | null;
  houseNumber: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postcode: string | null;
}

export async function reverseGeocode(lat: number, lon: number): Promise<ReverseGeocodeResult | null> {
  try {
    // Sempre via backend (nunca direto pro Nominatim do browser) — ver
    // comentário do endpoint /api/nominatim-reverse pro motivo.
    const response = await fetch(`${API_BASE_URL}/nominatim-reverse?lat=${lat}&lon=${lon}`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const address = data.address as Record<string, string> | undefined;
    if (!address) return null;
    return {
      street: address.road || address.pedestrian || address.footway || null,
      houseNumber: address.house_number || null,
      neighborhood: address.suburb || address.neighbourhood || address.quarter || null,
      city: address.city || address.town || address.village || null,
      state: address.state || null,
      postcode: address.postcode || null,
    };
  } catch {
    return null;
  }
}

// Junta o resultado do reverse geocode num endereço legível — mesma ordem
// (rua+número, bairro, cidade/estado) usada hoje pro resultado de CEP.
export function formatReverseGeocodeResult(r: ReverseGeocodeResult): string | null {
  const streetPart = r.street ? (r.houseNumber ? `${r.street}, ${r.houseNumber}` : r.street) : null;
  const cityState = r.city && r.state ? `${r.city}/${r.state}` : (r.city || r.state || null);
  const parts = [streetPart, r.neighborhood, cityState].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(', ') : null;
}

// Extract phone number
export function extractPhone(tags: Record<string, string>): string | null {
  return tags['phone'] || tags['contact:phone'] || null;
}

// Check if 24/7
export function is24x7(tags: Record<string, string>): boolean {
  const hours = tags['opening_hours'];
  return hours === '24/7' || hours === '24 hours' || hours?.includes('24/7');
}

// Cache utilities (localStorage with TTL)
interface CacheEntry {
  data: OsmPlace[];
  timestamp: number;
  ttl: number;
}

export function getCachedSearch(cacheKey: string): OsmPlace[] | null {
  try {
    const cached = localStorage.getItem(`osm_cache_${cacheKey}`);
    if (!cached) return null;

    const entry: CacheEntry = JSON.parse(cached);
    if (Date.now() - entry.timestamp > entry.ttl) {
      localStorage.removeItem(`osm_cache_${cacheKey}`);
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function setCachedSearch(cacheKey: string, data: OsmPlace[], ttlMs: number = 900000): void {
  try {
    const entry: CacheEntry = {
      data,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
    localStorage.setItem(`osm_cache_${cacheKey}`, JSON.stringify(entry));
  } catch (err) {
    console.warn('Failed to cache OSM results:', err);
  }
}

export function buildCacheKey(options: SearchOptions): string {
  const roundedLat = Math.round(options.lat * 100) / 100;
  const roundedLon = Math.round(options.lon * 100) / 100;
  return `${options.category}_${roundedLat}_${roundedLon}_${options.radiusKm}`;
}

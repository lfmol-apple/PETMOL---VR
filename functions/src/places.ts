/**
 * PETMOL Cloud Functions - Places API Proxy
 * 
 * Este arquivo contém as functions para busca de serviços pet usando
 * Google Places API (New) com caching agressivo e economia máxima.
 * 
 * REGRAS DE OURO:
 * 1. Zero chamadas diretas do frontend ao Google
 * 2. Cache 30 dias por geohash
 * 3. Contato (telefone/website) apenas on-demand
 * 4. Parceiros sempre no topo
 */

import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { geohashForLocation, distanceBetween } from 'geofire-common';
import fetch from 'node-fetch';

const db = admin.firestore();

// Config
const runtimeConfig = (functions as unknown as { config: () => { google?: { places_key?: string } } }).config();
const GOOGLE_PLACES_API_KEY = runtimeConfig.google?.places_key || process.env.GOOGLE_PLACES_API_KEY;
const CACHE_TTL_DAYS = 30;
const GEOHASH_PRECISION = 6; // ~1.2km precision
const DEFAULT_RADIUS = 5000;
const MIN_RADIUS = 1500;
const MAX_RADIUS = 15000;

// Types
interface PlaceItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
  isPartner: boolean;
  distanceMeters: number;
  partnerLevel?: number;
}

// Service type mapping
const SERVICE_TYPE_MAP: Record<string, string[]> = {
  'emergencia': ['veterinary_care'],
  'emergency': ['veterinary_care'],
  'vet_emergency': ['veterinary_care'],
  'banho_tosa': ['pet_store'],
  'grooming': ['pet_store'],
  'petshop': ['pet_store'],
  'hotel': ['pet_store'],
  'boarding': ['pet_store'],
  'vet_clinic': ['veterinary_care'],
  'clinic': ['veterinary_care'],
  'trainer': ['pet_store']
};

/**
 * buscarPetServices - Busca de serviços com cache
 */
export const buscarPetServices = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const lat = parseFloat(req.query.lat as string);
    const lng = parseFloat(req.query.lng as string);
    let radius = parseInt(req.query.radius as string) || DEFAULT_RADIUS;
    const service = (req.query.service as string) || 'petshop';

    if (isNaN(lat) || isNaN(lng)) {
      res.status(400).json({ error: 'Invalid lat/lng' });
      return;
    }

    radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, radius));
    const geohash = geohashForLocation([lat, lng], GEOHASH_PRECISION);
    const cacheKey = `${service}:${radius}:${geohash}`;

    console.log(`[buscarPetServices] ${cacheKey}`);

    // 1. Buscar parceiros
    const partners: PlaceItem[] = [];
    try {
      const partnersSnap = await db.collection('partners')
        .where('service_type', '==', service)
        .where('is_active', '==', true)
        .get();

      for (const doc of partnersSnap.docs) {
        const data = doc.data();
        if (data.lat && data.lng) {
          const distance = distanceBetween([lat, lng], [data.lat, data.lng]) * 1000;
          if (distance <= radius) {
            partners.push({
              id: data.google_place_id || doc.id,
              name: data.name,
              lat: data.lat,
              lng: data.lng,
              rating: data.rating,
              userRatingCount: data.rating_count,
              businessStatus: 'OPERATIONAL',
              isPartner: true,
              distanceMeters: Math.round(distance),
              partnerLevel: data.partner_level || 1
            });
          }
        }
      }

      partners.sort((a, b) => {
        const levelDiff = (b.partnerLevel || 0) - (a.partnerLevel || 0);
        return levelDiff !== 0 ? levelDiff : a.distanceMeters - b.distanceMeters;
      });
    } catch (err) {
      console.error('[partners]', err);
    }

    // 2. Check cache
    let googlePlaces: PlaceItem[] = [];
    let cacheHit = false;

    try {
      const cacheDoc = await db.collection('places_cache').doc(cacheKey).get();
      
      if (cacheDoc.exists) {
        const cacheData: any = cacheDoc.data();
        const now = admin.firestore.Timestamp.now();
        const cacheAge = (now.seconds - cacheData.updatedAt.seconds) / 86400;

        if (cacheAge < CACHE_TTL_DAYS) {
          cacheHit = true;
          googlePlaces = cacheData.places || [];
          console.log(`[cache] HIT (${cacheAge.toFixed(1)}d)`);
        }
      }
    } catch (err) {
      console.error('[cache]', err);
    }

    // 3. Call Google if cache miss
    if (!cacheHit && GOOGLE_PLACES_API_KEY) {
      try {
        const types = SERVICE_TYPE_MAP[service] || ['pet_store'];
        
        console.log(`[google] MISS - calling API`);

        const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.businessStatus'
          },
          body: JSON.stringify({
            locationRestriction: {
              circle: {
                center: { latitude: lat, longitude: lng },
                radius: radius
              }
            },
            includedTypes: types,
            languageCode: 'pt-BR',
            regionCode: 'BR',
            maxResultCount: 20
          })
        });

        if (response.ok) {
          const data: any = await response.json();
          const places = data.places || [];

          googlePlaces = places.map((p: any) => {
            const placeLat = p.location?.latitude || 0;
            const placeLng = p.location?.longitude || 0;
            const distance = distanceBetween([lat, lng], [placeLat, placeLng]) * 1000;

            return {
              id: p.id,
              name: p.displayName?.text || 'Sem nome',
              lat: placeLat,
              lng: placeLng,
              rating: p.rating,
              userRatingCount: p.userRatingCount,
              businessStatus: p.businessStatus,
              isPartner: false,
              distanceMeters: Math.round(distance)
            };
          });

          console.log(`[google] ${googlePlaces.length} places`);

          await db.collection('places_cache').doc(cacheKey).set({
            updatedAt: admin.firestore.Timestamp.now(),
            center: { lat, lng },
            radius,
            service,
            places: googlePlaces,
            source: 'google'
          });
        } else {
          const errorText = await response.text();
          console.error(`[google] error: ${response.status} - ${errorText}`);
        }
      } catch (err) {
        console.error('[google] exception:', err);
      }
    }

    // 4. Merge
    const partnerIds = new Set(partners.map(p => p.id));
    const filteredGoogle = googlePlaces.filter(gp => !partnerIds.has(gp.id));
    const results = [...partners, ...filteredGoogle];

    res.json({
      meta: {
        cache: cacheHit ? 'hit' : 'miss',
        googleCount: googlePlaces.length,
        partnerCount: partners.length,
        totalCount: results.length,
        radius,
        geohash
      },
      results
    });

  } catch (error) {
    console.error('[buscarPetServices]', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * getPlaceContact - Busca contato on-demand
 */
export const getPlaceContact = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const placeId = req.query.id as string;

    if (!placeId) {
      res.status(400).json({ error: 'Missing id' });
      return;
    }

    // Check cache
    const cacheKey = `contact_${placeId}`;
    const cacheDoc = await db.collection('place_contact_cache').doc(cacheKey).get();
    
    if (cacheDoc.exists) {
      const cacheData: any = cacheDoc.data();
      const now = admin.firestore.Timestamp.now();
      const cacheAge = (now.seconds - (cacheData?.updatedAt?.seconds || 0)) / 86400;

      if (cacheAge < CACHE_TTL_DAYS) {
        console.log(`[getPlaceContact] cache hit ${placeId}`);
        res.json({
          id: placeId,
          nationalPhoneNumber: cacheData?.phone,
          websiteUri: cacheData?.website,
          cached: true
        });
        return;
      }
    }

    // Call Google
    if (!GOOGLE_PLACES_API_KEY) {
      res.status(503).json({ error: 'API key not configured' });
      return;
    }

    const response = await fetch(`https://places.googleapis.com/v1/${placeId}`, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_PLACES_API_KEY,
        'X-Goog-FieldMask': 'nationalPhoneNumber,websiteUri'
      }
    });

    if (!response.ok) {
      console.error(`[getPlaceContact] error: ${response.status}`);
      res.status(response.status).json({ error: 'Failed' });
      return;
    }

    const data: any = await response.json();

    const result = {
      id: placeId,
      nationalPhoneNumber: data.nationalPhoneNumber,
      websiteUri: data.websiteUri,
      cached: false
    };

    await db.collection('place_contact_cache').doc(cacheKey).set({
      updatedAt: admin.firestore.Timestamp.now(),
      phone: data.nationalPhoneNumber,
      website: data.websiteUri
    });

    console.log(`[getPlaceContact] success ${placeId}`);
    res.json(result);

  } catch (error) {
    console.error('[getPlaceContact]', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

/**
 * logClick - Analytics
 */
export const logClick = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  try {
    const { placeId, isPartner, action, service, lat, lng } = req.body;

    if (!placeId || !action) {
      res.status(400).json({ error: 'Missing data' });
      return;
    }

    await db.collection('analytics_clicks').add({
      placeId,
      isPartner: isPartner || false,
      action,
      service: service || 'unknown',
      lat: lat || null,
      lng: lng || null,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      ip: req.ip || 'unknown'
    });

    console.log(`[logClick] ${action} for ${placeId}`);
    res.json({ success: true });

  } catch (error) {
    console.error('[logClick]', error);
    res.status(500).json({ error: 'Internal error' });
  }
});

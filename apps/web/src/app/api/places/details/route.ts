import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Kill switch global — PLACES_ENABLED=false por padrão (custo zero)
const PLACES_ENABLED = process.env.PLACES_ENABLED === 'true';

// IMPORTANTE: usar GOOGLE_PLACES_API_KEY (server-only, nunca NEXT_PUBLIC_)
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

// ── Cache em memória: place_id → {result, expiresAt} ────────────────────────
const cacheDetails = new Map<string, { result: unknown; expiresAt: number }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function GET(request: NextRequest) {
  // Kill switch: retorna null sem chamar Google
  if (!PLACES_ENABLED) {
    return NextResponse.json({ result: null, disabled: true, message: 'Busca de locais desativada.' });
  }

  try {
    const place_id = request.nextUrl.searchParams.get('place_id');

    if (!place_id) {
      return NextResponse.json({ error: 'place_id é obrigatório' }, { status: 400 });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return NextResponse.json({ result: null, status: 'DISABLED' });
    }

    // Cache HIT
    const cached = cacheDetails.get(place_id);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ result: cached.result, status: 'OK', cached: true });
    }

    // Place Details — campos mínimos (sem reviews, sem photos)
    const url = new URL('https://maps.googleapis.com/maps/api/place/details/json');
    url.searchParams.append('place_id', place_id);
    url.searchParams.append('fields', 'name,formatted_address,formatted_phone_number,website,rating,place_id');
    url.searchParams.append('key', GOOGLE_PLACES_API_KEY);
    url.searchParams.append('language', 'pt-BR');

    const response = await fetch(url.toString());
    const data = await response.json();

    if (!response.ok || data.status !== 'OK') {
      console.error('[places/details] Erro:', data.status, data.error_message);
      return NextResponse.json({ result: null, status: data.status, error: data.error_message });
    }

    const result = {
      place_id: data.result.place_id,
      name: data.result.name,
      formatted_address: data.result.formatted_address,
      formatted_phone_number: data.result.formatted_phone_number ?? null,
      website: data.result.website ?? null,
      rating: data.result.rating ?? null,
    };

    cacheDetails.set(place_id, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ result, status: 'OK' });

  } catch (error) {
    console.error('[places/details] Erro:', error);
    return NextResponse.json({ error: 'Erro ao buscar detalhes', result: null }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';

interface GoogleTextSearchResult {
  place_id: string;
  name: string;
  formatted_address: string;
  rating?: number | null;
}

export const dynamic = 'force-dynamic';

// Kill switch global — PLACES_ENABLED=false por padrão (custo zero)
const PLACES_ENABLED = process.env.PLACES_ENABLED === 'true';

// IMPORTANTE: usar GOOGLE_PLACES_API_KEY (server-only, nunca NEXT_PUBLIC_)
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';

// ── Cache em memória: query → {results, expiresAt} ──────────────────────────
const cacheSearch = new Map<string, { results: unknown[]; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min

export async function GET(request: NextRequest) {
  // Kill switch: retorna vazio sem chamar Google
  if (!PLACES_ENABLED) {
    return NextResponse.json({ results: [], disabled: true, message: 'Busca de locais desativada.' });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('query');

    if (!query) {
      return NextResponse.json({ error: 'Query é obrigatório' }, { status: 400 });
    }

    if (!GOOGLE_PLACES_API_KEY) {
      return NextResponse.json({ results: [], status: 'DISABLED' });
    }

    // Cache HIT
    const cached = cacheSearch.get(query);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json({ results: cached.results, status: 'OK', cached: true });
    }

    // Text Search — 1 única chamada, sem details
    const url = new URL('https://maps.googleapis.com/maps/api/place/textsearch/json');
    url.searchParams.append('query', `${query} petshop banho tosa`);
    url.searchParams.append('key', GOOGLE_PLACES_API_KEY);
    url.searchParams.append('language', 'pt-BR');
    url.searchParams.append('region', 'BR');

    const response = await fetch(url.toString());
    const data = (await response.json()) as {
      status: string;
      error_message?: string;
      results: GoogleTextSearchResult[];
    };

    if (!response.ok || data.status !== 'OK') {
      console.error('[places/search] Erro:', data.status, data.error_message);
      return NextResponse.json({ results: [], status: data.status, error: data.error_message });
    }

    // Retorna apenas campos leves (sem details extras)
    const results = data.results.slice(0, 5).map((place) => ({
      place_id: place.place_id,
      name: place.name,
      formatted_address: place.formatted_address,
      rating: place.rating ?? null,
    }));

    cacheSearch.set(query, { results, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json({ results, status: 'OK' });

  } catch (error) {
    console.error('[places/search] Erro:', error);
    return NextResponse.json({ error: 'Erro ao buscar estabelecimentos', results: [] }, { status: 500 });
  }
}

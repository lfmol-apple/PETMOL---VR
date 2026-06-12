import { NextRequest, NextResponse } from 'next/server';

// ── Cosmos API types ──────────────────────────────────────────────────────────

interface CosmosGtinResponse {
  description?: string;
  gtin?: string;
  brand?: { name?: string } | string;
  thumbnail?: string;
  avg_price?: { image?: string };
  extra_data?: {
    net_weight?: string | number;
    gross_weight?: string | number;
  };
}

// ── Cosmos caller ─────────────────────────────────────────────────────────────

async function callCosmos(
  barcode: string,
  token: string,
): Promise<CosmosGtinResponse | null> {
  const res = await fetch(
    `https://api.cosmos.bluesoft.com.br/gtins/${encodeURIComponent(barcode)}`,
    {
      headers: {
        'X-Cosmos-Token': token,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'petmol/1.0',
      },
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!res.ok) return null;
  return (await res.json()) as CosmosGtinResponse;
}

function extractBrand(brand?: CosmosGtinResponse['brand']): string | undefined {
  if (!brand) return undefined;
  if (typeof brand === 'string') return brand;
  return brand.name;
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const barcode = searchParams.get('barcode');
  const src = searchParams.get('src');

  // Validate barcode format (EAN-8 to EAN-14)
  if (!barcode || !/^\d{8,14}$/.test(barcode)) {
    return NextResponse.json({ error: 'invalid_barcode' }, { status: 400 });
  }

  if (src === 'cosmos') {
    const token = process.env.COSMOS_TOKEN;
    if (!token) {
      // Cosmos not configured — caller falls through to global APIs
      return NextResponse.json({ error: 'cosmos_not_configured' }, { status: 503 });
    }

    try {
      const data = await callCosmos(barcode, token);
      if (!data?.description) {
        return NextResponse.json({ error: 'not_found' }, { status: 404 });
      }

      const weight =
        data.extra_data?.net_weight
          ? `${data.extra_data.net_weight}g`
          : undefined;

      return NextResponse.json({
        name: data.description,
        brand: extractBrand(data.brand),
        image: data.thumbnail ?? data.avg_price?.image,
        weight,
      });
    } catch (err) {
      const isTimeout = err instanceof Error && err.name === 'TimeoutError';
      return NextResponse.json(
        { error: isTimeout ? 'upstream_timeout' : 'upstream_error' },
        { status: 502 },
      );
    }
  }

  return NextResponse.json({ error: 'unknown_source' }, { status: 400 });
}

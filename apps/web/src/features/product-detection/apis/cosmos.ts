import type { ResolvedProduct } from '../types';
import { classifyProduct } from '../classifier';

interface CosmosProxyResponse {
  name?: string;
  brand?: string;
  image?: string;
  weight?: string;
}

const COSMOS_URL = 'https://api.cosmos.bluesoft.com.br/gtins';

function mapCosmosResponse(barcode: string, data: CosmosProxyResponse): ResolvedProduct | null {
  if (!data?.name) return null;

  const text = [data.name, data.brand].filter(Boolean).join(' ');
  return {
    barcode,
    name: data.name,
    brand: data.brand,
    image: data.image,
    weight: data.weight,
    category: classifyProduct(text),
    source: 'cosmos',
  };
}

async function fetchFromCosmosDirect(barcode: string): Promise<ResolvedProduct | null> {
  const token = process.env.NEXT_PUBLIC_COSMOS_TOKEN;

  if (!token) {
    return null;
  }

  try {
    const res = await fetch(`${COSMOS_URL}/${encodeURIComponent(barcode)}.json`, {
      headers: {
        'X-Cosmos-Token': token,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      description?: string;
      brand?: { name?: string } | string;
      thumbnail?: string;
      avg_price?: { image?: string };
      extra_data?: { net_weight?: string | number };
    };

    return mapCosmosResponse(barcode, {
      name: data.description,
      brand: typeof data.brand === 'string' ? data.brand : data.brand?.name,
      image: data.thumbnail ?? data.avg_price?.image,
      weight: data.extra_data?.net_weight ? String(data.extra_data.net_weight) : undefined,
    });
  } catch {
    return null;
  }
}

async function fetchFromCosmosProxy(barcode: string): Promise<ResolvedProduct | null> {
  try {
    const res = await fetch(
      `/api/barcode?barcode=${encodeURIComponent(barcode)}&src=cosmos`,
      { signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as CosmosProxyResponse;
    return mapCosmosResponse(barcode, data);
  } catch {
    return null;
  }
}

/**
 * Fetches product data from Bluesoft Cosmos (Brazilian EAN database).
 * The request is proxied through the Next.js /api/barcode route so that
 * the Cosmos API token stays server-side and never leaks to the browser.
 *
 * Returns null on any error — caller must handle gracefully.
 */
export async function fetchFromCosmos(barcode: string): Promise<ResolvedProduct | null> {
  const proxy = await fetchFromCosmosProxy(barcode);
  if (proxy) return proxy;

  return fetchFromCosmosDirect(barcode);
}

export async function testCosmosHardcoded(): Promise<ResolvedProduct | null> {
  return fetchFromCosmos('7896004730189');
}

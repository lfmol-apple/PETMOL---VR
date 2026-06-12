import type { ResolvedProduct } from '../types';
import { classifyProduct } from '../classifier';

function normalizeText(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value
      .map(item => normalizeText(item))
      .find((item): item is string => Boolean(item));
  }

  return normalizeText(value);
}

function flattenTaxonomy(values: Array<unknown>): string[] {
  return values.flatMap(value => {
    if (Array.isArray(value)) {
      return value
        .map(item => normalizeText(item))
        .filter((item): item is string => Boolean(item));
    }

    const normalized = normalizeText(value);
    return normalized ? [normalized] : [];
  });
}

function buildResolvedProduct(
  barcode: string,
  source: ResolvedProduct['source'],
  payload: {
    name?: unknown;
    brand?: unknown;
    image?: unknown;
    weight?: unknown;
    manufacturer?: unknown;
    presentation?: unknown;
    concentration?: unknown;
    taxonomy?: Array<unknown>;
  },
): ResolvedProduct | null {
  const name = normalizeText(payload.name);
  if (!name) return null;

  const brand = normalizeText(payload.brand);
  const image = firstString(payload.image);
  const weight = normalizeText(payload.weight);
  const manufacturer = normalizeText(payload.manufacturer) ?? brand;
  const presentation = normalizeText(payload.presentation) ?? weight;
  const concentration = normalizeText(payload.concentration);
  const taxonomy = flattenTaxonomy(payload.taxonomy ?? []);
  const categoryText = [name, brand, manufacturer, presentation, concentration, ...taxonomy]
    .filter(Boolean)
    .join(' ');

  return {
    barcode,
    name,
    brand,
    image,
    weight,
    manufacturer,
    presentation,
    concentration,
    category: classifyProduct(categoryText),
    source,
  };
}

async function tryOpenFoodFacts(barcode: string): Promise<ResolvedProduct | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json`,
      { signal: AbortSignal.timeout(1800) },
    );
    if (!res.ok) return null;

    const data = await res.json();
    if (data?.status !== 1 || !data.product) return null;

    const product = data.product as Record<string, unknown>;
    return buildResolvedProduct(barcode, 'internal', {
      name: product.product_name_pt || product.product_name || product.generic_name,
      brand: typeof product.brands === 'string' ? product.brands.split(',')[0]?.trim() : undefined,
      image: product.image_small_url ?? product.image_url,
      weight: product.quantity,
      manufacturer: product.brands,
      taxonomy: [product.categories, product.labels, product.categories_tags],
    });
  } catch {
    return null;
  }
}

async function tryUpcApi(barcode: string): Promise<ResolvedProduct | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1800),
      },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const item = data?.items?.[0] as Record<string, unknown> | undefined;
    if (!item) return null;

    return buildResolvedProduct(barcode, 'internal', {
      name: item.title,
      brand: item.brand,
      image: item.images,
      manufacturer: item.brand,
      taxonomy: [item.category, item.description],
    });
  } catch {
    return null;
  }
}

async function tryBarcodeLookup(barcode: string): Promise<ResolvedProduct | null> {
  const apiKey = process.env.NEXT_PUBLIC_BARCODE_LOOKUP_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `https://api.barcodelookup.com/v3/products?barcode=${encodeURIComponent(barcode)}&formatted=y&key=${encodeURIComponent(apiKey)}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(1800),
      },
    );
    if (!res.ok) return null;

    const data = await res.json();
    const product = data?.products?.[0] as Record<string, unknown> | undefined;
    if (!product) return null;

    return buildResolvedProduct(barcode, 'internal', {
      name: product.title ?? product.product_name,
      brand: product.brand,
      image: product.thumbnail ?? product.images,
      weight: product.size,
      manufacturer: product.manufacturer,
      presentation: product.size,
      taxonomy: [product.category, product.features, product.description],
    });
  } catch {
    return null;
  }
}

export async function fetchGlobalCandidates(barcode: string): Promise<ResolvedProduct[]> {
  const settled = await Promise.allSettled([
    tryOpenFoodFacts(barcode),
    tryUpcApi(barcode),
    tryBarcodeLookup(barcode),
  ]);

  return settled
    .filter((result): result is PromiseFulfilledResult<ResolvedProduct | null> => result.status === 'fulfilled')
    .map(result => result.value)
    .filter((product): product is ResolvedProduct => Boolean(product));
}

export async function fetchFromGlobal(barcode: string): Promise<ResolvedProduct | null> {
  const products = await fetchGlobalCandidates(barcode);
  return products[0] ?? null;
}
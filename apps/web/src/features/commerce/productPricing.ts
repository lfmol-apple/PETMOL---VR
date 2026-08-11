import { API_BASE_URL } from '@/lib/api';

export interface ProductPriceResult {
  found: boolean;
  store: string;
  product_name?: string | null;
  brand?: string | null;
  price?: number | null;
  list_price?: number | null;
  is_available?: boolean | null;
  url?: string | null;
}

const NOT_FOUND: ProductPriceResult = { found: false, store: 'cobasi' };

/**
 * Preço real de um produto (hoje só Cobasi — ver commerce_pricing.py no
 * backend). Nunca lança erro: timeout/falha vira `found: false`, e o
 * chamador cai de volta para a busca normal multi-loja.
 */
export async function fetchProductPrice(query: string): Promise<ProductPriceResult> {
  const trimmed = query.trim();
  if (!trimmed) return NOT_FOUND;
  try {
    const res = await fetch(`${API_BASE_URL}/commerce/product-price?q=${encodeURIComponent(trimmed)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return NOT_FOUND;
    const data = (await res.json()) as ProductPriceResult;
    return data;
  } catch {
    return NOT_FOUND;
  }
}

export function formatBRLPrice(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface ProductOfferResult {
  found: boolean;
  merchant: string;
  product_name?: string | null;
  brand?: string | null;
  price?: number | null;
  list_price?: number | null;
  is_available?: boolean | null;
  url?: string | null;
  /** 'affiliate_product' em produção; 'direct' só aparece em dev (fallback de teste). */
  link_type?: 'affiliate_product' | 'direct' | null;
}

const OFFER_NOT_FOUND: ProductOfferResult = { found: false, merchant: 'cobasi' };

/**
 * Oferta real e monetizável (preço + link afiliado do MESMO produto,
 * casados por EAN no backend — ver commerce_offers.py). Diferente de
 * fetchProductPrice: nunca retorna uma URL sem comissão em produção.
 */
export async function fetchProductOffer(query: string, packageSizeKg?: number): Promise<ProductOfferResult> {
  const trimmed = query.trim();
  if (!trimmed) return OFFER_NOT_FOUND;
  try {
    const params = new URLSearchParams({ q: trimmed });
    if (typeof packageSizeKg === 'number' && packageSizeKg > 0) {
      params.set('weight_kg', String(packageSizeKg));
    }
    const res = await fetch(`${API_BASE_URL}/commerce/product-offer?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return OFFER_NOT_FOUND;
    const data = (await res.json()) as ProductOfferResult;
    return data;
  } catch {
    return OFFER_NOT_FOUND;
  }
}

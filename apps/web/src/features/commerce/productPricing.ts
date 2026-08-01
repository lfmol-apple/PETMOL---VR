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

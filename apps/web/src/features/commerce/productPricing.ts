import { API_BASE_URL } from '@/lib/api';

export function formatBRLPrice(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export interface CommerceOffer {
  merchant: string;
  url: string;
  /** 'affiliate_product' em produção; 'direct' só aparece em dev (fallback de teste). */
  link_type: 'affiliate_product' | 'affiliate_marketplace_offer' | 'affiliate_store' | 'direct';
  product_name?: string | null;
  brand?: string | null;
  price?: number | null;
  list_price?: number | null;
  is_available?: boolean | null;
}

/**
 * Lista de ofertas monetizáveis para um produto, menor preço primeiro —
 * ver commerce_offers.py/commerce_provider.py no backend. Hoje só a
 * Cobasi está ativa (0 ou 1 item), mas o contrato já é multi-provider:
 * Amazon/Shopee/ML/Petz entram na mesma lista quando aprovados, sem
 * mudar esta função nem quem a chama.
 *
 * Nunca lança erro: timeout/falha vira lista vazia, e quem chama mostra
 * "estamos buscando opções" — nunca um link sem comissão.
 */
export async function fetchCommerceOffers(query: string, packageSizeKg?: number): Promise<CommerceOffer[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  try {
    const params = new URLSearchParams({ q: trimmed });
    if (typeof packageSizeKg === 'number' && packageSizeKg > 0) {
      params.set('weight_kg', String(packageSizeKg));
    }
    const res = await fetch(`${API_BASE_URL}/commerce/offers?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { offers?: CommerceOffer[] };
    return Array.isArray(data.offers) ? data.offers : [];
  } catch {
    return [];
  }
}

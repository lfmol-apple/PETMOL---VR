/**
 * PETMOL Web API Client
 * Centralizes all API calls with proper error handling
 */

function resolveApiBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configuredBaseUrl) return configuredBaseUrl.replace(/\/$/, '');

  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:8000';
  }

  return '/api';
}

export const API_BASE_URL = resolveApiBaseUrl();

// Alias for backwards compatibility
export const API_URL = API_BASE_URL;

// Normalized base for backend routes that are prefixed with /api.
// - Production web proxy usually exposes API_BASE_URL="/api"
// - Local/dev commonly uses API_BASE_URL="http://localhost:8000"
export const API_BACKEND_BASE = API_BASE_URL.endsWith('/api')
  ? API_BASE_URL
  : `${API_BASE_URL}/api`;

// ========================================
// Types
// ========================================

export interface SuggestItem {
  id: string;
  product_id: string;
  title: string;
  brand: string | null;
  image_url: string | null;
  size_text: string | null;
  pack_weight_kg: number | null;
  min_price: number | null;
  max_price: number | null;
  price_per_kg: number | null;
  currency: string;
  source: string;
  url: string | null;
  fetched_at: string;
}

export interface SuggestResponse {
  suggestions: SuggestItem[];
  query: string;
  country: string;
  cached: boolean;
  fetched_at: string;
  providers_used: string[];
  warning: string | null;
  shopping_handoff_url?: string | null;
}

export interface ProductInfo {
  id: string;
  name: string;
  brand: string | null;
  variant: string | null;
  image_url: string | null;
  pack_sizes: Array<{ value: number; unit: string }>;
  species: string | null;
}

export interface ProductResponse {
  product: ProductInfo;
  fetched_at: string;
}

export interface Offer {
  id: string;
  title: string;
  price: number;
  currency: string;
  seller: string | null;
  url: string | null;
  source: string;
  image_url: string | null;
  in_stock: boolean;
  size_text: string | null;
  pack_weight_kg: number | null;
  price_per_kg: number | null;
  fetched_at: string;
}

export interface OffersResponse {
  product_id: string;
  offers: Offer[];
  fetched_at: string;
  cached: boolean;
  warning: string | null;
}

// Popular Today types
export interface PopularItem {
  product_id: string;
  title: string;
  brand: string | null;
  image_url: string | null;
  size_text: string | null;
  pack_weight_kg: number | null;
  min_price: number | null;
  max_price: number | null;
  price_per_kg: number | null;
  currency: string;
  fetched_at: string;
}

export interface PopularResponse {
  items: PopularItem[];
  fetched_at: string;
}

// ========================================
// API Error
// ========================================

export class ApiError extends Error {
  public readonly status: number;
  public readonly isTimeout: boolean;
  public readonly isNetwork: boolean;

  constructor(message: string, options?: { status?: number; isTimeout?: boolean; isNetwork?: boolean }) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status ?? 0;
    this.isTimeout = options?.isTimeout ?? false;
    this.isNetwork = options?.isNetwork ?? false;
  }
}

// ========================================
// Fetch Helper
// ========================================

async function apiFetch<T>(url: string, options?: { timeoutMs?: number }): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? 10000;
  
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new ApiError(`HTTP ${response.status}: ${errorText}`, { status: response.status });
    }

    return await response.json();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    
    if (error instanceof Error) {
      if (error.name === 'TimeoutError' || error.name === 'AbortError') {
        throw new ApiError('Tempo limite excedido', { isTimeout: true });
      }
      if (error.message.includes('fetch') || error.message.includes('network')) {
        throw new ApiError('Erro de conexão', { isNetwork: true });
      }
    }
    
    throw new ApiError('Erro desconhecido');
  }
}

// ========================================
// API Functions
// ========================================

/**
 * Search for product suggestions (autocomplete)
 */
export async function suggest(
  query: string,
  options?: { country?: string; limit?: number; force?: boolean }
): Promise<SuggestResponse> {
  if (query.length < 2) {
    return {
      suggestions: [],
      query,
      country: options?.country ?? 'BR',
      cached: false,
      fetched_at: new Date().toISOString(),
      providers_used: [],
      warning: null,
    };
  }

  const params = new URLSearchParams({
    q: query,
    country: options?.country ?? 'BR',
    limit: (options?.limit ?? 8).toString(),
  });

  if (options?.force) {
    params.append('force', 'true');
  }

  return apiFetch<SuggestResponse>(`${API_BASE_URL}/suggest?${params}`);
}

/**
 * Get product info by ID
 */
export async function getProduct(productId: string): Promise<ProductResponse> {
  return apiFetch<ProductResponse>(`${API_BASE_URL}/product/${encodeURIComponent(productId)}`);
}

/**
 * Get offers for a product
 */
export async function getOffers(
  productId: string,
  options?: { country?: string; limit?: number; force?: boolean }
): Promise<OffersResponse> {
  const params = new URLSearchParams({
    country: options?.country ?? 'BR',
    limit: (options?.limit ?? 20).toString(),
    force: options?.force ? 'true' : 'false',
  });

  return apiFetch<OffersResponse>(
    `${API_BASE_URL}/product/${encodeURIComponent(productId)}/offers?${params}`,
    { timeoutMs: 15000 }  // Longer timeout for offers
  );
}

/**
 * Get popular products for "Populares hoje" section
 */
export async function getPopular(
  options?: { country?: string; limit?: number }
): Promise<PopularResponse> {
  const params = new URLSearchParams({
    country: options?.country ?? 'BR',
    limit: (options?.limit ?? 6).toString(),
  });

  return apiFetch<PopularResponse>(`${API_BASE_URL}/popular?${params}`);
}

// ========================================
// Utilities
// ========================================

/**
 * Format price for display
 */
export function formatPrice(price: number | null, currency: string = 'BRL'): string | null {
  if (price === null) return null;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(price);
}

/**
 * Format price range for display
 */
export function formatPriceRange(min: number | null, max: number | null, currency: string = 'BRL'): string | null {
  if (min === null && max === null) return null;
  const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency });
  if (min === max || max === null) {
    return formatter.format(min!);
  }
  return `${formatter.format(min!)} — ${formatter.format(max!)}`;
}

/**
 * Format ISO date to time string
 */
export function formatTime(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

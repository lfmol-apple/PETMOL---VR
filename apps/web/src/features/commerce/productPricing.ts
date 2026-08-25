import { API_BASE_URL } from '@/lib/api';

export function formatBRLPrice(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function hasReliablePrice(offer: Pick<CommerceOffer, 'price' | 'price_is_stale'>): offer is CommerceOffer & { price: number } {
  return typeof offer.price === 'number' && !offer.price_is_stale;
}

export function offerPriceLabel(offer: CommerceOffer): string {
  if (typeof offer.price === 'number') {
    return offer.price_is_stale ? `${formatBRLPrice(offer.price)}*` : formatBRLPrice(offer.price);
  }
  return `Conferir preço na ${merchantLabel(offer.merchant)}`;
}

// Nomes de exibição por merchant — usado em toda tela que lista ofertas
// (busca Awin e cards de "comprar novamente"), pra nunca cravar o nome de
// uma loja específica (ex: "na Cobasi") num texto que hoje pode vir de
// qualquer provider registrado no CommerceEngine (Cobasi, Shopee, etc.).
export const MERCHANT_LABELS: Record<string, string> = {
  cobasi: 'Cobasi',
  zeenow: 'Zee Now',
  zeedog: 'Zee Dog',
  shopee: 'Shopee',
  mercadolivre: 'Mercado Livre',
  petz: 'Petz',
};

export function merchantLabel(merchant: string): string {
  return MERCHANT_LABELS[merchant] ?? merchant;
}

// Logomarca por merchant — mesma lista de lojas de MERCHANT_LABELS. Usado
// nas telas de comparação de preço (MonetizedOffersList) pra identificar a
// loja de cada oferta visualmente, em vez de um ícone genérico igual pra
// todas. Sem logo mapeado, quem chama cai no ícone genérico do card.
export const MERCHANT_LOGOS: Record<string, string> = {
  cobasi: '/partner-logos/cobasi.png',
  zeenow: '/partner-logos/zeenow.png',
  zeedog: '/partner-logos/zeedog.png',
  shopee: '/partner-logos/shopee.png',
  mercadolivre: '/partner-logos/mercadolivre.png',
  petz: '/partner-logos/petz.png',
};

export function merchantLogoSrc(merchant: string): string | null {
  return MERCHANT_LOGOS[merchant] ?? null;
}

export interface CommerceOffer {
  merchant: string;
  url: string;
  /** Tipo real da URL aberta: Awin, marketplace, storefront ou fallback direto. */
  link_type: 'affiliate_product' | 'affiliate_marketplace_offer' | 'affiliate_store' | 'direct';
  product_name?: string | null;
  brand?: string | null;
  price?: number | null;
  list_price?: number | null;
  is_available?: boolean | null;
  /** Momento em que esse preço foi sincronizado/confirmado no backend. */
  price_checked_at?: string | null;
  /** True quando o backend sabe que o preço é antigo, mas manteve o link de compra. */
  price_is_stale?: boolean;
  /** Só populado quando a oferta veio do feed Awin (AwinFeedProvider) —
   * Cobasi/Zee Now/Zee Dog têm; Shopee (busca por palavra-chave) e VTEX
   * direto ainda não. Sem imagem, o card cai no placeholder neutro. */
  image_url?: string | null;
}

function normalizeOfferUrl(url: string): string {
  if (url.startsWith('/commerce/awin-click')) {
    return `${API_BASE_URL}${url}`;
  }
  return url;
}

/**
 * Lista de ofertas monetizáveis para um produto, menor preço primeiro —
 * ver commerce_offers.py/commerce_provider.py no backend. As superfícies
 * do app ficam restritas a Cobasi, Shopee, Zee Now e Zee Dog.
 *
 * `gtin`: opcional — quando o produto já foi escaneado e temos o GTIN,
 * enviar aqui é o caminho preferido para providers estruturados (ex:
 * futuro AwinFeedProvider, que só resolve por GTIN exato). Nenhuma tela
 * hoje tem GTIN disponível nesse ponto, então nenhum chamador precisa
 * passar isso ainda — é só o contrato já pronto pra quando tiver.
 *
 * Nunca lança erro: timeout/falha vira lista vazia, e quem chama mostra
 * "estamos buscando opções" — nunca um link sem comissão.
 */
export interface AwinSearchResult {
  gtin: string;
  title: string | null;
  brand: string | null;
  price: number | null;
  list_price: number | null;
  image_url: string | null;
  /** Loja do preço mais baixo (quando o mesmo GTIN existe em mais de uma). */
  merchant: string;
  /** Quantas lojas Awin habilitadas têm esse GTIN — >1 vira um grid de preços. */
  offer_count: number;
}

/**
 * Busca textual no catálogo Awin já sincronizado (AffiliateFeedOffer, ver
 * awin_feed_sync.py) — GET /commerce/awin-search. Sem `merchant`, busca em
 * TODOS os merchants Awin habilitados de uma vez, agrupando por GTIN —
 * Cobasi já tem dado real; Zee Dog e Zee Now entram pelo mesmo caminho
 * quando sincronizadas. Cada
 * resultado já vem com GTIN; passar esse GTIN pra fetchCommerceOffers() é
 * o único jeito hoje de o app exercitar AwinFeedProvider (busca textual
 * normal nunca envia GTIN).
 */
export async function searchAwinCatalog(query: string, merchant?: string): Promise<AwinSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const params = new URLSearchParams({ q: trimmed });
    if (merchant) params.set('merchant', merchant);
    const res = await fetch(`${API_BASE_URL}/commerce/awin-search?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: AwinSearchResult[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

export interface PetzDirectLink {
  available: boolean;
  url: string | null;
  link_type?: 'affiliate_store';
}

/**
 * "Ver na Petz" — caminho DELIBERADAMENTE separado de fetchCommerceOffers.
 * Nunca entra na lista de comparação de preço (não existe fonte de preço
 * Petz por produto) — a URL retornada é a storefront FIXA da "Loja
 * Parceira" (cupom PETTMOL, 10% off aplicado manualmente no checkout),
 * só quando o produto já foi confirmado no catálogo Petz. Ver GET
 * /commerce/petz-direct-link no backend e docs/AFFILIATES.md. Sempre
 * falha em silêncio (available:false), igual às outras chamadas de
 * comércio deste arquivo.
 */
export async function fetchPetzDirectLink(gtin: string): Promise<PetzDirectLink> {
  const trimmed = gtin.trim();
  if (!trimmed) return { available: false, url: null };
  try {
    const res = await fetch(`${API_BASE_URL}/commerce/petz-direct-link?gtin=${encodeURIComponent(trimmed)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { available: false, url: null };
    const data = (await res.json()) as PetzDirectLink;
    return data?.available && data.url ? data : { available: false, url: null };
  } catch {
    return { available: false, url: null };
  }
}

export async function fetchCommerceOffers(query: string, packageSizeKg?: number, gtin?: string): Promise<CommerceOffer[]> {
  const trimmed = query.trim();
  if (!trimmed && !gtin) return [];
  try {
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (typeof packageSizeKg === 'number' && packageSizeKg > 0) {
      params.set('weight_kg', String(packageSizeKg));
    }
    if (gtin) params.set('gtin', gtin);
    const res = await fetch(`${API_BASE_URL}/commerce/offers?${params.toString()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { offers?: CommerceOffer[] };
    return Array.isArray(data.offers)
      ? data.offers.map((offer) => ({ ...offer, url: normalizeOfferUrl(offer.url) }))
      : [];
  } catch {
    return [];
  }
}

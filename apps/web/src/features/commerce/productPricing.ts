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
   * Cobasi tem; Shopee/ML (marketplace) e VTEX direto ainda não.
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
 * do app ficam restritas a Cobasi, Petz, Mercado Livre e Shopee.
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
 * Cobasi já tem dado real. Zee Dog e Zee Now podem existir no feed para
 * enriquecimento interno, mas não entram como lojas de venda. Cada
 * resultado já vem com GTIN; passar esse GTIN pra fetchCommerceOffers() é
 * o único jeito hoje de o app exercitar AwinFeedProvider (busca textual
 * normal nunca envia GTIN).
 */
export async function searchAwinCatalog(query: string, merchant?: string): Promise<AwinSearchResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  try {
    const params = new URLSearchParams({ q: trimmed, limit: '50' });
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
  /** true = programa Parceiro Petz ativo → mostrar "Ver na Petz" para qualquer produto. */
  available: boolean;
  partner_program_active?: boolean;
  /** Melhor destino: página do produto confirmado > busca do site > vitrine. */
  url: string | null;
  /** Página real do produto, só quando há mapping Petz confirmado. */
  direct_product_url?: string | null;
  /** Busca do site da Petz pelo nome do produto (fallback universal). */
  search_url?: string | null;
  partner_store_url?: string | null;
  coupon_code?: string | null;
  affiliate_program?: string | null;
  link_type?: 'affiliate_store';
}

/**
 * "Ver na Petz" — caminho DELIBERADAMENTE separado de fetchCommerceOffers
 * (nunca entra na comparação de preço: não há fonte de preço Petz por
 * produto). Quando o programa Parceiro Petz está ativo, aparece para
 * QUALQUER produto: leva à página do produto confirmado quando existe,
 * senão à busca do site da Petz pelo nome — em ambos os casos a comissão
 * vem do cupom PETTMOL no checkout. Ver GET /commerce/petz-direct-link e
 * docs/PETZ_COMMISSION_VALIDATION.md.
 */
export async function fetchPetzDirectLink(
  gtin?: string | null,
  productName?: string,
  brand?: string,
): Promise<PetzDirectLink> {
  const trimmedGtin = (gtin ?? '').trim();
  const trimmedName = (productName ?? '').trim();
  // Sem GTIN a página exata não é possível, mas a busca da Petz pelo nome
  // sim — só desiste quando não há NENHUM dos dois.
  if (!trimmedGtin && !trimmedName) return { available: false, url: null };
  try {
    const params = new URLSearchParams();
    if (trimmedGtin) params.set('gtin', trimmedGtin);
    if (trimmedName) params.set('q', trimmedName);
    if (brand?.trim()) params.set('brand', brand.trim());
    const res = await fetch(`${API_BASE_URL}/commerce/petz-direct-link?${params.toString()}`, {
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

export interface CommerceOffersLookup {
  query: string;
  packageSizeKg?: number;
  gtin?: string;
  /** Nome/título do produto — ajuda a Cobasi quando `query` vem pobre. */
  name?: string;
  /** Marca do produto. */
  brand?: string;
}

export async function fetchCommerceOffers(
  lookup: CommerceOffersLookup | string,
  packageSizeKg?: number,
  gtin?: string,
): Promise<CommerceOffer[]> {
  // Compat: aceita a assinatura antiga (query, packageSizeKg, gtin).
  const opts: CommerceOffersLookup =
    typeof lookup === 'string' ? { query: lookup, packageSizeKg, gtin } : lookup;
  const trimmed = (opts.query || '').trim();
  const name = (opts.name || '').trim();
  const brand = (opts.brand || '').trim();
  if (!trimmed && !opts.gtin && !name) return [];
  try {
    const params = new URLSearchParams();
    if (trimmed) params.set('q', trimmed);
    if (typeof opts.packageSizeKg === 'number' && opts.packageSizeKg > 0) {
      params.set('weight_kg', String(opts.packageSizeKg));
    }
    if (opts.gtin) params.set('gtin', opts.gtin);
    if (name) params.set('name', name);
    if (brand) params.set('brand', brand);
    const res = await fetch(`${API_BASE_URL}/commerce/offers?${params.toString()}`, {
      cache: 'no-store',
      // Cobasi é busca ao vivo na VTEX (até ~7s no backend por provider);
      // margem acima disso para não abortar um provider que ainda ia
      // responder. Não pode travar a UI indefinidamente.
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { offers?: CommerceOffer[] };
    return Array.isArray(data.offers)
      ? data.offers
          .map((offer) => ({ ...offer, url: normalizeOfferUrl(offer.url) }))
          .filter((offer) => offer.is_available !== false && Boolean(offer.url))
      : [];
  } catch {
    return [];
  }
}

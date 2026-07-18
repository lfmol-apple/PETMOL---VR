import { trackClick } from '@/lib/analytics/click';

export type HomeShoppingPartnerId = 'cobasi' | 'petz' | 'amazon' | 'petlove' | 'doglife' | 'shopee' | 'mercadolivre' | 'araujo';

export interface HomeShoppingPartner {
  id: HomeShoppingPartnerId;
  name: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  fallbackUrl?: string;
  directUrl?: string;
  /**
   * Monta a URL de busca afiliada dado um produto e o ID de afiliado.
   * Quando não definida, usa o comportamento padrão (fallbackUrl/directUrl).
   * O ID vem de NEXT_PUBLIC_AFFILIATE_{ID_MAIUSCULO}.
   *
   * Formatos por rede:
   *  - Amazon Associates : tag=seuId-20
   *  - Lomadee (Cobasi, Petz, Petlove) : URL base do painel + &url={destino}
   *  - Shopee Affiliates : URL base do painel (opaco, sem query)
   *  - ML Afiliados : affId=seuId na URL de busca
   */
  buildAffiliateUrl?: (query: string, affiliateId: string) => string;
}

// ── IDs de afiliado lidos das env vars (bakeadas no build) ────────────────────
// Configure em .env.local ou no VPS /etc/petmol/petmol.env:
//   NEXT_PUBLIC_AFFILIATE_AMAZON=seutag-20
//   NEXT_PUBLIC_AFFILIATE_COBASI=https://www.lomadee.com/link/SEU_ID/_id_SEU_PROGRAMA/
//   NEXT_PUBLIC_AFFILIATE_PETZ=https://www.lomadee.com/link/SEU_ID/_id_SEU_PROGRAMA/
//   NEXT_PUBLIC_AFFILIATE_PETLOVE=https://www.lomadee.com/link/SEU_ID/_id_SEU_PROGRAMA/
//   NEXT_PUBLIC_AFFILIATE_SHOPEE=https://s.shopee.com.br/SUA_URL_AFILIADA
//   NEXT_PUBLIC_AFFILIATE_ML=seuAffId
//   NEXT_PUBLIC_AFFILIATE_DOGLIFE=https://url-afiliada-doglife
//   NEXT_PUBLIC_AFFILIATE_ARAUJO=https://url-afiliada-araujo
const AFF: Record<HomeShoppingPartnerId, string | undefined> = {
  amazon:       process.env.NEXT_PUBLIC_AFFILIATE_AMAZON,
  cobasi:       process.env.NEXT_PUBLIC_AFFILIATE_COBASI,
  petz:         process.env.NEXT_PUBLIC_AFFILIATE_PETZ,
  petlove:      process.env.NEXT_PUBLIC_AFFILIATE_PETLOVE,
  shopee:       process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE,
  mercadolivre: process.env.NEXT_PUBLIC_AFFILIATE_ML,
  doglife:      process.env.NEXT_PUBLIC_AFFILIATE_DOGLIFE,
  araujo:       process.env.NEXT_PUBLIC_AFFILIATE_ARAUJO,
};

export const HOME_SHOPPING_PARTNERS: HomeShoppingPartner[] = [
  {
    id: 'cobasi',
    name: 'Cobasi',
    description: 'Compare preço e entrega para ração e cuidados',
    logoSrc: '/partner-logos/cobasi.png',
    logoAlt: 'Cobasi',
    fallbackUrl: 'https://www.cobasi.com.br',
    // Lomadee: cole a URL base do painel em NEXT_PUBLIC_AFFILIATE_COBASI
    // A URL de destino é appended via &url=
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.cobasi.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'petz',
    name: 'Petz',
    description: 'Compare preço e entrega para produtos pet',
    logoSrc: '/partner-logos/petz.png',
    logoAlt: 'Petz',
    fallbackUrl: 'https://www.petz.com.br',
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.petz.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'amazon',
    name: 'Amazon',
    description: 'Compare preço e entrega em pet shop online',
    logoSrc: '/partner-logos/amazon.svg',
    logoAlt: 'Amazon',
    fallbackUrl: 'https://www.amazon.com.br/s?k=pet+shop',
    // Amazon Associates: formato fixo, tag no query param
    buildAffiliateUrl: (query, tag) =>
      `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&tag=${tag}`,
  },
  {
    id: 'petlove',
    name: 'Petlove',
    description: 'Compare preço e entrega em saúde e ração',
    logoSrc: '/partner-logos/petlove.png',
    logoAlt: 'Petlove',
    fallbackUrl: 'https://www.petlove.com.br',
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.petlove.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'doglife',
    name: 'DogLife',
    description: 'Compare preço e entrega em planos e produtos pet',
    logoSrc: '/partner-logos/doglife.svg',
    logoAlt: 'DogLife',
    fallbackUrl: 'https://www.doglife.com.br',
    // URL opaca do painel de afiliados — não adiciona query
    buildAffiliateUrl: (_query, base) => base,
  },
  {
    id: 'shopee',
    name: 'Shopee',
    description: 'Produtos pet com preços competitivos',
    logoSrc: '/partner-logos/shopee.png',
    logoAlt: 'Shopee',
    directUrl: 'https://shopee.com.br/search?keyword=pet',
    // Shopee Affiliate: URL base do painel, sem query (landing page afiliada)
    buildAffiliateUrl: (_query, base) => base,
  },
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    description: 'Ampla seleção de produtos pet',
    logoSrc: '/partner-logos/mercadolivre.png',
    logoAlt: 'Mercado Livre',
    directUrl: 'https://www.mercadolivre.com.br/c/pet-shop',
    buildAffiliateUrl: (query, affId) =>
      `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}?affId=${affId}`,
  },
  {
    id: 'araujo',
    name: 'Drogaria Araújo',
    description: 'Medicamentos e produtos de saúde pet',
    logoSrc: '/partner-logos/araujo.png',
    logoAlt: 'Drogaria Araújo',
    directUrl: 'https://www.araujo.com.br/busca?q=pet',
    buildAffiliateUrl: (_query, base) => base,
  },
];

/**
 * Resolve a URL final de um parceiro para um produto específico.
 * Prioridade: link afiliado > directUrl > fallbackUrl > handoff proxy.
 */
export function resolvePartnerUrl(
  partner: HomeShoppingPartner,
  query: string,
  leadId: string,
): string {
  const affId = AFF[partner.id];

  // Afiliado configurado → usa link rastreado diretamente
  if (affId && partner.buildAffiliateUrl) {
    return partner.buildAffiliateUrl(query, affId);
  }

  // Sem afiliado → comportamento anterior
  if (partner.directUrl) return partner.directUrl;

  const fallback = encodeURIComponent(
    partner.fallbackUrl
      ? `${partner.fallbackUrl}/search?q=${encodeURIComponent(query)}`
      : `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`,
  );
  return `/api/handoff/shopping?partner=${partner.id}&lead_id=${encodeURIComponent(leadId)}&fallback=${fallback}`;
}

export async function openHomeShoppingPartner(
  partnerId: HomeShoppingPartnerId,
  query = 'pet shop',
): Promise<void> {
  const partner = HOME_SHOPPING_PARTNERS.find((entry) => entry.id === partnerId);
  if (!partner) return;

  const leadId = await trackClick({
    source: 'home',
    cta_type: 'shop_redirect',
    target: partner.id,
  });

  const url = resolvePartnerUrl(partner, query, leadId);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Builds a contextual handoff URL for food/ração purchase.
 * Uses affiliate link when configured, otherwise proxy.
 */
export function buildFoodHandoffUrl(
  brand: string,
  petId: string,
  partnerId: HomeShoppingPartnerId,
): string {
  const partner = HOME_SHOPPING_PARTNERS.find((p) => p.id === partnerId);
  if (!partner) return '#';

  const searchQuery = [brand.trim(), 'ração'].filter(Boolean).join(' ');
  const leadId = `food-${petId}-${Date.now()}`;

  return resolvePartnerUrl(partner, searchQuery, leadId);
}

/** Retorna true se o parceiro tem ID de afiliado configurado. */
export function partnerHasAffiliate(partnerId: HomeShoppingPartnerId): boolean {
  return Boolean(AFF[partnerId]);
}

/** Quantos parceiros têm link afiliado ativo (útil para debug/admin). */
export function countActiveAffiliates(): number {
  return Object.values(AFF).filter(Boolean).length;
}
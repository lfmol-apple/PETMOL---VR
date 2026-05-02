import { trackClick } from '@/lib/analytics/click';

export type HomeShoppingPartnerId = 'cobasi' | 'petz' | 'amazon' | 'petlove' | 'doglife';

export interface HomeShoppingPartner {
  id: HomeShoppingPartnerId;
  name: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  fallbackUrl?: string;
  directUrl?: string;
}

export const HOME_SHOPPING_PARTNERS: HomeShoppingPartner[] = [
  {
    id: 'cobasi',
    name: 'Cobasi',
    description: 'Compare preço e entrega para ração e cuidados',
    logoSrc: '/partner-logos/cobasi.png',
    logoAlt: 'Cobasi',
    fallbackUrl: 'https://www.cobasi.com.br',
  },
  {
    id: 'petz',
    name: 'Petz',
    description: 'Compare preço e entrega para produtos pet',
    logoSrc: '/partner-logos/petz.png',
    logoAlt: 'Petz',
    fallbackUrl: 'https://www.petz.com.br',
  },
  {
    id: 'amazon',
    name: 'Amazon',
    description: 'Compare preço e entrega em pet shop online',
    logoSrc: '/partner-logos/amazon.svg',
    logoAlt: 'Amazon',
    fallbackUrl: 'https://www.amazon.com.br/s?k=pet+shop',
  },
  {
    id: 'petlove',
    name: 'Petlove',
    description: 'Compare preço e entrega em saúde e ração',
    logoSrc: '/partner-logos/petlove.png',
    logoAlt: 'Petlove',
    fallbackUrl: 'https://www.petlove.com.br',
  },
  {
    id: 'doglife',
    name: 'DogLife',
    description: 'Compare preço e entrega em planos e produtos pet',
    logoSrc: '/partner-logos/doglife.svg',
    logoAlt: 'DogLife',
    fallbackUrl: 'https://www.doglife.com.br',
  },
];

function buildPartnerHandoffUrl(partner: HomeShoppingPartner, leadId: string): string {
  if (partner.directUrl) {
    return partner.directUrl;
  }

  const fallback = encodeURIComponent(partner.fallbackUrl ?? 'https://www.google.com/search?tbm=shop&q=pet');
  return `/api/handoff/shopping?partner=${partner.id}&lead_id=${encodeURIComponent(leadId)}&fallback=${fallback}`;
}

export async function openHomeShoppingPartner(partnerId: HomeShoppingPartnerId): Promise<void> {
  const partner = HOME_SHOPPING_PARTNERS.find((entry) => entry.id === partnerId);
  if (!partner) return;

  const leadId = await trackClick({
    source: 'home',
    cta_type: 'shop_redirect',
    target: partner.id,
  });

  const url = buildPartnerHandoffUrl(partner, leadId);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Builds a contextual handoff URL for food/ração purchase.
 * Passes the brand as q= so the partner can pre-fill search.
 * Uses /api/handoff/shopping proxy for affiliate tracking.
 */
export function buildFoodHandoffUrl(
  brand: string,
  petId: string,
  partnerId: HomeShoppingPartnerId,
): string {
  const partner = HOME_SHOPPING_PARTNERS.find((p) => p.id === partnerId);
  if (!partner) return '#';

  const searchQuery = [brand.trim(), 'ração'].filter(Boolean).join(' ');
  const q = encodeURIComponent(searchQuery);
  const leadId = `food-${petId}-${Date.now()}`;
  const fallback = encodeURIComponent(
    partner.fallbackUrl
      ? `${partner.fallbackUrl}/search?q=${encodeURIComponent(searchQuery)}`
      : `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(searchQuery)}`,
  );

  return `/api/handoff/shopping?partner=${partnerId}&q=${q}&lead_id=${encodeURIComponent(leadId)}&fallback=${fallback}`;
}
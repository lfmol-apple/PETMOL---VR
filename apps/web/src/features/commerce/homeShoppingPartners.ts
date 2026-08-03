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

// URLs de busca diretas por parceiro — usadas quando não há afiliado configurado.
// Sem proxy de handoff: abre direto no site da loja.
const DIRECT_SEARCH_URLS: Record<HomeShoppingPartnerId, (q: string) => string> = {
  cobasi:       (q) => `https://www.cobasi.com.br/busca?q=${encodeURIComponent(q)}`,
  petz:         (q) => `https://www.petz.com.br/busca?q=${encodeURIComponent(q)}`,
  petlove:      (q) => `https://www.petlove.com.br/busca?q=${encodeURIComponent(q)}`,
  amazon:       (q) => `https://www.amazon.com.br/s?k=${encodeURIComponent(q)}`,
  shopee:       (q) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`,
  mercadolivre: (q) => `https://lista.mercadolivre.com.br/${encodeURIComponent(q)}`,
  doglife:      (_q) => 'https://www.doglife.com.br',
  araujo:       (q) => `https://www.araujo.com.br/busca?q=${encodeURIComponent(q)}`,
};

// TESTE: link de afiliado DIRETO da Cobasi ("Minha Loja"), fornecido pela
// própria Cobasi com utm_campaign=petmol já embutido — programa próprio
// deles, fora da Lomadee (que é como o resto do arquivo trata Cobasi hoje).
// A página carrega o conteúdo via JS (não deu pra confirmar sem navegador
// se ela realmente filtra por produto), então ?q= aqui é uma HIPÓTESE — a
// mesma convenção que o site normal da Cobasi usa (cobasi.com.br/busca?q=).
// Prioridade temporária sobre a Lomadee/busca direta abaixo, especificamente
// pra testar isso ao vivo no app. Reverter é só remover este bloco.
const COBASI_MINHA_LOJA_BASE = 'https://minhaloja.cobasi.com.br/paco?utm_source=mais&utm_medium=maisplataforma&utm_campaign=petmol';

/**
 * Resolve a URL final de um parceiro para um produto específico.
 * Prioridade: link afiliado > URL de busca direta > directUrl > fallbackUrl.
 * Sem proxy de handoff para não bloquear abertura no mobile.
 */
export function resolvePartnerUrl(
  partner: HomeShoppingPartner,
  query: string,
  _leadId: string,
): string {
  if (partner.id === 'cobasi') {
    return `${COBASI_MINHA_LOJA_BASE}&q=${encodeURIComponent(query)}`;
  }

  const affId = AFF[partner.id];

  // Afiliado configurado → usa link rastreado diretamente
  if (affId && partner.buildAffiliateUrl) {
    return partner.buildAffiliateUrl(query, affId);
  }

  // Sem afiliado → abre diretamente no site da loja (sem proxy)
  const buildDirect = DIRECT_SEARCH_URLS[partner.id];
  if (buildDirect) return buildDirect(query);

  if (partner.directUrl) return partner.directUrl;
  if (partner.fallbackUrl) return partner.fallbackUrl;
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

function isStandaloneInstalledApp(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return iosStandalone || Boolean(window.matchMedia?.('(display-mode: standalone)').matches);
}

/**
 * Navigates to an external partner URL. Installed home-screen PWAs on iOS
 * (display-mode: standalone) have no tab chrome for window.open() to attach
 * to — WebKit spawns a separate modal browsing context that frequently
 * fails to finish loading the target URL, leaving the tutor looking at a
 * blank white screen with only a system "X" to close it (confirmed via a
 * real report: tapping "Comprar" inside Loja do Baby, landing on Cobasi,
 * then seeing exactly this instead of the product page). A normal full
 * navigation (location.href) is the standard workaround — standalone iOS
 * treats it as leaving the app to Safari, with Safari's own "back to
 * [App]" affordance, instead of trying to open a doomed popup window.
 * Regular (non-installed, e.g. desktop/Android Chrome tab) usage keeps
 * window.open, which isn't affected by this and lets the tutor return to
 * a still-open PETMOL tab instead of losing it.
 */
export function navigateToPartnerUrl(url: string): void {
  if (isStandaloneInstalledApp()) {
    window.location.href = url;
    return;
  }
  // window.open deve ser chamado sincronamente dentro do gesto do usuário —
  // por isso a analítica é disparada em background sem bloquear a abertura.
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Abre o parceiro em nova aba (ou navega diretamente, em PWA instalado —
 * ver navigateToPartnerUrl).
 */
export function openHomeShoppingPartner(
  partnerId: HomeShoppingPartnerId,
  query = 'pet shop',
): void {
  const partner = HOME_SHOPPING_PARTNERS.find((entry) => entry.id === partnerId);
  if (!partner) return;

  const url = resolvePartnerUrl(partner, query, '');
  navigateToPartnerUrl(url);

  // Analítica em background — não bloqueia a navegação
  void trackClick({
    source: 'home',
    cta_type: 'shop_redirect',
    target: partner.id,
  });
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
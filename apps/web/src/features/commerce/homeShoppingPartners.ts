import { Capacitor } from '@capacitor/core';
import { trackClick } from '@/lib/analytics/click';

export type HomeShoppingPartnerId = 'cobasi' | 'shopee' | 'zeenow' | 'zeedog';

/**
 * Estado real da integração de afiliado do merchant — não confundir com
 * "a loja aparece na UI hoje". Ciclo de vida esperado:
 *  - pending   : cadastro/aprovação comercial em andamento, nada tecnicamente ligado
 *  - approved  : programa aprovado comercialmente, mas ainda não ligado em código
 *  - active    : ligado em código E com caminho monetizável real testável
 *  - disabled  : desativado deliberadamente (sem programa adequado no momento)
 */
export type AffiliateStatus = 'disabled' | 'pending' | 'approved' | 'active';

/**
 * Tipo de relação comercial do merchant — cada um precisa de tratamento
 * diferente (ver docs/AFFILIATES.md):
 *  - retailer    : varejista direto — produto → link afiliado do produto
 *  - marketplace : produto → oferta/publicação de um vendedor → link afiliado
 *                  (a oferta pode expirar/mudar; não é vínculo permanente com o GTIN)
 *  - service      : afiliação de serviço/plano, não de produto/GTIN (ex: plano de saúde)
 */
export type MerchantType = 'retailer' | 'marketplace' | 'service';

/**
 * Mecanismo pelo qual o merchant monetiza — cada rede/programa tem o seu,
 * não dá para tratar todos como se fossem iguais (ex: Cobasi/Shopee/Awin
 * NÃO usam necessariamente a mesma rede só por serem do mesmo setor).
 *  - fixed_store        : storefront afiliada fixa (sem deep link por produto)
 *  - product_deeplink   : link afiliado específico por produto/GTIN
 *  - search_template     : template de busca com ID de afiliado embutido
 *  - none                : mecanismo ainda não confirmado/documentado
 */
export type AffiliateMode = 'fixed_store' | 'product_deeplink' | 'search_template' | 'none';

export interface HomeShoppingPartner {
  id: HomeShoppingPartnerId;
  name: string;
  description: string;
  logoSrc: string;
  logoAlt: string;
  fallbackUrl?: string;
  directUrl?: string;
  /** Estado real da integração — ver AffiliateStatus. */
  affiliateStatus: AffiliateStatus;
  /** Tipo de relação comercial — ver MerchantType. */
  merchantType: MerchantType;
  /** Mecanismo de monetização do merchant — ver AffiliateMode. */
  affiliateMode: AffiliateMode;
  /** Este merchant tem (ou terá) link afiliado por produto/GTIN específico. */
  supportsProductDeepLink: boolean;
  /** Este merchant tem (ou terá) uma storefront/vitrine afiliada fixa para navegação geral. */
  supportsStorefrontAffiliate: boolean;
  /**
   * URL fixa da storefront afiliada (área geral "Lojas"), quando existir.
   * Nunca modificar/concatenar query nela — é a URL exata cadastrada no
   * programa do merchant (ex: Cobasi Minha Loja/MAIS).
   */
  storefrontAffiliateUrl?: string;
  /**
   * Monta a URL de busca afiliada dado um produto e o ID de afiliado.
   * Quando não definida, usa o comportamento padrão (fallbackUrl/directUrl).
   * O ID vem de NEXT_PUBLIC_AFFILIATE_{ID_MAIUSCULO}.
   *
   * Formatos por rede:
   *  - Awin feed : ofertas por GTIN exato no backend
   *  - Shopee Affiliates : URL base do painel (opaco, sem query)
   *  - ML Afiliados : affId=seuId na URL de busca
   *  - Cobasi NÃO usa este mecanismo — sua monetização real (Minha
   *    Loja/MAIS) é resolvida por services/price-service (CommerceEngine/
   *    CobasiProvider), não por AFF/buildAffiliateUrl. O buildAffiliateUrl
   *    da Cobasi abaixo é legado, nunca ligado por env var real.
   */
  buildAffiliateUrl?: (query: string, affiliateId: string) => string;
}

// ── Affiliate-only commerce ────────────────────────────────────────────────
// Em produção, as lojas expostas no app são controladas pelo catálogo central
// abaixo. O clique de produto tenta primeiro ofertas monetizáveis do backend;
// os links diretos aqui existem como navegação de loja quando não há oferta
// automática para aquele item.
const _affiliateOnlyOverride = process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
export const AFFILIATE_ONLY_COMMERCE: boolean =
  _affiliateOnlyOverride != null
    ? _affiliateOnlyOverride === 'true' || _affiliateOnlyOverride === '1'
    : process.env.NODE_ENV === 'production';

// ── IDs de afiliado lidos das env vars (bakeadas no build) ────────────────────
// Configure em .env.local ou no VPS /etc/petmol/petmol.env:
//   NEXT_PUBLIC_AFFILIATE_COBASI=https://www.lomadee.com/link/SEU_ID/_id_SEU_PROGRAMA/
//   NEXT_PUBLIC_AFFILIATE_SHOPEE=https://s.shopee.com.br/SUA_URL_AFILIADA
const AFF: Record<HomeShoppingPartnerId, string | undefined> = {
  cobasi:       process.env.NEXT_PUBLIC_AFFILIATE_COBASI,
  shopee:       process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE,
  zeenow:       undefined, // Awin (advertiser 127557, approved) — sem link genérico Lomadee-style
  zeedog:       undefined, // Awin (advertiser 127555, approved) — sem link genérico Lomadee-style
};

export const HOME_SHOPPING_PARTNERS: HomeShoppingPartner[] = [
  {
    id: 'cobasi',
    name: 'Cobasi',
    description: 'Compare preço e entrega para ração e cuidados',
    logoSrc: '/partner-logos/cobasi.png',
    logoAlt: 'Cobasi',
    fallbackUrl: 'https://www.cobasi.com.br',
    // Programa real: Minha Loja Cobasi / Empreendedor MAIS — storefront fixa
    // confirmada e ligada (usada só pela área geral "Lojas", abaixo em
    // storefrontAffiliateUrl). O buildAffiliateUrl desta entrada é legado,
    // nunca ativado por env var real (ver comentário na interface acima).
    //
    // "Comprar novamente" de um produto específico NÃO usa este arquivo —
    // é resolvido dinamicamente por services/price-service (CommerceEngine/
    // CobasiProvider, GET /commerce/offers), via ProductAffiliateLink
    // cadastrado (modo "cached") ou UTM (modo "utm") — ver docs/AFFILIATES.md.
    //
    // Awin (rede) também lista a Cobasi como advertiser (17870, feed
    // disponível) — status comercial ainda 'pending' junto à Awin; não
    // confundir com o programa MAIS acima, que é o único de fato ligado
    // hoje. Ver services/price-service/src/awin_advertisers.py.
    //
    // 'active': único merchant hoje com mecanismo de fato ligado em código.
    affiliateStatus: 'active',
    merchantType: 'retailer',
    affiliateMode: 'product_deeplink',
    supportsProductDeepLink: true,
    supportsStorefrontAffiliate: true,
    storefrontAffiliateUrl: 'https://minhaloja.cobasi.com.br?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol',
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.cobasi.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'shopee',
    name: 'Shopee',
    description: 'Produtos pet com preços competitivos',
    logoSrc: '/partner-logos/shopee.png',
    logoAlt: 'Shopee',
    directUrl: 'https://shopee.com.br/search?keyword=pet',
    // Ofertas por produto vivem no backend via MarketplaceOfferProvider,
    // gated por SHOPEE_AFFILIATE_ENABLED. Esta URL direta é só fallback de
    // navegação para busca/loja quando não há oferta automática.
    affiliateStatus: 'active',
    merchantType: 'marketplace',
    affiliateMode: 'product_deeplink',
    supportsProductDeepLink: true,
    supportsStorefrontAffiliate: false,
    // NEXT_PUBLIC_AFFILIATE_SHOPEE deve ser uma URL oficial gerada no
    // painel da Shopee. Se ela contiver "{query}", substituímos pelo
    // termo buscado; se for um shortlink/storefront opaco, abrimos a URL
    // exatamente como veio, sem tentar inventar parâmetro.
    buildAffiliateUrl: (query, base) =>
      base.includes('{query}') ? base.replaceAll('{query}', encodeURIComponent(query)) : base,
  },
  {
    id: 'zeenow',
    name: 'Zee Now',
    description: 'Entrega rápida de produtos pet',
    logoSrc: '/partner-logos/zeenow.png',
    logoAlt: 'Zee Now',
    fallbackUrl: 'https://www.zeenow.com.br',
    // Awin advertiser 127557 — approved, feed 116779 com 13.835 produtos.
    // Ofertas por produto são resolvidas pelo AwinFeedProvider via GTIN.
    affiliateStatus: 'active',
    merchantType: 'retailer',
    affiliateMode: 'product_deeplink',
    supportsProductDeepLink: true,
    supportsStorefrontAffiliate: false,
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.zeenow.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'zeedog',
    name: 'Zee Dog',
    description: 'Produtos e acessórios de design para pets',
    logoSrc: '/partner-logos/zeedog.png',
    logoAlt: 'Zee Dog',
    fallbackUrl: 'https://www.zeedog.com.br',
    // Awin advertiser 127555 — approved, feed 116649 com 1.799 produtos
    // observados e GTINs válidos. Ofertas por produto são resolvidas pelo
    // AwinFeedProvider via GTIN.
    affiliateStatus: 'active',
    merchantType: 'retailer',
    affiliateMode: 'product_deeplink',
    supportsProductDeepLink: true,
    supportsStorefrontAffiliate: false,
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.zeedog.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
];

// URLs diretas só podem ser usadas em desenvolvimento. Em produção
// affiliate-only, ausência de link afiliado confirmado vira "sem URL" em
// vez de abrir uma busca que não remunera o PETMOL.
const DIRECT_SEARCH_URLS: Record<HomeShoppingPartnerId, (q: string) => string> = {
  cobasi:       (q) => `https://www.cobasi.com.br/busca?q=${encodeURIComponent(q)}`,
  shopee:       (q) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`,
  zeenow:       (q) => `https://www.zeenow.com.br/busca?q=${encodeURIComponent(q)}`,
  zeedog:       (q) => `https://www.zeedog.com.br/busca?q=${encodeURIComponent(q)}`,
};

// Cobasi's "Minha Loja"/"Mais" storefront (minhaloja.cobasi.com.br/paco)
// was tried here as a direct-affiliate alternative to Lomadee below, but
// reverse-engineered and ruled out for this use case: its own loader
// script (maisLoad.js) only reads utm_campaign to fetch a FIXED, pre-
// curated product showcase from a third-party API
// (api-seedmais.mais.com.br/api/Store/{campaign}) — it has no query/search
// parameter at all, so it can never deep-link to a specific product like
// "Comprar novamente" needs (confirmed by reading the actual loader
// script, not guessing). Also found that API currently returns 503 for
// the "petmol" campaign, so the store may not even be provisioned yet.
// Worth revisiting as a generic "visit our curated Cobasi picks" entry
// point once that's confirmed working — not as a replacement for
// per-product search.

/**
 * Resolve URL genérica de parceiro. Para produto específico, o caminho
 * correto é sempre /commerce/offers, que devolve link monetizado por
 * produto/GTIN. Esta função é só para loja/busca genérica.
 */
export function resolvePartnerUrl(
  partner: HomeShoppingPartner,
  query: string,
  _leadId: string,
): string | null {
  void _leadId;
  const affId = AFF[partner.id];

  // Afiliado de busca configurado → usa link rastreado diretamente.
  if (affId && partner.buildAffiliateUrl) {
    return partner.buildAffiliateUrl(query, affId);
  }

  // Storefront afiliada fixa confirmada.
  if (partner.storefrontAffiliateUrl) {
    return partner.storefrontAffiliateUrl;
  }

  if (AFFILIATE_ONLY_COMMERCE) {
    return null;
  }

  // Dev/local: permite URL direta para testar navegação sem credenciais.
  const buildDirect = DIRECT_SEARCH_URLS[partner.id];
  if (buildDirect) return buildDirect(query);

  if (partner.directUrl) return partner.directUrl;
  if (partner.fallbackUrl) return partner.fallbackUrl;
  return `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(query)}`;
}

export function isStandaloneInstalledApp(): boolean {
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
 *
 * Inside the Capacitor native shell (iOS/Android), neither of the above
 * applies: the WebView has no chrome at all, so window.open/location.href
 * would just navigate the store's checkout INSIDE the app's own WebView —
 * exactly what the affiliate-link handoff must never do. @capacitor/browser
 * opens the partner in the system browser (SFSafariViewController / Chrome
 * Custom Tabs) instead, preserving the affiliate URL/UTM/SubIDs untouched.
 */
export function navigateToPartnerUrl(url: string): void {
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url }));
    return;
  }
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
): boolean {
  const partner = HOME_SHOPPING_PARTNERS.find((entry) => entry.id === partnerId);
  if (!partner) return false;

  const url = resolvePartnerUrl(partner, query, '');
  if (!url) {
    void trackClick({
      source: 'home',
      cta_type: 'shop_redirect_unavailable',
      target: partner.id,
      link_type: 'direct',
      metadata: { reason: 'missing_affiliate_url' },
    });
    return false;
  }
  navigateToPartnerUrl(url);

  // Analítica em background — não bloqueia a navegação
  void trackClick({
    source: 'home',
    cta_type: 'shop_redirect',
    target: partner.id,
    link_type: partnerGenericLinkType(partner.id),
  });
  return true;
}

export function partnerGenericLinkType(partnerId: HomeShoppingPartnerId): 'affiliate_search' | 'affiliate_store' | 'direct' {
  const partner = HOME_SHOPPING_PARTNERS.find((entry) => entry.id === partnerId);
  if (AFF[partnerId] && partner?.buildAffiliateUrl) return 'affiliate_search';
  if (partner?.storefrontAffiliateUrl) return 'affiliate_store';
  return 'direct';
}

/** Retorna true se o parceiro tem caminho genérico afiliado confirmado. */
export function partnerHasAffiliate(partnerId: HomeShoppingPartnerId): boolean {
  return partnerGenericLinkType(partnerId) !== 'direct';
}

/** Quantos parceiros têm link afiliado ativo (útil para debug/admin). */
export function countActiveAffiliates(): number {
  return HOME_SHOPPING_PARTNERS.filter((partner) => partnerHasAffiliate(partner.id)).length;
}

// ── Visibilidade comercial (affiliate-only) ────────────────────────────────
// O catálogo atual do app é deliberadamente pequeno: Cobasi, Shopee, Zee Now
// e Zee Dog. Remover um merchant daqui é suficiente para tirá-lo das áreas de
// loja/compra sem depender de flags antigas.

/**
 * Área geral "Lojas": qualquer merchant do catálogo atual aparece, salvo
 * desativação explícita.
 */
export function isPartnerVisibleInStoreArea(partner: HomeShoppingPartner): boolean {
  if (partner.affiliateStatus === 'disabled') return false;
  if (!AFFILIATE_ONLY_COMMERCE) return true;
  return partnerHasAffiliate(partner.id);
}

/**
 * Fluxos por busca de texto (QuickBuyRow — recompra rápida na Loja do Pet):
 * expõem o mesmo conjunto de lojas do catálogo atual.
 */
export function isPartnerVisibleForSearch(partner: HomeShoppingPartner): boolean {
  if (partner.affiliateStatus === 'disabled') return false;
  if (!AFFILIATE_ONLY_COMMERCE) return true;
  return partnerHasAffiliate(partner.id);
}

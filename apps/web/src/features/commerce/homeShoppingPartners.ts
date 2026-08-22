import { trackClick } from '@/lib/analytics/click';
import { AMAZON_ASSOCIATE_TAG, buildAmazonSearchUrl } from './amazonAffiliate';

export type HomeShoppingPartnerId = 'cobasi' | 'petz' | 'amazon' | 'petlove' | 'doglife' | 'shopee' | 'mercadolivre' | 'araujo' | 'zeenow' | 'zeedog';

/**
 * Estado real da integração de afiliado do merchant — não confundir com
 * "a loja aparece na UI hoje". Ciclo de vida esperado:
 *  - pending   : cadastro/aprovação comercial em andamento, nada tecnicamente ligado
 *  - approved  : programa aprovado comercialmente, mas ainda não ligado em código
 *  - active    : ligado em código E com caminho monetizável real testável
 *  - disabled  : desativado deliberadamente (sem programa adequado no momento)
 *
 * Regra de visibilidade em produção: SOMENTE 'active' pode aparecer. 'pending'
 * e 'approved' ficam ocultos até o mecanismo estar de fato ligado — programa
 * aprovado comercialmente não é a mesma coisa que gerar comissão de verdade.
 */
export type AffiliateStatus = 'disabled' | 'pending' | 'approved' | 'active';

/**
 * Tipo de relação comercial do merchant — cada um precisa de tratamento
 * diferente (ver docs/AFFILIATES.md):
 *  - retailer    : varejista direto — produto → link afiliado do produto
 *  - marketplace : produto → oferta/publicação de um vendedor → link afiliado
 *                  (a oferta pode expirar/mudar; não é vínculo permanente com o GTIN)
 *  - amazon      : tratado separadamente (Associates tem regras/ferramentas próprias)
 *  - service      : afiliação de serviço/plano, não de produto/GTIN (ex: plano de saúde)
 */
export type MerchantType = 'retailer' | 'marketplace' | 'amazon' | 'service';

/**
 * Mecanismo pelo qual o merchant monetiza — cada rede/programa tem o seu,
 * não dá para tratar todos como se fossem iguais (ex: Cobasi/Petz/Petlove
 * NÃO usam necessariamente a mesma rede só por serem do mesmo setor).
 *  - fixed_store        : storefront afiliada fixa (sem deep link por produto)
 *  - product_deeplink   : link afiliado específico por produto/GTIN
 *  - search_template     : template de busca com ID de afiliado embutido
 *  - tracking_tag        : tag de afiliado anexada à URL (ex: Amazon Associates)
 *  - none                : mecanismo ainda não confirmado/documentado
 */
export type AffiliateMode = 'fixed_store' | 'product_deeplink' | 'search_template' | 'tracking_tag' | 'none';

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
   * Formatos por rede (nenhum é Awin — Awin ainda não está ligado em
   * nenhuma superfície; ver services/price-service/src/awin_advertisers.py):
   *  - Amazon Associates : tag=seuId-20
   *  - Lomadee (Petz, Petlove) : URL base do painel + &url={destino}
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
// Em produção, uma loja só pode aparecer/ser oferecida como CTA de compra
// quando existe caminho monetizável real (afiliado). Fallback para link
// comum (sem comissão) só é permitido em dev, para poder testar o fluxo.
// Ainda não é consumido por resolvePartnerUrl/openHomeShoppingPartner nem
// pela UI — isso entra em um commit seguinte de filtragem; por ora é só a
// flag disponível para quem for aplicá-la.
const _affiliateOnlyOverride = process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
export const AFFILIATE_ONLY_COMMERCE: boolean =
  _affiliateOnlyOverride != null
    ? _affiliateOnlyOverride === 'true' || _affiliateOnlyOverride === '1'
    : process.env.NODE_ENV === 'production';

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
  // Amazon tem tag real (petmol-20, Programa de Associados PJ aprovado,
  // categoria Pet Shop 11% informado) — NEXT_PUBLIC_AFFILIATE_AMAZON só
  // serve pra sobrescrever em caso de troca de tag; sem ela, cai no
  // default real embutido em amazonAffiliate.ts (não é segredo, aparece
  // em toda URL gerada, como o publisher ID da Awin).
  amazon:       process.env.NEXT_PUBLIC_AFFILIATE_AMAZON || AMAZON_ASSOCIATE_TAG,
  cobasi:       process.env.NEXT_PUBLIC_AFFILIATE_COBASI,
  petz:         process.env.NEXT_PUBLIC_AFFILIATE_PETZ,
  petlove:      process.env.NEXT_PUBLIC_AFFILIATE_PETLOVE,
  shopee:       process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE,
  mercadolivre: process.env.NEXT_PUBLIC_AFFILIATE_ML,
  doglife:      process.env.NEXT_PUBLIC_AFFILIATE_DOGLIFE,
  araujo:       process.env.NEXT_PUBLIC_AFFILIATE_ARAUJO,
  zeenow:       undefined, // Awin (advertiser 127557, pending) — sem link genérico Lomadee-style
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
    id: 'petz',
    name: 'Petz',
    description: 'Compare preço e entrega para produtos pet',
    logoSrc: '/partner-logos/petz.png',
    logoAlt: 'Petz',
    fallbackUrl: 'https://www.petz.com.br',
    // Dois caminhos possíveis, nenhum ligado ainda — 'pending' cobre ambos:
    //  1. Cadastro PJ direto (Lomadee-style, buildAffiliateUrl abaixo)
    //     bloqueado por validação de CNAE (CNPJ já tem 7319-0/02, questão
    //     em tratamento).
    //  2. Via Awin: advertiser 127553, status comercial 'pending' junto à
    //     Awin, feed_available=False (ver awin_advertisers.py) — mesmo
    //     aprovado, exigiria monetização por texto/API, não por feed
    //     estruturado (GTIN), diferente do caminho da Cobasi.
    // 'pending', não 'disabled': não é recusa, é aprovação em andamento.
    affiliateStatus: 'pending',
    merchantType: 'retailer',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.petz.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'amazon',
    name: 'Amazon',
    description: 'Consulte preço e disponibilidade na Amazon',
    logoSrc: '/partner-logos/amazon.svg',
    logoAlt: 'Amazon',
    fallbackUrl: 'https://www.amazon.com.br/s?k=pet+shop',
    // MVP pronto e testado (14/08/2026): conta Amazon Associados PJ
    // criada, tag petmol-20 tecnicamente ativa, categoria Pet Shop com 11%
    // informado, cadastro fiscal e bancário concluído. Sem Creators API
    // ainda (credenciais não emitidas; a PA-API 5 antiga está
    // descontinuada) — o mecanismo real é só link de busca com tag, gerado
    // por buildAmazonSearchUrl (amazonAffiliate.ts), nunca preço/imagem/
    // nota da Amazon (sem scraping). affiliateMode 'search_template' (não
    // 'tracking_tag': não é uma tag colada numa URL qualquer, é sempre um
    // link de busca construído e validado por domínio/esquema).
    //
    // IMPORTANTE — não confundir "link tecnicamente ativo" com "conta
    // aprovada": a candidatura ao Programa de Associados ainda está em
    // análise pela Amazon, que exige pelo menos 3 vendas qualificadas nos
    // primeiros 180 dias pra revisar a conta. Até lá, o link com a tag
    // funciona normalmente (é assim que a Amazon rastreia as vendas que
    // qualificam a candidatura), mas não é correto afirmar em código ou
    // documentação que a conta "já foi aprovada".
    //
    // Ativada de propósito, desacoplada do Shopee (revisão 19/08/2026) —
    // a decisão anterior de "só ligar as duas juntas" foi abandonada:
    // Amazon precisa gerar as 3 vendas qualificadas o quanto antes pra
    // sequer entrar em análise, então esperar Shopee só atrasava isso sem
    // necessidade.
    affiliateStatus: 'active',
    merchantType: 'amazon',
    affiliateMode: 'search_template',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
    buildAffiliateUrl: (query, tag) => buildAmazonSearchUrl(query, tag),
  },
  {
    id: 'petlove',
    name: 'Petlove',
    description: 'Compare preço e entrega em saúde e ração',
    logoSrc: '/partner-logos/petlove.png',
    logoAlt: 'Petlove',
    fallbackUrl: 'https://www.petlove.com.br',
    // "Petlove Produtos" (varejo geral) — sem programa de catálogo completo
    // confirmado para o modelo PETMOL hoje. Desativado deliberadamente, não
    // "em aprovação" — não presumir Lomadee nem confundir com Petlove Saúde
    // (afiliação de serviço/plano, tratada separadamente, não integrada
    // nesta tarefa).
    affiliateStatus: 'disabled',
    merchantType: 'retailer',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
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
    // No backend, este ID resolve para `petlove_dog_life_url`/`handoff_doglife`
    // (plano PetLove), o que sugere ser o MESMO relacionamento comercial que
    // docs/AFFILIATES.md descreve como "Petlove Plano de Saúde" (service) —
    // não confirmado, sinalizado como pendência de esclarecimento. Não
    // assumir integração automática por associação com Petlove Produtos
    // (merchant 'petlove' acima, que é retailer e é uma relação diferente).
    affiliateStatus: 'pending',
    merchantType: 'service',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
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
    // Status real 14/08/2026: conta virou PJ, dados fiscais/bancários em
    // avaliação, Instagram conectado — mas AINDA falta confirmar
    // petmol.com.br como "mídia aprovada" no Portal do Afiliado E obter o
    // primeiro link oficial real. 'pending' (não 'active') mantém isto
    // fora de produção pelas duas checagens de sempre
    // (isPartnerVisibleInStoreArea/ForSearch exigem affiliateStatus
    // 'active') — sem precisar de uma flag nova aqui. affiliateMode
    // 'none' porque não existe mecanismo confirmado ainda (nem para esta
    // entrada genérica de "Lojas", nem para o link oficial por produto,
    // que vive à parte em MarketplaceOffer/MarketplaceOfferProvider no
    // backend, gated por SHOPEE_AFFILIATE_ENABLED — ver
    // marketplace_offer_provider.py e docs/AFFILIATES.md). Quando isso
    // mudar, o link a usar aqui é o que a Shopee de fato fornecer — NUNCA
    // um template construído por nós (proibido pelas regras do programa).
    affiliateStatus: 'pending',
    merchantType: 'marketplace',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
  },
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    description: 'Ampla seleção de produtos pet',
    logoSrc: '/partner-logos/mercadolivre.png',
    logoAlt: 'Mercado Livre',
    directUrl: 'https://www.mercadolivre.com.br/c/pet-shop',
    // "affId" arbitrário não confirma comissão real — cadastro ainda por
    // fazer. Marketplace: oferta é por publicação/vendedor, não vínculo
    // permanente com o produto.
    affiliateStatus: 'pending',
    merchantType: 'marketplace',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
    buildAffiliateUrl: (query, affId) =>
      `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}?affId=${affId}`,
  },
  {
    id: 'zeenow',
    name: 'Zee Now',
    description: 'Entrega rápida de produtos pet',
    logoSrc: '/partner-logos/zeenow.png',
    logoAlt: 'Zee Now',
    fallbackUrl: 'https://www.zeenow.com.br',
    // Awin advertiser 127557 — feed_available=True (~13.746 produtos
    // observados no ShopWindow Awin), commercial_status 'pending' — assim
    // que aprovada e sincronizada (mesmo caminho da Cobasi hoje, ver
    // awin_feed_sync.py), passa a aparecer automaticamente na busca de
    // GET /commerce/awin-search sem precisar mudar nada aqui. Até lá, só
    // link de busca genérico (sem comissão).
    affiliateStatus: 'pending',
    merchantType: 'retailer',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
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
    // observados e GTINs válidos. Não virar 'active' aqui: Zee Dog deve
    // aparecer pelo fluxo exato de GTIN do CommerceEngine, não por link
    // genérico de busca.
    affiliateStatus: 'approved',
    merchantType: 'retailer',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
    buildAffiliateUrl: (query, base) =>
      `${base}&url=${encodeURIComponent(`https://www.zeedog.com.br/busca?q=${encodeURIComponent(query)}`)}`,
  },
  {
    id: 'araujo',
    name: 'Drogaria Araújo',
    description: 'Medicamentos e produtos de saúde pet',
    logoSrc: '/partner-logos/araujo.png',
    logoAlt: 'Drogaria Araújo',
    directUrl: 'https://www.araujo.com.br/busca?q=pet',
    // Aguardando programa de afiliação aprovado para o PETMOL.
    affiliateStatus: 'pending',
    merchantType: 'retailer',
    affiliateMode: 'none',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: false,
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
 * Resolve a URL final de um parceiro para um produto específico.
 * Prioridade: link afiliado > URL de busca direta > directUrl > fallbackUrl.
 * Sem proxy de handoff para não bloquear abertura no mobile.
 */
export function resolvePartnerUrl(
  partner: HomeShoppingPartner,
  query: string,
  _leadId: string,
): string {
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
    link_type: AFF[partner.id] ? 'affiliate_search' : 'direct',
  });
}

/** Retorna true se o parceiro tem ID de afiliado configurado. */
export function partnerHasAffiliate(partnerId: HomeShoppingPartnerId): boolean {
  return Boolean(AFF[partnerId]);
}

/** Quantos parceiros têm link afiliado ativo (útil para debug/admin). */
export function countActiveAffiliates(): number {
  return Object.values(AFF).filter(Boolean).length;
}

// ── Visibilidade comercial (affiliate-only) ────────────────────────────────
// Em dev, mostra todos os 8 (comportamento de sempre, para poder testar o
// fluxo sem precisar configurar nada). Em prod, cada superfície só mostra
// merchants que de fato resolvem para algo monetizável naquele contexto —
// nunca um merchant que só vai cair no DIRECT_SEARCH_URLS/fallback comum.

/**
 * Área geral "Lojas": visível se o merchant está 'active' (ligado em código
 * de fato, não só aprovado comercialmente — ver AffiliateStatus) E tem
 * storefront afiliada fixa (abre direto, sem busca — ver
 * storefrontAffiliateUrl) OU afiliado configurado para busca por categoria
 * (buildAffiliateUrl com AFF[id] setado).
 */
export function isPartnerVisibleInStoreArea(partner: HomeShoppingPartner): boolean {
  if (!AFFILIATE_ONLY_COMMERCE) return true;
  if (partner.affiliateStatus !== 'active') return false;
  return Boolean(partner.storefrontAffiliateUrl) || partnerHasAffiliate(partner.id);
}

/**
 * Fluxos por busca de texto (QuickBuyRow — recompra rápida na Loja do Pet):
 * a storefront não serve aqui — precisa de afiliado 'active' que funcione
 * com query.
 */
export function isPartnerVisibleForSearch(partner: HomeShoppingPartner): boolean {
  if (!AFFILIATE_ONLY_COMMERCE) return true;
  if (partner.affiliateStatus !== 'active') return false;
  return partnerHasAffiliate(partner.id);
}

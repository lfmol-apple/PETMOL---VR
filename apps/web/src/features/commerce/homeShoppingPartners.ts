import { Capacitor } from '@capacitor/core';
import { trackClick } from '@/lib/analytics/click';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { copyText } from '@/lib/clipboard';

export type HomeShoppingPartnerId = 'cobasi' | 'petz' | 'mercadolivre' | 'shopee';

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
//   NEXT_PUBLIC_AFFILIATE_MERCADOLIVRE=https://www.mercadolivre.com.br/social/SUA_TAG?...
const DEFAULT_SHOPEE_AFFILIATE_URL = 'https://s.shopee.com.br/4AzW1leQcW';
const DEFAULT_MERCADOLIVRE_PROFILE_URL = 'https://meli.la/2ftAKx5';

const AFF: Record<HomeShoppingPartnerId, string | undefined> = {
  cobasi:       process.env.NEXT_PUBLIC_AFFILIATE_COBASI,
  petz:         undefined, // storefront fixa (storefrontAffiliateUrl abaixo), não usa este mecanismo
  mercadolivre: process.env.NEXT_PUBLIC_AFFILIATE_MERCADOLIVRE,
  shopee:       process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE ?? DEFAULT_SHOPEE_AFFILIATE_URL,
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
    description: 'Loja parceira PETMOL — cupom PETTMOL, 10% de desconto',
    logoSrc: '/partner-logos/petz.png',
    logoAlt: 'Petz',
    // Programa próprio "Loja Parceira" (25/08/2026) — URL FIXA da vitrine,
    // sem busca/deep-link por produto (confirmado: a Petz não expõe isso).
    // Cupom PETTMOL (10% off) é aplicado manualmente pelo tutor no
    // checkout — nunca embutido na URL. Deve espelhar o mesmo valor de
    // STOREFRONT_AFFILIATE_URLS["petz"] em affiliate_links.py (backend).
    //
    // A Petz só aparece pra um produto específico quando GET
    // /commerce/petz-direct-link confirma que aquele produto existe no
    // catálogo da Petz (ver fetchPetzDirectLink em productPricing.ts).
    affiliateStatus: 'active',
    merchantType: 'retailer',
    affiliateMode: 'fixed_store',
    supportsProductDeepLink: false,
    supportsStorefrontAffiliate: true,
    storefrontAffiliateUrl: 'https://www.petz.com.br/parceiro/pettmol',
  },
  {
    id: 'mercadolivre',
    name: 'Mercado Livre',
    description: 'Ofertas marketplace cadastradas com link oficial',
    logoSrc: '/partner-logos/mercadolivre.png',
    logoAlt: 'Mercado Livre',
    directUrl: 'https://lista.mercadolivre.com.br/pet',
    // Marketplace: ofertas por produto vivem no backend via
    // MarketplaceOfferProvider("mercadolivre") e só aparecem com link
    // oficial cadastrado no Gerador de produtos recomendados. A vitrine
    // genérica abre o perfil/lista de recomendações informado no painel.
    affiliateStatus: 'active',
    merchantType: 'marketplace',
    affiliateMode: 'product_deeplink',
    supportsProductDeepLink: true,
    supportsStorefrontAffiliate: true,
    storefrontAffiliateUrl: DEFAULT_MERCADOLIVRE_PROFILE_URL,
    buildAffiliateUrl: (query, base) =>
      base.includes('{query}') ? base.replaceAll('{query}', encodeURIComponent(query)) : base,
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
];

// URLs diretas só podem ser usadas em desenvolvimento. Em produção
// affiliate-only, ausência de link afiliado confirmado vira "sem URL" em
// vez de abrir uma busca que não remunera o PETMOL.
const DIRECT_SEARCH_URLS: Record<HomeShoppingPartnerId, (q: string) => string> = {
  cobasi:       (q) => `https://www.cobasi.com.br/busca?q=${encodeURIComponent(q)}`,
  // Petz não tem busca por produto — resolvePartnerUrl() sempre resolve
  // pela storefrontAffiliateUrl antes de chegar aqui; nunca de fato usado.
  petz:         () => 'https://www.petz.com.br/parceiro/pettmol',
  mercadolivre: (q) => `https://lista.mercadolivre.com.br/${encodeURIComponent(q)}`,
  shopee:       (q) => `https://shopee.com.br/search?keyword=${encodeURIComponent(q)}`,
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
  window.open(url, '_blank', 'noopener');
}

export const PETZ_COUPON_CODE = 'PETTMOL';

export const PETZ_PARTNER_STORE_URL = 'https://www.petz.com.br/parceiro/pettmol';
const PETZ_ALLOWED_HOSTS = ['petz.com.br', 'www.petz.com.br'];

/** true só para uma URL https de petz.com.br (higiene / testes). */
export function isRealPetzUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && PETZ_ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Ponte /go/petz — resolve DOIS problemas de uma vez:
 *
 * 1. Interceptação pelo app da Petz (Universal Link / App Link): o SO só
 *    entrega o link ao app num TOQUE de <a>, nunca num redirect por
 *    JavaScript nem no load inicial do SFSafariViewController (Apple docs
 *    + relatos iOS 17/18 — ver docs/AFFILIATES.md §Petz). A página
 *    /go/petz fica em petmol.com.br (sem associação universal) e navega
 *    pra Petz só por JS.
 *
 * 2. Monetização: a comissão do Parceiro Petz só é garantida quando o
 *    cliente ENTRA pela Loja Parceira `petz.com.br/parceiro/pettmol` —
 *    aí o desconto de 10% e o cupom PETTMOL vêm aplicados sozinhos e a
 *    venda é atribuída (cookie `petzPartner`, ver
 *    docs/PETZ_COMMISSION_VALIDATION.md). Não existe deep link oficial de
 *    produto pela loja parceira — o cliente cai na home e busca. Por isso
 *    a ponte SEMPRE leva pra /parceiro/pettmol e passa o NOME do produto
 *    (`q`), que a ponte copia pro clipboard pra o cliente colar na busca
 *    da Petz. (O cupom NÃO é copiado — já é automático na loja parceira.)
 */
export function petzBridgeUrl(productName?: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.petmol.com.br';
  const name = (productName ?? '').trim();
  const suffix = name ? `?q=${encodeURIComponent(name.slice(0, 120))}` : '';
  return `${origin}/go/petz${suffix}`;
}

/** Margem antes do 2º hop (Petz grava petzPartner no header da resposta;
 *  800ms bastou nos testes, 2000ms é a margem de rede escolhida). */
export const PETZ_TWO_HOP_DELAY_MS = 2000;

/** Teto de espera pelo `browserPageLoaded` do 1º hop nativo antes de
 *  seguir mesmo assim (o Set-Cookie já veio no header da resposta bem
 *  antes do load terminar). */
export const PETZ_NATIVE_HOP_LOAD_TIMEOUT_MS = 3500;
/** Intervalo entre fechar e reabrir o navegador do sistema — dá tempo do
 *  SFSafariViewController desmontar pra `@capacitor/browser` 8.0.4
 *  aceitar a 2ª `open` (no iOS `prepare()` só cria se `safariVC == nil`). */
export const PETZ_NATIVE_REOPEN_GAP_MS = 700;

/**
 * TWO-HOP NATIVO (Capacitor — app PETMOL).
 *
 * No app, `window.open` não devolve handle utilizável, então o two-hop
 * web não roda. Aqui a gente encadeia dois `@capacitor/browser`:
 *   1. abre a Loja Parceira no navegador do sistema (SFSafariViewController
 *      no iOS / Chrome Custom Tabs no Android) → a Petz grava o cookie
 *      `petzPartner` no header da resposta;
 *   2. espera a página carregar, FECHA e REABRE já no 2º hop (página exata
 *      do produto, ou a busca da Petz com o termo). O navegador do sistema
 *      mantém a mesma sessão/cookies dentro do app, então a atribuição
 *      continua valendo.
 *
 * A COMISSÃO já está garantida assim que o 1º hop carrega. Se o 2º hop
 * falhar (ex: a view ainda não desmontou e a 2ª `open` é recusada),
 * reabrimos a Loja Parceira — o mesmo destino seguro do fallback.
 *
 * Segurança: o cookie é criado EXCLUSIVAMENTE pela Petz numa navegação
 * top-level a `/parceiro/pettmol`. Não lemos, não fabricamos, não
 * copiamos cookie; não inventamos parâmetro de URL.
 *
 * @returns true se assumiu o fluxo (mesmo caindo no reabrir-a-loja
 *   interno); false se nem o 1º hop abriu (o chamador usa a ponte /go/petz).
 */
async function openPetzNativeTwoHop(secondHopUrl: string): Promise<boolean> {
  let Browser: (typeof import('@capacitor/browser'))['Browser'];
  try {
    ({ Browser } = await import('@capacitor/browser'));
  } catch {
    return false;
  }

  // 1º hop — Loja Parceira. Set-Cookie `petzPartner` vem no header.
  try {
    await Browser.open({ url: PETZ_PARTNER_STORE_URL });
  } catch {
    return false;
  }

  // Espera a Loja Parceira carregar (garante o Set-Cookie), com teto de
  // tempo. Se o usuário fechar antes, aborta o 2º hop.
  let userClosed = false;
  await new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      void Browser.removeAllListeners();
      resolve();
    };
    void Browser.addListener('browserPageLoaded', finish);
    void Browser.addListener('browserFinished', () => {
      userClosed = true;
      finish();
    });
    setTimeout(finish, PETZ_NATIVE_HOP_LOAD_TIMEOUT_MS);
  });
  if (userClosed) return true; // desistência do usuário — não força o produto

  // Fecha e reabre já no produto. O cookie persiste na sessão do
  // navegador do sistema (mesmo app) → atribuição mantida.
  try {
    await Browser.close();
  } catch {
    /* já fechado */
  }
  await new Promise<void>((r) => setTimeout(r, PETZ_NATIVE_REOPEN_GAP_MS));

  try {
    await Browser.open({ url: secondHopUrl }); // 2º hop — produto exato ou busca da Petz
  } catch {
    // 2ª open recusada (view ainda montada). Comissão intacta (cookie já
    // gravado) — reabre a Loja Parceira, comportamento seguro.
    try {
      await Browser.open({ url: PETZ_PARTNER_STORE_URL });
    } catch {
      /* nada aberto — raro; usuário pode tocar de novo */
    }
  }
  return true;
}

/**
 * Clique "Ver na Petz".
 *
 * O 2º hop tem duas formas, na ordem de preferência:
 *  - `productUrl` (`/produto/...`): produto mapeado (`PetzProductMapping`
 *    confirmado) — o cliente cai NA página exata do produto.
 *  - `searchUrl` (`/busca?q=...`): qualquer outro produto — o cliente cai
 *    na BUSCA da Petz já com o termo, escolhe o item certo da lista.
 * Nos dois casos o cookie `petzPartner` (Path=/) sobrevive à navegação →
 * a venda continua atribuída à loja pettmol.
 *
 * TWO-HOP WEB (comprovado no navegador — ver docs/PETZ_COMMISSION_VALIDATION.md):
 *   gesto → window.open('about:blank') → win.location.href = Loja Parceira
 *   (Petz grava o cookie) → aguarda PETZ_TWO_HOP_DELAY_MS →
 *   win.location.replace(2º hop) NA MESMA janela. Tudo por JS (nunca
 *   <a href>) → o link não é entregue ao app da Petz.
 *
 * TWO-HOP NATIVO (Capacitor): sem `window.open` utilizável, encadeia dois
 * `@capacitor/browser` (abre a Loja Parceira → grava cookie → fecha →
 * reabre no 2º hop). Ver `openPetzNativeTwoHop`.
 *
 * FALLBACK (popup bloqueado / sem 2º hop utilizável / nem o 1º hop nativo
 * abriu): ponte /go/petz → só a Loja Parceira, copiando o NOME do produto
 * pra busca manual. Comissão garantida; só o destino do 2º hop que não
 * acontece.
 */
export async function openPetzPartnerStore(
  opts: {
    productUrl?: string | null;
    productName?: string | null;
    searchUrl?: string | null;
  } = {},
): Promise<void> {
  const productUrl = (opts.productUrl ?? '').trim();
  const productName = (opts.productName ?? '').trim();
  const searchUrl = (opts.searchUrl ?? '').trim();

  // 2º hop: página exata do produto > busca da Petz com o termo.
  const secondHop =
    productUrl && isRealPetzUrl(productUrl)
      ? productUrl
      : searchUrl && isRealPetzUrl(searchUrl)
        ? searchUrl
        : '';
  const isNative = Capacitor.isNativePlatform();
  const canTwoHop = !!secondHop && !isNative && typeof window !== 'undefined';

  // window.open PRIMEIRO e SÍNCRONO, dentro do gesto — senão o popup blocker mata.
  const win = canTwoHop ? window.open('about:blank', '_blank') : null;

  if (win) {
    // ── TWO-HOP WEB ──
    try { win.opener = null; } catch { /* noop */ }
    void copyText(PETZ_COUPON_CODE); // cupom como segurança (logado: auto; deslogado: cliente cola)
    showAppToast('Desconto PETTMOL ativado pela Loja Parceira. Cupom PETTMOL também foi copiado caso a Petz solicite.', {
      tone: 'success',
      durationMs: 6000,
    });
    win.location.href = PETZ_PARTNER_STORE_URL; // 1º hop — Petz grava petzPartner
    window.setTimeout(() => {
      try {
        win.location.replace(secondHop); // 2º hop — produto/busca, MESMA janela
      } catch {
        /* janela fechada pelo usuário — ignora */
      }
    }, PETZ_TWO_HOP_DELAY_MS);
    return;
  }

  if (secondHop && isNative) {
    // ── TWO-HOP NATIVO (app PETMOL) ──
    void copyText(PETZ_COUPON_CODE); // cupom como segurança (logado: auto; deslogado: cliente cola)
    showAppToast('Desconto PETTMOL ativado pela Loja Parceira. Cupom PETTMOL também foi copiado caso a Petz solicite.', {
      tone: 'success',
      durationMs: 6000,
    });
    const handled = await openPetzNativeTwoHop(secondHop);
    if (handled) return;
    // nem o 1º hop abriu → cai no fallback abaixo
  }

  // ── FALLBACK: popup bloqueado / sem 2º hop utilizável / 1º hop nativo indisponível ──
  const copied = productName ? await copyText(productName).catch(() => false) : false;
  if (copied) {
    showAppToast(`"${productName}" copiado — cole na busca da Petz. Seu cupom PETTMOL já está na Loja Parceira.`, {
      tone: 'success',
      durationMs: 6000,
    });
  }
  navigateToPartnerUrl(petzBridgeUrl(productName || undefined));
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
  if (partner.id === 'petz') {
    // Grade de lojas: sem produto específico → só Loja Parceira.
    void openPetzPartnerStore();
  } else {
    navigateToPartnerUrl(url);
  }

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
// O catálogo comercial atual do app é deliberadamente pequeno: Cobasi, Petz,
// Mercado Livre e Shopee. Zee Now/Zee Dog podem continuar existindo como
// fonte interna de feed/GTIN no backend, mas não entram nas áreas de
// loja/compra.

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

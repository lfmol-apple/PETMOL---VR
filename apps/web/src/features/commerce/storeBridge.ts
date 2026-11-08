/**
 * Ponte de loja (`/go/loja`) — lojas cujo APP reivindica os links no Android.
 *
 * O Chrome Custom Tab que o @capacitor/browser abre PODE saltar direto para o app da loja quando o domínio dela
 * declara App Links (assetlinks.json com `handle_all_urls`). Aí o PETMOL some do topo e a atribuição da comissão
 * pode se perder. A ponte (página em petmol.com.br que navega por JS com `location.replace`) não é elegível a
 * App Link, então o tutor continua dentro do navegador do PETMOL.
 *
 * Verificado em 08/11/2026 (assetlinks.json dos domínios): Cobasi (com.root.cobasi.Activities), Mercado Livre
 * (com.mercadolibre e outros; também em meli.la), Shopee (com.shopee.br, em shopee.com.br e s.shopee.com.br) e
 * Amazon (com.amazon.mShop.android.shopping; também amzn.to). iOS não precisa: o SFSafariViewController nunca
 * abre Universal Link. Web/PWA não têm app para saltar.
 */
export const STORE_BRIDGE_HOSTS = [
  // Cobasi / MAIS (a ponte já existia antes de 08/11/2026)
  'www.cobasi.com.br', 'cobasi.com.br', 'minhaloja.cobasi.com.br', 'mais.app',
  // Mercado Livre
  'www.mercadolivre.com.br', 'mercadolivre.com.br', 'lista.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'meli.la',
] as const;
// Decisão do dono (08/11/2026): por enquanto o bloqueio do app nativo vale só para o Mercado Livre (e a Cobasi, que já tinha).
// Shopee (com.shopee.br) e Amazon (com.amazon.mShop.android.shopping) também reivindicam os links no Android, mas
// NÃO entram na ponte por ora; para incluir, basta acrescentar o host aqui (e um caso no teste).

/** true só para uma URL https de um host de loja cujo app costuma saltar no Android. */
export function isAppClaimedStoreUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (STORE_BRIDGE_HOSTS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}

export function storeBridgeUrl(target: string): string {
  const origin =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://www.petmol.com.br';
  return `${origin}/go/loja?to=${encodeURIComponent(target)}`;
}

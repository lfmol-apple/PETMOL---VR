/**
 * iPhone: ao tocar na loja, abrir DIRETO o app nativo dela, com o link de afiliado intacto.
 *
 * O que o dono quer ver: o app do Mercado Livre / Shopee / Amazon aberto, com o "◀ PETMOL" pretinho no topo (o iOS mostra
 * essa faixa quando um app abre outro; é a prova de que a pessoa veio pelo link do PETMOL).
 *
 * Por que antes aparecia "às vezes": o `Browser.open` usa o SFSafariViewController, e quem chama o app da loja é o JavaScript
 * da PÁGINA dela — o iOS só mostra a faixa quando quer. Aqui o PETMOL assume a navegação: `window.location.href = <link>`.
 * O Capacitor iOS (WebViewDelegationHandler) cancela a navegação e chama `UIApplication.open(<link>)`: o iOS entrega o link
 * ao app da loja (Universal Link) e mostra o "◀ PETMOL" toda vez. Sem app instalado, o link abre no Safari (a comissão vale
 * pela web). Nenhum plugin nativo novo, nenhum parâmetro do link alterado.
 *
 * Só lojas cuja comissão vai NO PRÓPRIO LINK (parâmetros): Mercado Livre, Shopee e Amazon. Cobasi e Petz dependem de cookie
 * do navegador (o app delas não o carrega) e têm fluxos próprios: ficam fora.
 *
 * REGRA Nº 1: NÃO PERDER COMISSÃO → por enquanto só a conta do DONO usa este caminho (validar o clique no painel de cada loja
 * antes de ampliar aos tutores). Para ampliar, troque `isStoreNativeOpenUser`. Ver docs/AFFILIATES.md.
 */
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export const STORE_NATIVE_OPEN_HOSTS = [
  // Mercado Livre
  'www.mercadolivre.com.br', 'mercadolivre.com.br', 'lista.mercadolivre.com.br', 'meli.la',
  // Shopee
  'shopee.com.br', 'www.shopee.com.br', 's.shopee.com.br',
  // Amazon (o link já sai com a etiqueta: ver withAmazonTag)
  'www.amazon.com.br', 'amazon.com.br', 'amzn.to',
] as const;

export function isStoreNativeOpenUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (STORE_NATIVE_OPEN_HOSTS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}

let cached: boolean | null = null;

/** true só se a conta logada é admin (o dono). Falha de rede/sem login → false (comportamento de sempre). */
export async function isStoreNativeOpenUser(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const token = getToken();
    if (!token) return false;
    // Limite curto: a checagem nunca pode atrasar o toque do tutor (estourou → comportamento de sempre, sem cachear).
    const res = await fetch(`${API_BASE_URL}/v1/admin/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(1500) });
    cached = res.ok;
    return cached;
  } catch {
    return false;
  }
}

/** Para testes. */
export function resetStoreNativeOpenCache(): void {
  cached = null;
}

/** Aquece o resultado ao abrir a Loja (só no iPhone nativo), para o toque na loja não esperar rede. */
export function warmStoreNativeOpen(): void {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform?.() === 'ios') void isStoreNativeOpenUser();
  } catch { /* melhor esforço */ }
}

/** Entrega o link ao iOS (Capacitor → UIApplication.open): abre o app da loja, com o "◀ PETMOL" no topo. */
export function openStoreInNativeApp(url: string): void {
  window.location.href = url;
}

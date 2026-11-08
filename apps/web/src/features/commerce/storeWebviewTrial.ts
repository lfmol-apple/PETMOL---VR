/**
 * TESTE CONTROLADO (iPhone): abrir a loja DENTRO do PETMOL, com a barra do PETMOL no topo.
 *
 * Por quê: no iPhone o navegador seguro (SFSafariViewController) deixa a página da loja chamar o app nativo dela, e o
 * PETMOL some. A janela interna (`@capgo/inappbrowser`, WKWebView) com `preventDeeplink` impede o app da loja de
 * sequestrar a navegação — o mesmo recurso que a Petz já usa.
 *
 * REGRA NÚMERO UM: NÃO PERDER COMISSÃO. Ninguém sabe ainda se o painel de afiliados de cada loja credita a venda feita
 * dentro dessa janela, então o recurso está LIGADO SÓ PARA A CONTA DO DONO (admin) até haver prova. Para os tutores
 * nada muda. O link de afiliado vai INTACTO (nenhum parâmetro alterado). Amazon NUNCA entra: a Política de Aplicativos
 * Móveis dela proíbe link de afiliado em WebView. A Petz tem fluxo próprio.
 *
 * Para ampliar: confirme no painel de cada loja que o clique (e, depois, uma compra de teste) aparece e só então troque
 * `isStoreWebviewTrialUser` por uma regra mais ampla. Ver docs/AFFILIATES.md.
 */
import { Capacitor } from '@capacitor/core';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

export const STORE_WEBVIEW_TRIAL_HOSTS = [
  // Mercado Livre
  'www.mercadolivre.com.br', 'mercadolivre.com.br', 'lista.mercadolivre.com.br', 'meli.la',
  // Shopee
  'shopee.com.br', 'www.shopee.com.br', 's.shopee.com.br',
  // Cobasi / MAIS
  'www.cobasi.com.br', 'cobasi.com.br', 'minhaloja.cobasi.com.br', 'mais.app',
] as const;

/** Só https de um host da lista. Amazon e Petz ficam de fora de propósito. */
export function isStoreWebviewTrialUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && (STORE_WEBVIEW_TRIAL_HOSTS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}

let cached: boolean | null = null;

/** true só se a conta logada é admin (o dono). Falha de rede/sem login → false (comportamento de hoje). */
export async function isStoreWebviewTrialUser(): Promise<boolean> {
  if (cached !== null) return cached;
  try {
    const token = getToken();
    if (!token) return false;
    // Limite curto: a checagem nunca pode atrasar o toque do tutor na loja (estourou → comportamento de hoje, sem cachear).
    const res = await fetch(`${API_BASE_URL}/v1/admin/me`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(1500) });
    cached = res.ok;
    return cached;
  } catch {
    return false;
  }
}

/** Para testes. */
export function resetStoreWebviewTrialCache(): void {
  cached = null;
}

/** Abre a loja na janela interna do PETMOL. Devolve false se o plugin não estiver no binário ou der erro (aí vale o fluxo de hoje). */
export async function openStoreInPetmol(url: string, title: string): Promise<boolean> {
  try {
    const { InAppBrowser, ToolBarType } = await import('@capgo/inappbrowser');
    await InAppBrowser.openWebView({
      url,
      title,
      toolbarType: ToolBarType.NAVIGATION,
      showReloadButton: true,
      preventDeeplink: true, // o app da loja nunca sequestra a navegação
      isInspectable: false,
    });
    return true;
  } catch {
    return false;
  }
}

/** Aquece o resultado ao abrir a Loja (só no iPhone nativo), para o toque na loja não esperar rede. */
export function warmStoreWebviewTrial(): void {
  try {
    if (Capacitor.isNativePlatform() && Capacitor.getPlatform?.() === 'ios') void isStoreWebviewTrialUser();
  } catch { /* melhor esforço */ }
}

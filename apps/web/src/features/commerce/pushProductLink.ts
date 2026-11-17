/**
 * Notificação do admin com LINK DE PRODUTO (aba Push do /admin): o toque abre a Home com ?produto=<link>&b=<envio>
 * e a Home abre o produto DIRETO na loja, do mesmo jeito que um toque na Loja do Pet (afiliado, app nativo da loja,
 * ponte da Cobasi no Android — tudo em navigateToPartnerUrl).
 *
 * Segurança: só abre https de lojas conhecidas (lista abaixo). Qualquer outro endereço é ignorado, mesmo que alguém
 * monte uma URL na mão. A lista é a MESMA do servidor (services/price-service/src/admin/product_link.py, STORE_HOSTS);
 * um teste confere que são iguais. Ao acrescentar uma loja, acrescente nos dois.
 */
import { Capacitor } from '@capacitor/core';
import { getToken } from '@/lib/auth-token';
import { pushDiagBreadcrumb } from '@/features/notifications/nativePushService';
import { navigateToPartnerUrl } from './homeShoppingPartners';
import { isStoreNativeOpenUser } from './storeNativeOpen';

export const PUSH_PRODUCT_HOSTS = [
  'www.amazon.com.br', 'amazon.com.br', 'amzn.to', 'link.amazon', 'www.amazon.com', 'amazon.com',
  'shopee.com.br', 'www.shopee.com.br', 's.shopee.com.br',
  'www.mercadolivre.com.br', 'mercadolivre.com.br', 'lista.mercadolivre.com.br', 'produto.mercadolivre.com.br', 'meli.la',
  'www.cobasi.com.br', 'cobasi.com.br', 'minhaloja.cobasi.com.br', 'mais.app',
  'www.awin1.com', 'awin1.com',
  'www.petz.com.br', 'petz.com.br',
  'www.petlove.com.br', 'petlove.com.br',
  'www.zeedog.com.br', 'zeedog.com.br', 'www.zeenow.com.br', 'zeenow.com.br',
] as const;

/** true só para uma URL https (sem login/porta) de uma loja da lista. */
export function isPushProductUrl(raw: string | null | undefined): boolean {
  try {
    const u = new URL((raw ?? '').trim());
    return u.protocol === 'https:' && !u.username && !u.password && (u.port === '' || u.port === '443')
      && (PUSH_PRODUCT_HOSTS as readonly string[]).includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Chave de um toque de notificação de produto: um por ENVIO (b) + link. Vazia (sem link) → o Home zera a trava. */
export function productTapKey(raw: string | null | undefined, broadcastId: string | null | undefined): string | null {
  return raw ? `${broadcastId ?? ''}|${raw}` : null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * iPhone nativo: o app nativo da loja (com o "◀ PETMOL" no topo) só abre se a checagem "esta conta usa esse caminho" terminar
 * ANTES do toque — e essa checagem tem limite de 1,5 s. Logo depois de tocar numa notificação o app está acordando: o login
 * ainda pode não ter carregado e a primeira rede estoura o limite, o que mandava o produto para o navegador comum (sem a faixa).
 * Aqui esperamos o login e repetimos a checagem (até ~4 s) ANTES de abrir. Conta comum: resposta negativa rápida → segue o
 * fluxo de sempre, sem atraso perceptível.
 */
export async function primeStoreNativeOpen(maxMs = 4000): Promise<void> {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform?.() !== 'ios') return;
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    if (!getToken()) { await sleep(250); continue; }
    const t0 = Date.now();
    if (await isStoreNativeOpenUser()) return;
    if (Date.now() - t0 < 400) return;      // negativa rápida (conta comum, já guardada): não há o que esperar
    // estourou o limite: a rede ainda está acordando → tenta de novo
  }
}

/** Abre o produto. No app nativo usa o caminho de sempre das lojas; na web/PWA, navega na própria aba (sem bloqueio de pop-up). */
export async function openPushProductLink(raw: string): Promise<boolean> {
  const url = (raw ?? '').trim();
  if (!isPushProductUrl(url)) return false;
  if (Capacitor.isNativePlatform()) {
    try {
      await primeStoreNativeOpen();
      pushDiagBreadcrumb('product open: chamando a abertura da loja (' + (Capacitor.getPlatform?.() ?? '?') + ')');
      navigateToPartnerUrl(url);
    } catch (e) {
      pushDiagBreadcrumb('product open: ERRO ' + String(e).slice(0, 120) + ' → navegador do sistema');
      // Rede de segurança: se o caminho das lojas falhar, abre o link no navegador do sistema (nunca fica só no PETMOL).
      void import('@capacitor/browser').then(({ Browser }) => Browser.open({ url })).catch(() => { window.location.assign(url); });
    }
  } else {
    window.location.assign(url);
  }
  return true;
}

/**
 * Toque numa notificação de produto: tira o link e o id do envio da URL do toque (`/home?produto=<link>&b=<envio>`).
 * Usado pelo app nativo para abrir a loja NO TOQUE, sem depender da Home montar e reler a URL (era aí que o link se perdia
 * e o app só abria o PETMOL). Devolve null se não for push de produto ou se o link não for de loja conhecida.
 */
export function productFromPushUrl(url: string | null | undefined): { raw: string; broadcast: string | null } | null {
  try {
    const u = new URL(url ?? '', 'https://petmol.local');
    const raw = u.searchParams.get('produto');
    if (!raw || !isPushProductUrl(raw)) return null;
    return { raw: raw.trim(), broadcast: u.searchParams.get('b') };
  } catch {
    return null;
  }
}

// ── Produto pendente: o toque NUNCA depende de a página sobreviver até abrir a loja ─────────────────────────────────
// O toque grava o link no aparelho ANTES de qualquer espera. Se algo interromper (recarregamento por versão nova, app
// retomado com JS antigo, WebView reiniciada), o próximo carregamento do app termina a abertura (NativePushBridge).
const PENDING_PRODUCT_KEY = 'petmol_pending_product';
const PENDING_PRODUCT_TTL_MS = 180_000;

export function savePendingProduct(raw: string, broadcast: string | null, now = Date.now()): void {
  try { localStorage.setItem(PENDING_PRODUCT_KEY, JSON.stringify({ raw, b: broadcast, ts: now })); } catch { /* sem storage */ }
}

function readPendingProduct(now = Date.now()): { raw: string; ts: number } | null {
  try {
    const j = localStorage.getItem(PENDING_PRODUCT_KEY);
    if (!j) return null;
    const p = JSON.parse(j) as { raw?: string; ts?: number };
    if (!p.raw || typeof p.ts !== 'number' || now - p.ts > PENDING_PRODUCT_TTL_MS || !isPushProductUrl(p.raw)) {
      localStorage.removeItem(PENDING_PRODUCT_KEY);
      return null;
    }
    return { raw: p.raw, ts: p.ts };
  } catch {
    return null;
  }
}

let openingPending = false;

/** Abre o produto pendente (se houver) e só então o apaga. Seguro para chamar várias vezes: uma abertura por vez. */
export const PRODUCT_OPENING_EVENT = 'petmol:product-opening';
export const PRODUCT_OPENED_EVENT = 'petmol:product-opened';
const emit = (name: string) => { try { window.dispatchEvent(new Event(name)); } catch { /* sem window */ } };

/** Há um produto de push a abrir (gravado e ainda válido)? A tela neutra "Abrindo o produto" usa isto. */
export const hasPendingProduct = (): boolean => readPendingProduct() !== null;

export async function openPendingProduct(): Promise<boolean> {
  if (openingPending) return false;
  const p = readPendingProduct();
  if (!p) return false;
  openingPending = true;
  emit(PRODUCT_OPENING_EVENT);          // REGRA DE OURO: enquanto abre o produto, o PETMOL não mostra a Home
  try {
    const ok = await openPushProductLink(p.raw);
    try { localStorage.removeItem(PENDING_PRODUCT_KEY); } catch { /* ok */ }
    return ok;
  } finally {
    openingPending = false;
    emit(PRODUCT_OPENED_EVENT);
  }
}

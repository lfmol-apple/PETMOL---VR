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
import { API_BASE_URL } from '@/lib/api';
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

/**
 * Abertura COM VERIFICAÇÃO (app nativo). Chamar a abertura da loja logo depois do toque pode falhar em silêncio (o app ainda está
 * acordando e não há tela para apresentar o navegador). Então: espera o app ficar visível, abre, e só considera aberto se houver
 * sinal real (o app foi para o segundo plano porque a loja assumiu, ou o navegador do sistema carregou a página). Sem sinal em 3,5 s,
 * tenta de outro jeito (navegador do sistema; depois navegação direta). Cada passo é registrado no diagnóstico do servidor.
 */
async function openNativeVerified(url: string, firstAttemptDone: () => void): Promise<void> {
  let confirmed = false;
  const confirm = () => { confirmed = true; };
  const onVis = () => { if (document.visibilityState === 'hidden') confirm(); };
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', confirm);
  let handle: { remove: () => Promise<void> } | null = null;
  const waitConfirm = async (ms: number) => { const end = Date.now() + ms; while (!confirmed && Date.now() < end) await sleep(150); };
  try {
    try {
      const { Browser } = await import('@capacitor/browser');
      handle = await Browser.addListener('browserPageLoaded', confirm);
    } catch { /* sem plugin: segue só com o sinal de segundo plano */ }

    // O iOS só entrega o link à loja (window.location / navegador do sistema) se a cena do app estiver TOTALMENTE ativa; logo depois do toque
    // ela ainda está em transição e a abertura é cancelada em silêncio. Espera ficar ativa (até 6 s) e dá um respiro antes de abrir.
    try {
      const { App } = await import('@capacitor/app');
      for (let i = 0; i < 30; i++) { if ((await App.getState()).isActive) break; await sleep(200); }
    } catch {
      for (let i = 0; i < 20 && document.visibilityState !== 'visible'; i++) await sleep(150);
    }
    await sleep(350);
    await primeStoreNativeOpen();
    pushDiagBreadcrumb('product open: 1ª tentativa (caminho das lojas, ' + (Capacitor.getPlatform?.() ?? '?') + ')');
    try { navigateToPartnerUrl(url); } catch (e) { pushDiagBreadcrumb('product open: erro na 1ª tentativa ' + String(e).slice(0, 100)); }
    firstAttemptDone();                      // quem chamou já pode seguir; a verificação continua em segundo plano
    await waitConfirm(3500);
    if (confirmed) { pushDiagBreadcrumb('product open: CONFIRMADO (1ª tentativa)'); return; }

    pushDiagBreadcrumb('product open: 1ª tentativa SEM sinal → navegador do sistema');
    try { const { Browser } = await import('@capacitor/browser'); await Browser.open({ url }); } catch (e) { pushDiagBreadcrumb('product open: erro no navegador do sistema ' + String(e).slice(0, 100)); }
    await waitConfirm(3500);
    if (confirmed) { pushDiagBreadcrumb('product open: CONFIRMADO (navegador do sistema)'); return; }

    pushDiagBreadcrumb('product open: 2ª tentativa SEM sinal → navegação direta');
    window.location.assign(url);
  } finally {
    firstAttemptDone();
    document.removeEventListener('visibilitychange', onVis);
    window.removeEventListener('pagehide', confirm);
    try { await handle?.remove(); } catch { /* ok */ }
  }
}

/** Abre o produto. No app nativo, com verificação e plano B (em segundo plano, sem travar quem chamou); na web/PWA, navega na própria aba. */
export async function openPushProductLink(raw: string): Promise<boolean> {
  const url = (raw ?? '').trim();
  if (!isPushProductUrl(url)) return false;
  if (Capacitor.isNativePlatform()) {
    await new Promise<void>((resolve) => { void openNativeVerified(url, resolve); });
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

// ── Plano B: "abriu o app → abre o produto da campanha" ────────────────────────────────────────────────────────────
// O toque na notificação sempre acorda o PETMOL. Se a abertura direta da loja não rolar por qualquer motivo, ao abrir o app
// perguntamos ao servidor se há um link de campanha enviado a este tutor há poucos minutos e ainda não aberto — e abrimos.
const HANDLED_KEY = 'petmol_product_handled';

export function markProductHandled(batch: string | null | undefined): void {
  if (!batch) return;
  try {
    const cur = JSON.parse(localStorage.getItem(HANDLED_KEY) || '[]') as string[];
    if (!cur.includes(batch)) localStorage.setItem(HANDLED_KEY, JSON.stringify([...cur, batch].slice(-20)));
  } catch { /* sem storage */ }
}
export function isProductHandled(batch: string): boolean {
  try { return (JSON.parse(localStorage.getItem(HANDLED_KEY) || '[]') as string[]).includes(batch); } catch { return false; }
}

async function authed(path: string, init?: RequestInit): Promise<Response | null> {
  const token = getToken();
  if (!token) return null;
  try {
    return await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) }, cache: 'no-store' });
  } catch { return null; }
}

/** Avisa o servidor que este envio já abriu o produto (toque ou plano B): ele não será oferecido de novo. */
export async function consumePendingLink(batch: string | null | undefined, via: 'tap' | 'app_open'): Promise<void> {
  if (!batch) return;
  markProductHandled(batch);
  await authed('/notifications/pending-link/consume', { method: 'POST', body: JSON.stringify({ batch_id: batch, via }) });
}

/** Ao abrir o app: há link de campanha recente e não aberto? Abre o produto (com a tela "Abrindo o produto"). Devolve se abriu. */
export async function openPendingCampaignLink(): Promise<boolean> {
  if (!Capacitor.isNativePlatform() || openingPending) return false;
  const res = await authed('/notifications/pending-link');
  if (!res || !res.ok) return false;
  const pending = ((await res.json()) as { pending: { batch_id: string; url: string } | null }).pending;
  if (!pending || isProductHandled(pending.batch_id) || !isPushProductUrl(pending.url)) return false;
  markProductHandled(pending.batch_id);
  pushDiagBreadcrumb('plano B: abriu o app e há link de campanha pendente (' + (() => { try { return new URL(pending.url).hostname; } catch { return '?'; } })() + ')');
  savePendingProduct(pending.url, pending.batch_id);
  void consumePendingLink(pending.batch_id, 'app_open');
  return openPendingProduct();
}

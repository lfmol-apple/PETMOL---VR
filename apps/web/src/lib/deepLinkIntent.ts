'use client';

const DEEP_LINK_INTENT_KEY = 'petmol_deeplink_intent_at';

export function markDeepLinkIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEEP_LINK_INTENT_KEY, String(Date.now()));
  } catch {}
}

export function hasRecentDeepLinkIntent(windowMs = 15_000): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('modal') || params.get('petId') || params.get('checkin') === '1') {
      return true;
    }
  } catch {}

  try {
    const raw = sessionStorage.getItem(DEEP_LINK_INTENT_KEY);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) && at > 0 && Date.now() - at < windowMs;
  } catch {
    return false;
  }
}

const PENDING_DEEP_LINK_KEY = 'petmol_pending_deeplink';

/** Guarda o destino do toque no push de forma síncrona (localStorage), para a
 * Home conseguir ler mesmo que o toque chegue antes de ela montar. */
export function savePendingDeepLink(url: string, now = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(PENDING_DEEP_LINK_KEY, JSON.stringify({ url, ts: now }));
  } catch {}
}

/** Lê e consome o destino guardado (uma vez). null se não há ou se venceu. */
export function takePendingDeepLink(maxAgeMs = 300_000, now = Date.now()): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PENDING_DEEP_LINK_KEY);
    if (!raw) return null;
    localStorage.removeItem(PENDING_DEEP_LINK_KEY);
    const { url, ts } = JSON.parse(raw) as { url?: string; ts?: number };
    if (!url || typeof ts !== 'number' || now - ts > maxAgeMs) return null;
    return url;
  } catch {
    return null;
  }
}

const DEEP_LINK_NONCE_PARAM = '_dl';

/** Marca cada entrega de deep link com um id único na query. A Home só abre o
 * destino de uma query que ainda não tratou; sem isso, qualquer re-render dela
 * (pets recarregados ao voltar pro app) reabria o sheet que o usuário acabou
 * de fechar, enquanto a query ainda estivesse na URL. */
export function withDeepLinkNonce(url: string, now = Date.now()): string {
  const [path, query = ''] = url.split('?');
  const params = new URLSearchParams(query);
  params.set(DEEP_LINK_NONCE_PARAM, String(now));
  return `${path}?${params.toString()}`;
}

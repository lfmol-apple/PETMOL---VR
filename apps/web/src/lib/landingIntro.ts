/**
 * Introdução em vídeo da landing (só celular): pôster → "Assistir com som" → comercial → landing normal.
 *
 * INTERRUPTOR: para desligar a introdução sem tocar em mais nada, troque LANDING_INTRO_ENABLED para `false`
 * (uma linha) e publique — a landing volta a abrir direto, com o A/B e todo o resto intactos. Também dá para
 * desligar por visita com `?intro=0`. Para ver a introdução no computador ou repetidamente, use `?intro=preview`
 * (não conta nas estatísticas).
 */
export const LANDING_INTRO_ENABLED = true;

/** Versão nos nomes dos arquivos: ao trocar o vídeo, mude o sufixo (cache longo e imutável). */
export const INTRO_VIDEO_SRC = '/landing/comercial/petmol-comercial-v1.mp4';
export const INTRO_POSTER_SRC = '/landing/comercial/petmol-comercial-poster-v1.webp';

const SEEN_KEY = 'petmol_landing_intro_seen';

export type IntroMode = 'shown' | 'none';

export interface IntroDecision {
  show: boolean;
  /** true = visita de teste (?intro=preview): eventos marcados e ignorados nas estatísticas. */
  preview: boolean;
  reason: string;
}

export function decideIntro(input: { enabled?: boolean; search: string; isMobile: boolean; isNative: boolean; seen: boolean }): IntroDecision {
  const enabled = input.enabled ?? LANDING_INTRO_ENABLED;
  const q = new URLSearchParams(input.search);
  const flag = (q.get('intro') || '').toLowerCase();
  if (!enabled) return { show: false, preview: false, reason: 'disabled' };
  if (input.isNative) return { show: false, preview: false, reason: 'native_app' };
  if (flag === 'preview') return { show: true, preview: true, reason: 'preview' };
  if (flag === '0' || flag === 'off') return { show: false, preview: false, reason: 'opt_out' };
  if (q.has('ab')) return { show: false, preview: false, reason: 'ab_preview' }; // links de conferência do teste A/B vão direto à landing
  if (!input.isMobile) return { show: false, preview: false, reason: 'not_mobile' };
  if (input.seen) return { show: false, preview: false, reason: 'seen_this_session' };
  return { show: true, preview: false, reason: 'ok' };
}

export function isMobileVisitor(): boolean {
  try {
    const narrow = window.matchMedia('(max-width: 767px)').matches;
    const touch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    return narrow && touch;
  } catch {
    return false;
  }
}

export function wasIntroSeen(): boolean {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}

export function markIntroSeen(): void {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* sem storage: pode repetir, nunca trava */ }
}

// Estado desta visita, lido pelos eventos (landingEvents) para separar "com introdução" de "sem".
let mode: IntroMode = 'none';
export const getIntroMode = (): IntroMode => mode;
export const setIntroMode = (m: IntroMode): void => { mode = m; };

/** Horário de São Paulo no formato AAAA-MM-DD HH:mm:ss (para conferir horários sem converter fuso). */
export function saoPauloTime(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(d);
  } catch {
    return '';
  }
}

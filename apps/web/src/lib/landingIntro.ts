/**
 * Introdução em vídeo da landing (só celular): pôster → "Assistir com som" → comercial → landing normal.
 *
 * INTERRUPTOR: para desligar a introdução sem tocar em mais nada, troque LANDING_INTRO_ENABLED para `false`
 * (uma linha) e publique — a landing volta a abrir direto, com o A/B e todo o resto intactos. Também dá para
 * desligar por visita com `?intro=0`. Para ver a introdução no computador ou repetidamente, use `?intro=preview`
 * (não conta nas estatísticas).
 */
export const LANDING_INTRO_ENABLED = true;

export type CommercialId = 'racao' | 'pet-sumido';

export interface Commercial {
  id: CommercialId;
  /** Versão nos nomes dos arquivos: ao trocar o vídeo, mude o sufixo (cache longo e imutável). */
  videoSrc: string;
  posterSrc: string;
  seconds: number;
  /** Texto do pôster (o app escreve por cima da imagem). */
  headline: [string, string];
  tagline?: string;
}

export const COMMERCIALS: Record<CommercialId, Commercial> = {
  racao: {
    id: 'racao',
    videoSrc: '/landing/comercial/petmol-comercial-v1.mp4',
    posterSrc: '/landing/comercial/petmol-comercial-poster-v1.webp',
    seconds: 27,
    headline: ['A última porção', 'de ração.'],
  },
  'pet-sumido': {
    id: 'pet-sumido',
    videoSrc: '/landing/comercial/petmol-pet-sumido-v1.mp4',
    posterSrc: '/landing/comercial/petmol-pet-sumido-poster-v1.webp',
    seconds: 45,
    headline: ['Operação', 'Fuga.'],
    tagline: 'Biscoito tem um plano.',
  },
};

/**
 * REVEZAMENTO POR DIA (decisão do dono, 26/09/2026): um dia roda o comercial do Pet Sumido, no outro o da ração.
 * A data conta em São Paulo. Dia de referência (26/09/2026) = Pet Sumido; o dia seguinte = ração; e assim por diante.
 * Para FIXAR um só comercial, troque COMMERCIAL_FIXED por 'racao' ou 'pet-sumido' (uma linha) e publique.
 */
export const COMMERCIAL_ROTATION_START = '2026-09-26';
export const COMMERCIAL_FIXED: CommercialId | null = null;

/** Data de São Paulo no formato AAAA-MM-DD. */
export function saoPauloDate(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short' }).format(d);
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

export function commercialForDate(d: Date = new Date(), fixed: CommercialId | null = COMMERCIAL_FIXED): CommercialId {
  if (fixed) return fixed;
  const days = Math.round((Date.parse(`${saoPauloDate(d)}T00:00:00Z`) - Date.parse(`${COMMERCIAL_ROTATION_START}T00:00:00Z`)) / 86_400_000);
  return ((days % 2) + 2) % 2 === 0 ? 'pet-sumido' : 'racao';
}

/** Comercial desta visita. Em `?intro=preview` dá para forçar com `?comercial=racao|pet-sumido` (não conta nas estatísticas). */
export function pickCommercial(search: string, preview: boolean, d: Date = new Date()): Commercial {
  if (preview) {
    const forced = new URLSearchParams(search).get('comercial');
    if (forced === 'racao' || forced === 'pet-sumido') return COMMERCIALS[forced];
  }
  return COMMERCIALS[commercialForDate(d)];
}

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
  if (input.seen) return { show: false, preview: false, reason: 'seen_this_load' };
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

// Decisão do dono (26/09/2026): o comercial aparece em TODA visita ao celular (a cada carga da página, inclusive ao
// atualizar). Só não repete ao navegar dentro da mesma página (ex.: voltar do /login), por isso a marca fica em
// memória e não em sessionStorage.
let shownThisLoad = false;
export function wasIntroSeen(): boolean { return shownThisLoad; }
export function markIntroSeen(): void { shownThisLoad = true; }
/** Só para testes. */
export function __resetIntroSeen(): void { shownThisLoad = false; }

// Estado desta visita, lido pelos eventos (landingEvents) para separar "com introdução" de "sem".
let mode: IntroMode = 'none';
let shownCommercial: CommercialId | null = null;
export const getIntroMode = (): IntroMode => mode;
/** Qual comercial foi exibido nesta visita (null = nenhum). */
export const getIntroCommercial = (): CommercialId | null => (mode === 'shown' ? shownCommercial : null);
export const setIntroMode = (m: IntroMode, commercial: CommercialId | null = null): void => { mode = m; shownCommercial = m === 'shown' ? commercial : null; };

/** Horário de São Paulo no formato AAAA-MM-DD HH:mm:ss (para conferir horários sem converter fuso). */
export function saoPauloTime(d: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium' }).format(d);
  } catch {
    return '';
  }
}

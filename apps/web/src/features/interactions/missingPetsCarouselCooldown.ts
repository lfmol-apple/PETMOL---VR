'use client';

// Cadência do aviso automático "Tem pet sumido perto de você" (Home): não
// pode virar chato, mas também não pode depender só de o tutor achar o
// botão "Pet Sumido" sozinho. Guardado por CONJUNTO de IDs de alerta (não
// uma flag global) — um alerta novo sempre fura a soneca de um antigo.
const STORAGE_KEY = 'petmol_nearby_carousel_cooldown_v1';
const DEFAULT_SNOOZE_MS = 6 * 60 * 60 * 1000; // 6h — soneca implícita (ex.: abriu o carrossel)
const SNOOZE_OPENS = 3; // ou 3 aberturas da Home, o que vier primeiro (só na soneca implícita)
const MAX_AUTO_SHOWS_PER_DAY = 3;

/** Escolha explícita do tutor no botão de silenciar — "algumas horas" ou
 *  "um dia". Diferente da soneca implícita, uma escolha explícita NÃO
 *  reabre antes por causa de "N aberturas" — o tutor decidiu por quanto
 *  tempo, o app respeita literalmente esse tempo. */
export const SNOOZE_OPTIONS = {
  hours: 6 * 60 * 60 * 1000,
  day: 24 * 60 * 60 * 1000,
} as const;
export type SnoozeOption = keyof typeof SNOOZE_OPTIONS;

interface CooldownState {
  // último conjunto de IDs mostrado/dispensado, com quando e em qual "abertura"
  dismissedIds: string[];
  dismissedAt: number;
  dismissedAtOpenCount: number;
  snoozeMs: number;
  explicitSnooze: boolean;
  // aberturas da Home desde sempre (contador monotônico simples)
  homeOpenCount: number;
  // timestamps (ms) dos auto-shows de hoje, pra aplicar o teto diário
  autoShowTimestamps: number[];
}

function readState(): CooldownState {
  const empty: CooldownState = {
    dismissedIds: [], dismissedAt: 0, dismissedAtOpenCount: 0,
    snoozeMs: DEFAULT_SNOOZE_MS, explicitSnooze: false,
    homeOpenCount: 0, autoShowTimestamps: [],
  };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return empty;
    return { ...empty, ...(JSON.parse(raw) as Partial<CooldownState>) };
  } catch {
    return empty;
  }
}

function writeState(state: CooldownState): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { /* best effort */ }
}

function pruneOldTimestamps(timestamps: number[]): number[] {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return timestamps.filter((t) => t > dayAgo);
}

/** Chamar uma vez por montagem da Home — incrementa o contador de aberturas
 *  usado pela soneca de "N aberturas". */
export function registerHomeOpen(): void {
  const state = readState();
  state.homeOpenCount += 1;
  writeState(state);
}

/**
 * Decide se o aviso automático deve aparecer AGORA para este conjunto de
 * IDs de alerta ativos. Regras: um ID nunca visto antes sempre fura a
 * soneca; um conjunto já dispensado só reaparece depois de ~6h OU 3
 * aberturas da Home (o que vier primeiro); teto de 3 auto-shows por dia.
 */
export function shouldAutoShowNearbyCarousel(activeAlertIds: string[]): boolean {
  if (activeAlertIds.length === 0) return false;
  const state = readState();

  const hasNewAlert = activeAlertIds.some((id) => !state.dismissedIds.includes(id));
  if (hasNewAlert) {
    const recentShows = pruneOldTimestamps(state.autoShowTimestamps);
    return recentShows.length < MAX_AUTO_SHOWS_PER_DAY;
  }

  // nenhum alerta novo: só reabre se a soneca do conjunto anterior já venceu
  const elapsedMs = Date.now() - state.dismissedAt;
  const opensSinceDismiss = state.homeOpenCount - state.dismissedAtOpenCount;
  const snoozeExpired = elapsedMs >= state.snoozeMs
    || (!state.explicitSnooze && opensSinceDismiss >= SNOOZE_OPENS);
  if (!snoozeExpired) return false;

  const recentShows = pruneOldTimestamps(state.autoShowTimestamps);
  return recentShows.length < MAX_AUTO_SHOWS_PER_DAY;
}

/** Chamar quando o aviso automático é de fato exibido (não a cada checagem). */
export function markNearbyCarouselAutoShown(): void {
  const state = readState();
  state.autoShowTimestamps = [...pruneOldTimestamps(state.autoShowTimestamps), Date.now()];
  writeState(state);
}

/** Chamar quando o tutor "trata" o aviso — dispensando-o (com ou sem escolher
 *  uma duração de soneca explícita) ou abrindo o carrossel/cartaz — em todos
 *  os casos o mesmo conjunto de alertas já foi visto. Sem `snoozeOption`
 *  (ex.: abriu o carrossel), usa a soneca implícita padrão (6h ou 3
 *  aberturas). Com `snoozeOption` (o tutor escolheu "algumas horas" ou
 *  "um dia" no botão de silenciar), respeita literalmente esse prazo, sem o
 *  atalho de reabrir cedo por causa de N aberturas. */
export function markNearbyCarouselDismissed(activeAlertIds: string[], snoozeOption?: SnoozeOption): void {
  const state = readState();
  state.dismissedIds = activeAlertIds;
  state.dismissedAt = Date.now();
  state.dismissedAtOpenCount = state.homeOpenCount;
  state.snoozeMs = snoozeOption ? SNOOZE_OPTIONS[snoozeOption] : DEFAULT_SNOOZE_MS;
  state.explicitSnooze = Boolean(snoozeOption);
  writeState(state);
}

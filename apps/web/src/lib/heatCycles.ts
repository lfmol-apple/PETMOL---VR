/**
 * Registro de cio — lógica pura (sem rede, sem React), testável.
 *
 * Princípios (decisão de produto, 08/11/2026):
 *  - Tudo é ESTIMATIVA para o tutor se organizar; nunca "dias férteis" exatos nem diagnóstico.
 *  - Previsão do próximo cio só para CADELAS (ciclo regular, ~6–8 meses). Gatas variam muito: só registramos.
 *  - Os dias são datas "YYYY-MM-DD" (sem fuso), como o servidor guarda.
 */

export interface HeatCycle {
  id: string;
  pet_id: string;
  started_on: string;
  ended_on: string | null;
  mated_on: string | null;
  notes: string | null;
}

const DAY_MS = 86_400_000;

/** Intervalo entre inícios de cio considerado plausível numa cadela (descarta registros esquecidos/errados). */
const MIN_INTERVAL_DAYS = 90;
const MAX_INTERVAL_DAYS = 540;
/** Quantos intervalos recentes entram na média. */
const INTERVALS_IN_AVERAGE = 3;
/** Cio em andamento há mais que isto merece uma conversa com o veterinário. */
export const LONG_HEAT_DAYS = 28;
/** Janela depois do fim do cio em que vale ficar de olho em sinais de infecção no útero (piometra). */
export const POST_HEAT_WATCH_FROM_DAYS = 14;
export const POST_HEAT_WATCH_TO_DAYS = 63;
/** Avisa "cio chegando" quando faltam até estes dias. */
export const HEAT_SOON_DAYS = 14;

const GESTATION_DAYS: Record<string, number> = { dog: 63, cat: 65 };

function dayNumber(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1) / DAY_MS;
}

function isoFromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(dayNumber(toIso) - dayNumber(fromIso));
}

export function addDays(iso: string, days: number): string {
  return isoFromDayNumber(dayNumber(iso) + days);
}

/** Do mais antigo para o mais recente. */
function sortedAsc(cycles: HeatCycle[]): HeatCycle[] {
  return [...cycles].sort((a, b) => a.started_on.localeCompare(b.started_on));
}

/** O cio em andamento (sem fim), se houver. */
export function openCycle(cycles: HeatCycle[]): HeatCycle | null {
  const open = sortedAsc(cycles).filter((c) => !c.ended_on);
  return open.length ? open[open.length - 1] : null;
}

export function lastCycle(cycles: HeatCycle[]): HeatCycle | null {
  const s = sortedAsc(cycles);
  return s.length ? s[s.length - 1] : null;
}

/** Dia N do cio em andamento (o dia do início é o dia 1). */
export function heatDayNumber(cycle: HeatCycle, todayIso: string): number {
  return Math.max(1, daysBetween(cycle.started_on, todayIso) + 1);
}

/** Duração de um cio encerrado, em dias (início e fim contam). */
export function cycleLengthDays(cycle: HeatCycle): number | null {
  return cycle.ended_on ? daysBetween(cycle.started_on, cycle.ended_on) + 1 : null;
}

/** Média dos últimos intervalos plausíveis entre inícios de cio; null se não houver nenhum. */
export function averageIntervalDays(cycles: HeatCycle[]): { days: number; samples: number } | null {
  const s = sortedAsc(cycles);
  const intervals: number[] = [];
  for (let i = 1; i < s.length; i++) {
    const gap = daysBetween(s[i - 1].started_on, s[i].started_on);
    if (gap >= MIN_INTERVAL_DAYS && gap <= MAX_INTERVAL_DAYS) intervals.push(gap);
  }
  const recent = intervals.slice(-INTERVALS_IN_AVERAGE);
  if (!recent.length) return null;
  return { days: Math.round(recent.reduce((a, b) => a + b, 0) / recent.length), samples: recent.length };
}

export interface HeatPrediction {
  /** Data estimada do início do próximo cio. */
  nextOn: string;
  /** Dias até lá (negativo = já passou da data estimada). */
  daysUntil: number;
  intervalDays: number;
  samples: number;
}

/** Só cadelas, sem cio em andamento, com pelo menos um intervalo plausível. */
export function predictNextHeat(cycles: HeatCycle[], species: string, todayIso: string): HeatPrediction | null {
  if (species !== 'dog') return null;
  if (openCycle(cycles)) return null;
  const avg = averageIntervalDays(cycles);
  const last = lastCycle(cycles);
  if (!avg || !last) return null;
  const nextOn = addDays(last.started_on, avg.days);
  return { nextOn, daysUntil: daysBetween(todayIso, nextOn), intervalDays: avg.days, samples: avg.samples };
}

/** Parto estimado a partir do cruzamento (cadela ~63 dias, gata ~65). null para outras espécies. */
export function estimatedDueDate(matedOn: string | null, species: string): string | null {
  const g = GESTATION_DAYS[species];
  return matedOn && g ? addDays(matedOn, g) : null;
}

export function isLongHeat(cycle: HeatCycle, todayIso: string): boolean {
  return !cycle.ended_on && heatDayNumber(cycle, todayIso) > LONG_HEAT_DAYS;
}

/**
 * Estamos na janela "algumas semanas depois do cio" em que a atenção a sinais de infecção no útero importa?
 * Conta a partir do FIM do último cio encerrado.
 */
export function inPostHeatWatch(cycles: HeatCycle[], todayIso: string): boolean {
  const last = lastCycle(cycles);
  if (!last || !last.ended_on) return false;
  const since = daysBetween(last.ended_on, todayIso);
  return since >= POST_HEAT_WATCH_FROM_DAYS && since <= POST_HEAT_WATCH_TO_DAYS;
}

export type HeatButtonState = 'in_heat' | 'soon' | 'idle';

/** Estado do botão na foto: em cio (rosa), cio chegando (âmbar, só cadelas) ou neutro. */
export function heatButtonState(cycles: HeatCycle[], species: string, todayIso: string): HeatButtonState {
  if (openCycle(cycles)) return 'in_heat';
  const p = predictNextHeat(cycles, species, todayIso);
  if (p && p.daysUntil <= HEAT_SOON_DAYS) return 'soon';
  return 'idle';
}

/** O cio só faz sentido para cadela/gata fêmea não castrada. */
export function heatTrackingApplies(pet: { sex?: string | null; neutered?: boolean | null; species?: string | null }): boolean {
  return pet.sex === 'female' && !pet.neutered && (pet.species === 'dog' || pet.species === 'cat');
}

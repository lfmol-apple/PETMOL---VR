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

/** Ritmo informado pelo tutor ao ativar o acompanhamento (espelho de pets/heat_care.py). */
export interface HeatSettings {
  enabled: boolean;
  interval_days: number;
  duration_days: number;
}

export interface HeatOption { days: number; label: string }
export interface HeatProfile {
  intervals: HeatOption[];
  intervalDefault: number;
  durations: HeatOption[];
  durationDefault: number;
  /** Gata: ciclo por temporada (pode pausar); cadela: ritmo regular. */
  seasonal: boolean;
  noun: string;
  intervalQuestion: string;
  durationQuestion: string;
  note: string;
}

/** Cadela: 5 ou 6 meses; 1, 2 ou 3 semanas. Gata (poliéstrica sazonal): volta a cada 2–4 semanas na estação; 4–10 dias. */
export const HEAT_PROFILES: Record<'dog' | 'cat', HeatProfile> = {
  dog: {
    intervals: [{ days: 150, label: 'De 5 em 5 meses' }, { days: 180, label: 'De 6 em 6 meses' }],
    intervalDefault: 180,
    durations: [{ days: 7, label: '1 semana' }, { days: 15, label: '15 dias' }, { days: 21, label: '3 semanas' }],
    durationDefault: 21,
    seasonal: false,
    noun: 'cadela',
    intervalQuestion: 'De quanto em quanto tempo o cio costuma vir?',
    durationQuestion: 'Quanto tempo ele costuma durar?',
    note: 'Se você não sabe, deixe como está: com 2 ou mais cios registrados, o PETMOL passa a usar o ritmo real dela.',
  },
  cat: {
    intervals: [{ days: 14, label: 'A cada 2 semanas' }, { days: 21, label: 'A cada 3 semanas' }, { days: 28, label: 'A cada 4 semanas' }],
    intervalDefault: 21,
    durations: [{ days: 4, label: '4 dias' }, { days: 7, label: '1 semana' }, { days: 10, label: '10 dias' }],
    durationDefault: 7,
    seasonal: true,
    noun: 'gata',
    intervalQuestion: 'Na época de cio, de quanto em quanto tempo ele volta?',
    durationQuestion: 'Quanto tempo cada cio costuma durar?',
    note: 'Gatas entram em cio por temporadas (mais na primavera e no verão) e, sem cruzamento, o cio se repete a cada poucas semanas. Passado um tempo sem cio, o PETMOL entende como pausa.',
  },
};

export function heatProfile(species: string): HeatProfile | null {
  return Object.hasOwn(HEAT_PROFILES, species) ? HEAT_PROFILES[species as 'dog' | 'cat'] : null;
}

/** Gata sem cio há mais que isto = pausa da temporada: sem previsão. */
export const CAT_SEASON_PAUSE_DAYS = 90;

/** Dia previsto para o fim de um cio em andamento (início + duração informada). */
export function expectedEndOn(cycle: HeatCycle, durationDays: number): string {
  return addDays(cycle.started_on, durationDays - 1);
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
  /** Intervalos reais usados na média (0 = veio da configuração do tutor). */
  samples: number;
  source: 'average' | 'settings';
}

/**
 * Sem cio em andamento e com pelo menos um cio encerrado.
 *  - Cadela: com 2+ cios registrados manda o ritmo real; senão, o que o tutor informou (se informou).
 *  - Gata: o ritmo do tutor, e some na pausa da temporada. Sem configuração, gata não tem previsão.
 */
export function predictNextHeat(
  cycles: HeatCycle[], species: string, todayIso: string, settings?: HeatSettings | null,
): HeatPrediction | null {
  const profile = heatProfile(species);
  if (!profile) return null;
  if (openCycle(cycles)) return null;
  const last = lastCycle(cycles);
  if (!last) return null;
  if (profile.seasonal) {
    if (!settings) return null;
    if (daysBetween(last.started_on, todayIso) > CAT_SEASON_PAUSE_DAYS) return null;
    return { nextOn: addDays(last.started_on, settings.interval_days), daysUntil: daysBetween(todayIso, addDays(last.started_on, settings.interval_days)), intervalDays: settings.interval_days, samples: 0, source: 'settings' };
  }
  const avg = averageIntervalDays(cycles);
  const days = avg?.days ?? settings?.interval_days;
  if (!days) return null;
  const nextOn = addDays(last.started_on, days);
  return { nextOn, daysUntil: daysBetween(todayIso, nextOn), intervalDays: days, samples: avg?.samples ?? 0, source: avg ? 'average' : 'settings' };
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
export function heatButtonState(cycles: HeatCycle[], species: string, todayIso: string, settings?: HeatSettings | null): HeatButtonState {
  if (openCycle(cycles)) return 'in_heat';
  const p = predictNextHeat(cycles, species, todayIso, settings);
  if (p && p.daysUntil <= HEAT_SOON_DAYS) return 'soon';
  return 'idle';
}

/** O cio só faz sentido para cadela/gata fêmea não castrada. */
export function heatTrackingApplies(pet: { sex?: string | null; neutered?: boolean | null; species?: string | null }): boolean {
  return pet.sex === 'female' && !pet.neutered && (pet.species === 'dog' || pet.species === 'cat');
}

import type { GroomingRecord } from '@/lib/types/home';

function dayNumber(iso: string): number | null {
  const [y, m, d] = (iso || '').slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Registros do mais novo para o mais velho. */
function newestFirst(records: GroomingRecord[]): GroomingRecord[] {
  return [...records].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

export interface GroomingInsights {
  /** Dias entre cada registro e o anterior (mais velho), alinhado a `newestFirst`; null se não der para calcular. */
  gapsDays: Array<number | null>;
  /** Mediana dos intervalos (≥2 intervalos); null caso contrário. */
  typicalDays: number | null;
  /** Média dos intervalos (≥1 intervalo). */
  averageDays: number | null;
  /** Soma dos valores registrados; null se nenhum registro tem valor. */
  totalCost: number | null;
}

export function groomingInsights(records: GroomingRecord[]): GroomingInsights {
  const sorted = newestFirst(records);
  const gapsDays = sorted.map((r, i) => {
    const older = sorted[i + 1];
    if (!older) return null;
    const a = dayNumber(r.date);
    const b = dayNumber(older.date);
    return a != null && b != null && a - b > 0 ? a - b : null;
  });
  const gaps = gapsDays.filter((g): g is number => g != null);
  const ordered = [...gaps].sort((x, y) => x - y);
  const median = ordered.length >= 2
    ? Math.round(ordered.length % 2 ? ordered[(ordered.length - 1) / 2] : (ordered[ordered.length / 2 - 1] + ordered[ordered.length / 2]) / 2)
    : null;
  const average = gaps.length ? Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length) : null;
  const costs = sorted.map((r) => r.cost).filter((c): c is number => typeof c === 'number');
  return { gapsDays, typicalDays: median, averageDays: average, totalCost: costs.length ? costs.reduce((s, c) => s + c, 0) : null };
}

/** Sugere trocar o intervalo do lembrete quando o hábito real difere mais de 20% do configurado. */
export function suggestedInterval(typicalDays: number | null, configuredDays: number | null | undefined): number | null {
  if (!typicalDays || typicalDays < 1) return null;
  const configured = configuredDays && configuredDays > 0 ? configuredDays : null;
  if (configured && Math.abs(typicalDays - configured) / configured <= 0.2) return null;
  return typicalDays;
}

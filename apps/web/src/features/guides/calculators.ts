/**
 * Lógica pura das calculadoras editoriais dos Guias PETMOL.
 *
 * São ferramentas de conteúdo: não usam banco, não chamam API, não
 * guardam nada, não recomendam marca e não dão orientação clínica.
 * Funções puras — testáveis sem rede nem DOM. Os Client Components em
 * `components/` só coletam input, validam e chamam isto.
 */

export interface Validated<T> {
  ok: boolean;
  value?: T;
  error?: string;
}

/** Aceita "7,5" ou "7.5"; rejeita vazio, negativo, zero e não-número. */
export function parsePositiveNumber(raw: string, field: string): Validated<number> {
  const cleaned = (raw ?? '').trim().replace(',', '.');
  if (cleaned === '') return { ok: false, error: `Informe ${field}.` };
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return { ok: false, error: `${field} precisa ser um número.` };
  if (n <= 0) return { ok: false, error: `${field} precisa ser maior que zero.` };
  return { ok: true, value: n };
}

export function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  const label = rounded === 1 ? 'dia' : 'dias';
  const asInt = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1).replace('.', ',');
  return `${asInt} ${label}`;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export function formatBRL(value: number): string {
  return BRL.format(Math.round(value * 100) / 100);
}

// ── 1. Quanto tempo dura um saco de ração ────────────────────────────
export interface BagDurationInput {
  bagKg: number;
  dailyGrams: number;
}
export interface BagDurationResult {
  days: number;
  weeks: number;
}
export function bagDuration({ bagKg, dailyGrams }: BagDurationInput): BagDurationResult {
  const days = (bagKg * 1000) / dailyGrams;
  return { days, weeks: days / 7 };
}

// ── 2. Quanto custa alimentar um cão por mês ─────────────────────────
export interface MonthlyCostInput {
  bagPrice: number;
  bagKg: number;
  dailyGrams: number;
}
export interface MonthlyCostResult {
  costPerKg: number;
  costPerDay: number;
  costPer30Days: number;
  bagDurationDays: number;
}
export function monthlyCost({ bagPrice, bagKg, dailyGrams }: MonthlyCostInput): MonthlyCostResult {
  const costPerKg = bagPrice / bagKg;
  const costPerDay = costPerKg * (dailyGrams / 1000);
  return {
    costPerKg,
    costPerDay,
    costPer30Days: costPerDay * 30,
    bagDurationDays: (bagKg * 1000) / dailyGrams,
  };
}

// ── 3. Comparar duas rações pelo custo diário ───────────────────────
export interface RationOption {
  label: string;
  bagPrice: number;
  bagKg: number;
  dailyGrams: number;
}
export interface RationComparisonRow {
  label: string;
  costPerKg: number;
  costPerDay: number;
  costPer30Days: number;
}
export interface RationComparisonResult {
  a: RationComparisonRow;
  b: RationComparisonRow;
  /** label da opção mais barata por dia; null se empate exato. */
  cheaperLabel: string | null;
  /** diferença mensal absoluta entre as duas (sempre >= 0). */
  monthlyDifference: number;
}
function comparisonRow(label: string, o: RationOption): RationComparisonRow {
  const costPerKg = o.bagPrice / o.bagKg;
  const costPerDay = costPerKg * (o.dailyGrams / 1000);
  return { label, costPerKg, costPerDay, costPer30Days: costPerDay * 30 };
}
export function compareRations(a: RationOption, b: RationOption): RationComparisonResult {
  const rowA = comparisonRow(a.label || 'Ração A', a);
  const rowB = comparisonRow(b.label || 'Ração B', b);
  const diff = Math.abs(rowA.costPer30Days - rowB.costPer30Days);
  let cheaperLabel: string | null = null;
  if (rowA.costPerDay < rowB.costPerDay) cheaperLabel = rowA.label;
  else if (rowB.costPerDay < rowA.costPerDay) cheaperLabel = rowB.label;
  return { a: rowA, b: rowB, cheaperLabel, monthlyDifference: diff };
}

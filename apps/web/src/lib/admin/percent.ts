/**
 * Percentuais do painel Desempenho. A BASE é sempre "Se cadastrou" (quem criou a conta); downloads ficam de fora
 * (decisão do dono, 17/11/2026). Ex.: notificações ativas ÷ pessoas cadastradas.
 *
 * Cada número do painel é contado na DATA em que aconteceu; por isso, num período curto o percentual pode passar de 100%
 * (a pessoa se cadastrou antes e fez a ação agora). Não cortamos em 100%: mostramos o número real.
 */
export type PercentKey = 'pets' | 'alimentacao' | 'notificacoes' | 'localizacao';
export const PERCENT_KEYS: readonly PercentKey[] = ['pets', 'alimentacao', 'notificacoes', 'localizacao'];

/** 12.5 → "12,5%"; 50 → "50%"; sem base (0 ou indefinida) → "—". */
export function pctOf(part: number | null | undefined, base: number | null | undefined): string {
  if (part == null || base == null || !Number.isFinite(part) || !Number.isFinite(base) || base <= 0) return '—';
  const v = Math.round((part / base) * 1000) / 10;
  return `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 1 })}%`;
}

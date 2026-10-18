import { describe, expect, it } from 'vitest';
import { groomingInsights, suggestedInterval } from './groomingInsights';

const r = (date: string, cost?: number) => ({ id: date, type: 'bath', date, cost }) as never;

describe('groomingInsights', () => {
  const recs = [r('2026-09-15'), r('2026-07-30'), r('2026-06-16', 145), r('2026-05-07', 145)];
  it('intervalos entre serviços (do mais novo ao mais velho)', () => {
    expect(groomingInsights(recs).gapsDays).toEqual([47, 44, 40, null]);
  });
  it('mediana, média e total gasto', () => {
    const i = groomingInsights(recs);
    expect(i.typicalDays).toBe(44);
    expect(i.averageDays).toBe(44);
    expect(i.totalCost).toBe(290);
  });
  it('poucos registros: sem mediana; sem valor: sem total', () => {
    expect(groomingInsights([r('2026-09-15'), r('2026-07-30')]).typicalDays).toBeNull();
    expect(groomingInsights([r('2026-09-15'), r('2026-07-30')]).averageDays).toBe(47);
    expect(groomingInsights([r('2026-09-15')]).totalCost).toBeNull();
    expect(groomingInsights([]).gapsDays).toEqual([]);
  });
  it('ignora ordem de entrada', () => {
    expect(groomingInsights([...recs].reverse()).gapsDays).toEqual([47, 44, 40, null]);
  });
});

describe('suggestedInterval', () => {
  it('só sugere quando o hábito difere mais de 20% do configurado', () => {
    expect(suggestedInterval(44, 45)).toBeNull();
    expect(suggestedInterval(44, 15)).toBe(44);
    expect(suggestedInterval(30, 45)).toBe(30);
    expect(suggestedInterval(null, 45)).toBeNull();
    expect(suggestedInterval(44, null)).toBe(44);
  });
});

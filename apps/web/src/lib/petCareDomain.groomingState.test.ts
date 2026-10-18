import { describe, expect, it } from 'vitest';
import { groomingRoutineState, groomingToleranceDays } from './petCareDomain';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rec = (over: Record<string, unknown>) => ({ id: 'g1', type: 'bath', date: iso(-20), ...over }) as never;

describe('groomingToleranceDays', () => {
  it('~20% do intervalo, no mínimo 2 dias', () => {
    expect(groomingToleranceDays(7)).toBe(2);
    expect(groomingToleranceDays(15)).toBe(3);
    expect(groomingToleranceDays(30)).toBe(6);
    expect(groomingToleranceDays(45)).toBe(9);
  });
});

describe('groomingRoutineState', () => {
  it('nunca controlado (sem registros ou sem próxima data/frequência): none', () => {
    expect(groomingRoutineState('p1', [])).toBe('none');
    expect(groomingRoutineState('p1', [rec({})])).toBe('none');
  });
  it('agendado e ainda não ocorreu (futuro ou hoje): scheduled', () => {
    expect(groomingRoutineState('p1', [rec({ next_recommended_date: iso(5) })])).toBe('scheduled');
    expect(groomingRoutineState('p1', [rec({ next_recommended_date: iso(0) })])).toBe('scheduled');
    expect(groomingRoutineState('p1', [rec({ frequency_days: 30, date: iso(-10) })])).toBe('scheduled');
  });
  it('passou da data mas dentro da folga (20% do intervalo): due — âmbar fixo, não pisca', () => {
    // intervalo 45 dias -> folga de 9 dias
    expect(groomingRoutineState('p1', [rec({ frequency_days: 45, date: iso(-50), next_recommended_date: iso(-5) })])).toBe('due');
    expect(groomingRoutineState('p1', [rec({ frequency_days: 45, date: iso(-54), next_recommended_date: iso(-9) })])).toBe('due');
  });
  it('passou da data E da folga: overdue — pisca', () => {
    expect(groomingRoutineState('p1', [rec({ frequency_days: 45, date: iso(-55), next_recommended_date: iso(-10) })])).toBe('overdue');
    // intervalo de 7 dias: folga mínima de 2 dias
    expect(groomingRoutineState('p1', [rec({ frequency_days: 7, date: iso(-10), next_recommended_date: iso(-3) })])).toBe('overdue');
    expect(groomingRoutineState('p1', [rec({ frequency_days: 7, date: iso(-9), next_recommended_date: iso(-2) })])).toBe('due');
  });
  it('sem frequência gravada: o intervalo vem da data do serviço até a próxima', () => {
    // serviço há 60 dias, próximo era há 20 -> intervalo 40, folga 8 -> 20 dias de atraso pisca
    expect(groomingRoutineState('p1', [rec({ date: iso(-60), next_recommended_date: iso(-20) })])).toBe('overdue');
  });
  it('registrar um banho novo resolve o atraso do banho (pega o mais recente por tipo)', () => {
    const old = rec({ id: 'a', next_recommended_date: iso(-30), frequency_days: 15 });
    const fresh = rec({ id: 'b', date: iso(0), next_recommended_date: iso(15) });
    expect(groomingRoutineState('p1', [old, fresh])).toBe('scheduled');
  });
  it('um tipo bem atrasado basta para piscar, mesmo com o outro agendado', () => {
    const bath = rec({ id: 'a', type: 'bath', next_recommended_date: iso(10) });
    const grooming = rec({ id: 'b', type: 'grooming', frequency_days: 15, date: iso(-30), next_recommended_date: iso(-15) });
    expect(groomingRoutineState('p1', [bath, grooming])).toBe('overdue');
  });
  it('atrasado dentro da folga em um tipo e agendado no outro: due', () => {
    const bath = rec({ id: 'a', type: 'bath', next_recommended_date: iso(10) });
    const grooming = rec({ id: 'b', type: 'grooming', frequency_days: 45, date: iso(-50), next_recommended_date: iso(-5) });
    expect(groomingRoutineState('p1', [bath, grooming])).toBe('due');
  });
});

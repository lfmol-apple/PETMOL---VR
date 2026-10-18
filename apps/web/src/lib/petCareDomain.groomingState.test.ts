import { describe, expect, it } from 'vitest';
import { groomingRoutineState } from './petCareDomain';

const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const rec = (over: Record<string, unknown>) => ({ id: 'g1', type: 'bath', date: iso(-20), ...over }) as never;

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
  it('atrasado (próxima data no passado e nenhum banho mais novo): overdue', () => {
    expect(groomingRoutineState('p1', [rec({ next_recommended_date: iso(-3) })])).toBe('overdue');
    expect(groomingRoutineState('p1', [rec({ frequency_days: 15, date: iso(-20) })])).toBe('overdue');
  });
  it('registrar um banho novo resolve o atraso do banho (pega o mais recente por tipo)', () => {
    const old = rec({ id: 'a', next_recommended_date: iso(-3) });
    const fresh = rec({ id: 'b', date: iso(0), next_recommended_date: iso(15) });
    expect(groomingRoutineState('p1', [old, fresh])).toBe('scheduled');
  });
  it('um tipo atrasado basta para piscar, mesmo com o outro agendado', () => {
    const bath = rec({ id: 'a', type: 'bath', next_recommended_date: iso(10) });
    const grooming = rec({ id: 'b', type: 'grooming', next_recommended_date: iso(-1) });
    expect(groomingRoutineState('p1', [bath, grooming])).toBe('overdue');
  });
});

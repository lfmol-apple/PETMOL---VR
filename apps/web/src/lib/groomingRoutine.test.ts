import { describe, expect, it } from 'vitest';
import { effectiveGroomingRecords } from './groomingRoutine';
import { groomingRoutineState } from './petCareDomain';

const r = (id: string, date: string) => ({ id, date, type: 'bath' }) as never;
const all = [r('a', '2026-07-01'), r('b', '2026-09-15'), r('c', '2026-10-20')];

describe('effectiveGroomingRecords', () => {
  it('ativo e nunca pausado (ou sem config): todos os registros contam', () => {
    expect(effectiveGroomingRecords(all, null)).toHaveLength(3);
    expect(effectiveGroomingRecords(all, { active: true, resumed_on: null })).toHaveLength(3);
  });
  it('desativado: nenhum conta, mesmo havendo registros', () => {
    expect(effectiveGroomingRecords(all, { active: false, resumed_on: null })).toEqual([]);
    expect(effectiveGroomingRecords(all, { active: false, resumed_on: '2026-10-01' })).toEqual([]);
  });
  it('retomado: contam os registros a partir do dia da retomada (os antigos ficam só no histórico)', () => {
    const got = effectiveGroomingRecords(all, { active: true, resumed_on: '2026-10-01' });
    expect(got.map((x) => x.id)).toEqual(['c']);
    expect(effectiveGroomingRecords(all, { active: true, resumed_on: '2026-10-20' }).map((x) => x.id)).toEqual(['c']);
  });
  it('retomado: um registro antigo cujo PRÓXIMO banho ainda está pela frente continua valendo', () => {
    const vigente = [{ id: 'v', date: '2026-09-15', type: 'bath', next_recommended_date: '2026-10-27' }] as never;
    expect(effectiveGroomingRecords(vigente, { active: true, resumed_on: '2026-10-18' }).map((x) => x.id)).toEqual(['v']);
    const vencido = [{ id: 'x', date: '2026-07-30', type: 'bath', next_recommended_date: '2026-09-13' }] as never;
    expect(effectiveGroomingRecords(vencido, { active: true, resumed_on: '2026-10-18' })).toEqual([]);
  });
});

describe('banheirinha com a rotina desativada/retomada', () => {
  const iso = (off: number) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const overdue = [{ id: 'a', type: 'bath', date: iso(-60), next_recommended_date: iso(-20), frequency_days: 40 }] as never;

  it('com registros atrasados mas lembretes desativados: nada de piscar — fica "none" (risquinho)', () => {
    expect(groomingRoutineState('p1', overdue)).toBe('overdue');
    expect(groomingRoutineState('p1', effectiveGroomingRecords(overdue, { active: false }))).toBe('none');
  });
  it('retomado: o atraso antigo não volta; vira "none" até um registro novo', () => {
    expect(groomingRoutineState('p1', effectiveGroomingRecords(overdue, { active: true, resumed_on: iso(0) }))).toBe('none');
    const withNew = [...(overdue as never[]), { id: 'n', type: 'bath', date: iso(0), next_recommended_date: iso(15) }] as never;
    expect(groomingRoutineState('p1', effectiveGroomingRecords(withNew, { active: true, resumed_on: iso(0) }))).toBe('scheduled');
  });
});

describe('o caso do Baby: último banho 15/09, próximo 27/10, desativou e reativou em 18/10', () => {
  const iso = (off: number) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  it('a banheirinha continua verde (agendado), não com risquinho', () => {
    const baby = [{ id: 'b', type: 'bath_grooming', date: iso(-33), next_recommended_date: iso(9), frequency_days: 45 }] as never;
    expect(groomingRoutineState('p1', effectiveGroomingRecords(baby, { active: true, resumed_on: iso(0) }))).toBe('scheduled');
  });
});

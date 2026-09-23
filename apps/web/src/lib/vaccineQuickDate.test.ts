import { describe, expect, it } from 'vitest';
import { isValidAppliedOn, nextDoseStatus, resolveQuickAppliedOn } from './vaccineQuickDate';

const TODAY = '2026-09-24';

/** As quatro datas do pedido, relativas a TODAY (24/09/2026). */
const CASES = [
  ['hoje', '2026-09-24'],
  ['ontem', '2026-09-23'],
  ['há seis meses', '2026-03-24'],
  ['há um ano', '2025-09-24'],
] as const;

describe('resolveQuickAppliedOn — a data escolhida vale exatamente como veio', () => {
  it.each(CASES)('vacina aplicada %s: %s segue intacta até o backend', (_label, iso) => {
    const r = resolveQuickAppliedOn('today', iso, TODAY);
    expect(r.error).toBeUndefined();
    expect(r.appliedOn).toBe(iso);          // mesma string — nunca vira Date no caminho
    expect(r.isUnknown).toBe(false);        // é aplicação confirmada, não estimativa
  });

  it('data futura é recusada com mensagem, e não vira "hoje" em silêncio', () => {
    const r = resolveQuickAppliedOn('today', '2026-09-25', TODAY);
    expect(r.error).toMatch(/não pode ter sido aplicada no futuro/);
  });

  it('data vazia ou inválida é recusada (nada de salvar com data inventada)', () => {
    for (const bad of ['', '24/09/2026', '2026-9-24', '2026-02-31', 'abc']) {
      expect(resolveQuickAppliedOn('today', bad, TODAY).error, bad).toBeTruthy();
    }
  });

  it('sem data escolhida mantém o comportamento antigo dos outros chamadores', () => {
    expect(resolveQuickAppliedOn('today', undefined, TODAY)).toEqual({ appliedOn: TODAY, isUnknown: false });
    expect(resolveQuickAppliedOn('this_month', undefined, TODAY)).toEqual({ appliedOn: '2026-09-01', isUnknown: false });
    expect(resolveQuickAppliedOn('unknown', undefined, TODAY)).toEqual({ appliedOn: TODAY, isUnknown: true });
  });
});

describe('isValidAppliedOn', () => {
  it('aceita hoje e qualquer dia passado, inclusive ano bissexto', () => {
    expect(isValidAppliedOn(TODAY, TODAY)).toBe(true);
    expect(isValidAppliedOn('2024-02-29', TODAY)).toBe(true);
    expect(isValidAppliedOn('2020-01-01', TODAY)).toBe(true);
  });
  it('recusa amanhã, 29/02 de ano não bissexto e formatos errados', () => {
    expect(isValidAppliedOn('2026-09-25', TODAY)).toBe(false);
    expect(isValidAppliedOn('2025-02-29', TODAY)).toBe(false);
    expect(isValidAppliedOn(null, TODAY)).toBe(false);
    expect(isValidAppliedOn(undefined, TODAY)).toBe(false);
  });
});

describe('nextDoseStatus — dias de calendário, sem fuso', () => {
  it('próxima dose HOJE é "hora de revisar", nunca "atrasada" (o bug do new Date UTC)', () => {
    expect(nextDoseStatus('2026-09-24', TODAY)).toBe('Pode estar na hora de revisar');
  });
  it('ontem = atrasada; daqui a 30 dias = revisar; 31 dias = em dia', () => {
    expect(nextDoseStatus('2026-09-23', TODAY)).toBe('Vale confirmar com seu veterinário');
    expect(nextDoseStatus('2026-10-24', TODAY)).toBe('Pode estar na hora de revisar');
    expect(nextDoseStatus('2026-10-25', TODAY)).toBe('Em dia');
  });
  it('vacina de um ano atrás: a próxima dose anual cai hoje; a de seis meses ainda está em dia', () => {
    // backend soma o intervalo ao applied_on real: 2025-09-24 + 1 ano = hoje
    expect(nextDoseStatus('2026-09-24', TODAY)).toBe('Pode estar na hora de revisar');
    // 2026-03-24 + 1 ano = 2027-03-24
    expect(nextDoseStatus('2027-03-24', TODAY)).toBe('Em dia');
  });
  it('aceita timestamp ISO e ausência de data', () => {
    expect(nextDoseStatus('2026-09-23T00:00:00Z', TODAY)).toBe('Vale confirmar com seu veterinário');
    expect(nextDoseStatus(null, TODAY)).toBe('Em dia');
    expect(nextDoseStatus(undefined, TODAY)).toBe('Em dia');
  });
});

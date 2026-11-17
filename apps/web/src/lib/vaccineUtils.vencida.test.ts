import { describe, expect, it } from 'vitest';
import { daysUntilCalendarDate, isVaccineOverdue } from './vaccineUtils';

// Aparelho no Brasil (UTC-3): 17/11 às 10:00 local = 13:00 UTC; às 23:00 local já é 18/11 02:00 UTC.
const manha = new Date(2026, 10, 17, 10, 0);
const noite = new Date(2026, 10, 17, 23, 30);

describe('vacina vencida — por DIA de calendário', () => {
  it('vence hoje NÃO é vencida (nem de manhã nem à noite)', () => {
    expect(daysUntilCalendarDate('2026-11-17', manha)).toBe(0);
    expect(daysUntilCalendarDate('2026-11-17', noite)).toBe(0);
    expect(isVaccineOverdue('2026-11-17', manha)).toBe(false);
    expect(isVaccineOverdue('2026-11-17T00:00:00', noite)).toBe(false);
  });
  it('ontem é vencida; amanhã não é', () => {
    expect(isVaccineOverdue('2026-11-16', manha)).toBe(true);
    expect(daysUntilCalendarDate('2026-11-16', manha)).toBe(-1);
    expect(isVaccineOverdue('2026-11-18', manha)).toBe(false);
    expect(daysUntilCalendarDate('2026-11-18', noite)).toBe(1);
  });
  it('sem data ou data inválida não é vencida', () => {
    expect(isVaccineOverdue(null, manha)).toBe(false);
    expect(isVaccineOverdue('', manha)).toBe(false);
    expect(isVaccineOverdue('lixo', manha)).toBe(false);
  });
});

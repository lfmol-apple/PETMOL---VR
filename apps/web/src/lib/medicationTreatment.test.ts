import { describe, expect, it } from 'vitest';
import { isMedicationTreatmentStale, treatmentNominalEnd } from './medicationTreatment';

const ursacol = {
  treatment_days: 90,
  applied_dates: ['2026-03-07', '2026-07-19', '2026-08-07', '2026-08-23'],
};

describe('isMedicationTreatmentStale', () => {
  it('90 dias iniciados em 07/03, última dose 23/08, hoje 19/09 → concluído', () => {
    expect(isMedicationTreatmentStale('2026-03-07T00:00:00Z', ursacol, '2026-09-19')).toBe(true);
  });
  it('período acabou mas dose recente (≤14 dias) → ainda ativo', () => {
    expect(isMedicationTreatmentStale('2026-03-07', { ...ursacol, applied_dates: ['2026-09-12'] }, '2026-09-19')).toBe(false);
  });
  it('tratamento dentro do período → ativo', () => {
    expect(isMedicationTreatmentStale('2026-09-15', { treatment_days: 7, applied_dates: [] }, '2026-09-19')).toBe(false);
  });
  it('sem dados de duração → nunca conclui sozinho', () => {
    expect(isMedicationTreatmentStale('2026-01-01', {}, '2026-09-19')).toBe(false);
  });
  it('intervalo personalizado: 3 doses a cada 10 dias termina no dia 20', () => {
    expect(treatmentNominalEnd('2026-01-01', { total_doses: 3, custom_interval_days: 10 })).toBe('2026-01-21');
  });
  it('7 dias a partir de 15/09 termina em 21/09', () => {
    expect(treatmentNominalEnd('2026-09-15', { treatment_days: 7 })).toBe('2026-09-21');
  });
});

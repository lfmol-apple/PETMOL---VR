import { describe, expect, it } from 'vitest';
import { isMedicationTreatmentStale, medicationDosesToday, medicationSlotTimes, medicationTreatmentState, treatmentNominalEnd } from './medicationTreatment';

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

const TODAY = '2026-09-19';

describe('medicationTreatmentState', () => {
  it('dentro do prazo → active', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-09-15' }, { treatment_days: 7, applied_dates: ['2026-09-15'] }, TODAY)).toBe('active');
  });
  it('todas as doses registradas → completed (mesmo com prazo vencido há meses)', () => {
    const days = Array.from({ length: 7 }, (_, i) => `2026-03-0${i + 1}`);
    expect(medicationTreatmentState({ scheduled_at: '2026-03-01' }, { treatment_days: 7, applied_dates: days }, TODAY)).toBe('completed');
  });
  it('status completed do backend → completed', () => {
    expect(medicationTreatmentState({ status: 'completed', scheduled_at: '2026-09-01' }, {}, TODAY)).toBe('completed');
  });
  it('status completed mas doses removidas depois → não fica completed', () => {
    expect(medicationTreatmentState({ status: 'completed', scheduled_at: '2026-09-15' }, { treatment_days: 7, applied_dates: [] }, TODAY)).toBe('active');
  });
  it('cancelado → interrupted, com ou sem doses', () => {
    expect(medicationTreatmentState({ status: 'cancelled', scheduled_at: '2026-09-15' }, { treatment_days: 7, applied_dates: [] }, TODAY)).toBe('interrupted');
  });
  it('prazo encerrado, doses faltando, sem atividade recente → expired_unconfirmed (nunca completed)', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-03-07' }, ursacol, TODAY)).toBe('expired_unconfirmed');
  });
  it('prazo encerrado sem nenhuma dose registrada → expired_unconfirmed', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-06-01' }, { treatment_days: 10, applied_dates: [] }, TODAY)).toBe('expired_unconfirmed');
  });
  it('prazo encerrado mas dose há ≤14 dias → active (tutor ainda está aplicando)', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-09-01' }, { treatment_days: 10, applied_dates: ['2026-09-10'] }, TODAY)).toBe('active');
  });
  it('sem duração definida → nunca expira sozinho', () => {
    expect(medicationTreatmentState({ scheduled_at: '2025-01-01' }, {}, TODAY)).toBe('active');
  });
  it('intervalo personalizado: 3 doses a cada 10 dias, vencido e parado → expired_unconfirmed', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-01-01' }, { total_doses: 3, custom_interval_days: 10, applied_dates: ['2026-01-01'] }, TODAY)).toBe('expired_unconfirmed');
  });
  it('intervalo personalizado com todas as doses → completed', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-01-01' }, { total_doses: 3, custom_interval_days: 10, applied_dates: ['2026-01-01', '2026-01-11', '2026-01-21'] }, TODAY)).toBe('completed');
  });
  it('reabrir o app não muda o estado (função pura sobre os dados gravados)', () => {
    const ev = { scheduled_at: '2026-03-07' };
    expect(medicationTreatmentState(ev, ursacol, TODAY)).toBe(medicationTreatmentState(ev, { ...ursacol }, TODAY));
  });
  it('registrar dose depois de expirado reativa o tratamento', () => {
    expect(medicationTreatmentState({ scheduled_at: '2026-03-07' }, { ...ursacol, applied_dates: [...ursacol.applied_dates, '2026-09-18'] }, TODAY)).toBe('active');
  });
});


describe('medicationDosesToday (card da Home: alerta vermelho só com dose atrasada de verdade)', () => {
  const HOJE = '2026-09-21';
  const diaria19 = { frequency_mode: 'vezes_dia', times_per_day: 1, first_dose_time: '19:00', reminder_times: ['19:00'], treatment_days: 10 };

  it('dose diária marcada hoje (applied_dates) → em dia', () => {
    const ex = { ...diaria19, applied_dates: ['2026-09-19', HOJE] };
    expect(medicationDosesToday('2026-09-19', ex, HOJE, '19:24')).toEqual({ due: 1, done: 1 });
  });
  it('Dipirona a cada 8h com as 3 doses de hoje em applied_slots → em dia', () => {
    const ex = { frequency_mode: 'intervalo', interval_minutes: 480, first_dose_time: '17:00', reminder_times: ['17:00'], treatment_days: 7,
      applied_dates: [HOJE], applied_slots: { [HOJE]: ['01:00', '09:00', '17:00'] } };
    expect(medicationSlotTimes(ex)).toEqual(['01:00', '09:00', '17:00']);
    expect(medicationDosesToday('2026-09-19', ex, HOJE, '19:24')).toEqual({ due: 3, done: 3 });
  });
  it('só 1 das 3 doses registrada → 1/3 (atrasado de verdade)', () => {
    const ex = { frequency_mode: 'intervalo', interval_minutes: 480, first_dose_time: '17:00', treatment_days: 7, applied_slots: { [HOJE]: ['01:00'] } };
    expect(medicationDosesToday('2026-09-19', ex, HOJE, '19:24')).toEqual({ due: 3, done: 1 });
  });
  it('dose das 11:33 sem registro às 19:24 → atrasada; antes das 11:33 ainda não conta', () => {
    const ex = { frequency_mode: 'vezes_dia', times_per_day: 1, first_dose_time: '11:33', reminder_times: ['11:33'], treatment_days: 30, applied_dates: [] };
    expect(medicationDosesToday('2026-09-21', ex, HOJE, '19:24')).toEqual({ due: 1, done: 0 });
    expect(medicationDosesToday('2026-09-21', ex, HOJE, '10:00')).toEqual({ due: 0, done: 0 });
  });
  it('dose pulada conta como resolvida', () => {
    const ex = { ...diaria19, skipped_dates: [HOJE] };
    expect(medicationDosesToday('2026-09-19', ex, HOJE, '20:00')).toEqual({ due: 1, done: 1 });
  });
  it('tratamento que ainda não começou, já terminou, ou SOS → nada devido', () => {
    expect(medicationDosesToday('2026-09-22', diaria19, HOJE, '23:00')).toEqual({ due: 0, done: 0 });
    expect(medicationDosesToday('2026-09-01', { ...diaria19, treatment_days: 5 }, HOJE, '23:00')).toEqual({ due: 0, done: 0 });
    expect(medicationDosesToday('2026-09-19', { frequency_mode: 'conforme_necessidade' }, HOJE, '23:00')).toEqual({ due: 0, done: 0 });
  });
  it('intervalo em dias: só é dia de dose a cada N dias', () => {
    const ex = { frequency_mode: 'intervalo_dias', custom_interval_days: 15, total_doses: 2, first_dose_time: '09:00' };
    expect(medicationDosesToday('2026-09-21', ex, HOJE, '10:00')).toEqual({ due: 1, done: 0 });    // dia 0
    expect(medicationDosesToday('2026-09-10', ex, HOJE, '10:00')).toEqual({ due: 0, done: 0 });    // dia 11: não é dia de dose
  });
});

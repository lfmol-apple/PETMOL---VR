import { describe, expect, it } from 'vitest';
import { buildPetCareReminders, type PetCareDomainParams } from './petCareDomain';
import type { PetEventRecord } from './petEvents';

// Regressão: lembretes de medicação nunca carregavam `gtin`, mesmo quando o
// tutor escaneou o código de barras no cadastro — MedicationItemSheet.tsx
// grava o código embutido em notes ("... | Código de barras: X"), não numa
// coluna própria, e processEvents() nunca extraía isso de volta. Resultado
// real reportado pelo usuário: o card de "Comprar novamente" nunca achava
// preço pra medicação nenhuma, escaneada ou não, porque o gtin nunca saía
// do texto da nota.

function baseParams(petEvents: PetEventRecord[]): PetCareDomainParams {
  return {
    pet_id: 'pet-1',
    pet_name: 'Rex',
    vaccines: [],
    parasiteControls: [],
    groomingRecords: [],
    feedingPlan: null,
    petEvents,
  };
}

function medicationEvent(overrides: Partial<PetEventRecord>): PetEventRecord {
  return {
    id: 'ev-1',
    type: 'medicacao',
    title: 'Antibiótico Teste',
    scheduled_at: '2026-08-01T00:00:00Z',
    status: 'active',
    source: 'manual',
    notes: 'Dose: 1 comprimido | Via: oral | Frequência: 1x dia | Código de barras: 7891234500000',
    ...overrides,
  };
}

describe('buildPetCareReminders — gtin em lembretes de medicação', () => {
  it('extrai o gtin das notes no caminho de intervalo personalizado (custom_interval_days)', () => {
    const ev = medicationEvent({
      next_due_date: '2026-08-25T00:00:00Z',
      extra_data: JSON.stringify({ custom_interval_days: 15 }),
    });
    const reminders = buildPetCareReminders(baseParams([ev]));
    const med = reminders.find(r => r.domain === 'medication');
    expect(med?.gtin).toBe('7891234500000');
  });

  it('extrai o gtin no caminho de tratamento diário (treatment_days)', () => {
    // Datas relativas a hoje: com data fixa o tratamento "vencia" com o tempo
    // e passava a ser considerado concluído (ver lib/medicationTreatment.ts).
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const ev = medicationEvent({
      scheduled_at: `${today}T00:00:00Z`,
      next_due_date: `${today}T00:00:00Z`,
      extra_data: JSON.stringify({ treatment_days: 10, applied_dates: [] }),
    });
    const reminders = buildPetCareReminders(baseParams([ev]));
    const med = reminders.find(r => r.domain === 'medication');
    expect(med?.gtin).toBe('7891234500000');
  });

  it('extrai o gtin no caminho genérico (sem treatment_days/custom_interval_days)', () => {
    const ev = medicationEvent({
      next_due_date: '2026-08-25T00:00:00Z',
      extra_data: JSON.stringify({}),
    });
    const reminders = buildPetCareReminders(baseParams([ev]));
    const med = reminders.find(r => r.domain === 'medication');
    expect(med?.gtin).toBe('7891234500000');
  });

  it('medicação sem código de barras nas notes fica com gtin undefined (nunca quebra)', () => {
    const ev = medicationEvent({
      notes: 'Dose: 1 comprimido | Via: oral | Frequência: 1x dia',
      next_due_date: '2026-08-25T00:00:00Z',
      extra_data: JSON.stringify({}),
    });
    const reminders = buildPetCareReminders(baseParams([ev]));
    const med = reminders.find(r => r.domain === 'medication');
    expect(med?.gtin).toBeUndefined();
  });

  it('outro tipo de evento (ex: consulta) nunca tenta extrair código de barras', () => {
    const ev = medicationEvent({
      type: 'consulta',
      notes: 'Anotação qualquer sem relação com código de barras',
      next_due_date: '2026-08-25T00:00:00Z',
    });
    const reminders = buildPetCareReminders(baseParams([ev]));
    const consulta = reminders.find(r => r.domain === 'event');
    expect(consulta?.gtin).toBeUndefined();
  });
});

describe('buildPetCareReminders — prazo encerrado sem conclusão confirmada', () => {
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  it('tratamento diário vencido e parado não gera lembrete', () => {
    const ev = medicationEvent({
      scheduled_at: `${daysAgo(60)}T00:00:00Z`,
      next_due_date: `${daysAgo(59)}T00:00:00Z`,
      extra_data: JSON.stringify({ treatment_days: 10, applied_dates: [daysAgo(58)] }),
    });
    expect(buildPetCareReminders(baseParams([ev])).some(r => r.domain === 'medication')).toBe(false);
  });

  it('intervalo personalizado vencido e parado não vira lembrete atrasado eterno', () => {
    const ev = medicationEvent({
      scheduled_at: `${daysAgo(90)}T00:00:00Z`,
      next_due_date: `${daysAgo(60)}T00:00:00Z`,
      extra_data: JSON.stringify({ custom_interval_days: 10, total_doses: 3, applied_dates: [daysAgo(90)] }),
    });
    expect(buildPetCareReminders(baseParams([ev])).some(r => r.domain === 'medication')).toBe(false);
  });

  it('intervalo personalizado ainda dentro do prazo continua lembrando', () => {
    const ev = medicationEvent({
      scheduled_at: `${daysAgo(5)}T00:00:00Z`,
      next_due_date: `${daysAgo(-5)}T00:00:00Z`,
      extra_data: JSON.stringify({ custom_interval_days: 10, total_doses: 3, applied_dates: [daysAgo(5)] }),
    });
    expect(buildPetCareReminders(baseParams([ev])).some(r => r.domain === 'medication')).toBe(true);
  });

  it('tratamento vencido mas com dose recente continua lembrando', () => {
    const ev = medicationEvent({
      scheduled_at: `${daysAgo(12)}T00:00:00Z`,
      next_due_date: `${daysAgo(11)}T00:00:00Z`,
      extra_data: JSON.stringify({ treatment_days: 10, applied_dates: [daysAgo(3)] }),
    });
    expect(buildPetCareReminders(baseParams([ev])).some(r => r.domain === 'medication')).toBe(true);
  });

  it('cancelado (interrompido) nunca gera lembrete', () => {
    const ev = medicationEvent({
      status: 'cancelled',
      scheduled_at: `${daysAgo(2)}T00:00:00Z`,
      next_due_date: `${daysAgo(1)}T00:00:00Z`,
      extra_data: JSON.stringify({ treatment_days: 10, applied_dates: [] }),
    });
    expect(buildPetCareReminders(baseParams([ev])).some(r => r.domain === 'medication')).toBe(false);
  });
});

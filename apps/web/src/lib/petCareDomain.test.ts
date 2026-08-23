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
    const ev = medicationEvent({
      scheduled_at: '2026-08-20T00:00:00Z',
      next_due_date: '2026-08-25T00:00:00Z',
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

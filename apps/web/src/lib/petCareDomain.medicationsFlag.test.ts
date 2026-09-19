import { describe, expect, it } from 'vitest';
import { buildPetCareReminders, type PetCareDomainParams } from './petCareDomain';
import { MEDICATIONS_ENABLED } from './featureFlags';
import type { PetEventRecord } from './petEvents';

// Medicamentos desativados no PETMOL 1.0 (18/09/2026, ver
// docs/MEDICAMENTOS_DESATIVADOS.md). Sem mock nenhum aqui de propósito —
// este arquivo prova o comportamento REAL de produção: com
// MEDICATIONS_ENABLED=false (o valor de verdade em featureFlags.ts),
// nenhum evento tipo 'medicacao' vira lembrete, mesmo com dados de
// tratamento completos e válidos. Dados/eventos existentes de usuários
// que já tinham medicação cadastrada continuam intactos no banco — só
// não geram mais lembrete/card/notificação nenhum.

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

describe('buildPetCareReminders — medicamentos desativados por padrão', () => {
  it('MEDICATIONS_ENABLED é false por padrão (regressão: alguém religou sem querer)', () => {
    expect(MEDICATIONS_ENABLED).toBe(false);
  });

  it('evento de medicação com treatment_days ativo não vira lembrete', () => {
    const ev: PetEventRecord = {
      id: 'ev-1',
      type: 'medicacao',
      title: 'Antibiótico Teste',
      scheduled_at: '2026-09-15T00:00:00Z',
      status: 'active',
      source: 'manual',
      next_due_date: '2026-09-19T00:00:00Z',
      notes: 'Dose: 1 comprimido | Via: oral | Frequência: 1x dia',
      extra_data: JSON.stringify({ treatment_days: 10, applied_dates: [] }),
    };
    const reminders = buildPetCareReminders(baseParams([ev]));
    expect(reminders.find(r => r.domain === 'medication')).toBeUndefined();
  });

  it('evento de medicação com intervalo personalizado não vira lembrete', () => {
    const ev: PetEventRecord = {
      id: 'ev-2',
      type: 'medicacao',
      title: 'Vermífugo reforço',
      scheduled_at: '2026-09-01T00:00:00Z',
      status: 'active',
      source: 'manual',
      next_due_date: '2026-09-25T00:00:00Z',
      notes: 'Dose: 1 comprimido | Via: oral',
      extra_data: JSON.stringify({ custom_interval_days: 15, total_doses: 2 }),
    };
    const reminders = buildPetCareReminders(baseParams([ev]));
    expect(reminders.find(r => r.domain === 'medication')).toBeUndefined();
  });

  it('outros tipos de evento (consulta) continuam gerando lembrete normalmente', () => {
    const ev: PetEventRecord = {
      id: 'ev-3',
      type: 'consulta',
      title: 'Retorno veterinário',
      scheduled_at: '2026-09-10T00:00:00Z',
      status: 'active',
      source: 'manual',
      next_due_date: '2026-09-25T00:00:00Z',
    };
    const reminders = buildPetCareReminders(baseParams([ev]));
    expect(reminders.find(r => r.domain === 'event')).toBeDefined();
  });
});

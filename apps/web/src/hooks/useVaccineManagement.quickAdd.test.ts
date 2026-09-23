import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const showBlockingNotice = vi.fn();
vi.mock('@/features/interactions/userPromptChannel', () => ({
  requestUserConfirmation: vi.fn(),
  showAppToast: vi.fn(),
  showBlockingNotice: (...a: unknown[]) => showBlockingNotice(...a),
}));
vi.mock('@/lib/v1Metrics', () => ({ trackV1Metric: vi.fn() }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/features/notifications/pushService', () => ({
  scheduleUniqueReminder: vi.fn(),
  buildRemindAt: vi.fn(),
  subtractDays: vi.fn(),
}));
vi.mock('@/services/vaccineService', () => ({
  updateVaccine: vi.fn(), deleteVaccine: vi.fn(), clearAllVaccines: vi.fn(),
}));

import { useVaccineManagement } from './useVaccineManagement';

// 24/09/2026, meio-dia LOCAL
const NOW = new Date(2026, 8, 24, 12, 0, 0);
const VACCINE = { type: 'multiple' as const, name: 'V10', icon: '💉', code: 'DOG_POLYVALENT_V8' };

const CASES = [
  ['hoje', '2026-09-24', '2027-09-24'],
  ['ontem', '2026-09-23', '2027-09-23'],
  ['há seis meses', '2026-03-24', '2027-03-24'],
  ['há um ano', '2025-09-24', '2026-09-24'],
] as const;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  showBlockingNotice.mockClear();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const sent = JSON.parse(String(init?.body)).vaccines[0];
    const applied = sent.applied_on as string;
    const next = `${Number(applied.slice(0, 4)) + 1}${applied.slice(4)}`;   // servidor: anual a partir da data real
    return {
      ok: true,
      json: async () => ({ vaccines: [{ id: 'v1', display_name: sent.display_name, applied_on: applied, next_due_on: next, notes: sent.notes, record_type: sent.record_type }] }),
    } as Response;
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function setup() {
  const pets = [{ pet_id: 'p1', species: 'dog', birth_date: '2020-01-01', vaccines: [] }] as never;
  return renderHook(() => useVaccineManagement({
    selectedPetId: 'p1', pets, setPets: vi.fn(), fetchPetEvents: vi.fn(),
    t: (k: string) => k, locale: 'pt-BR',
    reviewRegistros: null, reviewConfirmed: false, reviewExpectedCount: 0, rawRegistros: null,
    reviewLearnEnabled: false, cardAnalysis: null, closeCardAnalysis: vi.fn(),
  }));
}

const sentBody = () => JSON.parse(String(fetchMock.mock.calls[0][1].body)).vaccines[0];

describe('handleQuickAddVaccine — a data que vai pro servidor é a escolhida', () => {
  it.each(CASES)('vacina aplicada %s: applied_on = %s, registro confirmado, próxima dose a partir dela', async (_l, iso, nextDue) => {
    const { result } = setup();
    await act(async () => { await result.current.handleQuickAddVaccine(VACCINE, 'today', iso); });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = sentBody();
    expect(sent.applied_on).toBe(iso);
    expect(sent.record_type).toBe('confirmed_application');
    expect(sent.confirmed_by_user).toBe(true);
    expect(sent.next_due_on).toBeUndefined();                 // o servidor calcula a partir da data real

    // histórico local mostra a data escolhida e a próxima dose calculada dela
    expect(result.current.vaccines).toHaveLength(1);
    expect(result.current.vaccines[0].date_administered).toBe(iso);
    expect(result.current.vaccines[0].next_dose_date).toBe(nextDue);
    expect(showBlockingNotice.mock.calls[0][0]).toContain(`Próxima previsão: ${nextDue}`);
  });

  it('data futura não chega ao servidor (nada é salvo com data inventada)', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handleQuickAddVaccine(VACCINE, 'today', '2026-09-25'); });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(showBlockingNotice.mock.calls[0][0]).toMatch(/não pode ter sido aplicada no futuro/);
  });

  it('"Não lembro a data" segue como estimativa (não vira aplicação confirmada)', async () => {
    const { result } = setup();
    await act(async () => { await result.current.handleQuickAddVaccine(VACCINE, 'unknown'); });
    const sent = sentBody();
    expect(sent.record_type).toBe('estimated_control_start');
    expect(sent.notes).toContain('date_unknown=true');
  });
});

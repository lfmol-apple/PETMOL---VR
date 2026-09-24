import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/lib/I18nContext', () => ({
  useI18n: () => ({ locale: 'pt-BR', geo: {}, setCountry: vi.fn(), setLocale: vi.fn(), t: (k: string) => k }),
}));
vi.mock('@/features/interactions/userPromptChannel', () => ({
  requestUserConfirmation: vi.fn(), showBlockingNotice: vi.fn(),
}));

import { useLocationDetection } from './useLocationDetection';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ country_code: 'BR' }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('useLocationDetection — sem chamar serviços de IP de terceiros por padrão', () => {
  it('desligado (padrão): nenhuma requisição a ipapi.co / api.country.is', async () => {
    renderHook(() => useLocationDetection());
    await Promise.resolve();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ligado por NEXT_PUBLIC_ENABLE_TRAVEL_DETECTION=1: volta a consultar o país', async () => {
    vi.stubEnv('NEXT_PUBLIC_ENABLE_TRAVEL_DETECTION', '1');
    renderHook(() => useLocationDetection());
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain('ipapi.co');
  });
});

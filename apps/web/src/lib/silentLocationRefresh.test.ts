import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { forgetLocationRefresh, MIN_INTERVAL_MS, refreshLocationSilently } from './silentLocationRefresh';

let getCurrentPosition: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function setup(permission: 'granted' | 'prompt' | 'denied' | 'unavailable') {
  getCurrentPosition = vi.fn((ok: (p: unknown) => void) => ok({ coords: { latitude: -19.9173, longitude: -43.9345 } }));
  fetchMock = vi.fn(async () => ({ ok: true }) as Response);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition },
    permissions: permission === 'unavailable' ? undefined : { query: vi.fn(async () => ({ state: permission })) },
  });
}

beforeEach(() => { forgetLocationRefresh(); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('refreshLocationSilently — nunca pergunta, só renova quem já liberou', () => {
  it('permissão já liberada: lê a posição e manda pro servidor (baixa precisão, cache de 10 min)', async () => {
    setup('granted');
    expect(await refreshLocationSilently(1_000)).toBe('updated');
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    expect(getCurrentPosition.mock.calls[0][2]).toMatchObject({ enableHighAccuracy: false, maximumAge: 600000 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/auth\/me$/);
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body)).toEqual({ lat: -19.9173, lng: -43.9345 });
  });

  it.each(['prompt', 'denied', 'unavailable'] as const)('permissão "%s": não lê a posição, não chama o servidor e NUNCA dispara o pedido do sistema', async (state) => {
    setup(state);
    expect(await refreshLocationSilently(1_000)).toBe('not-granted');
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no máximo uma renovação a cada 6 horas', async () => {
    setup('granted');
    expect(await refreshLocationSilently(10_000)).toBe('updated');
    expect(await refreshLocationSilently(10_000 + MIN_INTERVAL_MS - 1)).toBe('throttled');
    expect(await refreshLocationSilently(10_000 + MIN_INTERVAL_MS)).toBe('updated');
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it('falha do servidor ou da leitura não trava nem conta como renovação feita', async () => {
    setup('granted');
    fetchMock.mockResolvedValueOnce({ ok: false } as Response);
    expect(await refreshLocationSilently(1_000)).toBe('failed');
    getCurrentPosition.mockImplementationOnce((_ok: unknown, err: (e: unknown) => void) => err(new Error('timeout')));
    expect(await refreshLocationSilently(2_000)).toBe('failed');
    expect(await refreshLocationSilently(3_000)).toBe('updated');       // e tenta de novo logo depois
  });

  it('forgetLocationRefresh libera a próxima renovação na hora', async () => {
    setup('granted');
    await refreshLocationSilently(5_000);
    forgetLocationRefresh();
    expect(await refreshLocationSilently(6_000)).toBe('updated');
  });
});

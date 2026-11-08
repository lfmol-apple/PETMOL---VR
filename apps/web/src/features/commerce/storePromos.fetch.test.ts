import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchStorePromos, STORE_PROMOS } from './storePromos';

afterEach(() => vi.unstubAllGlobals());

describe('fetchStorePromos', () => {
  it('devolve a lista do servidor', async () => {
    const promos = [{ id: 'x', merchants: ['cobasi'], name: 'X', detail: '', startsOn: '2026-11-10', endsOn: '2026-11-12', source: 'https://a' }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ today: '2026-11-08', promos }) }));
    expect(await fetchStorePromos()).toEqual(promos);
  });
  it('falha de rede ou resposta ruim → null (o app usa a lista embutida de reserva)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    expect(await fetchStorePromos()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    expect(await fetchStorePromos()).toBeNull();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ promos: 'lixo' }) }));
    expect(await fetchStorePromos()).toBeNull();
    expect(STORE_PROMOS.length).toBeGreaterThan(0);
  });
});

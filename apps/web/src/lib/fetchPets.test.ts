import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPets, invalidatePets } from './fetchPets';

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  invalidatePets();
  fetchMock = vi.fn(async () => new Response(JSON.stringify([{ id: 'p1' }]), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchPets — dedupe do GET /pets', () => {
  it('duas leituras seguidas com o mesmo token fazem UMA chamada e ambas conseguem ler o corpo', async () => {
    const [a, b] = await Promise.all([fetchPets('/api', 'tok'), fetchPets('/api', 'tok')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual([{ id: 'p1' }]);
    expect(await b.json()).toEqual([{ id: 'p1' }]);
  });

  it('token diferente (outra conta) NÃO reaproveita a resposta', async () => {
    await fetchPets('/api', 'tokA');
    await fetchPets('/api', 'tokB');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('depois de invalidatePets() a próxima leitura vai à rede de novo', async () => {
    await fetchPets('/api', 'tok');
    invalidatePets();
    await fetchPets('/api', 'tok');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falha de rede não fica em cache', async () => {
    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await expect(fetchPets('/api', 'tok')).rejects.toThrow('offline');
    const ok = await fetchPets('/api', 'tok');
    expect(ok.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('envia o token e os cookies', async () => {
    await fetchPets('/api', 'tok');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/pets');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.credentials).toBe('include');
  });
});

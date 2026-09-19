import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchMe, invalidateMe } from './fetchMe';

afterEach(() => { invalidateMe(); vi.restoreAllMocks(); });

describe('fetchMe', () => {
  it('chamadas simultâneas com o mesmo token viram 1 requisição', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ id: 'u1' })));
    const [a, b, c] = await Promise.all([fetchMe('/api', 't'), fetchMe('/api', 't'), fetchMe('/api', 't')]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await a.json()).toEqual({ id: 'u1' });
    expect(await b.json()).toEqual({ id: 'u1' });
    expect(await c.json()).toEqual({ id: 'u1' });
  });

  it('token diferente não compartilha resposta', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
    await fetchMe('/api', 'a'); await fetchMe('/api', 'b');
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('invalidateMe força nova leitura', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('{}'));
    await fetchMe('/api', 't'); invalidateMe(); await fetchMe('/api', 't');
    expect(spy).toHaveBeenCalledTimes(2);
  });
});

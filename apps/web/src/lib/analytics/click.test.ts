import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('trackClick', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('não quebra a UX quando analytics falha', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const { trackClick } = await import('./click');

    await expect(trackClick({ source: 'home', cta_type: 'commerce_click' })).resolves.toBe('');
  });

  it('envia anonymous_id e session_id no payload legado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ lead_id: 'lead-1' }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { trackClick } = await import('./click');

    await expect(trackClick({ source: 'home', cta_type: 'offer_viewed', target: 'cobasi' })).resolves.toBe('lead-1');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    expect(body.metadata.anonymous_id).toMatch(/^anon_/);
    expect(body.metadata.session_id).toMatch(/^sess_/);
    expect(body.metadata.platform).toBeTruthy();
  });
});

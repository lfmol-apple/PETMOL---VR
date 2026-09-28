import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Achado real (28/09/2026): subscribeToPush() só checava passivamente se a
// localização já tinha sido concedida em outro lugar — quem ativava push
// fora do card de nudge da Home (vacina, ração, remédio) nunca era pedido
// pra compartilhar, e caía no escape de até 15 usuários/alerta que o
// broadcast de Pet Sumido usa pra quem não tem nenhuma coordenada — ou
// seja, recebia alertas de fora do raio. Estes testes travam que
// subscribeToPush() e refreshSubscription() agora pedem geolocalização de
// verdade (chamam getCurrentPosition sempre, não só quando já 'granted').

const getCurrentPosition = vi.fn();
const fetchMock = vi.fn();

function stubBrowserPushApis() {
  vi.stubGlobal('navigator', {
    serviceWorker: { ready: Promise.resolve({ pushManager: { subscribe: vi.fn().mockResolvedValue({ toJSON: () => ({ endpoint: 'https://push.example/1' }) }) } }) },
    geolocation: { getCurrentPosition },
  });
  vi.stubGlobal('PushManager', function () {});
  vi.stubGlobal('Notification', { requestPermission: vi.fn().mockResolvedValue('granted') });
  localStorage.clear();
}

beforeEach(() => {
  stubBrowserPushApis();
  fetchMock.mockReset();
  fetchMock.mockImplementation((url: string) => {
    if (String(url).includes('/notifications/vapid-public-key')) {
      return Promise.resolve({ json: async () => ({ publicKey: 'AAAA' }) });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('pushService — pede localização de verdade ao ativar push', () => {
  it('subscribeToPush chama getCurrentPosition (pede permissão) mesmo sem estado prévio', async () => {
    getCurrentPosition.mockImplementation((ok: (p: unknown) => void) =>
      ok({ coords: { latitude: -23.5, longitude: -46.6 } }),
    );
    const { subscribeToPush } = await import('./pushService');
    const ok = await subscribeToPush('token-123');

    expect(ok).toBe(true);
    expect(getCurrentPosition).toHaveBeenCalledTimes(1);
    // nunca mais 'navigator.permissions.query' — a checagem passiva antiga
    const subscribeCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/notifications/subscribe'));
    const body = JSON.parse((subscribeCall![1] as RequestInit).body as string);
    expect(body.lat).toBe(-23.5);
    expect(body.lng).toBe(-46.6);
  });

  it('persiste a localização obtida no perfil (PATCH /auth/me) — fallback do broadcast de Pet Sumido', async () => {
    getCurrentPosition.mockImplementation((ok: (p: unknown) => void) =>
      ok({ coords: { latitude: -23.5, longitude: -46.6 } }),
    );
    const { subscribeToPush } = await import('./pushService');
    await subscribeToPush('token-123');

    const meCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/me'));
    expect(meCall).toBeTruthy();
    const body = JSON.parse((meCall![1] as RequestInit).body as string);
    expect(body).toEqual({ lat: -23.5, lng: -46.6 });
  });

  it('usuário nega localização: subscribe de push continua funcionando, sem PATCH de perfil', async () => {
    getCurrentPosition.mockImplementation((_ok: unknown, fail: (e: unknown) => void) => fail(new Error('denied')));
    const { subscribeToPush } = await import('./pushService');
    const ok = await subscribeToPush('token-123');

    expect(ok).toBe(true);
    const meCall = fetchMock.mock.calls.find((c) => String(c[0]).includes('/auth/me'));
    expect(meCall).toBeUndefined();
  });
});

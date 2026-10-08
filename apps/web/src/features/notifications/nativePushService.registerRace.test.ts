/**
 * Achado 08/10/2026: a Home monta HomePetHeader, PermissionsNudgeCard e
 * OnboardingChecklistCard ao mesmo tempo — cada um com sua própria instância
 * de useNotificationPermissionController, cada uma chamando
 * registerNativePush() de forma independente. Os listeners
 * 'registration'/'registrationError' viviam num array módulo-level
 * compartilhado: a chamada mais nova removia os listeners da chamada
 * anterior AINDA EM ANDAMENTO, que nunca ouvia a resposta da Apple/Google e
 * caía no timeout de 15s — apagando um sininho que o cache já tinha
 * mostrado certo (ativado) pouco antes ("fica vermelho sozinho depois de
 * alguns segundos").
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (arg: unknown) => void;

const listeners: Record<string, Listener[]> = { registration: [], registrationError: [] };
let registerCalls = 0;

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
    getPlatform: () => 'ios',
  },
  registerPlugin: () => ({
    checkPermissions: async () => ({ receive: 'granted' }),
    requestPermissions: async () => ({ receive: 'granted' }),
    register: async () => {
      registerCalls += 1;
    },
    removeAllListeners: async () => {},
    addListener: async (event: string, cb: Listener) => {
      listeners[event] = listeners[event] || [];
      listeners[event].push(cb);
      return {
        remove: async () => {
          listeners[event] = (listeners[event] || []).filter((f) => f !== cb);
        },
      };
    },
  }),
}));

vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));
vi.mock('@/lib/deepLinkIntent', () => ({ markDeepLinkIntent: vi.fn(), savePendingDeepLink: vi.fn() }));

import { registerNativePush } from './nativePushService';

function fireRegistration(token: string) {
  for (const cb of listeners.registration) cb({ value: token });
}

// A 2ª (e seguintes) chamada(s) passam primeiro por remover o(s) handle(s)
// da anterior antes de registrar o novo — espera o callback de verdade
// mudar de referência em vez de contar microtasks às cegas (um simples
// "length > 0" veria o antigo, ainda não removido, como se já fosse o novo).
async function waitForNextRegistrationListener(previous: Listener | undefined) {
  for (let i = 0; i < 30; i++) {
    const current = listeners.registration[0];
    if (current && current !== previous) return;
    await Promise.resolve();
  }
  throw new Error('listener de registration nunca apareceu');
}

// setDiag() também manda um fetch de diagnóstico pra /notifications/native-diag
// (telemetria remota temporária, não relacionada ao registro em si) — os
// testes filtram só as chamadas pro endpoint que importa aqui.
function deviceRegisterCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/notifications/native-device'));
}

beforeEach(() => {
  listeners.registration = [];
  listeners.registrationError = [];
  registerCalls = 0;
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 }) as Response));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registerNativePush — chamadas concorrentes', () => {
  it('3 telas chamando ao mesmo tempo compartilham UMA tentativa — nenhuma perde o listener da outra', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;

    // 3 "telas" (HomePetHeader, PermissionsNudgeCard, OnboardingChecklistCard)
    // chamando ao mesmo tempo, exatamente como acontece de verdade na Home.
    const p1 = registerNativePush('tok');
    const p2 = registerNativePush('tok');
    const p3 = registerNativePush('tok');

    // Só precisa disparar o evento 'registration' UMA vez — todas as 3
    // chamadas devem estar ouvindo o MESMO listener.
    await waitForNextRegistrationListener(undefined);
    fireRegistration('device-token-abc');

    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(r3).toBe(true);
    expect(registerCalls).toBe(1); // uma tentativa real só, não 3
    expect(deviceRegisterCalls(fetchMock).length).toBe(1); // um POST só pro backend
  });

  it('chamadas sequenciais (uma depois da outra terminar) continuam funcionando normalmente', async () => {
    const first = registerNativePush('tok');
    await waitForNextRegistrationListener(undefined);
    const firstListener = listeners.registration[0];
    fireRegistration('device-token-1');
    expect(await first).toBe(true);

    const second = registerNativePush('tok');
    await waitForNextRegistrationListener(firstListener);
    fireRegistration('device-token-2');
    expect(await second).toBe(true);

    expect(registerCalls).toBe(2);
  });
});

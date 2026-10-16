/**
 * Achado 08/10/2026: no app nativo, o sininho de notificação partia SEMPRE
 * de "desativado" até a reconfirmação assíncrona (round-trip com APNs/FCM +
 * backend, até 15s) terminar. Toda vez que o WebView recarregava ao voltar
 * do background (comum em iOS sob pressão de memória), o ícone piscava
 * "desativado" por alguns segundos mesmo com a subscription real intacta.
 *
 * 2ª rodada (mesmo dia): a 1ª correção cacheava o último estado confirmado,
 * mas também tratava QUALQUER retorno não-"granted" de
 * checkNativePushPermission() como recusa definitiva — e essa checagem tem
 * seu próprio timeout de 6s, que falha sozinho bem na hora que o app volta
 * do background (ponte nativa do Capacitor ainda reconectando). Resultado:
 * o sininho voltava a apagar sozinho "depois de alguns segundos" — pior que
 * antes, porque agora sobrescrevia um cache que estava certo. Revertido
 * pra só confirmar via registerNativePush (que de fato fala com APNs/FCM +
 * backend); uma leitura de permissão que falhar/não vier "granted" apenas
 * não decide nada, em vez de apagar o estado.
 *
 * 3ª rodada (mesmo dia): desativar na Home não "pegava" no Perfil — cada
 * tela usa sua própria instância deste hook, e a instância nova (Profile)
 * via a permissão do SO ainda concedida e se auto-registrava de novo,
 * desfazendo a desativação quase na hora. Faltava um sinal de "o usuário
 * ACABOU de desativar", distinto de "a permissão do SO está concedida".
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/features/notifications/pushService', () => ({ getDeviceId: () => 'dev1' }));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));

const checkNativePushPermission = vi.fn();
const registerNativePush = vi.fn();
const unregisterNativePush = vi.fn();
vi.mock('@/features/notifications/nativePushService', () => ({
  isNativePushPlatform: () => true,
  checkNativePushPermission: (...args: unknown[]) => checkNativePushPermission(...args),
  requestNativePushPermission: vi.fn(),
  registerNativePush: (...args: unknown[]) => registerNativePush(...args),
  unregisterNativePush: (...args: unknown[]) => unregisterNativePush(...args),
  pushDiagBreadcrumb: vi.fn(),
}));

import { useNotificationPermissionController, __resetSharedSubscribedForTests } from './useNotificationPermissionController';

const CACHE_KEY = 'petmol_push_last_known_subscribed_v1';
const OPT_OUT_KEY = 'petmol_push_user_opted_out_v1';

beforeEach(() => {
  localStorage.clear();
  __resetSharedSubscribedForTests();
  checkNativePushPermission.mockReset();
  registerNativePush.mockReset();
  unregisterNativePush.mockReset();
});

describe('useNotificationPermissionController — app nativo', () => {
  it('com subscription confirmada antes: parte de "ativado" (não de false) enquanto reconfirma', async () => {
    localStorage.setItem(CACHE_KEY, '1');
    let resolvePermission: (v: 'granted') => void = () => {};
    checkNativePushPermission.mockImplementation(() => new Promise((res) => { resolvePermission = res; }));

    const { result } = renderHook(() => useNotificationPermissionController());

    // Ainda checando a permissão (promise pendente) — não deve cair pra false.
    expect(result.current.isSubscribed).toBe(true);

    resolvePermission('granted');
    registerNativePush.mockResolvedValue(true);
    await waitFor(() => expect(registerNativePush).toHaveBeenCalled());
  });

  it('checagem de permissão falha/retorna não-granted: NÃO apaga o cache (checkNativePushPermission tem timeout de 6s e pode falhar por leitura, não por recusa real)', async () => {
    localStorage.setItem(CACHE_KEY, '1');
    checkNativePushPermission.mockResolvedValue('denied');

    const { result } = renderHook(() => useNotificationPermissionController());

    await waitFor(() => expect(checkNativePushPermission).toHaveBeenCalled());
    expect(registerNativePush).not.toHaveBeenCalled();
    // Continua "ativado" — era isso que o cache dizia e nada confirmou o contrário.
    expect(result.current.isSubscribed).toBe(true);
    expect(localStorage.getItem(CACHE_KEY)).toBe('1');
  });

  it('permissão concedida e registro ok: confirma "ativado" e persiste no cache', async () => {
    checkNativePushPermission.mockResolvedValue('granted');
    registerNativePush.mockResolvedValue(true);

    const { result } = renderHook(() => useNotificationPermissionController());

    await waitFor(() => expect(result.current.isSubscribed).toBe(true));
    expect(localStorage.getItem(CACHE_KEY)).toBe('1');
  });

  it('desativar numa tela (Home) é respeitado quando outra tela (Perfil) monta depois — não reativa sozinho', async () => {
    // Home: já estava "ativado" e confirmado.
    localStorage.setItem(CACHE_KEY, '1');
    checkNativePushPermission.mockResolvedValue('granted');
    const home = renderHook(() => useNotificationPermissionController());
    await waitFor(() => expect(registerNativePush).toHaveBeenCalledTimes(1));

    // Usuário toca em "Desativar" na Home.
    await act(async () => { await home.result.current.unsubscribe(); });
    expect(unregisterNativePush).toHaveBeenCalled();
    expect(home.result.current.isSubscribed).toBe(false);
    expect(localStorage.getItem(CACHE_KEY)).toBe('0');
    expect(localStorage.getItem(OPT_OUT_KEY)).toBe('1');

    // Perfil monta uma instância NOVA do hook — permissão do SO continua
    // "granted" (desativar no app não mexe na permissão do SO).
    registerNativePush.mockClear();
    const profile = renderHook(() => useNotificationPermissionController());
    await waitFor(() => expect(checkNativePushPermission).toHaveBeenCalledTimes(2));

    expect(profile.result.current.isSubscribed).toBe(false);
    expect(registerNativePush).not.toHaveBeenCalled(); // não reativou sozinho
  });

  it('reativar depois de ter desativado limpa o sinal e volta a renovar normalmente', async () => {
    localStorage.setItem(OPT_OUT_KEY, '1');
    checkNativePushPermission.mockResolvedValue('granted');
    registerNativePush.mockResolvedValue(true);

    const { result } = renderHook(() => useNotificationPermissionController());
    await waitFor(() => expect(checkNativePushPermission).toHaveBeenCalled());
    expect(registerNativePush).not.toHaveBeenCalled(); // ainda com o sinal de opt-out

    await act(async () => { await result.current.subscribeToPush(); });

    expect(result.current.isSubscribed).toBe(true);
    expect(localStorage.getItem(OPT_OUT_KEY)).toBeNull();
  });

  it('renovação silenciosa que FALHA não derruba o estado "ativo" (sininho não pisca à toa)', async () => {
    localStorage.setItem(CACHE_KEY, '1');
    checkNativePushPermission.mockResolvedValue('granted');
    registerNativePush.mockResolvedValue(false);   // timeout/sinal fraco

    const { result } = renderHook(() => useNotificationPermissionController());
    await waitFor(() => expect(registerNativePush).toHaveBeenCalled());
    await act(async () => { await Promise.resolve(); });

    expect(result.current.isSubscribed).toBe(true);
    expect(localStorage.getItem(CACHE_KEY)).toBe('1');
  });

  it('duas telas lendo o hook (sininho da Home e Perfil) mostram sempre o MESMO valor, ao mesmo tempo', async () => {
    localStorage.setItem(CACHE_KEY, '1');
    checkNativePushPermission.mockResolvedValue('granted');
    registerNativePush.mockResolvedValue(true);

    const home = renderHook(() => useNotificationPermissionController());
    const profile = renderHook(() => useNotificationPermissionController());
    await waitFor(() => expect(registerNativePush).toHaveBeenCalled());
    expect(home.result.current.isSubscribed).toBe(true);
    expect(profile.result.current.isSubscribed).toBe(true);

    // Desativa numa tela: a OUTRA, já montada, acompanha na hora (antes ficava com o valor velho).
    await act(async () => { await profile.result.current.unsubscribe(); });
    expect(profile.result.current.isSubscribed).toBe(false);
    expect(home.result.current.isSubscribed).toBe(false);

    // Reativa na outra: as duas voltam juntas.
    await act(async () => { await home.result.current.subscribeToPush(); });
    expect(home.result.current.isSubscribed).toBe(true);
    expect(profile.result.current.isSubscribed).toBe(true);
  });
});

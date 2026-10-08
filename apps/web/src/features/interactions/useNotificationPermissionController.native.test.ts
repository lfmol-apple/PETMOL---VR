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
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/features/notifications/pushService', () => ({ getDeviceId: () => 'dev1' }));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));

const checkNativePushPermission = vi.fn();
const registerNativePush = vi.fn();
vi.mock('@/features/notifications/nativePushService', () => ({
  isNativePushPlatform: () => true,
  checkNativePushPermission: (...args: unknown[]) => checkNativePushPermission(...args),
  requestNativePushPermission: vi.fn(),
  registerNativePush: (...args: unknown[]) => registerNativePush(...args),
  unregisterNativePush: vi.fn(),
  pushDiagBreadcrumb: vi.fn(),
}));

import { useNotificationPermissionController } from './useNotificationPermissionController';

const CACHE_KEY = 'petmol_push_last_known_subscribed_v1';

beforeEach(() => {
  localStorage.clear();
  checkNativePushPermission.mockReset();
  registerNativePush.mockReset();
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
});

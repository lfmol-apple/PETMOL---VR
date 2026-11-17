/** Toque numa notificação com LINK DE PRODUTO no app nativo: abre a loja direto, sem passar pela Home. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';

type Listener = (arg: unknown) => void;
const listeners: Record<string, Listener[]> = {};
const open = vi.fn();
const deliver = vi.fn();
const track = vi.fn();

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, getPlatform: () => 'ios' },
  registerPlugin: () => ({
    addListener: async (event: string, cb: Listener) => { (listeners[event] ||= []).push(cb); return { remove: async () => {} }; },
  }),
}));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: vi.fn() }));
const intent = vi.fn();
vi.mock('@/lib/deepLinkIntent', () => ({ markDeepLinkIntent: () => intent(), savePendingDeepLink: (...a: unknown[]) => deliver(...a) }));
vi.mock('@/lib/analytics', () => ({ trackProductEvent: (...a: unknown[]) => track(...a) }));
vi.mock('@/features/commerce/homeShoppingPartners', () => ({ navigateToPartnerUrl: (...a: unknown[]) => open(...a) }));
vi.mock('@/features/commerce/storeNativeOpen', () => ({ isStoreNativeOpenUser: async () => false }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { initNativePushDeepLink } from './nativePushService';

const tap = (url: string) => listeners.pushNotificationActionPerformed[0]({ notification: { data: { url } } });

describe('toque em push de produto (app nativo)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    if (!listeners.pushNotificationActionPerformed) await initNativePushDeepLink();
  });

  it('link do Mercado Livre abre a loja na hora e mede o toque', async () => {
    const link = 'https://meli.la/1AbCdEf';
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    tap(`/home?produto=${encodeURIComponent(link)}&b=env1`);
    expect(intent).toHaveBeenCalled();   // antes de qualquer espera: o gate de versão não recarrega a página no meio da abertura
    await waitFor(() => expect(open).toHaveBeenCalledWith(link));
    expect(setItem.mock.calls.some(([k, v]) => k === 'petmol_pending_product' && String(v).includes(link))).toBe(true);   // gravado antes de abrir
    await waitFor(() => expect(localStorage.getItem('petmol_pending_product')).toBeNull());
    setItem.mockRestore();   // só some depois de abrir
    expect(track).toHaveBeenCalledWith('broadcast_opened', { broadcast: 'env1' });
    expect(deliver).not.toHaveBeenCalled();
  });

  it('push sem produto segue o caminho de sempre (Home)', async () => {
    tap('/home?modal=food&b=env2');
    await waitFor(() => expect(deliver).toHaveBeenCalled());
    expect(open).not.toHaveBeenCalled();
  });
});

/** Abertura com verificação: sem sinal de que a loja abriu, o app tenta de outro jeito (não fica parado na Home). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.fn();
const browserOpen = vi.fn().mockResolvedValue(undefined);
let pageLoaded: (() => void) | null = null;
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
let active = false;
vi.mock('@capacitor/app', () => ({ App: { getState: async () => ({ isActive: active }) } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: (...a: unknown[]) => browserOpen(...a), addListener: async (_e: string, cb: () => void) => { pageLoaded = cb; return { remove: async () => {} }; } } }));
vi.mock('@/features/notifications/nativePushService', () => ({ pushDiagBreadcrumb: vi.fn() }));
vi.mock('./homeShoppingPartners', () => ({ navigateToPartnerUrl: (...a: unknown[]) => nav(...a) }));
vi.mock('./storeNativeOpen', () => ({ isStoreNativeOpenUser: async () => false }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { openPushProductLink } from './pushProductLink';

const link = 'https://meli.la/abc';
const go = async () => { const p = openPushProductLink(link); await vi.advanceTimersByTimeAsync(600); await p; };
describe('abertura nativa com verificação', () => {
  beforeEach(() => { vi.useFakeTimers(); nav.mockClear(); browserOpen.mockClear(); pageLoaded = null; active = true; });
  afterEach(() => vi.useRealTimers());

  it('sem sinal em 3,5 s, tenta o navegador do sistema', async () => {
    await go();
    expect(nav).toHaveBeenCalledWith(link);
    expect(browserOpen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3800);
    expect(browserOpen).toHaveBeenCalledWith({ url: link });
  });

  it('espera o app ficar ativo antes de abrir (o iOS cancela a abertura se a cena ainda está em transição)', async () => {
    active = false;
    const p = openPushProductLink(link);
    await vi.advanceTimersByTimeAsync(1500);
    expect(nav).not.toHaveBeenCalled();
    active = true;
    await vi.advanceTimersByTimeAsync(800);
    await p;
    expect(nav).toHaveBeenCalledWith(link);
  });

  it('com sinal de que abriu, não tenta de novo (nada abre duas vezes)', async () => {
    await go();
    await vi.advanceTimersByTimeAsync(500);
    pageLoaded?.();
    await vi.advanceTimersByTimeAsync(4000);
    expect(browserOpen).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledTimes(1);
  });
});

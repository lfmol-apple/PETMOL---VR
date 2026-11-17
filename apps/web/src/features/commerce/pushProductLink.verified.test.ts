/** Abertura com verificação: sem sinal de que a loja abriu, o app tenta de outro jeito (não fica parado na Home). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.fn();
const browserOpen = vi.fn().mockResolvedValue(undefined);
let pageLoaded: (() => void) | null = null;
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: (...a: unknown[]) => browserOpen(...a), addListener: async (_e: string, cb: () => void) => { pageLoaded = cb; return { remove: async () => {} }; } } }));
vi.mock('@/features/notifications/nativePushService', () => ({ pushDiagBreadcrumb: vi.fn() }));
vi.mock('./homeShoppingPartners', () => ({ navigateToPartnerUrl: (...a: unknown[]) => nav(...a) }));
vi.mock('./storeNativeOpen', () => ({ isStoreNativeOpenUser: async () => false }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));

import { openPushProductLink } from './pushProductLink';

const link = 'https://meli.la/abc';
describe('abertura nativa com verificação', () => {
  beforeEach(() => { vi.useFakeTimers(); nav.mockClear(); browserOpen.mockClear(); pageLoaded = null; });
  afterEach(() => vi.useRealTimers());

  it('sem sinal em 3,5 s, tenta o navegador do sistema', async () => {
    await openPushProductLink(link);
    expect(nav).toHaveBeenCalledWith(link);
    expect(browserOpen).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(3800);
    expect(browserOpen).toHaveBeenCalledWith({ url: link });
  });

  it('com sinal de que abriu, não tenta de novo (nada abre duas vezes)', async () => {
    await openPushProductLink(link);
    await vi.advanceTimersByTimeAsync(500);
    pageLoaded?.();
    await vi.advanceTimersByTimeAsync(4000);
    expect(browserOpen).not.toHaveBeenCalled();
    expect(nav).toHaveBeenCalledTimes(1);
  });
});

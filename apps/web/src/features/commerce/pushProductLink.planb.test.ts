/** Plano B: ao abrir o app, se há link de campanha enviado há pouco e ainda não aberto, o produto abre sozinho — uma vez só. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const nav = vi.fn();
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' } }));
vi.mock('@capacitor/app', () => ({ App: { getState: async () => ({ isActive: true }) } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(), addListener: async () => ({ remove: async () => {} }) } }));
vi.mock('@/features/notifications/nativePushService', () => ({ pushDiagBreadcrumb: vi.fn() }));
vi.mock('./homeShoppingPartners', () => ({ navigateToPartnerUrl: (...a: unknown[]) => nav(...a) }));
vi.mock('./storeNativeOpen', () => ({ isStoreNativeOpenUser: async () => false }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => 'tok' }));
vi.mock('@/lib/api', () => ({ API_BASE_URL: '/api' }));

import { openPendingCampaignLink, isProductHandled } from './pushProductLink';

const link = 'https://meli.la/abc';
const calls: { url: string; method: string }[] = [];
const server = (pending: unknown) => vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
  calls.push({ url, method: init?.method ?? 'GET' });
  return { ok: true, json: async () => ({ pending }) } as Response;
}));

describe('plano B: abriu o app → abre o produto da campanha', () => {
  beforeEach(() => { nav.mockClear(); calls.length = 0; localStorage.clear(); });
  afterEach(() => vi.unstubAllGlobals());

  it('há link pendente: abre o produto e avisa o servidor que abriu', async () => {
    server({ batch_id: 'b1', campaign_id: 'c1', url: link, title: 'Ração X' });
    expect(await openPendingCampaignLink()).toBe(true);
    expect(nav).toHaveBeenCalledWith(link);
    expect(isProductHandled('b1')).toBe(true);
    expect(calls.some((c) => c.url === '/api/notifications/pending-link/consume' && c.method === 'POST')).toBe(true);
  });

  it('sem pendência, ou envio que o toque já abriu: não abre nada', async () => {
    server(null);
    expect(await openPendingCampaignLink()).toBe(false);
    server({ batch_id: 'b2', campaign_id: 'c1', url: link, title: 'X' });
    localStorage.setItem('petmol_product_handled', JSON.stringify(['b2']));      // o toque já tratou este envio
    expect(await openPendingCampaignLink()).toBe(false);
    expect(nav).not.toHaveBeenCalled();
  });

  it('link de fora da lista de lojas nunca abre', async () => {
    server({ batch_id: 'b3', campaign_id: 'c1', url: 'https://evil.example/x', title: 'X' });
    expect(await openPendingCampaignLink()).toBe(false);
    expect(nav).not.toHaveBeenCalled();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// No Android nativo, um link afiliado da Cobasi/MAIS é aberto via a ponte
// /go/loja (redirect JS em petmol.com.br) pra o Chrome Custom Tab não
// saltar pro app da Cobasi e perder o cookie da UTM MAIS. iOS e web abrem
// o link direto. Ver docs/AFFILIATES.md.

const browserOpen = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));

const COBASI_URL =
  'https://www.cobasi.com.br/racao-royal-canin-3827380/p?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol';
const MAIS_URL = 'https://mais.app/IvUCAG';
const SHOPEE_URL = 'https://s.shopee.com.br/abc123';

describe('navigateToPartnerUrl — ponte Cobasi no Android', () => {
  beforeEach(() => browserOpen.mockClear());
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    vi.doUnmock('@capacitor/core');
  });

  async function load(platform: string) {
    vi.resetModules();
    vi.doMock('@capacitor/core', () => ({
      Capacitor: { isNativePlatform: () => true, getPlatform: () => platform },
    }));
    return import('./homeShoppingPartners');
  }

  it('Android: link Cobasi vai pela ponte /go/loja?to=<url>', async () => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl(COBASI_URL);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    const opened = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(opened.pathname).toBe('/go/loja');
    expect(opened.searchParams.get('to')).toBe(COBASI_URL);
  });

  it('Android: shortlink mais.app também vai pela ponte', async () => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl(MAIS_URL);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(new URL(browserOpen.mock.calls[0][0].url as string).searchParams.get('to')).toBe(MAIS_URL);
  });

  it('Android: link Shopee NÃO passa pela ponte (fora de escopo)', async () => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl(SHOPEE_URL);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(SHOPEE_URL);
  });

  it('iOS: link Cobasi abre direto (SFSafariViewController não faz Universal Link)', async () => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(COBASI_URL);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(COBASI_URL);
  });

  it('isCobasiAffiliateUrl: só https de host Cobasi/MAIS conhecido', async () => {
    const { isCobasiAffiliateUrl } = await load('android');
    expect(isCobasiAffiliateUrl('https://www.cobasi.com.br/x/p')).toBe(true);
    expect(isCobasiAffiliateUrl('https://minhaloja.cobasi.com.br/x')).toBe(true);
    expect(isCobasiAffiliateUrl('https://mais.app/IvUCAG')).toBe(true);
    expect(isCobasiAffiliateUrl('https://www.petz.com.br/x')).toBe(false);
    expect(isCobasiAffiliateUrl('http://www.cobasi.com.br/x')).toBe(false);
    expect(isCobasiAffiliateUrl('lixo')).toBe(false);
  });
});

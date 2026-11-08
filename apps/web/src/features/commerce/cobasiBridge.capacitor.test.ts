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

describe('navigateToPartnerUrl — ponte das lojas no Android', () => {
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

  it.each([
    ['Mercado Livre (meli.la)', 'https://meli.la/2ftAKx5'],
    ['Mercado Livre (perfil)', 'https://www.mercadolivre.com.br/social/mohe4109227?matt_word=mohe4109227&matt_tool=85497435'],
  ])('Android: %s também vai pela ponte, com o link intacto', async (_nome, link) => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl(link);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    const opened = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(opened.pathname).toBe('/go/loja');
    expect(opened.searchParams.get('to')).toBe(link);
  });

  it.each([
    ['Shopee', 'https://s.shopee.com.br/abc123'],
    ['Amazon', 'https://www.amazon.com.br/s?k=pet&tag=pelmol-20'],
  ])('Android: %s NÃO usa a ponte por ora (decisão do dono: bloqueio só no Mercado Livre)', async (_n, link) => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl(link);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(link);
  });

  it('Android: loja fora da lista (Petz tem a própria ponte) abre direto', async () => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl('https://exemplo.com.br/x');
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe('https://exemplo.com.br/x');
  });

  it.each([
    ['Shopee', 'https://s.shopee.com.br/abc123'],
    ['Mercado Livre', 'https://meli.la/2ftAKx5'],
    ['Amazon', 'https://www.amazon.com.br/s?k=pet&tag=pelmol-20'],
  ])('iOS: %s abre direto (SFSafariViewController não faz Universal Link)', async (_n, link) => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(link);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(link);
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

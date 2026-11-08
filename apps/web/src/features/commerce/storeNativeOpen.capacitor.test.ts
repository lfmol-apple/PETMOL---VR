import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// iPhone, só a conta do dono: Mercado Livre, Shopee e Amazon abrem DIRETO no app nativo da loja (o iOS mostra o "◀ PETMOL"),
// com o link INTACTO. Tutores, Cobasi e Petz seguem como sempre. Android: ponte só da Cobasi.

const browserOpen = vi.fn().mockResolvedValue(undefined);
const track = vi.fn().mockResolvedValue(undefined);
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));
vi.mock('@/lib/analytics/click', () => ({ trackClick: track }));

const ML = 'https://meli.la/2ftAKx5';
const SHOPEE = 'https://s.shopee.com.br/4AzW1leQcW';
const AMAZON = 'https://www.amazon.com.br/s?k=pet&tag=pelmol-20';
const COBASI = 'https://www.cobasi.com.br/racao/p?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol';

let hrefSet: string[];

async function load(platform: string, opts: { token?: string | null; adminStatus?: number | 'erro' } = {}) {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => platform } }));
  vi.doMock('@/lib/auth-token', () => ({ getToken: () => (opts.token === undefined ? 'tok' : opts.token) }));
  const status = opts.adminStatus ?? 200;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
    if (status === 'erro') throw new Error('offline');
    return { ok: status === 200, status };
  }));
  hrefSet = [];
  const fake = { origin: 'https://www.petmol.com.br' } as Record<string, unknown>;
  Object.defineProperty(fake, 'href', { get: () => 'https://www.petmol.com.br/home', set: (v: string) => { hrefSet.push(v); } });
  vi.stubGlobal('window', { location: fake, matchMedia: () => ({ matches: false }), navigator: {} });
  return import('./homeShoppingPartners');
}

describe('iPhone: loja abre direto no app nativo (só dono)', () => {
  beforeEach(() => { browserOpen.mockClear(); track.mockClear(); });
  afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); vi.doUnmock('@capacitor/core'); vi.doUnmock('@/lib/auth-token'); });

  it.each([['Mercado Livre', ML], ['Shopee', SHOPEE], ['Amazon', AMAZON]])('dono: %s é entregue ao iOS com o link INTACTO (sem navegador intermediário)', async (_n, link) => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(link, { title: _n });
    await vi.waitFor(() => expect(hrefSet).toEqual([link]));
    expect(browserOpen).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(track).toHaveBeenCalled());
    expect(track.mock.calls[0][0].metadata).toMatchObject({ mode: 'native_app_direct' });
  });

  it('Amazon sem etiqueta: o link entregue ao iOS já leva a etiqueta do PETMOL', async () => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl('https://www.amazon.com.br/s?k=ração', { title: 'Amazon' });
    await vi.waitFor(() => expect(hrefSet.length).toBe(1));
    expect(new URL(hrefSet[0]).searchParams.get('tag')).toBe('pelmol-20');
  });

  it.each([['tutor (não é admin)', { adminStatus: 403 }], ['sem login', { token: null }], ['rede fora', { adminStatus: 'erro' as const }]])('%s: nada muda, abre pelo navegador de sempre', async (_n, o) => {
    const { navigateToPartnerUrl } = await load('ios', o);
    navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(ML);
    expect(hrefSet).toEqual([]);
  });

  it.each([['Cobasi', COBASI], ['Petz', 'https://www.petz.com.br/parceiro/PETMOL']])('%s (comissão por cookie) NUNCA abre direto no app, nem para o dono', async (_n, link) => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(link, { title: _n });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(link);
    expect(hrefSet).toEqual([]);
  });

  it('Android: Mercado Livre, Shopee e Amazon abrem como o app permitir (sem ponte); Cobasi segue pela ponte', async () => {
    const { navigateToPartnerUrl } = await load('android');
    for (const l of [ML, SHOPEE, AMAZON]) {
      browserOpen.mockClear();
      navigateToPartnerUrl(l);
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
      expect(browserOpen.mock.calls[0][0].url).toBe(l);
    }
    browserOpen.mockClear();
    navigateToPartnerUrl(COBASI);
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(new URL(browserOpen.mock.calls[0][0].url as string).pathname).toBe('/go/loja');
  });
});

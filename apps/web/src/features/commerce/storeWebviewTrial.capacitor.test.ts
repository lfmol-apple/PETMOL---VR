import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Teste controlado (iPhone): só a conta do dono abre ML/Shopee/Cobasi na janela interna do PETMOL, com o link INTACTO
// e `preventDeeplink` (o app da loja não sequestra). Tutores, Amazon e Android seguem o fluxo de sempre.

const browserOpen = vi.fn().mockResolvedValue(undefined);
const openWebView = vi.fn().mockResolvedValue(undefined);
const closeWeb = vi.fn().mockResolvedValue(undefined);
const toast = vi.fn();
const track = vi.fn().mockResolvedValue(undefined);
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));
vi.mock('@/features/interactions/userPromptChannel', () => ({ showAppToast: toast }));
vi.mock('@/lib/analytics/click', () => ({ trackClick: track }));
vi.mock('@capgo/inappbrowser', () => ({
  InAppBrowser: { openWebView, close: closeWeb },
  ToolBarType: { NAVIGATION: 'navigation' },
}));

const ML = 'https://meli.la/2ftAKx5';
const SHOPEE = 'https://s.shopee.com.br/abc123';
const COBASI = 'https://www.cobasi.com.br/racao/p?utm_source=mais&utm_medium=maisplataforma&utm_campaign=lojapetmol';
const AMAZON = 'https://www.amazon.com.br/s?k=pet&tag=pelmol-20';

async function load(platform: string, opts: { token?: string | null; adminStatus?: number | 'erro' } = {}) {
  vi.resetModules();
  vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true, getPlatform: () => platform } }));
  vi.doMock('@/lib/auth-token', () => ({ getToken: () => (opts.token === undefined ? 'tok' : opts.token) }));
  const status = opts.adminStatus ?? 200;
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => {
    if (status === 'erro') throw new Error('offline');
    return { ok: status === 200, status };
  }));
  return import('./homeShoppingPartners');
}

describe('loja dentro do PETMOL (teste só do dono, iPhone)', () => {
  beforeEach(() => { browserOpen.mockClear(); openWebView.mockReset().mockResolvedValue(undefined); closeWeb.mockClear(); toast.mockClear(); track.mockClear(); });
  afterEach(() => { vi.resetModules(); vi.unstubAllGlobals(); vi.doUnmock('@capacitor/core'); vi.doUnmock('@/lib/auth-token'); });

  it.each([['Mercado Livre', ML]])('dono no iPhone: %s abre na janela interna com o link intacto e sem deeplink', async (nome, link) => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(link, { title: nome });
    await vi.waitFor(() => expect(openWebView).toHaveBeenCalled());
    const arg = openWebView.mock.calls[0][0];
    expect(arg.url).toBe(link);
    expect(arg.preventDeeplink).toBe(true);
    expect(arg.title).toBe(nome);
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('tutor (não é admin) no iPhone: nada muda, abre pelo navegador de sempre', async () => {
    const { navigateToPartnerUrl } = await load('ios', { adminStatus: 403 });
    navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(ML);
    expect(openWebView).not.toHaveBeenCalled();
  });

  it.each([['sem login', { token: null }], ['rede fora', { adminStatus: 'erro' as const }]])('%s: cai no fluxo de hoje', async (_n, o) => {
    const { navigateToPartnerUrl } = await load('ios', o);
    navigateToPartnerUrl(SHOPEE, { title: 'Shopee' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(openWebView).not.toHaveBeenCalled();
  });

  it('Amazon NUNCA vai para a janela interna (política da Amazon), nem para o dono', async () => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(AMAZON, { title: 'Amazon' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(AMAZON);
    expect(openWebView).not.toHaveBeenCalled();
  });

  it('plugin ausente/erro na janela interna: cai no navegador (o toque nunca fica sem resposta)', async () => {
    openWebView.mockRejectedValue(new Error('plugin ausente'));
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(ML);
  });

  it('Android não usa a janela interna (usa a ponte, link intacto)', async () => {
    const { navigateToPartnerUrl } = await load('android');
    navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(new URL(browserOpen.mock.calls[0][0].url as string).searchParams.get('to')).toBe(ML);
    expect(openWebView).not.toHaveBeenCalled();
  });

  it('fecha qualquer janela anterior antes de abrir (a "terceira vez" não pode herdar janela viva)', async () => {
    const { navigateToPartnerUrl } = await load('ios');
    for (let i = 1; i <= 3; i++) {
      navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
      await vi.waitFor(() => expect(openWebView).toHaveBeenCalledTimes(i));
      expect(closeWeb).toHaveBeenCalledTimes(i); // fechou o que pudesse estar vivo ANTES de cada abertura
    }
    expect(browserOpen).not.toHaveBeenCalled();
  });

  it('1ª tentativa falha e a 2ª funciona: continua dentro do PETMOL (sem cair no app da loja)', async () => {
    openWebView.mockRejectedValueOnce(new Error('apresentação ocupada'));
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
    await vi.waitFor(() => expect(openWebView).toHaveBeenCalledTimes(2));
    expect(browserOpen).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(track).toHaveBeenCalled());
    expect(track.mock.calls[0][0].metadata).toMatchObject({ mode: 'in_app_webview', attempts: 2 });
  });

  it('as 2 tentativas falham: o dono recebe aviso com o motivo, é registrado e abre como hoje', async () => {
    openWebView.mockRejectedValue(new Error('plugin quebrou'));
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(ML, { title: 'Mercado Livre' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(ML);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(String(toast.mock.calls[0][0])).toContain('plugin quebrou');
    expect(track.mock.calls[0][0].metadata).toMatchObject({ mode: 'fallback_system', attempts: 2, error: 'plugin quebrou' });
  });

  it('Amazon: o link sem etiqueta sai COM a etiqueta e intacto até o navegador (iPhone)', async () => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl('https://www.amazon.com.br/s?k=ração', { title: 'Amazon' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(new URL(browserOpen.mock.calls[0][0].url as string).searchParams.get('tag')).toBe('pelmol-20');
    expect(openWebView).not.toHaveBeenCalled();
  });

  it.each([['Shopee', SHOPEE], ['Cobasi', COBASI]])('dono no iPhone: %s NÃO usa a janela interna por ora (só o Mercado Livre)', async (_n, link) => {
    const { navigateToPartnerUrl } = await load('ios');
    navigateToPartnerUrl(link, { title: _n });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
    expect(browserOpen.mock.calls[0][0].url).toBe(link);
    expect(openWebView).not.toHaveBeenCalled();
  });
});

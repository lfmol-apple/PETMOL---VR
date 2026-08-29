import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor (app nativo PETMOL): "Ver na Petz" abre a ponte /go/petz no
// navegador do sistema (SFSafariViewController / Chrome Custom Tab) via
// @capacitor/browser. A ponte redireciona por JS pra a BUSCA da Petz
// (`/busca?q=`) — nunca `/produto/...`, que a AASA da Petz reivindica e o
// iOS entrega ao app. O cupom PETTMOL vai pro clipboard antes.
// Ver docs/AFFILIATES.md §Petz.

const browserOpen = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));

const PRODUCT_URL = 'https://www.petz.com.br/produto/kit-enxoval-201842';
const SEARCH_URL = 'https://www.petz.com.br/busca?q=Royal+Canin';

describe('openPetzPartnerStore — Capacitor', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    browserOpen.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('mesmo com productUrl (/produto/), a ponte vai pra a BUSCA — nunca /produto/', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productUrl: PRODUCT_URL, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    expect(openSpy).not.toHaveBeenCalled(); // nunca window.open no app
    expect(browserOpen).toHaveBeenCalledTimes(1);
    const url = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBe(SEARCH_URL);
    expect(url.href).not.toContain('/produto/');
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
  });

  it('produto sem mapping: ponte /go/petz?to=<busca>', async () => {
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ searchUrl: SEARCH_URL, productName: 'Ração Golden' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    const url = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(url.searchParams.get('to')).toBe(SEARCH_URL);
  });

  it('sem produto nem busca: ponte /go/petz sem ?to=', async () => {
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({});
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    const url = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor (app nativo PETMOL): "Ver na Petz" NUNCA faz two-hop.
// Enquanto o navegador do sistema (SFSafariViewController / Chrome Custom
// Tab) está por cima do WebView, o iOS suspende o JS do WebView — não há
// como orquestrar as duas navegações. Então o app sempre cai no
// FALLBACK: ponte /go/petz → Loja Parceira (cookie petzPartner →
// comissão garantida) + nome do produto copiado pra busca manual.
// Ver docs/AFFILIATES.md §Petz e o bloco "TWO-HOP NO APP — POR QUE NÃO
// DÁ" em homeShoppingPartners.ts.

const browserOpen = vi.fn().mockResolvedValue(undefined);
const browserClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen, close: browserClose } }));

const PRODUCT_URL = 'https://www.petz.com.br/produto/kit-enxoval-201842';
const SEARCH_URL = 'https://www.petz.com.br/busca?q=Royal+Canin';

describe('openPetzPartnerStore — Capacitor', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    browserOpen.mockClear();
    browserClose.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('com URL real de produto: NÃO faz two-hop; abre só a ponte /go/petz', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productUrl: PRODUCT_URL, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    expect(openSpy).not.toHaveBeenCalledWith('about:blank', '_blank');
    expect(browserClose).not.toHaveBeenCalled();
    expect(browserOpen).toHaveBeenCalledTimes(1);
    const url = browserOpen.mock.calls[0][0].url as string;
    expect(url).toContain('/go/petz');
    expect(url).not.toContain('petz.com.br/produto');
    expect(url).not.toContain('petz.com.br/busca');
    // fallback copia o NOME do produto (não o cupom)
    expect(writeText).toHaveBeenCalledWith('Kit Enxoval');
  });

  it('sem produto/busca: abre a ponte /go/petz', async () => {
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productName: 'Ração Golden' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    const url = browserOpen.mock.calls[0][0].url as string;
    expect(url).toContain('/go/petz');
    expect(url).toContain('q=Ra');
  });
});

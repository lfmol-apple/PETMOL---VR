import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor (app nativo PETMOL): o two-hop web NÃO se aplica —
// `window.open` não devolve handle usável e `@capacitor/browser` 8.0.4
// recusa a 2ª chamada de `Browser.open`. Então "Ver na Petz" cai no
// fallback: abre a ponte /go/petz (só Loja Parceira). A comissão
// continua garantida (cookie da Loja Parceira); só o produto exato que
// não acontece nesse caminho. Ver docs/AFFILIATES.md §Petz.

const browserOpen = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));

describe('openPetzPartnerStore — Capacitor', () => {
  beforeEach(() => {
    browserOpen.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('mesmo com URL real de produto, NÃO faz two-hop; abre a ponte /go/petz', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({
      productUrl: 'https://www.petz.com.br/produto/kit-enxoval-201842',
      productName: 'Kit Enxoval',
    });
    // deixa o import('@capacitor/browser').then(...) resolver
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    expect(openSpy).not.toHaveBeenCalledWith('about:blank', '_blank');
    expect(browserOpen).toHaveBeenCalledTimes(1);
    const url = browserOpen.mock.calls[0][0].url as string;
    expect(url).toContain('/go/petz');
    expect(url).not.toContain('petz.com.br/produto');
  });
});

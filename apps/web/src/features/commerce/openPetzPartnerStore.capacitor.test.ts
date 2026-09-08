import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Capacitor (app nativo PETMOL): "Ver na Petz" / card "Petz" abre a ponte
// /go/petz no navegador do sistema (SFSafariViewController / Chrome
// Custom Tab) via @capacitor/browser. A ponte SEMPRE redireciona por JS
// pra a Loja Parceira (`/parceiro/PETMOL`) — nunca `/busca?q=` nem
// `/produto/...` (decisão de produto, 04/09/2026: reduzir ao máximo o
// risco de perder comissão). O cupom PETMOL vai pro clipboard antes.
// Ver docs/AFFILIATES.md §Petz.

const browserOpen = vi.fn().mockResolvedValue(undefined);
const browserClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen, close: browserClose } }));

const PRODUCT_URL = 'https://www.petz.com.br/produto/kit-enxoval-201842';
const SEARCH_URL = 'https://www.petz.com.br/busca?q=Royal+Canin';
const COUPON_APPLY_URL = 'https://www.petz.com.br/aplicarCupom_Loja.html?cupom=PETMOL';
const CART_ADD_URL = 'https://www.petz.com.br/comprarAgora_Loja.html?prod=100223&qtde=1';

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
    vi.useRealTimers();
  });

  it('mesmo com productUrl (/produto/) e searchUrl (/busca), a ponte vai pra a Loja Parceira — nunca /produto/ ou /busca', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productUrl: PRODUCT_URL, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    expect(openSpy).not.toHaveBeenCalled(); // nunca window.open no app
    expect(browserOpen).toHaveBeenCalledTimes(1);
    const url = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBeNull();
    expect(url.href).not.toContain('/produto/');
    expect(url.href).not.toContain('/busca');
    expect(writeText).toHaveBeenCalledWith('PETMOL');
  });

  it('produto sem mapping (só searchUrl): ponte /go/petz sem ?to= — vai pra Loja Parceira', async () => {
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ searchUrl: SEARCH_URL, productName: 'Ração Golden' });
    await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());

    const url = new URL(browserOpen.mock.calls[0][0].url as string);
    expect(url.searchParams.get('to')).toBeNull();
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

  // ── carrinho pré-montado (backend flag petz_cart_prefill) ─────────────

  describe('cart prefill', () => {
    it('couponApplyUrl + cartAddUrl válidos → 2× Browser.open (cupom → produto), sem a ponte', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      const p = openPetzPartnerStore({
        productName: 'Ração do Baby',
        searchUrl: SEARCH_URL,
        couponApplyUrl: COUPON_APPLY_URL,
        cartAddUrl: CART_ADD_URL,
      });
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalledTimes(1));
      expect(browserOpen).toHaveBeenNthCalledWith(1, { url: COUPON_APPLY_URL });
      await vi.advanceTimersByTimeAsync(1800);
      await p;
      expect(browserClose).toHaveBeenCalled();
      expect(browserOpen).toHaveBeenCalledTimes(2);
      expect(browserOpen).toHaveBeenNthCalledWith(2, { url: CART_ADD_URL });
      // nenhuma dessas URLs é a ponte /go/petz
      for (const call of browserOpen.mock.calls) {
        expect(String(call[0].url)).not.toContain('/go/petz');
      }
      expect(writeText).toHaveBeenCalledWith('PETMOL');
    });

    it('cartAddUrl inválido (host errado / prod não-numérico) → cai no fluxo da ponte', async () => {
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({
        productName: 'X',
        searchUrl: SEARCH_URL,
        couponApplyUrl: COUPON_APPLY_URL,
        cartAddUrl: 'https://evil.example/comprarAgora_Loja.html?prod=1',
      });
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
      expect(browserOpen).toHaveBeenCalledTimes(1);
      expect(new URL(browserOpen.mock.calls[0][0].url as string).pathname).toBe('/go/petz');
    });

    it('couponApplyUrl ausente → cai no fluxo da ponte (o par é obrigatório)', async () => {
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({ productName: 'X', cartAddUrl: CART_ADD_URL });
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
      expect(browserOpen).toHaveBeenCalledTimes(1);
      expect(new URL(browserOpen.mock.calls[0][0].url as string).pathname).toBe('/go/petz');
    });
  });
});

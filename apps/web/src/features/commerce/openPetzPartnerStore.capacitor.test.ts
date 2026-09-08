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

// @capgo/inappbrowser — usado só no fluxo "carrinho pré-montado".
const iabListenerRemove = vi.fn().mockResolvedValue(undefined);
const iabAddListener = vi.fn().mockImplementation(() => Promise.resolve({ remove: iabListenerRemove }));
const iabOpenWebView = vi.fn().mockResolvedValue({ id: '1' });
const iabSetUrl = vi.fn().mockResolvedValue(undefined);
const iabShow = vi.fn().mockResolvedValue(undefined);
const iabClose = vi.fn().mockResolvedValue(undefined);

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen, close: browserClose } }));
vi.mock('@capgo/inappbrowser', () => ({
  InAppBrowser: {
    addListener: iabAddListener,
    openWebView: iabOpenWebView,
    setUrl: iabSetUrl,
    show: iabShow,
    close: iabClose,
  },
  ToolBarType: { ACTIVITY: 'activity', NAVIGATION: 'navigation', BLANK: 'blank', DEFAULT: '' },
}));

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
    iabAddListener.mockClear();
    iabOpenWebView.mockClear();
    iabSetUrl.mockClear();
    iabShow.mockClear();
    iabClose.mockClear();
    iabListenerRemove.mockClear();

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
  // App nativo: os 2 hops Struts rodam numa única WKWebView
  // (@capgo/inappbrowser), pra dividirem a sessão de cookies.

  describe('cart prefill', () => {
    it('URLs válidas → openWebView(cupom, hidden) → setUrl(produto) → show() no /checkout/cart; nunca @capacitor/browser', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      const p = openPetzPartnerStore({
        productName: 'Ração do Baby',
        searchUrl: SEARCH_URL,
        couponApplyUrl: COUPON_APPLY_URL,
        cartAddUrl: CART_ADD_URL,
      });
      await vi.waitFor(() => expect(iabOpenWebView).toHaveBeenCalledTimes(1));
      const openArg = iabOpenWebView.mock.calls[0][0];
      expect(openArg.url).toBe(COUPON_APPLY_URL);
      expect(openArg.hidden).toBe(true);
      expect(openArg.preventDeeplink).toBe(true);

      // hop 2 dispara depois do delay
      await vi.advanceTimersByTimeAsync(1600);
      expect(iabSetUrl).toHaveBeenCalledWith({ url: CART_ADD_URL });
      expect(iabShow).not.toHaveBeenCalled();

      // a Petz redireciona pro carrinho → urlChangeEvent → show()
      const onUrlChange = iabAddListener.mock.calls[0][1] as (d: { url: string }) => void;
      onUrlChange({ url: 'https://www.petz.com.br/checkout/cart/1357099' });
      await vi.waitFor(() => expect(iabShow).toHaveBeenCalledTimes(1));

      await p;
      expect(browserOpen).not.toHaveBeenCalled();
      expect(writeText).toHaveBeenCalledWith('PETMOL');
    });

    it('safety timeout revela a WebView mesmo sem o urlChangeEvent do carrinho', async () => {
      vi.useFakeTimers();
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      const p = openPetzPartnerStore({ productName: 'X', couponApplyUrl: COUPON_APPLY_URL, cartAddUrl: CART_ADD_URL });
      await vi.waitFor(() => expect(iabOpenWebView).toHaveBeenCalled());
      await vi.advanceTimersByTimeAsync(1600 + 9000);
      expect(iabShow).toHaveBeenCalledTimes(1);
      await p;
    });

    it('cartAddUrl inválido (host errado) → cai no fluxo da ponte, sem inappbrowser', async () => {
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({
        productName: 'X',
        searchUrl: SEARCH_URL,
        couponApplyUrl: COUPON_APPLY_URL,
        cartAddUrl: 'https://evil.example/comprarAgora_Loja.html?prod=1',
      });
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
      expect(iabOpenWebView).not.toHaveBeenCalled();
      expect(new URL(browserOpen.mock.calls[0][0].url as string).pathname).toBe('/go/petz');
    });

    it('couponApplyUrl ausente → cai no fluxo da ponte (o par é obrigatório)', async () => {
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({ productName: 'X', cartAddUrl: CART_ADD_URL });
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
      expect(iabOpenWebView).not.toHaveBeenCalled();
      expect(new URL(browserOpen.mock.calls[0][0].url as string).pathname).toBe('/go/petz');
    });

    it('inappbrowser indisponível (openWebView rejeita) → fecha e cai no fluxo da ponte', async () => {
      iabOpenWebView.mockRejectedValueOnce(new Error('no native impl in binary'));
      vi.stubGlobal('open', vi.fn());
      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({ productName: 'X', couponApplyUrl: COUPON_APPLY_URL, cartAddUrl: CART_ADD_URL });
      await vi.waitFor(() => expect(browserOpen).toHaveBeenCalled());
      expect(iabClose).toHaveBeenCalled();
      expect(new URL(browserOpen.mock.calls[0][0].url as string).pathname).toBe('/go/petz');
    });
  });
});

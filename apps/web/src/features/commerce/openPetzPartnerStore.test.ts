import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// openPetzPartnerStore — clique "Ver na Petz" / card "Petz" da loja parceira.
//
// Por padrão (`preferSearch` ausente/false — flag de backend
// `petz_product_search_link` OFF) leva pra Loja Parceira (/parceiro/PETMOL)
// — nunca pra `/busca` nem `/produto/...`. Com `preferSearch: true` o
// destino passa a ser `searchUrl` (a busca da Petz pelo produto), desde
// que seja uma URL Petz segura (fora da AASA). `productUrl` (`/produto/*`)
// nunca é destino. Cupom PETMOL sempre copiado. Sempre via a ponte
// /go/petz (redirect JS).

const REAL_PRODUCT = 'https://www.petz.com.br/produto/kit-enxoval-modernpet-201842';
const SEARCH_URL = 'https://www.petz.com.br/busca?q=Royal+Canin+racao';

describe('openPetzPartnerStore', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function callAndGetBridgeUrl(
    opts: Parameters<typeof import('./homeShoppingPartners')['openPetzPartnerStore']>[0],
  ) {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore(opts);
    expect(openSpy).toHaveBeenCalledTimes(1);
    return new URL(openSpy.mock.calls[0][0] as string);
  }

  it('searchUrl (/busca) NÃO decide mais o destino — sempre a Loja Parceira, sem ?to=', async () => {
    const url = await callAndGetBridgeUrl({ searchUrl: SEARCH_URL, productName: 'Ração Golden' });
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBeNull();
    expect(url.searchParams.get('q')).toBe('Ração Golden');
    expect(url.host).not.toContain('petz.com.br');
  });

  it('productUrl (/produto/...) NUNCA é usado como destino — sempre cai na Loja Parceira', async () => {
    // só productUrl, sem searchUrl → Loja Parceira
    const url = await callAndGetBridgeUrl({ productUrl: REAL_PRODUCT, productName: 'Kit Enxoval' });
    expect(url.searchParams.get('to')).toBeNull();
    expect(url.href).not.toContain('/produto/');

    // productUrl + searchUrl → mesmo assim, Loja Parceira (nem /produto/ nem /busca decidem mais)
    vi.resetModules();
    vi.unstubAllGlobals();
    const url2 = await callAndGetBridgeUrl({ productUrl: REAL_PRODUCT, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });
    expect(url2.searchParams.get('to')).toBeNull();
    expect(url2.href).not.toContain('/produto/');
    expect(url2.href).not.toContain('/busca');
  });

  it('sem searchUrl utilizável → ponte sem ?to= (Loja Parceira)', async () => {
    const url = await callAndGetBridgeUrl({});
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBeNull();
  });

  it('sempre copia o cupom PETMOL (nunca o nome do produto)', async () => {
    await callAndGetBridgeUrl({ searchUrl: SEARCH_URL, productName: 'Ração Golden Fórmula' });
    expect(writeText).toHaveBeenCalledWith('PETMOL');
    expect(writeText).not.toHaveBeenCalledWith('Ração Golden Fórmula');
  });

  it('searchUrl qualquer (válido, malicioso ou na AASA da Petz) nunca vira ?to= — não é mais usado', async () => {
    for (const anySearchUrl of [
      'https://evil.com/busca?q=x',
      'http://www.petz.com.br/busca?q=x',
      'https://petz.com.br.evil.com/busca',
      'javascript:alert(1)',
      'https://www.petz.com.br/produto/x-123', // real petz mas na AASA
      'https://www.petz.com.br/', // home, na AASA
      SEARCH_URL, // até um searchUrl legítimo — irrelevante agora
    ]) {
      vi.resetModules();
      const url = await callAndGetBridgeUrl({ searchUrl: anySearchUrl, productName: 'X' });
      expect(url.searchParams.get('to')).toBeNull();
      expect(url.href).not.toContain('evil.com');
      vi.unstubAllGlobals();
    }
  });

  it('clipboard indisponível não bloqueia a navegação', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await expect(openPetzPartnerStore({ searchUrl: SEARCH_URL })).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalled();
  });

  it('retorna true/false conforme o cupom foi mesmo copiado (pra coupon_copied na analítica)', async () => {
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await expect(openPetzPartnerStore({})).resolves.toBe(true);

    vi.resetModules();
    vi.unstubAllGlobals();
    vi.stubGlobal('open', vi.fn());
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    const { openPetzPartnerStore: openAgain } = await import('./homeShoppingPartners');
    await expect(openAgain({})).resolves.toBe(false);
  });

  describe('preferSearch (flag petz_product_search_link ON)', () => {
    it('preferSearch + searchUrl /busca válido → destino é a busca (?to=<searchUrl>)', async () => {
      const url = await callAndGetBridgeUrl({
        searchUrl: SEARCH_URL,
        productName: 'Ração Golden',
        preferSearch: true,
      });
      expect(url.pathname).toBe('/go/petz');
      expect(url.searchParams.get('to')).toBe(SEARCH_URL);
      expect(url.searchParams.get('q')).toBe('Ração Golden');
      expect(url.host).not.toContain('petz.com.br');
    });

    it('preferSearch mas sem searchUrl → cai na Loja Parceira (sem ?to=)', async () => {
      const url = await callAndGetBridgeUrl({ productName: 'X', preferSearch: true });
      expect(url.searchParams.get('to')).toBeNull();
    });

    it('preferSearch + searchUrl inseguro (evil / http / AASA / produto) → nunca vira ?to=, cai na Loja Parceira', async () => {
      for (const badUrl of [
        'https://evil.com/busca?q=x',
        'http://www.petz.com.br/busca?q=x',
        'https://petz.com.br.evil.com/busca',
        'javascript:alert(1)',
        'https://www.petz.com.br/produto/x-123',
        'https://www.petz.com.br/',
      ]) {
        vi.resetModules();
        const url = await callAndGetBridgeUrl({ searchUrl: badUrl, productName: 'X', preferSearch: true });
        expect(url.searchParams.get('to')).toBeNull();
        expect(url.href).not.toContain('evil.com');
        expect(url.href).not.toContain('/produto/');
        vi.unstubAllGlobals();
      }
    });

    it('preferSearch + productUrl (/produto/*) NUNCA é destino — mesmo sem searchUrl', async () => {
      const url = await callAndGetBridgeUrl({
        productUrl: REAL_PRODUCT,
        productName: 'Kit Enxoval',
        preferSearch: true,
      });
      expect(url.searchParams.get('to')).toBeNull();
      expect(url.href).not.toContain('/produto/');
    });

    it('preferSearch ainda copia o cupom PETMOL', async () => {
      await callAndGetBridgeUrl({ searchUrl: SEARCH_URL, productName: 'Ração', preferSearch: true });
      expect(writeText).toHaveBeenCalledWith('PETMOL');
    });
  });

  describe('carrinho pré-montado no navegador (popup 2 hops, destination: cart)', () => {
    const COUPON_APPLY = 'https://www.petz.com.br/aplicarCupom_Loja.html?cupom=PETMOL';
    const CART_ADD = 'https://www.petz.com.br/comprarAgora_Loja.html?prod=95492&qtde=1';

    afterEach(() => {
      vi.useRealTimers();
    });

    it('abre popup no aplicarCupom e ~2,2s depois navega o MESMO popup pro comprarAgora — sem a ponte', async () => {
      vi.useFakeTimers();
      const popup = { location: { href: '' } };
      const openSpy = vi.fn().mockReturnValue(popup);
      vi.stubGlobal('open', openSpy);

      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      const result = await openPetzPartnerStore({ couponApplyUrl: COUPON_APPLY, cartAddUrl: CART_ADD });

      expect(result).toBe(true); // cupom copiado
      expect(openSpy).toHaveBeenCalledTimes(1);
      expect(openSpy.mock.calls[0][0]).toBe(COUPON_APPLY);
      expect(popup.location.href).toBe(''); // hop 2 ainda não

      vi.advanceTimersByTime(2200);
      expect(popup.location.href).toBe(CART_ADD); // hop 2

      // a ponte /go/petz NÃO foi usada — só a chamada do popup
      expect(openSpy).toHaveBeenCalledTimes(1);
    });

    it('popup bloqueado (window.open → null) → cai na ponte /go/petz', async () => {
      const openSpy = vi.fn().mockReturnValue(null);
      vi.stubGlobal('open', openSpy);

      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({ couponApplyUrl: COUPON_APPLY, cartAddUrl: CART_ADD });

      // 1ª chamada = tentativa de popup (null); 2ª = a ponte
      expect(openSpy).toHaveBeenCalledTimes(2);
      expect(new URL(openSpy.mock.calls[1][0] as string).pathname).toBe('/go/petz');
    });

    it('PWA instalado no iOS (standalone) → NÃO abre popup (window.open escaparia pro Safari)', async () => {
      const openSpy = vi.fn().mockReturnValue({ location: { href: '' } });
      vi.stubGlobal('open', openSpy);
      Object.defineProperty(window, 'location', {
        value: { href: '', assign: vi.fn(), replace: vi.fn() },
        configurable: true,
      });
      Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });

      const { openPetzPartnerStore } = await import('./homeShoppingPartners');
      await openPetzPartnerStore({ couponApplyUrl: COUPON_APPLY, cartAddUrl: CART_ADD });

      // popup pulado; navegação vai por window.location.href (fallback da ponte)
      expect(openSpy).not.toHaveBeenCalled();
      expect(new URL(window.location.href).pathname).toBe('/go/petz');

      // @ts-expect-error limpa o override
      delete navigator.standalone;
    });
  });

  it('feedback de cupom: copiou → "10% OFF na Petz"; falhou → "Use o cupom ... para 10% OFF"', async () => {
    const toastSpy = vi.fn();
    vi.doMock('@/features/interactions/userPromptChannel', () => ({ showAppToast: toastSpy }));
    vi.stubGlobal('open', vi.fn());

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({});
    expect(toastSpy).toHaveBeenCalledWith('Cupom PETMOL copiado — 10% OFF na Petz', expect.objectContaining({ tone: 'success' }));

    toastSpy.mockClear();
    vi.resetModules();
    vi.doMock('@/features/interactions/userPromptChannel', () => ({ showAppToast: toastSpy }));
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore: openAgain } = await import('./homeShoppingPartners');
    await openAgain({});
    expect(toastSpy).toHaveBeenCalledWith('Use o cupom PETMOL para 10% OFF', expect.objectContaining({ tone: 'neutral' }));
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// openPetzPartnerStore — clique "Ver na Petz" / card "Petz" da loja parceira.
//
// SEMPRE leva pra Loja Parceira (/parceiro/pettmol) — nunca pra
// `/busca?q=...` nem `/produto/...` (decisão de produto, 04/09/2026:
// reduzir ao máximo o risco de perder comissão — só a Loja Parceira é um
// destino comprovado). productUrl/searchUrl continuam aceitos na
// assinatura, mas não decidem mais o destino. Cupom PETTMOL copiado.
// Sempre via a ponte /go/petz (redirect JS).

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

  it('sempre copia o cupom PETTMOL (nunca o nome do produto)', async () => {
    await callAndGetBridgeUrl({ searchUrl: SEARCH_URL, productName: 'Ração Golden Fórmula' });
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
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

  it('feedback de cupom: copiou → "10% OFF na Petz"; falhou → "Use o cupom ... para 10% OFF"', async () => {
    const toastSpy = vi.fn();
    vi.doMock('@/features/interactions/userPromptChannel', () => ({ showAppToast: toastSpy }));
    vi.stubGlobal('open', vi.fn());

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({});
    expect(toastSpy).toHaveBeenCalledWith('Cupom PETTMOL copiado — 10% OFF na Petz', expect.objectContaining({ tone: 'success' }));

    toastSpy.mockClear();
    vi.resetModules();
    vi.doMock('@/features/interactions/userPromptChannel', () => ({ showAppToast: toastSpy }));
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    vi.stubGlobal('open', vi.fn());
    const { openPetzPartnerStore: openAgain } = await import('./homeShoppingPartners');
    await openAgain({});
    expect(toastSpy).toHaveBeenCalledWith('Use o cupom PETTMOL para 10% OFF', expect.objectContaining({ tone: 'neutral' }));
  });
});

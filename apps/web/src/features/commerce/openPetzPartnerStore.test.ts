import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// openPetzPartnerStore — clique "Ver na Petz".
//
// Leva pra BUSCA da Petz (`/busca?q=...`) — o produto aparece nos
// resultados. NUNCA pra `/produto/...`: esse path está na AASA da Petz e
// o iOS o entrega ao app (tela "DETALHES" quebrada). Sem searchUrl
// utilizável → Loja Parceira. Cupom PETTMOL copiado. Sempre via a ponte
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

  it('searchUrl (/busca) → ponte /go/petz com ?to= pra a BUSCA da Petz', async () => {
    const url = await callAndGetBridgeUrl({ searchUrl: SEARCH_URL, productName: 'Ração Golden' });
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBe(SEARCH_URL);
    expect(url.searchParams.get('q')).toBe('Ração Golden');
    expect(url.host).not.toContain('petz.com.br');
  });

  it('productUrl (/produto/...) NUNCA é usado como destino — cai na busca/loja parceira', async () => {
    // só productUrl, sem searchUrl → não há destino seguro → Loja Parceira
    const url = await callAndGetBridgeUrl({ productUrl: REAL_PRODUCT, productName: 'Kit Enxoval' });
    expect(url.searchParams.get('to')).toBeNull();
    expect(url.href).not.toContain('/produto/');

    // productUrl + searchUrl → usa a BUSCA, ignora o /produto/
    vi.resetModules();
    vi.unstubAllGlobals();
    const url2 = await callAndGetBridgeUrl({ productUrl: REAL_PRODUCT, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });
    expect(url2.searchParams.get('to')).toBe(SEARCH_URL);
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

  it('searchUrl inválido / malicioso / na AASA da Petz → nunca vira ?to=', async () => {
    for (const bad of [
      'https://evil.com/busca?q=x',
      'http://www.petz.com.br/busca?q=x',
      'https://petz.com.br.evil.com/busca',
      'javascript:alert(1)',
      'https://www.petz.com.br/produto/x-123', // real petz mas na AASA
      'https://www.petz.com.br/', // home, na AASA
    ]) {
      vi.resetModules();
      const url = await callAndGetBridgeUrl({ searchUrl: bad, productName: 'X' });
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
});

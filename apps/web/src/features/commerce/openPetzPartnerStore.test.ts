import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// openPetzPartnerStore — clique "Ver na Petz".
//
// Abre a página da Petz ONDE O PRODUTO APARECE:
//   productUrl (/produto/...)  → página exata (produto mapeado)
//   searchUrl  (/busca?q=...)  → busca da Petz com o termo
//   nenhum                     → Loja Parceira /parceiro/pettmol
// Copia o cupom PETTMOL pro clipboard (10% + comissão ao colar no
// carrinho). Sempre via a ponte /go/petz (redirect JS) pra o app da Petz
// não interceptar no iPhone.

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

  async function callAndGetBridgeUrl(opts: Parameters<typeof import('./homeShoppingPartners')['openPetzPartnerStore']>[0]) {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore(opts);
    expect(openSpy).toHaveBeenCalledTimes(1);
    return new URL(openSpy.mock.calls[0][0] as string);
  }

  it('produto mapeado → ponte /go/petz com ?to= apontando pra a PÁGINA do produto', async () => {
    const url = await callAndGetBridgeUrl({ productUrl: REAL_PRODUCT, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBe(REAL_PRODUCT);
    expect(url.host).not.toContain('petz.com.br');
  });

  it('produto sem mapping mas com searchUrl → ?to= aponta pra a BUSCA da Petz', async () => {
    const url = await callAndGetBridgeUrl({ searchUrl: SEARCH_URL, productName: 'Ração Golden' });
    expect(url.searchParams.get('to')).toBe(SEARCH_URL);
    expect(url.searchParams.get('q')).toBe('Ração Golden');
  });

  it('sem produto nem busca → ponte sem ?to= (cai na Loja Parceira)', async () => {
    const url = await callAndGetBridgeUrl({});
    expect(url.pathname).toBe('/go/petz');
    expect(url.searchParams.get('to')).toBeNull();
  });

  it('sempre copia o cupom PETTMOL (nunca o nome do produto)', async () => {
    await callAndGetBridgeUrl({ productUrl: REAL_PRODUCT, productName: 'Ração Golden Fórmula' });
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
    expect(writeText).not.toHaveBeenCalledWith('Ração Golden Fórmula');
  });

  it('URL de produto/busca inválida ou maliciosa → nunca vira ?to=', async () => {
    for (const bad of [
      'https://evil.com/produto/x',
      'http://www.petz.com.br/produto/x',
      'https://petz.com.br.evil.com/x',
      'javascript:alert(1)',
    ]) {
      vi.resetModules();
      const url = await callAndGetBridgeUrl({ productUrl: bad, searchUrl: bad, productName: 'X' });
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
    await expect(openPetzPartnerStore({ productUrl: REAL_PRODUCT })).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalled();
  });
});

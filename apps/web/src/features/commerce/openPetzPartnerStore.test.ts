import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// openPetzPartnerStore — clique "Ver na Petz".
//
// TWO-HOP WEB (comprovado no navegador): gesto → window.open('about:blank')
// → win.location.href = Loja Parceira (Petz grava petzPartner) → delay →
// win.location.replace(2º hop). O cookie (Path=/) sobrevive → carrinho
// continua atribuído à loja pettmol.
//   2º hop = /produto/... (produto mapeado) OU /busca?q=... (qualquer
//   outro produto — cliente escolhe da lista).
//
// FALLBACK (Capacitor / popup bloqueado / SEM 2º hop utilizável): ponte
// /go/petz → só a Loja Parceira, copiando o NOME do produto pra busca.

const PARTNER_STORE = 'https://www.petz.com.br/parceiro/pettmol';
const REAL_PRODUCT = 'https://www.petz.com.br/produto/kit-enxoval-modernpet-201842';
const SEARCH_URL = 'https://www.petz.com.br/busca?q=Royal+Canin+racao';

function fakeWindow() {
  return {
    opener: {} as unknown,
    location: { href: '', replace: vi.fn() },
  };
}

describe('openPetzPartnerStore', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.useFakeTimers();
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('produto Petz mapeado (URL real) → two-hop: Loja Parceira ANTES, depois o produto exato', async () => {
    const win = fakeWindow();
    const openSpy = vi.fn(() => win);
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore, PETZ_TWO_HOP_DELAY_MS } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productUrl: REAL_PRODUCT, searchUrl: SEARCH_URL, productName: 'Kit Enxoval' });

    // janela em branco no gesto, opener neutralizado
    expect(openSpy).toHaveBeenCalledWith('about:blank', '_blank');
    expect(win.opener).toBeNull();
    // 1º hop imediato: Loja Parceira
    expect(win.location.href).toBe(PARTNER_STORE);
    // 2º hop ainda NÃO aconteceu
    expect(win.location.replace).not.toHaveBeenCalled();
    // ...só depois do delay — e prefere o PRODUTO exato ao searchUrl
    vi.advanceTimersByTime(PETZ_TWO_HOP_DELAY_MS);
    expect(win.location.replace).toHaveBeenCalledWith(REAL_PRODUCT);
    expect(openSpy).toHaveBeenCalledTimes(1);
  });

  it('produto SEM URL exata mas COM searchUrl → two-hop pra BUSCA da Petz', async () => {
    const win = fakeWindow();
    vi.stubGlobal('open', vi.fn(() => win));

    const { openPetzPartnerStore, PETZ_TWO_HOP_DELAY_MS } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ searchUrl: SEARCH_URL, productName: 'Ração Golden' });

    expect(win.location.href).toBe(PARTNER_STORE);
    vi.advanceTimersByTime(PETZ_TWO_HOP_DELAY_MS);
    expect(win.location.replace).toHaveBeenCalledWith(SEARCH_URL);
    // com 2º hop utilizável, copia o CUPOM (não o nome)
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
    expect(writeText).not.toHaveBeenCalledWith('Ração Golden');
  });

  it('two-hop copia o CUPOM PETTMOL (não o nome do produto)', async () => {
    vi.stubGlobal('open', vi.fn((..._a: unknown[]) => fakeWindow()));
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productUrl: REAL_PRODUCT, productName: 'Ração Golden Fórmula' });

    expect(writeText).toHaveBeenCalledWith('PETTMOL');
    expect(writeText).not.toHaveBeenCalledWith('Ração Golden Fórmula');
  });

  it('sem productUrl E sem searchUrl → fallback: ponte /go/petz + copia o NOME do produto', async () => {
    const openSpy = vi.fn((..._a: unknown[]) => fakeWindow());
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({ productName: 'Ração Golden Fórmula' });

    expect(openSpy).toHaveBeenCalledTimes(1); // navigateToPartnerUrl → window.open(ponte)
    const opened = new URL(openSpy.mock.calls[0][0] as string);
    expect(opened.pathname).toBe('/go/petz');
    expect(opened.searchParams.get('q')).toBe('Ração Golden Fórmula');
    expect(opened.href).not.toContain('petz.com.br');
    expect(writeText).toHaveBeenCalledWith('Ração Golden Fórmula');
    expect(writeText).not.toHaveBeenCalledWith('PETTMOL');
  });

  it('productUrl E searchUrl inválidos / maliciosos → NÃO faz two-hop, cai no fallback', async () => {
    const openSpy = vi.fn((..._a: unknown[]) => fakeWindow());
    vi.stubGlobal('open', openSpy);

    const bad = ['https://evil.com/produto/x', 'http://www.petz.com.br/produto/x', 'https://petz.com.br.evil.com/x', 'javascript:alert(1)'];
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    for (const url of bad) {
      openSpy.mockClear();
      await openPetzPartnerStore({ productUrl: url, searchUrl: url, productName: 'X' });
      const opened = openSpy.mock.calls[0][0] as string;
      expect(opened).toContain('/go/petz');
      expect(opened).not.toBe('about:blank');
      expect(opened).not.toContain('evil.com');
    }
  });

  it('window.open retorna null (popup bloqueado) → fallback, sem lançar', async () => {
    vi.stubGlobal('open', vi.fn((..._a: unknown[]) => null));
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await expect(openPetzPartnerStore({ productUrl: REAL_PRODUCT, productName: 'X' })).resolves.not.toThrow();
  });

  it('grade de lojas (sem produto) → só Loja Parceira, sem copiar nada', async () => {
    const openSpy = vi.fn((..._a: unknown[]) => fakeWindow());
    vi.stubGlobal('open', openSpy);
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore({});
    expect(writeText).not.toHaveBeenCalled();
    expect(openSpy.mock.calls[0][0]).toMatch(/\/go\/petz$/);
  });

  it('clipboard indisponível não bloqueia a navegação', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    vi.stubGlobal('open', vi.fn((..._a: unknown[]) => fakeWindow()));
    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await expect(openPetzPartnerStore({ productUrl: REAL_PRODUCT })).resolves.not.toThrow();
  });
});

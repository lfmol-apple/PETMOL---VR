import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// openPetzPartnerStore — clique "Ver na Petz":
//  1. copia o NOME DO PRODUTO pro clipboard (pra o cliente colar na busca
//     da Petz — a loja parceira não tem deep link de produto);
//  2. abre a Loja Parceira pela ponte /go/petz (petmol.com.br), que evita
//     o iOS/Android entregarem o link ao app da Petz instalado.
// O cupom PETTMOL e os 10% entram sozinhos na loja parceira (cookie
// petzPartner) — NÃO é copiado. Nunca abre petz.com.br direto.
describe('openPetzPartnerStore', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    writeText.mockClear();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('copia o NOME do produto (não o cupom) e abre a ponte /go/petz?q=', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore('Ração Golden Fórmula Adulto');

    expect(writeText).toHaveBeenCalledWith('Ração Golden Fórmula Adulto');
    expect(writeText).not.toHaveBeenCalledWith('PETTMOL');

    expect(openSpy).toHaveBeenCalledTimes(1);
    const opened = new URL(openSpy.mock.calls[0][0] as string);
    expect(opened.pathname).toBe('/go/petz');
    expect(opened.searchParams.get('q')).toBe('Ração Golden Fórmula Adulto');
    expect(opened.href).not.toContain('petz.com.br');
  });

  it('sem nome de produto não copia nada e abre /go/petz sem query', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await openPetzPartnerStore();

    expect(writeText).not.toHaveBeenCalled();
    expect(openSpy.mock.calls[0][0]).toMatch(/\/go\/petz$/);
  });

  it('ainda navega mesmo se o clipboard falhar (best-effort, nunca bloqueia)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await expect(openPetzPartnerStore('X')).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/go/petz'), '_blank', 'noopener');
  });

  it('nunca lança sem clipboard nem execCommand disponíveis', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { openPetzPartnerStore } = await import('./homeShoppingPartners');
    await expect(openPetzPartnerStore('X')).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/go/petz'), '_blank', 'noopener');
  });
});

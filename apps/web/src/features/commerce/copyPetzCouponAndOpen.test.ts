import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// copyPetzCouponAndOpen — clique "Ver na Petz":
//  1. copia o cupom PETTMOL como RESERVA (a Loja Parceira já aplica os
//     10% sozinha ao entrar — ver docs/PETZ_COMMISSION_VALIDATION.md);
//  2. abre a Loja Parceira pela ponte /go/petz (petmol.com.br), que evita
//     o iOS/Android entregarem o link ao app da Petz instalado.
// Nunca abre petz.com.br direto; só passa o NOME do produto (?q=).
describe('copyPetzCouponAndOpen', () => {
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

  it('copia PETTMOL e abre a ponte /go/petz com o nome do produto em ?q=', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen, PETZ_COUPON_CODE } = await import('./homeShoppingPartners');
    await copyPetzCouponAndOpen('Ração Golden Fórmula Adulto');

    expect(writeText).toHaveBeenCalledWith(PETZ_COUPON_CODE);
    expect(writeText).toHaveBeenCalledWith('PETTMOL');

    expect(openSpy).toHaveBeenCalledTimes(1);
    const opened = new URL(openSpy.mock.calls[0][0] as string);
    expect(opened.pathname).toBe('/go/petz');
    expect(opened.searchParams.get('q')).toBe('Ração Golden Fórmula Adulto');
    // nunca abre a URL da Petz direto (é isso que o app da Petz intercepta)
    expect(opened.href).not.toContain('petz.com.br');
  });

  it('sem nome de produto abre /go/petz sem query', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await copyPetzCouponAndOpen();
    expect(openSpy.mock.calls[0][0]).toMatch(/\/go\/petz$/);
  });

  it('ainda navega mesmo se o clipboard falhar (best-effort, nunca bloqueia)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await expect(copyPetzCouponAndOpen('X')).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/go/petz'), '_blank', 'noopener');
  });

  it('nunca chama clipboard sem a API disponível (ex: contexto não seguro)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    // @ts-expect-error execCommand ausente em jsdom
    delete document.execCommand;
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await expect(copyPetzCouponAndOpen('X')).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/go/petz'), '_blank', 'noopener');
  });
});

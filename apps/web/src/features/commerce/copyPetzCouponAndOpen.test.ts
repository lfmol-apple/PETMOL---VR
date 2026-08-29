import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// copyPetzCouponAndOpen — clique "Ver na Petz":
//  1. copia o cupom PETTMOL (mecanismo de atribuição do Parceiro Petz);
//  2. abre a Petz pela ponte /go/petz (petmol.com.br), que evita o iOS/
//     Android entregarem o link ao app da Petz instalado (Universal Link
//     / App Link) — ver petzBridgeUrl / docs/AFFILIATES.md §Petz.
// A URL real da Petz nunca é alterada, só embrulhada em ?to=.
describe('copyPetzCouponAndOpen', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const REAL = 'https://www.petz.com.br/produto/racao-royal-canin-100223';

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

  it('copia PETTMOL antes de navegar e abre a ponte /go/petz com a URL real embrulhada', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen, PETZ_COUPON_CODE } = await import('./homeShoppingPartners');
    await copyPetzCouponAndOpen(REAL);

    expect(writeText).toHaveBeenCalledWith(PETZ_COUPON_CODE);
    expect(writeText).toHaveBeenCalledWith('PETTMOL');

    expect(openSpy).toHaveBeenCalledTimes(1);
    const opened = openSpy.mock.calls[0][0] as string;
    expect(opened).toContain('/go/petz?to=');
    // a URL real da Petz vai inteira, só percent-encoded — nada é alterado
    expect(decodeURIComponent(new URL(opened).searchParams.get('to')!)).toBe(REAL);
    // nunca abre a URL da Petz direto (é isso que o app intercepta)
    expect(opened.startsWith('https://www.petz.com.br')).toBe(false);
  });

  it('ainda navega mesmo se o clipboard falhar (best-effort, nunca bloqueia)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await expect(copyPetzCouponAndOpen(REAL)).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/go/petz?to='), '_blank', 'noopener');
  });

  it('nunca chama clipboard sem a API disponível (ex: contexto não seguro)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await expect(copyPetzCouponAndOpen(REAL)).resolves.not.toThrow();
    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('/go/petz?to='), '_blank', 'noopener');
  });
});

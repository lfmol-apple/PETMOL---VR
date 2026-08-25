import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// copyPetzCouponAndOpen — mitigação pro caso do app da Petz interceptar o
// link (iOS Universal Links / Android App Links) e abrir na home em vez do
// produto: garante que o cupom PETTMOL já esteja no clipboard ANTES de
// navegar, então não importa em qual tela o tutor cair.
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
  });

  it('copia o código do cupom PETTMOL pro clipboard antes de navegar', async () => {
    const { copyPetzCouponAndOpen, PETZ_COUPON_CODE } = await import('./homeShoppingPartners');
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    await copyPetzCouponAndOpen('https://www.petz.com.br/produto/racao-royal-canin-100223');

    expect(writeText).toHaveBeenCalledWith(PETZ_COUPON_CODE);
    expect(writeText).toHaveBeenCalledWith('PETTMOL');
  });

  it('ainda navega mesmo se o clipboard falhar (best-effort, nunca bloqueia)', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await expect(
      copyPetzCouponAndOpen('https://www.petz.com.br/produto/racao-royal-canin-100223')
    ).resolves.not.toThrow();
  });

  it('nunca chama clipboard sem a API disponível (ex: contexto não seguro)', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    const { copyPetzCouponAndOpen } = await import('./homeShoppingPartners');
    await expect(
      copyPetzCouponAndOpen('https://www.petz.com.br/produto/racao-royal-canin-100223')
    ).resolves.not.toThrow();
  });
});

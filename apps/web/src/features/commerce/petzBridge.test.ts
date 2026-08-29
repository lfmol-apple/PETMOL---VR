import { afterEach, describe, expect, it, vi } from 'vitest';

// Ponte /go/petz — a parte controlável pelo PETMOL. O Universal Link em
// si é do SO e não dá pra simular em jsdom (ver docs/AFFILIATES.md §Petz).
describe('petzBridgeUrl / isRealPetzUrl', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('petzBridgeUrl sempre aponta pra /go/petz no domínio do PETMOL (nunca petz.com.br direto)', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    const bridge = new URL(petzBridgeUrl('Sanol Shampoo Tonalizante'));

    expect(bridge.origin).toBe(window.location.origin);
    expect(bridge.pathname).toBe('/go/petz');
    // leva só o NOME do produto pra busca dentro da Loja Parceira
    expect(bridge.searchParams.get('q')).toBe('Sanol Shampoo Tonalizante');
    expect(bridge.href).not.toContain('petz.com.br');
  });

  it('petzBridgeUrl sem nome de produto não leva query nenhuma', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    expect(petzBridgeUrl()).toBe(`${window.location.origin}/go/petz`);
    expect(petzBridgeUrl('   ')).toBe(`${window.location.origin}/go/petz`);
  });

  it('isRealPetzUrl aceita só https de petz.com.br e rejeita disfarces', async () => {
    const { isRealPetzUrl } = await import('./homeShoppingPartners');
    expect(isRealPetzUrl('https://www.petz.com.br/produto/x-100223')).toBe(true);
    expect(isRealPetzUrl('https://petz.com.br/busca?q=racao')).toBe(true);
    expect(isRealPetzUrl('http://www.petz.com.br/produto/x')).toBe(false);
    expect(isRealPetzUrl('https://petz.com.br.evil.com/produto/x')).toBe(false);
    expect(isRealPetzUrl('javascript:alert(1)')).toBe(false);
  });
});

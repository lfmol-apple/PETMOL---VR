import { afterEach, describe, expect, it, vi } from 'vitest';

// Ponte /go/petz — a parte controlável pelo PETMOL. O Universal Link em
// si é do SO e não dá pra simular em jsdom (ver docs/AFFILIATES.md §Petz).
describe('petzBridgeUrl / isRealPetzUrl', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('petzBridgeUrl sempre aponta pra /go/petz no domínio do PETMOL (nunca petz.com.br direto no host)', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    const bridge = new URL(
      petzBridgeUrl('https://www.petz.com.br/produto/drontal-83755', 'Drontal Plus 10kg'),
    );

    expect(bridge.origin).toBe(window.location.origin);
    expect(bridge.pathname).toBe('/go/petz');
    // destino final vai no ?to= (a ponte valida e redireciona por JS)
    expect(bridge.searchParams.get('to')).toBe('https://www.petz.com.br/produto/drontal-83755');
    expect(bridge.searchParams.get('q')).toBe('Drontal Plus 10kg');
    expect(bridge.host).not.toContain('petz.com.br');
  });

  it('petzBridgeUrl com URL de busca preserva o destino', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    const bridge = new URL(petzBridgeUrl('https://www.petz.com.br/busca?q=Royal+Canin', 'Ração X'));
    expect(bridge.searchParams.get('to')).toBe('https://www.petz.com.br/busca?q=Royal+Canin');
  });

  it('petzBridgeUrl NÃO coloca ?to= quando o alvo é a própria Loja Parceira ou uma URL inválida', async () => {
    const { petzBridgeUrl, PETZ_PARTNER_STORE_URL } = await import('./homeShoppingPartners');
    expect(new URL(petzBridgeUrl(PETZ_PARTNER_STORE_URL)).searchParams.get('to')).toBeNull();
    expect(new URL(petzBridgeUrl('https://evil.com/x', 'X')).searchParams.get('to')).toBeNull();
    expect(new URL(petzBridgeUrl('javascript:alert(1)', 'X')).searchParams.get('to')).toBeNull();
  });

  it('petzBridgeUrl sem alvo utilizável nem nome → só /go/petz', async () => {
    const { petzBridgeUrl, PETZ_PARTNER_STORE_URL } = await import('./homeShoppingPartners');
    expect(petzBridgeUrl(PETZ_PARTNER_STORE_URL)).toBe(`${window.location.origin}/go/petz`);
    expect(petzBridgeUrl('')).toBe(`${window.location.origin}/go/petz`);
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

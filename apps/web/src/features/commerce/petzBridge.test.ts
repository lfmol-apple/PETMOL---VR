import { afterEach, describe, expect, it, vi } from 'vitest';

// Ponte /go/petz — a parte controlável pelo PETMOL. O Universal Link em
// si é do SO e não dá pra simular em jsdom (ver docs/AFFILIATES.md §Petz).
describe('petzBridgeUrl / isRealPetzUrl / isPetzAppClaimedUrl', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('petzBridgeUrl aceita /busca como destino e vai no ?to=', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    const bridge = new URL(
      petzBridgeUrl('https://www.petz.com.br/busca?q=Drontal', 'Drontal Plus 10kg'),
    );

    expect(bridge.origin).toBe(window.location.origin);
    expect(bridge.pathname).toBe('/go/petz');
    expect(bridge.searchParams.get('to')).toBe('https://www.petz.com.br/busca?q=Drontal');
    expect(bridge.searchParams.get('q')).toBe('Drontal Plus 10kg');
    expect(bridge.host).not.toContain('petz.com.br');
  });

  it('petzBridgeUrl NUNCA coloca /produto/ (nem /colecao/, nem home) no ?to= — está na AASA da Petz', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    for (const claimed of [
      'https://www.petz.com.br/produto/drontal-83755',
      'https://www.petz.com.br/colecao/x',
      'https://www.petz.com.br/',
    ]) {
      expect(new URL(petzBridgeUrl(claimed, 'X')).searchParams.get('to')).toBeNull();
    }
  });

  it('petzBridgeUrl NÃO coloca ?to= quando o alvo é a Loja Parceira, evil.com ou javascript:', async () => {
    const { petzBridgeUrl, PETZ_PARTNER_STORE_URL } = await import('./homeShoppingPartners');
    expect(new URL(petzBridgeUrl(PETZ_PARTNER_STORE_URL)).searchParams.get('to')).toBeNull();
    expect(new URL(petzBridgeUrl('https://evil.com/busca', 'X')).searchParams.get('to')).toBeNull();
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

  it('isPetzAppClaimedUrl: true pra /, /produto/*, /colecao/*, /minhas-assinaturas/*; false pra /busca e /parceiro/*', async () => {
    const { isPetzAppClaimedUrl } = await import('./homeShoppingPartners');
    expect(isPetzAppClaimedUrl('https://www.petz.com.br/')).toBe(true);
    expect(isPetzAppClaimedUrl('https://www.petz.com.br/produto/x-123')).toBe(true);
    expect(isPetzAppClaimedUrl('https://www.petz.com.br/colecao/gatos')).toBe(true);
    expect(isPetzAppClaimedUrl('https://www.petz.com.br/minhas-assinaturas/x')).toBe(true);
    expect(isPetzAppClaimedUrl('https://www.petz.com.br/busca?q=racao')).toBe(false);
    expect(isPetzAppClaimedUrl('https://www.petz.com.br/parceiro/pettmol')).toBe(false);
    expect(isPetzAppClaimedUrl('https://evil.com/produto/x')).toBe(false);
  });
});

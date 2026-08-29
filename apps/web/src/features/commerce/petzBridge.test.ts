import { afterEach, describe, expect, it, vi } from 'vitest';

// Ponte /go/petz — decisão de navegação que cabe ao PETMOL.
// O comportamento do Universal Link em si é do SO e não dá pra simular em
// jsdom; aqui garantimos a parte controlável: só destinos petz.com.br,
// URL real preservada, e nunca abrir a Petz sem passar pela ponte.
describe('isRealPetzUrl / petzBridgeUrl', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('aceita só https de petz.com.br / www.petz.com.br', async () => {
    const { isRealPetzUrl } = await import('./homeShoppingPartners');
    expect(isRealPetzUrl('https://www.petz.com.br/produto/x-100223')).toBe(true);
    expect(isRealPetzUrl('https://petz.com.br/busca?q=racao')).toBe(true);
    expect(isRealPetzUrl('https://www.petz.com.br/parceiro/pettmol')).toBe(true);
  });

  it('rejeita host disfarçado, http, outro domínio e lixo', async () => {
    const { isRealPetzUrl } = await import('./homeShoppingPartners');
    expect(isRealPetzUrl('http://www.petz.com.br/produto/x')).toBe(false);
    expect(isRealPetzUrl('https://petz.com.br.evil.com/produto/x')).toBe(false);
    expect(isRealPetzUrl('https://evil.com/?petz.com.br')).toBe(false);
    expect(isRealPetzUrl('javascript:alert(1)')).toBe(false);
    expect(isRealPetzUrl('not a url')).toBe(false);
  });

  it('petzBridgeUrl embrulha a URL real da Petz em /go/petz?to= no domínio do PETMOL', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    const real = 'https://www.petz.com.br/busca?q=Sanol+Shampoo';
    const bridge = new URL(petzBridgeUrl(real));

    expect(bridge.origin).toBe(window.location.origin);
    expect(bridge.pathname).toBe('/go/petz');
    expect(bridge.searchParams.get('to')).toBe(real);
  });

  it('petzBridgeUrl cai na Loja Parceira quando a URL não é da Petz (anti open-redirect)', async () => {
    const { petzBridgeUrl } = await import('./homeShoppingPartners');
    const bridge = new URL(petzBridgeUrl('https://evil.com/roubar'));
    expect(bridge.searchParams.get('to')).toBe('https://www.petz.com.br/parceiro/pettmol');
  });
});

import { describe, expect, it } from 'vitest';
import { isAppClaimedStoreUrl, STORE_BRIDGE_HOSTS, storeBridgeUrl } from './storeBridge';

describe('storeBridge', () => {
  it('reconhece só https de hosts de loja cujo app reivindica o link', () => {
    for (const u of [
      'https://www.cobasi.com.br/x/p', 'https://mais.app/abc', 'https://meli.la/2ftAKx5',
      'https://www.mercadolivre.com.br/social/x',
    ]) expect(isAppClaimedStoreUrl(u)).toBe(true);
    // por ora o bloqueio é só do Mercado Livre (e da Cobasi, que já tinha): Shopee e Amazon ficam de fora
    for (const u of ['https://s.shopee.com.br/abc', 'https://www.amazon.com.br/s?k=pet&tag=t', 'https://amzn.to/xyz']) {
      expect(isAppClaimedStoreUrl(u)).toBe(false);
    }
    for (const u of ['http://www.amazon.com.br/x', 'https://www.petz.com.br/parceiro/PETMOL', 'https://evil.com/?u=amazon.com.br', 'lixo', '']) {
      expect(isAppClaimedStoreUrl(u)).toBe(false);
    }
  });
  it('a ponte leva o link intacto e só aceita hosts da lista (sem open-redirect)', () => {
    const target = 'https://www.amazon.com.br/s?k=pet&tag=pelmol-20';
    const bridged = new URL(storeBridgeUrl(target));
    expect(bridged.pathname).toBe('/go/loja');
    expect(bridged.searchParams.get('to')).toBe(target);
    expect(STORE_BRIDGE_HOSTS.every((h) => !h.includes('/') && !h.includes(':'))).toBe(true);
  });
});

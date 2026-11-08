import { describe, expect, it } from 'vitest';
import { isStoreNativeOpenUrl } from './storeNativeOpen';

describe('isStoreNativeOpenUrl', () => {
  it('só lojas cuja comissão vai no link: Mercado Livre, Shopee e Amazon', () => {
    for (const u of ['https://meli.la/2ftAKx5', 'https://www.mercadolivre.com.br/social/x?matt_word=a', 'https://s.shopee.com.br/abc', 'https://www.amazon.com.br/s?k=pet&tag=t', 'https://amzn.to/xyz']) {
      expect(isStoreNativeOpenUrl(u)).toBe(true);
    }
  });
  it('Cobasi, Petz, http e lixo não', () => {
    for (const u of ['https://www.cobasi.com.br/x/p', 'https://mais.app/IvUCAG', 'https://www.petz.com.br/parceiro/PETMOL', 'http://meli.la/x', 'lixo', '']) {
      expect(isStoreNativeOpenUrl(u)).toBe(false);
    }
  });
});

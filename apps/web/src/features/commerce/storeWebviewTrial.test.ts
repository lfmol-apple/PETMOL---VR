import { describe, expect, it } from 'vitest';
import { isStoreWebviewTrialUrl } from './storeWebviewTrial';

describe('isStoreWebviewTrialUrl', () => {
  it('só o Mercado Livre (decisão do dono, por ora)', () => {
    for (const u of ['https://meli.la/2ftAKx5', 'https://www.mercadolivre.com.br/social/x?matt_word=a']) {
      expect(isStoreWebviewTrialUrl(u)).toBe(true);
    }
  });
  it('Shopee, Cobasi, Amazon (política) e Petz (fluxo próprio) não; http e lixo também não', () => {
    for (const u of ['https://s.shopee.com.br/abc', 'https://www.cobasi.com.br/x/p', 'https://mais.app/IvUCAG', 'https://www.amazon.com.br/s?k=pet&tag=x', 'https://amzn.to/xyz', 'https://www.petz.com.br/parceiro/PETMOL', 'http://meli.la/x', 'lixo', '']) {
      expect(isStoreWebviewTrialUrl(u)).toBe(false);
    }
  });
});

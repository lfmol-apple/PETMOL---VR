import { describe, expect, it } from 'vitest';
import { isStoreWebviewTrialUrl } from './storeWebviewTrial';

describe('isStoreWebviewTrialUrl', () => {
  it('Mercado Livre, Shopee e Cobasi sim', () => {
    for (const u of ['https://meli.la/2ftAKx5', 'https://www.mercadolivre.com.br/social/x?matt_word=a', 'https://s.shopee.com.br/abc', 'https://www.cobasi.com.br/x/p', 'https://mais.app/IvUCAG']) {
      expect(isStoreWebviewTrialUrl(u)).toBe(true);
    }
  });
  it('Amazon (política) e Petz (fluxo próprio) nunca; http e lixo também não', () => {
    for (const u of ['https://www.amazon.com.br/s?k=pet&tag=x', 'https://amzn.to/xyz', 'https://www.petz.com.br/parceiro/PETMOL', 'http://meli.la/x', 'lixo', '']) {
      expect(isStoreWebviewTrialUrl(u)).toBe(false);
    }
  });
});

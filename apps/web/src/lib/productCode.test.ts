import { describe, expect, it } from 'vitest';
import { gtinFromQr, isValidGtin } from './productCode';

describe('código de produto', () => {
  it('valida o dígito verificador GS1', () => {
    expect(isValidGtin('7891000100103')).toBe(true);
    expect(isValidGtin('7891000100104')).toBe(false);
    expect(isValidGtin('12345')).toBe(false);
  });
  it('QR só com o número', () => {
    expect(gtinFromQr('7891000100103')).toBe('7891000100103');
    expect(gtinFromQr('7891000100104')).toBeNull();
  });
  it('link GS1 Digital Link (GTIN-14 com zero à esquerda vira EAN-13)', () => {
    expect(gtinFromQr('https://id.gs1.org/01/07891000100103')).toBe('7891000100103');
    expect(gtinFromQr('https://marca.com.br/p/01/07891000100103/10/LOTE1?x=1')).toBe('7891000100103');
  });
  it('GTIN em parâmetro do link e na cadeia (01)', () => {
    expect(gtinFromQr('https://loja.com/produto?ean=7891000100103')).toBe('7891000100103');
    expect(gtinFromQr('(01)07891000100103(17)261231')).toBe('7891000100103');
  });
  it('QR que não é de produto (site, wifi, texto, número inválido) é ignorado', () => {
    for (const t of ['https://www.instagram.com/marca', 'WIFI:S:casa;T:WPA;P:123;;', 'oi', '', 'https://x.com/01/07891000100104', 'javascript:alert(1)']) {
      expect(gtinFromQr(t)).toBeNull();
    }
  });
});

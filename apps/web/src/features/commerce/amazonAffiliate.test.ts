import { describe, expect, it } from 'vitest';
import {
  AMAZON_ASSOCIATE_TAG,
  buildAmazonProductUrl,
  buildAmazonSearchUrl,
  isAllowedAmazonHost,
} from './amazonAffiliate';

describe('buildAmazonSearchUrl', () => {
  it('monta a URL de busca com a tag e encoding exatos do exemplo real', () => {
    const url = buildAmazonSearchUrl('Royal Canin Urinary S/O Small Dog 7,5 kg', 'petmol-20');
    expect(url).toBe(
      'https://www.amazon.com.br/s?k=Royal%20Canin%20Urinary%20S%2FO%20Small%20Dog%207%2C5%20kg&tag=petmol-20',
    );
  });

  it('usa a tag padrão do projeto quando nenhuma é passada', () => {
    const url = buildAmazonSearchUrl('ração');
    expect(url).toContain(`tag=${AMAZON_ASSOCIATE_TAG}`);
  });

  it('codifica caracteres especiais (acentos, símbolos)', () => {
    const url = buildAmazonSearchUrl('Ração p/ Cão & Gato — 10kg');
    expect(url).toContain(encodeURIComponent('Ração p/ Cão & Gato — 10kg'));
  });

  it('remove espaços nas pontas do termo de busca', () => {
    const url = buildAmazonSearchUrl('  ração  ');
    expect(url).toBe(`https://www.amazon.com.br/s?k=ra%C3%A7%C3%A3o&tag=${AMAZON_ASSOCIATE_TAG}`);
  });
});

describe('isAllowedAmazonHost', () => {
  it('aceita o domínio apex', () => {
    expect(isAllowedAmazonHost('amazon.com.br')).toBe(true);
  });

  it('aceita subdomínios reais', () => {
    expect(isAllowedAmazonHost('www.amazon.com.br')).toBe(true);
    expect(isAllowedAmazonHost('smile.amazon.com.br')).toBe(true);
  });

  it('é case-insensitive', () => {
    expect(isAllowedAmazonHost('WWW.AMAZON.COM.BR')).toBe(true);
  });

  it('rejeita domínio com "amazon.com.br" como prefixo de outro domínio', () => {
    expect(isAllowedAmazonHost('amazon.com.br.exemplo.com')).toBe(false);
  });

  it('rejeita domínio colado sem o ponto de subdomínio', () => {
    expect(isAllowedAmazonHost('golpeamazon.com.br')).toBe(false);
  });

  it('rejeita domínio completamente diferente', () => {
    expect(isAllowedAmazonHost('amazon.com')).toBe(false);
    expect(isAllowedAmazonHost('mercadolivre.com.br')).toBe(false);
  });
});

describe('buildAmazonProductUrl', () => {
  it('inclui tag=petmol-20 em uma URL de produto sem tag', () => {
    const url = buildAmazonProductUrl('https://www.amazon.com.br/dp/B08XYZ1234', 'petmol-20');
    expect(url).toBe('https://www.amazon.com.br/dp/B08XYZ1234?tag=petmol-20');
  });

  it('substitui uma tag incorreta pela tag correta', () => {
    const url = buildAmazonProductUrl('https://www.amazon.com.br/dp/B08XYZ1234?tag=outroafiliado-20', 'petmol-20');
    expect(url).toBe('https://www.amazon.com.br/dp/B08XYZ1234?tag=petmol-20');
  });

  it('preserva outros parâmetros da URL original', () => {
    const url = buildAmazonProductUrl('https://www.amazon.com.br/dp/B08XYZ1234?th=1&psc=1', 'petmol-20');
    expect(url).toContain('th=1');
    expect(url).toContain('psc=1');
    expect(url).toContain('tag=petmol-20');
  });

  it('rejeita domínio falso (retorna null)', () => {
    expect(buildAmazonProductUrl('https://amazon.com.br.golpe.com/dp/B08XYZ1234')).toBeNull();
    expect(buildAmazonProductUrl('https://golpeamazon.com.br/dp/B08XYZ1234')).toBeNull();
    expect(buildAmazonProductUrl('https://mercadolivre.com.br/produto')).toBeNull();
  });

  it('rejeita protocolo http (não https)', () => {
    expect(buildAmazonProductUrl('http://www.amazon.com.br/dp/B08XYZ1234')).toBeNull();
  });

  it('rejeita esquemas perigosos', () => {
    expect(buildAmazonProductUrl('javascript:alert(1)')).toBeNull();
    expect(buildAmazonProductUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
  });

  it('rejeita URL malformada', () => {
    expect(buildAmazonProductUrl('não é uma url')).toBeNull();
    expect(buildAmazonProductUrl('')).toBeNull();
  });
});

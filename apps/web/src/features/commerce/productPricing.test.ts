import { describe, expect, it } from 'vitest';
import { hasReliablePrice, preferCobasiOffer, type CommerceOffer } from './productPricing';

function offer(overrides: Partial<CommerceOffer> & { merchant: string }): CommerceOffer {
  return {
    url: `https://example.com/${overrides.merchant}`,
    link_type: 'affiliate_product',
    price: 100,
    price_is_stale: false,
    ...overrides,
  };
}

describe('hasReliablePrice', () => {
  it('true só com preço numérico e não-stale', () => {
    expect(hasReliablePrice({ price: 10, price_is_stale: false })).toBe(true);
    expect(hasReliablePrice({ price: 10, price_is_stale: true })).toBe(false);
    expect(hasReliablePrice({ price: null, price_is_stale: false })).toBe(false);
    expect(hasReliablePrice({ price: undefined, price_is_stale: false })).toBe(false);
  });
});

describe('preferCobasiOffer — Cobasi primeiro nos cards da Loja do Pet (produtos cadastrados do pet)', () => {
  it('move a Cobasi pro topo mesmo quando outra loja é mais barata', () => {
    const offers = [
      offer({ merchant: 'shopee', price: 50 }),
      offer({ merchant: 'cobasi', price: 80 }),
    ];
    const result = preferCobasiOffer(offers);
    expect(result.map((o) => o.merchant)).toEqual(['cobasi', 'shopee']);
  });

  it('mantém a ordem por preço quando a Cobasi já é a mais barata (nada a fazer)', () => {
    const offers = [
      offer({ merchant: 'cobasi', price: 50 }),
      offer({ merchant: 'shopee', price: 80 }),
    ];
    const result = preferCobasiOffer(offers);
    expect(result.map((o) => o.merchant)).toEqual(['cobasi', 'shopee']);
    expect(result).toBe(offers); // sem Cobasi pra mover, retorna a mesma referência
  });

  it('sem Cobasi na lista, mantém a ordem por preço como veio do backend', () => {
    const offers = [
      offer({ merchant: 'shopee', price: 50 }),
      offer({ merchant: 'mercadolivre', price: 80 }),
    ];
    expect(preferCobasiOffer(offers)).toEqual(offers);
  });

  it('Cobasi presente mas SEM preço confiável (stale) não é preferida — mantém a mais barata confiável primeiro', () => {
    const offers = [
      offer({ merchant: 'shopee', price: 50 }),
      offer({ merchant: 'cobasi', price: 40, price_is_stale: true }),
    ];
    expect(preferCobasiOffer(offers).map((o) => o.merchant)).toEqual(['shopee', 'cobasi']);
  });

  it('Cobasi presente mas sem preço nenhum não é preferida', () => {
    const offers = [
      offer({ merchant: 'shopee', price: 50 }),
      offer({ merchant: 'cobasi', price: null }),
    ];
    expect(preferCobasiOffer(offers).map((o) => o.merchant)).toEqual(['shopee', 'cobasi']);
  });

  it('preserva a ordem relativa das demais lojas ao mover a Cobasi (3+ ofertas)', () => {
    const offers = [
      offer({ merchant: 'shopee', price: 30 }),
      offer({ merchant: 'mercadolivre', price: 60 }),
      offer({ merchant: 'cobasi', price: 90 }),
    ];
    expect(preferCobasiOffer(offers).map((o) => o.merchant)).toEqual(['cobasi', 'shopee', 'mercadolivre']);
  });

  it('lista vazia ou com 1 item nunca quebra', () => {
    expect(preferCobasiOffer([])).toEqual([]);
    const single = [offer({ merchant: 'cobasi', price: 50 })];
    expect(preferCobasiOffer(single)).toEqual(single);
  });

  it('nunca inventa nem descarta oferta — só reordena (mesmo conjunto, tamanho igual)', () => {
    const offers = [
      offer({ merchant: 'shopee', price: 50 }),
      offer({ merchant: 'cobasi', price: 80 }),
      offer({ merchant: 'mercadolivre', price: 95 }),
    ];
    const result = preferCobasiOffer(offers);
    expect(result).toHaveLength(offers.length);
    expect(new Set(result.map((o) => o.merchant))).toEqual(new Set(offers.map((o) => o.merchant)));
  });
});

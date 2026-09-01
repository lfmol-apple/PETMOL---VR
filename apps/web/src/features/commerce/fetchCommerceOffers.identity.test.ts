import { afterEach, describe, expect, it, vi } from 'vitest';

// Defesa final de identidade no frontend: com card.gtin conhecido, uma
// oferta cujo canonical_gtin diverge é outro produto — nunca renderiza.

function mockOffers(offers: unknown[]) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ offers }) }));
}

describe('fetchCommerceOffers — defesa de identidade por GTIN', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('descarta oferta com canonical_gtin diferente do GTIN pedido', async () => {
    mockOffers([
      { merchant: 'shopee', url: 'https://s.shopee.com.br/a', canonical_gtin: '7896181298090', price: 380, is_available: true },
      { merchant: 'cobasi', url: 'https://mais.app/X', canonical_gtin: '7899999999999', price: 33, is_available: true },
    ]);
    const { fetchCommerceOffers } = await import('./productPricing');
    const result = await fetchCommerceOffers('Royal Canin', 7.5, '7896181298090');
    expect(result.map((o) => o.merchant)).toEqual(['shopee']);
  });

  it('mantém oferta sem canonical_gtin (backend não informou)', async () => {
    mockOffers([
      { merchant: 'shopee', url: 'https://s.shopee.com.br/a', price: 380, is_available: true },
    ]);
    const { fetchCommerceOffers } = await import('./productPricing');
    const result = await fetchCommerceOffers('Royal Canin', 7.5, '7896181298090');
    expect(result).toHaveLength(1);
  });

  it('sem GTIN pedido, não filtra por canonical_gtin', async () => {
    mockOffers([
      { merchant: 'shopee', url: 'https://s.shopee.com.br/a', canonical_gtin: '111', price: 10, is_available: true },
      { merchant: 'cobasi', url: 'https://mais.app/X', canonical_gtin: '222', price: 20, is_available: true },
    ]);
    const { fetchCommerceOffers } = await import('./productPricing');
    const result = await fetchCommerceOffers('produtos pet');
    expect(result).toHaveLength(2);
  });

  it('aceita GTIN com formatação (traços/espaços) vs canonical só dígitos', async () => {
    mockOffers([
      { merchant: 'shopee', url: 'https://s.shopee.com.br/a', canonical_gtin: '7896181298090', price: 380, is_available: true },
    ]);
    const { fetchCommerceOffers } = await import('./productPricing');
    const result = await fetchCommerceOffers('Royal Canin', 7.5, '789-6181 298090');
    expect(result).toHaveLength(1);
  });
});

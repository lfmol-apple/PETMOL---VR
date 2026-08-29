import { afterEach, describe, expect, it, vi } from 'vitest';

describe('fetchPetzDirectLink — "Ver na Petz" (caminho separado do CommerceEngine)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('retorna a URL quando o backend confirma available:true', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        url: 'https://www.petz.com.br/produto/x-100223',
        direct_product_url: 'https://www.petz.com.br/produto/x-100223',
        partner_store_url: 'https://www.petz.com.br/parceiro/pettmol',
        coupon_code: 'PETTMOL',
        affiliate_program: 'petz_partner',
        link_type: 'affiliate_store',
      }),
    }));

    const { fetchPetzDirectLink } = await import('./productPricing');
    const result = await fetchPetzDirectLink('7896181298090');

    expect(result).toEqual({
      available: true,
      url: 'https://www.petz.com.br/produto/x-100223',
      direct_product_url: 'https://www.petz.com.br/produto/x-100223',
      partner_store_url: 'https://www.petz.com.br/parceiro/pettmol',
      coupon_code: 'PETTMOL',
      affiliate_program: 'petz_partner',
      link_type: 'affiliate_store',
    });
  });

  it('retorna available:false quando o backend responde available:false', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ available: false, url: null }),
    }));

    const { fetchPetzDirectLink } = await import('./productPricing');
    const result = await fetchPetzDirectLink('7896181298090');

    expect(result).toEqual({ available: false, url: null });
  });

  it('nunca lança erro — timeout/falha de rede vira available:false em silêncio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    const { fetchPetzDirectLink } = await import('./productPricing');
    await expect(fetchPetzDirectLink('7896181298090')).resolves.toEqual({ available: false, url: null });
  });

  it('GTIN vazio nunca chama a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPetzDirectLink } = await import('./productPricing');
    const result = await fetchPetzDirectLink('   ');

    expect(result).toEqual({ available: false, url: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

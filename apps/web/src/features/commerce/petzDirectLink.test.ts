import { afterEach, describe, expect, it, vi } from 'vitest';

describe('fetchPetzDirectLink — "Ver na Petz" (caminho separado do CommerceEngine)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('produto confirmado → destino é a página real do produto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        partner_program_active: true,
        url: 'https://www.petz.com.br/produto/x-100223',
        direct_product_url: 'https://www.petz.com.br/produto/x-100223',
        search_url: 'https://www.petz.com.br/busca?q=Ra%C3%A7%C3%A3o+X',
        partner_store_url: 'https://www.petz.com.br/parceiro/pettmol',
        coupon_code: 'PETTMOL',
        affiliate_program: 'petz_partner',
        link_type: 'affiliate_store',
      }),
    }));

    const { fetchPetzDirectLink } = await import('./productPricing');
    const result = await fetchPetzDirectLink('7896181298090', 'Ração X');

    expect(result.url).toBe('https://www.petz.com.br/produto/x-100223');
    expect(result.direct_product_url).toBe('https://www.petz.com.br/produto/x-100223');
    expect(result.coupon_code).toBe('PETTMOL');
  });

  it('produto sem mapping confirmado → destino é a busca do site da Petz + passa o nome como q', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        partner_program_active: true,
        url: 'https://www.petz.com.br/busca?q=Ra%C3%A7%C3%A3o+Golden',
        direct_product_url: null,
        search_url: 'https://www.petz.com.br/busca?q=Ra%C3%A7%C3%A3o+Golden',
        partner_store_url: 'https://www.petz.com.br/parceiro/pettmol',
        coupon_code: 'PETTMOL',
        affiliate_program: 'petz_partner',
        link_type: 'affiliate_store',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPetzDirectLink } = await import('./productPricing');
    const result = await fetchPetzDirectLink('7899999999999', 'Ração Golden');

    expect(fetchMock.mock.calls[0][0]).toContain('q=Ra%C3%A7%C3%A3o+Golden');
    expect(result.url).toBe('https://www.petz.com.br/busca?q=Ra%C3%A7%C3%A3o+Golden');
    expect(result.direct_product_url).toBeNull();
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

  it('sem GTIN E sem nome nunca chama a rede', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPetzDirectLink } = await import('./productPricing');
    expect(await fetchPetzDirectLink('   ')).toEqual({ available: false, url: null });
    expect(await fetchPetzDirectLink(undefined)).toEqual({ available: false, url: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sem GTIN mas COM nome → busca a Petz pelo nome (só ?q=, sem gtin)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        available: true,
        url: 'https://www.petz.com.br/busca?q=Simparic',
        direct_product_url: null,
        search_url: 'https://www.petz.com.br/busca?q=Simparic',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchPetzDirectLink } = await import('./productPricing');
    const result = await fetchPetzDirectLink(undefined, 'Simparic 10 a 20 kg');

    expect(result.available).toBe(true);
    expect(result.search_url).toContain('/busca?q=');
    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('q=Simparic');
    expect(calledUrl).not.toContain('gtin=');
  });
});

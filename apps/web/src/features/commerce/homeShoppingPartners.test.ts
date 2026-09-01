import { describe, expect, it, vi } from 'vitest';

describe('homeShoppingPartners — parceiros ativos no app', () => {
  it('mantém Cobasi, Petz, Mercado Livre e Shopee no cadastro (Petz/ML desativados, mas continuam no array)', async () => {
    const { HOME_SHOPPING_PARTNERS } = await import('./homeShoppingPartners');

    expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.id)).toEqual([
      'cobasi',
      'petz',
      'mercadolivre',
      'shopee',
    ]);
  });

  it('LANÇAMENTO (2026-08-30): só Cobasi e Shopee visíveis; Petz e Mercado Livre desativados', async () => {
    const {
      HOME_SHOPPING_PARTNERS,
      isPartnerVisibleForSearch,
      isPartnerVisibleInStoreArea,
    } = await import('./homeShoppingPartners');

    expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.affiliateStatus)).toEqual([
      'active',    // cobasi
      'disabled',  // petz — desativada
      'disabled',  // mercadolivre — fora do lançamento, entra depois
      'active',    // shopee
    ]);
    expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea).map((partner) => partner.id)).toEqual([
      'cobasi',
      'shopee',
    ]);
    expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleForSearch).map((partner) => partner.id)).toEqual([
      'cobasi',
      'shopee',
    ]);
  });

  it('NEXT_PUBLIC_AFFILIATE_AMAZON configurada não recoloca Amazon na lista nem nos links', async () => {
    const previous = process.env.NEXT_PUBLIC_AFFILIATE_AMAZON;
    process.env.NEXT_PUBLIC_AFFILIATE_AMAZON = 'petmol-20';
    vi.resetModules();

    try {
      const {
        HOME_SHOPPING_PARTNERS,
        resolvePartnerUrl,
      } = await import('./homeShoppingPartners');

      const partnerIds = HOME_SHOPPING_PARTNERS.map((partner) => String(partner.id));
      expect(partnerIds).not.toContain('amazon');
      expect(partnerIds).not.toContain('zeenow');
      expect(partnerIds).not.toContain('zeedog');

      for (const partner of HOME_SHOPPING_PARTNERS) {
        const url = resolvePartnerUrl(partner, 'ração pet', '');
        expect(url ?? '').not.toContain('amazon.com.br');
        expect(url ?? '').not.toContain('petmol-20');
      }
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_AMAZON;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_AMAZON = previous;
      }
      vi.resetModules();
    }
  });

  it('só a Petz passa pela ponte /go/petz; Cobasi/Shopee/ML abrem a URL afiliada direto', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true });

    try {
      const { openHomeShoppingPartner } = await import('./homeShoppingPartners');

      openHomeShoppingPartner('cobasi', 'ração');
      expect(openSpy.mock.calls.at(-1)?.[0]).toContain('minhaloja.cobasi.com.br');
      expect(openSpy.mock.calls.at(-1)?.[0]).not.toContain('/go/petz');

      openHomeShoppingPartner('petz', 'ração');
      await new Promise((r) => setTimeout(r, 0));
      const lastPetz = openSpy.mock.calls.at(-1)?.[0] as string;
      expect(lastPetz).toContain('/go/petz');
      expect(lastPetz).not.toContain('petz.com.br');
      expect(new URL(lastPetz).pathname).toBe('/go/petz');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('abre a URL afiliada exata sem cortar o referer do navegador', async () => {
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);

    try {
      const { navigateToPartnerUrl } = await import('./homeShoppingPartners');
      const url = 'https://www.awin1.com/cread.php?awinmid=127557&awinaffid=123456&ued=https%3A%2F%2Fwww.zeenow.com.br%2Fpromocoes';

      navigateToPartnerUrl(url);

      expect(openSpy).toHaveBeenCalledWith(url, '_blank', 'noopener');
      expect(openSpy.mock.calls[0]?.[2]).not.toContain('noreferrer');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  it('em affiliate-only abre somente links monetizados confirmados, sem fallback direto', async () => {
    const previous = process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
    process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = 'true';
    vi.resetModules();

    try {
      const {
        HOME_SHOPPING_PARTNERS,
        resolvePartnerUrl,
        isPartnerVisibleForSearch,
        isPartnerVisibleInStoreArea,
      } = await import('./homeShoppingPartners');

      const cobasi = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'cobasi');
      const shopee = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'shopee');
      const mercadoLivre = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'mercadolivre');
      const petz = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'petz');

      expect(cobasi && resolvePartnerUrl(cobasi, 'ração pet', '')).toContain('minhaloja.cobasi.com.br');
      expect(shopee && resolvePartnerUrl(shopee, 'ração pet', '')).toBe('https://s.shopee.com.br/4AzW1leQcW');
      expect(mercadoLivre && resolvePartnerUrl(mercadoLivre, 'ração pet', '')).toBe('https://meli.la/2ftAKx5');
      expect(petz && resolvePartnerUrl(petz, 'ração pet', '')).toContain('petz.com.br/parceiro/pettmol');
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleForSearch).map((partner) => partner.id)).toEqual([
        'cobasi',
        'shopee',
      ]);
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea).map((partner) => partner.id)).toEqual([
        'cobasi',
        'shopee',
      ]);
    } finally {
      if (previous === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = previous;
      }
      vi.resetModules();
    }
  });

  it('em affiliate-only mantém Shopee genérica quando há URL afiliada oficial configurada', async () => {
    const previousOnly = process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
    const previousShopee = process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE;
    process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = 'true';
    process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE = 'https://s.shopee.com.br/PETMOL?keyword={query}';
    vi.resetModules();

    try {
      const {
        HOME_SHOPPING_PARTNERS,
        resolvePartnerUrl,
        isPartnerVisibleForSearch,
        partnerGenericLinkType,
      } = await import('./homeShoppingPartners');

      const shopee = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'shopee');
      expect(shopee && resolvePartnerUrl(shopee, 'ração baby', '')).toBe('https://s.shopee.com.br/PETMOL?keyword=ra%C3%A7%C3%A3o%20baby');
      expect(partnerGenericLinkType('shopee')).toBe('affiliate_search');
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleForSearch).map((partner) => partner.id)).toEqual([
        'cobasi',
        'shopee',
      ]);
    } finally {
      if (previousOnly === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = previousOnly;
      }
      if (previousShopee === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_SHOPEE = previousShopee;
      }
      vi.resetModules();
    }
  });

  it('NEXT_PUBLIC_AFFILIATE_ZEENOW/ZEEDOG não recoloca Zee Now e Zee Dog na loja', async () => {
    const previousOnly = process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
    const previousZeeNow = process.env.NEXT_PUBLIC_AFFILIATE_ZEENOW;
    const previousZeeDog = process.env.NEXT_PUBLIC_AFFILIATE_ZEEDOG;
    process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = 'true';
    process.env.NEXT_PUBLIC_AFFILIATE_ZEENOW = 'https://www.awin1.com/cread.php?awinmid=127557&awinaffid=123456';
    process.env.NEXT_PUBLIC_AFFILIATE_ZEEDOG = 'https://www.awin1.com/cread.php?awinmid=127555&awinaffid=123456';
    vi.resetModules();

    try {
      const {
        HOME_SHOPPING_PARTNERS,
        isPartnerVisibleInStoreArea,
      } = await import('./homeShoppingPartners');

      expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.id)).not.toContain('zeenow');
      expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.id)).not.toContain('zeedog');
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea).map((partner) => partner.id)).toEqual([
        'cobasi',
        'shopee',
      ]);
    } finally {
      if (previousOnly === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = previousOnly;
      }
      if (previousZeeNow === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_ZEENOW;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_ZEENOW = previousZeeNow;
      }
      if (previousZeeDog === undefined) {
        delete process.env.NEXT_PUBLIC_AFFILIATE_ZEEDOG;
      } else {
        process.env.NEXT_PUBLIC_AFFILIATE_ZEEDOG = previousZeeDog;
      }
      vi.resetModules();
    }
  });

  // "Cobasi sempre pela Minha Loja": TODA URL Cobasi que o PETMOL emite
  // (fallbackUrl, buildAffiliateUrl, busca direta) aponta para
  // minhaloja.cobasi.com.br — o site principal não credita a comissão MAIS.
  it('toda rota Cobasi resolve para minhaloja.cobasi.com.br', async () => {
    const { HOME_SHOPPING_PARTNERS } = await import('./homeShoppingPartners');
    const cobasi = HOME_SHOPPING_PARTNERS.find((p) => p.id === 'cobasi')!;
    expect(cobasi.fallbackUrl).toContain('minhaloja.cobasi.com.br');
    expect(cobasi.storefrontAffiliateUrl).toContain('minhaloja.cobasi.com.br');
    const built = cobasi.buildAffiliateUrl!('ração royal canin', 'https://base');
    expect(built).toContain('minhaloja.cobasi.com.br');
    expect(built).not.toContain('www.cobasi.com.br');
  });

});

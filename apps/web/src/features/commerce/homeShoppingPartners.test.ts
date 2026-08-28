import { describe, expect, it, vi } from 'vitest';

describe('homeShoppingPartners — parceiros ativos no app', () => {
  it('mantém somente Cobasi, Shopee, Zee Now, Zee Dog e Petz no cadastro exposto ao app', async () => {
    const { HOME_SHOPPING_PARTNERS } = await import('./homeShoppingPartners');

    expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.id)).toEqual([
      'cobasi',
      'shopee',
      'zeenow',
      'zeedog',
      'petz',
    ]);
  });

  it('mostra as cinco lojas nos cards e no comprar novamente', async () => {
    const {
      HOME_SHOPPING_PARTNERS,
      isPartnerVisibleForSearch,
      isPartnerVisibleInStoreArea,
    } = await import('./homeShoppingPartners');

    expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.affiliateStatus)).toEqual([
      'active',
      'active',
      'active',
      'active',
      'active',
    ]);
    expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea).map((partner) => partner.id)).toEqual([
      'cobasi',
      'shopee',
      'zeenow',
      'zeedog',
      'petz',
    ]);
    // Petz não entra em isPartnerVisibleForSearch por afinidade de busca —
    // entra porque tem storefrontAffiliateUrl (mesmo caminho da Cobasi),
    // não porque suporta busca por produto (supportsProductDeepLink: false).
    expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleForSearch).map((partner) => partner.id)).toEqual([
      'cobasi',
      'shopee',
      'zeenow',
      'zeedog',
      'petz',
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
      expect(partnerIds).not.toContain('araujo');

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

  it('em affiliate-only não abre busca direta genérica sem afiliado confirmado', async () => {
    const previous = process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE;
    process.env.NEXT_PUBLIC_AFFILIATE_ONLY_COMMERCE = 'true';
    vi.resetModules();

    try {
      const {
        HOME_SHOPPING_PARTNERS,
        resolvePartnerUrl,
        isPartnerVisibleForSearch,
      } = await import('./homeShoppingPartners');

      const cobasi = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'cobasi');
      const shopee = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'shopee');
      const zeenow = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'zeenow');
      const zeedog = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'zeedog');
      const petz = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'petz');

      expect(cobasi && resolvePartnerUrl(cobasi, 'ração pet', '')).toContain('minhaloja.cobasi.com.br');
      expect(shopee && resolvePartnerUrl(shopee, 'ração pet', '')).toBeNull();
      expect(zeenow && resolvePartnerUrl(zeenow, 'ração pet', '')).toBeNull();
      expect(zeedog && resolvePartnerUrl(zeedog, 'ração pet', '')).toBeNull();
      expect(petz && resolvePartnerUrl(petz, 'ração pet', '')).toContain('petz.com.br/parceiro/pettmol');
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleForSearch).map((partner) => partner.id)).toEqual(['cobasi', 'petz']);
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
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleForSearch).map((partner) => partner.id)).toEqual(['cobasi', 'shopee', 'petz']);
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

  it('monta deep link Awin com ued para Zee Now e Zee Dog quando as URLs afiliadas estão configuradas', async () => {
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
        resolvePartnerUrl,
        isPartnerVisibleInStoreArea,
      } = await import('./homeShoppingPartners');

      const zeenow = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'zeenow');
      const zeedog = HOME_SHOPPING_PARTNERS.find((partner) => partner.id === 'zeedog');
      const zeenowUrl = zeenow && resolvePartnerUrl(zeenow, 'ração baby', '');
      const zeedogUrl = zeedog && resolvePartnerUrl(zeedog, 'ração baby', '');

      expect(zeenowUrl).toContain('https://www.awin1.com/cread.php?awinmid=127557&awinaffid=123456&ued=');
      expect(zeenowUrl).toContain(encodeURIComponent('https://www.zeenow.com.br/busca?q=ra%C3%A7%C3%A3o%20baby'));
      expect(zeenowUrl).not.toContain('&url=');
      expect(zeedogUrl).toContain('https://www.awin1.com/cread.php?awinmid=127555&awinaffid=123456&ued=');
      expect(zeedogUrl).toContain(encodeURIComponent('https://www.zeedog.com.br/busca?q=ra%C3%A7%C3%A3o%20baby'));
      expect(zeedogUrl).not.toContain('&url=');
      expect(HOME_SHOPPING_PARTNERS.filter(isPartnerVisibleInStoreArea).map((partner) => partner.id)).toEqual([
        'cobasi',
        'zeenow',
        'zeedog',
        'petz',
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
});

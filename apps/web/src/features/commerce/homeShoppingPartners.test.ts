import { describe, expect, it, vi } from 'vitest';

describe('homeShoppingPartners — parceiros ativos no app', () => {
  it('mantém somente Cobasi, Shopee, Zee Now e Zee Dog no cadastro exposto ao app', async () => {
    const { HOME_SHOPPING_PARTNERS } = await import('./homeShoppingPartners');

    expect(HOME_SHOPPING_PARTNERS.map((partner) => partner.id)).toEqual([
      'cobasi',
      'shopee',
      'zeenow',
      'zeedog',
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
        expect(resolvePartnerUrl(partner, 'ração pet', '')).not.toContain('amazon.com.br');
        expect(resolvePartnerUrl(partner, 'ração pet', '')).not.toContain('petmol-20');
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
});

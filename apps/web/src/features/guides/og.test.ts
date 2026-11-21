import { describe, expect, it } from 'vitest';
import { getAllGuides } from './index';
import { SITE_URL } from '@/lib/siteUrl';

describe('imagem de compartilhamento dos guias', () => {
  it('generateMetadata devolve imagem (og e twitter) para todos os guias', async () => {
    const mod = await import('@/app/guias/[slug]/page');
    for (const g of getAllGuides()) {
      const m = await mod.generateMetadata({ params: Promise.resolve({ slug: g.slug }) });
      const og = (m.openGraph as { images?: Array<{ url: string }> }).images;
      expect(og?.[0]?.url, g.slug).toMatch(new RegExp('^' + SITE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/.+\\.(png|jpg|jpeg|webp)$'));
      expect((m.twitter as { images?: string[] }).images?.length, g.slug).toBeGreaterThan(0);
    }
  });
});

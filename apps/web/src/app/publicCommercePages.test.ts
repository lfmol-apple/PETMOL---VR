import { describe, expect, it, vi } from 'vitest';
import LojaPublicaPage from './loja/page';
import GuiasIndexPage from './guias/page';
import GuidePage from './guias/[slug]/page';
import {
  PUBLIC_GUIDE_DETAIL_PAGE_ENABLED,
  PUBLIC_GUIDES_PAGE_ENABLED,
  PUBLIC_STORE_PAGE_ENABLED,
} from './publicCommercePages';
import sitemap from './sitemap';
import { getAllGuides } from '@/features/guides';

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('página pública de loja desativada', () => {
  it('/loja retorna 404 reversível enquanto a página pública estiver desativada', () => {
    expect(PUBLIC_STORE_PAGE_ENABLED).toBe(false);
    expect(() => LojaPublicaPage()).toThrow('NEXT_NOT_FOUND');
  });
});

describe('área editorial pública (/guias) ativa', () => {
  it('as flags da área editorial estão ligadas', () => {
    expect(PUBLIC_GUIDES_PAGE_ENABLED).toBe(true);
    expect(PUBLIC_GUIDE_DETAIL_PAGE_ENABLED).toBe(true);
  });

  it('/guias renderiza sem 404', () => {
    expect(() => GuiasIndexPage()).not.toThrow();
    expect(GuiasIndexPage()).toBeTruthy();
  });

  it('/guias/[slug] renderiza para um slug real', async () => {
    const slug = getAllGuides()[0]!.slug;
    await expect(GuidePage({ params: Promise.resolve({ slug }) })).resolves.toBeTruthy();
  });

  it('/guias/[slug] retorna 404 para um slug inexistente', async () => {
    await expect(
      GuidePage({ params: Promise.resolve({ slug: 'guia-que-nao-existe' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('sitemap público', () => {
  it('não lista /loja enquanto a página pública de loja estiver desativada', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => new URL(entry.url).pathname);
    expect(urls).not.toContain('/loja');
  });

  it('lista /guias e cada guia enquanto a área editorial estiver ativa', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => new URL(entry.url).pathname);

    expect(urls).toContain('/guias');
    for (const guide of getAllGuides()) {
      expect(urls).toContain(`/guias/${guide.slug}`);
    }
  });
});

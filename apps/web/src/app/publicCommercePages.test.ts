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

vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

describe('páginas públicas de loja/guias desativadas', () => {
  it('/loja retorna 404 reversível enquanto a página pública estiver desativada', () => {
    expect(PUBLIC_STORE_PAGE_ENABLED).toBe(false);
    expect(() => LojaPublicaPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('/guias retorna 404 reversível enquanto a página pública estiver desativada', () => {
    expect(PUBLIC_GUIDES_PAGE_ENABLED).toBe(false);
    expect(() => GuiasIndexPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('/guias/[slug] retorna 404 reversível enquanto a página pública estiver desativada', async () => {
    expect(PUBLIC_GUIDE_DETAIL_PAGE_ENABLED).toBe(false);
    await expect(
      GuidePage({ params: Promise.resolve({ slug: 'conforto-pets-idosos' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });
});

describe('sitemap público', () => {
  it('não lista /loja nem /guias enquanto as páginas públicas estiverem desativadas', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => new URL(entry.url).pathname);

    expect(urls).not.toContain('/loja');
    expect(urls).not.toContain('/guias');
    expect(urls.some((url) => url.startsWith('/guias/'))).toBe(false);
  });
});

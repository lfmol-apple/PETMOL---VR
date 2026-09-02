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

describe('área editorial /guias — PAUSADA temporariamente', () => {
  it('as flags dos guias estão desligadas (reversível — conteúdo intacto no código)', () => {
    expect(PUBLIC_GUIDES_PAGE_ENABLED).toBe(false);
    expect(PUBLIC_GUIDE_DETAIL_PAGE_ENABLED).toBe(false);
  });

  it('/guias retorna 404 enquanto pausada', () => {
    expect(() => GuiasIndexPage()).toThrow('NEXT_NOT_FOUND');
  });

  it('/guias/[slug] retorna 404 mesmo para um slug real enquanto pausada', async () => {
    const slug = getAllGuides()[0]!.slug;
    await expect(GuidePage({ params: Promise.resolve({ slug }) })).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('os 15 guias continuam existindo na base de conteúdo (só a exibição foi pausada)', () => {
    expect(getAllGuides().length).toBeGreaterThanOrEqual(15);
  });
});

describe('sitemap público', () => {
  it('não lista /loja (página desativada)', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).not.toContain('/loja');
  });

  it('não lista /guias nem os guias enquanto a área estiver pausada', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).not.toContain('/guias');
    for (const guide of getAllGuides()) {
      expect(urls).not.toContain(`/guias/${guide.slug}`);
    }
  });

  it('lista /recommendations e as páginas institucionais (independentes dos guias)', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).toContain('/recommendations');
    expect(urls).toContain('/sobre');
    expect(urls).toContain('/politica-editorial');
    expect(urls).toContain('/transparencia');
  });
});

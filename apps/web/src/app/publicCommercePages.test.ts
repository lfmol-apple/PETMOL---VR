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

describe('área editorial /guias — REATIVADA (Amazon Associates Brasil, Fase 1)', () => {
  it('as flags dos guias estão ligadas', () => {
    expect(PUBLIC_GUIDES_PAGE_ENABLED).toBe(true);
    expect(PUBLIC_GUIDE_DETAIL_PAGE_ENABLED).toBe(true);
  });

  it('/guias renderiza (não dá mais 404)', () => {
    expect(() => GuiasIndexPage()).not.toThrow();
  });

  it('/guias/[slug] renderiza para um slug real', async () => {
    const slug = getAllGuides()[0]!.slug;
    await expect(GuidePage({ params: Promise.resolve({ slug }) })).resolves.toBeTruthy();
  });

  it('/guias/[slug] ainda dá 404 para um slug inexistente', async () => {
    await expect(
      GuidePage({ params: Promise.resolve({ slug: 'slug-que-nao-existe-xyz' }) }),
    ).rejects.toThrow('NEXT_NOT_FOUND');
  });

  it('os 15 guias continuam existindo na base de conteúdo', () => {
    expect(getAllGuides().length).toBeGreaterThanOrEqual(15);
  });
});

describe('sitemap público', () => {
  it('não lista /loja (página desativada)', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).not.toContain('/loja');
  });

  it('lista /guias e todos os guias agora que a área está reativada', async () => {
    const urls = (await sitemap()).map((e) => new URL(e.url).pathname);
    expect(urls).toContain('/guias');
    for (const guide of getAllGuides()) {
      expect(urls).toContain(`/guias/${guide.slug}`);
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

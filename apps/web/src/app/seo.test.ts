import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), notFound: vi.fn() }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => null }));
vi.mock('@/lib/landingEvents', () => ({ trackLandingEvent: vi.fn(), trackDownloadClick: vi.fn() }));

describe('SEO — home renderizada no servidor', () => {
  it('o HTML inicial já traz o H1, as funcionalidades e as imagens (não só a tela de carregamento)', async () => {
    const LandingPage = (await import('./page')).default;
    const html = renderToStaticMarkup(createElement(LandingPage));
    expect(html).toContain('<h1');
    expect(html).toContain('O PETMOL ajuda você a cuidar dela');
    for (const t of ['Alimentação', 'Vacinas', 'Pet Sumido', 'Loja do Pet']) expect(html).toContain(t);
    expect(html.length).toBeGreaterThan(5000);
  });
});

describe('SEO — sitemap e robots', () => {
  it('o sitemap não lista rotas que redirecionam ou não existem, e não usa datas artificiais nas páginas fixas', async () => {
    const sitemap = (await import('./sitemap')).default;
    const items = await sitemap();
    const urls = items.map((i) => i.url);
    for (const bad of ['/services', '/coverage', '/emergency', '/privacy', '/terms']) {
      expect(urls.some((u) => new URL(u).pathname === bad)).toBe(false);
    }
    expect(urls.some((u) => u.endsWith('/legal/privacy'))).toBe(true);
    expect(new Set(urls).size).toBe(urls.length);
    const fixed = items.filter((i) => /\/(achei-um-pet|reportar-pet-perdido)$/.test(i.url) || i.url.replace(/\/$/, '').split('/').length === 3);
    for (const f of fixed) expect(f.lastModified).toBeUndefined();
  });

  it('robots protege as áreas privadas e deixa o /login rastreável (ele tem noindex)', async () => {
    const robots = (await import('./robots')).default;
    const r = robots();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const dis = ([] as string[]).concat(rules.disallow ?? []);
    for (const p of ['/admin/', '/api/', '/home', '/profile', '/cuidar/']) expect(dis).toContain(p);
    expect(dis).not.toContain('/login');
  });
});

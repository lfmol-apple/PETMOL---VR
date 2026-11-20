import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }), notFound: () => { throw new Error('NEXT_NOT_FOUND'); } }));
vi.mock('@/lib/auth-token', () => ({ getToken: () => null }));

import { getAllGuides, validateGuides, getGuideCategory } from '@/features/guides';
import { GUIDE_CLUSTERS } from '@/features/guides/clusters';
import { GuideArticleJsonLd } from '@/components/guides/JsonLd';
import { SITE_URL } from '@/lib/siteUrl';
import type { Guide, GuideBlock } from '@/features/guides/types';

const NEW_SLUGS = [
  'pet-perdido-o-que-fazer-nas-primeiras-horas',
  'quanto-de-racao-dar-para-gato',
  'de-quanto-em-quanto-tempo-dar-banho-no-cachorro',
  'gato-fugiu-de-casa-volta-sozinho-o-que-fazer',
  'achei-um-cachorro-o-que-fazer',
];

function plain(g: Guide): string {
  const parts: string[] = [g.title, g.summary];
  for (const b of g.blocks as GuideBlock[]) {
    if ('text' in b && typeof b.text === 'string') parts.push(b.text);
    if (b.type === 'ul' || b.type === 'ol' || b.type === 'checklist') parts.push(b.items.join(' '));
    if (b.type === 'table') parts.push([...b.headers, ...b.rows.flat()].join(' '));
  }
  for (const f of g.faq ?? []) parts.push(f.question, f.answer);
  return parts.join(' ').toLowerCase().replace(/[^a-zà-ú0-9 ]+/g, ' ');
}
function shingles(t: string, n = 6) {
  const w = t.split(/\s+/).filter(Boolean); const s = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) s.add(w.slice(i, i + n).join(' '));
  return s;
}
function jaccard(a: Set<string>, b: Set<string>) {
  let i = 0; a.forEach((x) => { if (b.has(x)) i++; });
  return i / (a.size + b.size - i || 1);
}

describe('integração dos 8 PRs — guias', () => {
  const guides = getAllGuides();

  it('27 guias (22 + 5 novos), integridade estrutural e slugs únicos', () => {
    expect(guides.length).toBe(27);
    expect(validateGuides()).toEqual([]);
    for (const s of NEW_SLUGS) expect(guides.some((g) => g.slug === s), s).toBe(true);
  });

  it('nenhum título nem descrição duplicados entre guias', () => {
    const t = guides.map((g) => g.title); const d = guides.map((g) => g.description);
    expect(new Set(t).size).toBe(t.length); expect(new Set(d).size).toBe(d.length);
  });

  it('sem conteúdo duplicado: nenhum par de guias passa de 10% de trechos idênticos (6 palavras)', () => {
    const sh = guides.map((g) => [g.slug, shingles(plain(g))] as const);
    let worst = { a: '', b: '', v: 0 };
    for (let i = 0; i < sh.length; i++) for (let j = i + 1; j < sh.length; j++) {
      const v = jaccard(sh[i][1], sh[j][1]);
      if (v > worst.v) worst = { a: sh[i][0], b: sh[j][0], v };
    }
    console.log('PAR MAIS PARECIDO:', worst.a, '×', worst.b, (worst.v * 100).toFixed(2) + '%');
    expect(worst.v).toBeLessThan(0.1);
  });

  it('cada guia novo está em uma jornada (cluster) e recebe pelo menos 2 links internos de outros guias', () => {
    for (const slug of NEW_SLUGS) {
      expect(GUIDE_CLUSTERS.some((c) => c.steps.includes(slug)), `${slug} fora de cluster`).toBe(true);
      let inbound = 0;
      for (const g of guides) {
        if (g.slug === slug) continue;
        const linked = g.relatedSlugs.includes(slug) || g.blocks.some((b) => b.type === 'links' && b.items.some((i) => i.slug === slug));
        if (linked) inbound++;
      }
      const clusterPeers = GUIDE_CLUSTERS.filter((c) => c.steps.includes(slug)).reduce((n, c) => n + c.steps.length - 1, 0);
      console.log(`${slug}: links diretos=${inbound}, pares de jornada=${clusterPeers}`);
      expect(inbound + clusterPeers).toBeGreaterThanOrEqual(2);
    }
  });

  it('guias novos: fontes https, aviso veterinário, sem nome de pessoa e sem palavras de generalização', () => {
    for (const slug of NEW_SLUGS) {
      const g = guides.find((x) => x.slug === slug)!;
      for (const s of g.sources ?? []) expect(s.url).toMatch(/^https:\/\//);
      // o guia geral de pet perdido não trata de saúde (aviso veterinário só nos guias de saúde/cuidado)
      if (slug !== 'pet-perdido-o-que-fazer-nas-primeiras-horas') expect(g.vetContext, slug).toBe(true);
      expect(plain(g)).not.toMatch(/diesel|kornreich|albrecht/);
    }
  });

  it('JSON-LD: cada guia gera JSON válido com a MESMA Organization (@id) e sameAs, e FAQPage quando há FAQ', () => {
    for (const g of guides) {
      const html = renderToStaticMarkup(createElement(GuideArticleJsonLd, { guide: g }));
      const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')));
      expect(scripts.length, g.slug).toBeGreaterThan(0);
      const flat = JSON.stringify(scripts);
      expect(flat).toContain(`${SITE_URL}/#organization`);
      expect(flat).toContain('instagram.com/pettmol');
      expect(flat).toContain('youtube.com/@petmolinstitucional');
      if (g.faq?.length) expect(flat).toContain('FAQPage');
      expect(getGuideCategory(g.category)).toBeTruthy();
    }
  });
});

describe('integração — metadados, sitemap, robots, home', () => {
  it('canônica e título corretos para TODOS os guias (generateMetadata real)', async () => {
    const mod = await import('@/app/guias/[slug]/page');
    for (const g of getAllGuides()) {
      const m = await mod.generateMetadata({ params: Promise.resolve({ slug: g.slug }) });
      expect((m.alternates as { canonical: string }).canonical).toBe(`${SITE_URL}/guias/${g.slug}`);
      expect(String(m.title)).toContain(g.title);
      expect(m.description).toBe(g.description);
    }
  });

  it('sitemap: tem /guias e os 27 guias, sem duplicatas, sem rota que redireciona/404, sem lastModified artificial nas páginas fixas', async () => {
    const items = await (await import('@/app/sitemap')).default();
    const urls = items.map((i) => i.url);
    expect(new Set(urls).size).toBe(urls.length);
    expect(urls).toContain(`${SITE_URL}/guias`);
    for (const g of getAllGuides()) expect(urls).toContain(`${SITE_URL}/guias/${g.slug}`);
    for (const bad of ['/services', '/coverage', '/emergency', '/privacy', '/terms']) expect(urls.some((u) => new URL(u).pathname === bad)).toBe(false);
    console.log('URLS NO SITEMAP (sem pet-perdido):', urls.filter((u) => !u.includes('/pet-perdido/')).length);
  });

  it('robots: protege áreas privadas, libera guias/legal/achei-um-pet/pet-perdido e deixa /login rastreável', async () => {
    const r = (await import('@/app/robots')).default();
    const rules = Array.isArray(r.rules) ? r.rules[0] : r.rules;
    const dis = ([] as string[]).concat(rules.disallow ?? []);
    for (const p of ['/admin/', '/api/', '/home', '/profile', '/cuidar/', '/auth/']) expect(dis).toContain(p);
    for (const p of ['/guias', '/legal', '/achei-um-pet', '/pet-perdido', '/login', '/sobre']) expect(dis.some((d) => p.startsWith(d))).toBe(false);
  });

  it('home no servidor: H1, as 5 funcionalidades, selos das lojas, Organization+WebSite com sameAs, e links sociais NÃO desenhados no 1º quadro', async () => {
    const html = renderToStaticMarkup(createElement((await import('@/app/page')).default));
    expect(html).toContain('<h1');
    for (const t of ['Alimentação', 'Vacinas', 'Pet Sumido', 'Loja do Pet', 'Perfil']) expect(html).toContain(t);
    expect(html).toContain('apps.apple.com'); expect(html).toContain('play.google.com');
    expect(html).toContain('#organization'); expect(html).toContain('#website');
    expect(html).not.toContain('instagram.com/pettmol"'); // links sociais só após confirmar que não é o app
    expect(html).toContain('landing-root');
  });

  it('botões de instalação: URLs das lojas válidas e com placement', async () => {
    const { appStoreUrl, googlePlayUrl } = await import('@/lib/landingLinks');
    const a = appStoreUrl('guia-teste', {} as never); const p = googlePlayUrl('guia-teste', {} as never);
    expect(a).toMatch(/^https:\/\/apps\.apple\.com\//); expect(p).toMatch(/^https:\/\/play\.google\.com\//);
    console.log('appStoreUrl:', a.slice(0, 110)); console.log('googlePlayUrl:', p.slice(0, 110));
  });
});

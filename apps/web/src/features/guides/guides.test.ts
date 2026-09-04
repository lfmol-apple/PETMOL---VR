import { describe, expect, it } from 'vitest';
import {
  GUIDE_CATEGORIES,
  GUIDE_CATEGORY_ORDER,
  getAllGuides,
  getBuyingGuides,
  getCategoriesWithGuides,
  getFeaturedGuides,
  getGuideBySlug,
  getPopularTopics,
  getRelatedGuides,
  getToolGuides,
  searchGuides,
  validateGuides,
} from './index';
import { GUIDE_CLUSTERS, getClusterPlacements, validateClusters } from './clusters';

// Guias que existem desde a base original (set/2026). Novos guias entram além destes.
const CORE_TOPICS = [
  'como-escolher-racao-ideal-cachorro',
  'quanto-tempo-dura-saco-de-racao',
  'quanto-custa-alimentar-cachorro-por-mes',
  'coleira-ou-peitoral-qual-escolher',
  'como-escolher-caixa-transporte-cachorro',
  'como-escolher-tamanho-cama-cachorro',
  'bebedouro-automatico-cachorro-vale-a-pena',
  'como-escolher-tapete-higienico-cachorro',
  'brinquedos-para-caes-como-escolher-com-seguranca',
  'o-que-levar-viagem-com-cachorro',
  'como-escolher-comedouro-cachorro',
  'checklist-adotou-cachorro',
  'comparar-racoes-custo-diario',
  'economizar-produtos-pet-sem-so-menor-preco',
  'kit-viajar-de-carro-com-cachorro',
];

describe('conteúdo dos guias — integridade estrutural', () => {
  it('validateGuides() não retorna nenhum erro', () => {
    expect(validateGuides()).toEqual([]);
  });

  it('mantém os guias da base original e só cresce a partir dela', () => {
    const slugs = new Set(getAllGuides().map((g) => g.slug));
    for (const t of CORE_TOPICS) expect(slugs.has(t), t).toBe(true);
    expect(slugs.size).toBeGreaterThanOrEqual(CORE_TOPICS.length);
  });

  it('todos os slugs são únicos', () => {
    const slugs = getAllGuides().map((g) => g.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('cada guia tem corpo substancial (blocos, seções, volume de texto)', () => {
    for (const g of getAllGuides()) {
      expect(g.blocks.length, `${g.slug} — blocos`).toBeGreaterThanOrEqual(8);
      expect(g.blocks.filter((b) => b.type === 'p').length, `${g.slug} — parágrafos`).toBeGreaterThanOrEqual(2);
      expect(g.blocks.filter((b) => b.type === 'h2').length, `${g.slug} — seções h2`).toBeGreaterThanOrEqual(3);
      // Volume total de texto do corpo — um guia raso não passa disto.
      let chars = 0;
      for (const b of g.blocks) {
        if ('text' in b && typeof b.text === 'string') chars += b.text.length;
        else if (b.type === 'ul' || b.type === 'ol' || b.type === 'checklist') chars += b.items.join(' ').length;
        else if (b.type === 'links') chars += b.items.map((i) => i.label).join(' ').length;
        else if (b.type === 'table') chars += [...b.headers, ...b.rows.flat()].join(' ').length;
      }
      expect(chars, `${g.slug} — caracteres de corpo`).toBeGreaterThan(2200);
    }
  });

  it('as 3 calculadoras estão ligadas a um guia', () => {
    const tools = getToolGuides().map((g) => g.tool);
    expect(new Set(tools)).toEqual(
      new Set(['duracao-saco-racao', 'custo-mensal-racao', 'comparar-racoes-custo-diario']),
    );
  });

  it('todo slug relacionado aponta para um guia real, e getRelatedGuides devolve 3', () => {
    for (const g of getAllGuides()) {
      const related = getRelatedGuides(g.slug);
      expect(related.length, g.slug).toBe(3);
      for (const r of related) expect(r.slug).not.toBe(g.slug);
    }
  });

  it('blocos "links" apontam para guias reais e nunca para o próprio guia', () => {
    const slugs = new Set(getAllGuides().map((g) => g.slug));
    for (const g of getAllGuides()) {
      for (const b of g.blocks) {
        if (b.type !== 'links') continue;
        expect(b.items.length, `${g.slug} — bloco links vazio`).toBeGreaterThan(0);
        for (const it of b.items) {
          expect(slugs.has(it.slug), `${g.slug} → ${it.slug}`).toBe(true);
          expect(it.slug).not.toBe(g.slug);
          expect(it.label.length).toBeGreaterThan(5);
        }
      }
    }
  });

  it('categorias usadas existem no mapa de categorias', () => {
    for (const g of getAllGuides()) {
      expect(GUIDE_CATEGORIES[g.category], g.slug).toBeDefined();
    }
  });

  it('todas as fontes citadas usam https', () => {
    for (const g of getAllGuides()) {
      for (const s of g.sources ?? []) {
        expect(s.url, `${g.slug} — ${s.label}`).toMatch(/^https:\/\//);
      }
    }
  });

  it('destaques do índice existem e cobrem mais de uma categoria', () => {
    const featured = getFeaturedGuides();
    expect(featured.length).toBeGreaterThanOrEqual(3);
    for (const f of featured) expect(getGuideBySlug(f.slug)).toBeDefined();
    expect(new Set(featured.map((f) => f.category)).size).toBeGreaterThanOrEqual(2);
  });

  it('guias de compra existem, são únicos e todos reais', () => {
    const buying = getBuyingGuides();
    expect(buying.length).toBeGreaterThanOrEqual(5);
    expect(new Set(buying.map((g) => g.slug)).size).toBe(buying.length);
    for (const g of buying) expect(getGuideBySlug(g.slug)).toBeDefined();
  });

  it('a categoria Gatos existe e tem conteúdo editorial próprio', () => {
    expect(GUIDE_CATEGORY_ORDER).toContain('gatos');
    const gatos = getAllGuides().filter((g) => g.category === 'gatos');
    expect(gatos.length).toBeGreaterThanOrEqual(3);
    for (const g of gatos) expect(g.vetContext).toBe(true);
  });

  it('getCategoriesWithGuides nunca devolve categoria vazia', () => {
    for (const { guides } of getCategoriesWithGuides()) {
      expect(guides.length).toBeGreaterThan(0);
    }
  });

  it('assuntos mais procurados apontam só para destinos internos reais', () => {
    const slugs = new Set(getAllGuides().map((g) => g.slug));
    for (const t of getPopularTopics()) {
      expect(t.href.startsWith('/guias')).toBe(true);
      const m = t.href.match(/^\/guias\/([a-z0-9-]+)$/);
      if (m) expect(slugs.has(m[1]!), t.href).toBe(true);
    }
  });
});

describe('clusters editoriais', () => {
  it('validateClusters() não retorna erro', () => {
    expect(validateClusters()).toEqual([]);
  });

  it('todo passo de cluster é um guia real, sem repetição', () => {
    const slugs = new Set(getAllGuides().map((g) => g.slug));
    for (const c of GUIDE_CLUSTERS) {
      expect(new Set(c.steps).size).toBe(c.steps.length);
      for (const s of c.steps) expect(slugs.has(s), `${c.id} → ${s}`).toBe(true);
    }
  });

  it('a maioria dos guias pertence a pelo menos um cluster', () => {
    const inCluster = getAllGuides().filter((g) => getClusterPlacements(g.slug).length > 0);
    expect(inCluster.length / getAllGuides().length).toBeGreaterThan(0.6);
  });

  it('o stepper resolve anterior/próximo corretamente', () => {
    const alim = GUIDE_CLUSTERS.find((c) => c.id === 'alimentacao')!;
    const mid = getClusterPlacements(alim.steps[1]!).find((p) => p.cluster.id === 'alimentacao')!;
    expect(mid.prev?.slug).toBe(alim.steps[0]);
    expect(mid.next?.slug).toBe(alim.steps[2]);
  });
});

describe('busca editorial', () => {
  it('encontra guias por termo do título', () => {
    const hits = searchGuides('ração');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.some((h) => h.slug === 'como-escolher-racao-ideal-cachorro')).toBe(true);
  });

  it('encontra por searchTerms mesmo sem a palavra no título', () => {
    const hits = searchGuides('areia');
    expect(hits.some((h) => h.slug === 'como-escolher-areia-higienica-para-gatos')).toBe(true);
  });

  it('devolve vazio para consulta curta ou sem correspondência', () => {
    expect(searchGuides('a')).toEqual([]);
    expect(searchGuides('xyzqwk')).toEqual([]);
  });
});

describe('qualidade editorial — sem conteúdo de encher, sem afirmação falsa', () => {
  const CLICHES = [
    /neste guia completo/i,
    /no mundo atual/i,
    /seu pet merece o melhor/i,
    /descubra tudo sobre/i,
    /guia definitivo/i,
    /não perca tempo/i,
    /\blorem ipsum\b/i,
  ];
  const ABSOLUTES = [
    /\bsempre a melhor escolha\b/i,
    /\bnunca falha\b/i,
    /\b100% seguro\b/i,
    /\bmelhor do mercado\b/i,
    /\bmais vendido\b/i,
  ];

  function allText(): { slug: string; text: string }[] {
    return getAllGuides().map((g) => {
      const parts: string[] = [g.title, g.headline ?? '', g.description, g.summary];
      for (const b of g.blocks) {
        if ('text' in b && typeof b.text === 'string') parts.push(b.text);
        else if (b.type === 'ul' || b.type === 'ol' || b.type === 'checklist') parts.push(...b.items);
        else if (b.type === 'links') parts.push(...b.items.map((i) => i.label));
        else if (b.type === 'table') parts.push(...b.headers, ...b.rows.flat(), b.caption ?? '');
      }
      for (const f of g.faq ?? []) parts.push(f.question, f.answer);
      return { slug: g.slug, text: parts.join('\n') };
    });
  }

  it('nenhum clichê de conteúdo em massa', () => {
    for (const { slug, text } of allText()) {
      for (const re of CLICHES) {
        expect(re.test(text), `${slug} contém "${re}"`).toBe(false);
      }
    }
  });

  it('nenhuma afirmação absoluta / de venda', () => {
    for (const { slug, text } of allText()) {
      for (const re of ABSOLUTES) {
        expect(re.test(text), `${slug} contém "${re}"`).toBe(false);
      }
    }
  });

  it('nenhum guia cita "Baby" (curadoria institucional, não de um pet específico)', () => {
    for (const { slug, text } of allText()) {
      expect(/\bBaby\b/i.test(text), slug).toBe(false);
    }
  });

  it('guias com contexto de saúde marcam vetContext', () => {
    const healthSlugs = [
      'como-escolher-racao-ideal-cachorro',
      'quanto-tempo-dura-saco-de-racao',
      'coleira-ou-peitoral-qual-escolher',
      'bebedouro-automatico-cachorro-vale-a-pena',
      'checklist-adotou-cachorro',
    ];
    for (const slug of healthSlugs) {
      expect(getGuideBySlug(slug)?.vetContext, slug).toBe(true);
    }
  });

  it('nenhum guia tem parágrafo curto demais (placeholder)', () => {
    for (const g of getAllGuides()) {
      for (const b of g.blocks) {
        if (b.type === 'p') {
          expect(b.text.trim().length, `${g.slug}: "${b.text.slice(0, 40)}..."`).toBeGreaterThan(60);
        }
      }
    }
  });
});

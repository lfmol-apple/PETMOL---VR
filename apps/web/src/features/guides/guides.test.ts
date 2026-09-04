import { describe, expect, it } from 'vitest';
import {
  GUIDE_CATEGORIES,
  getAllGuides,
  getBuyingGuides,
  getFeaturedGuides,
  getGuideBySlug,
  getRelatedGuides,
  getToolGuides,
  validateGuides,
} from './index';

const SPEC_TOPICS = [
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

  it('publica exatamente os 15 guias da especificação', () => {
    const slugs = getAllGuides().map((g) => g.slug).sort();
    expect(slugs).toEqual([...SPEC_TOPICS].sort());
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
        if ('items' in b) chars += b.items.join(' ').length;
        if (b.type === 'table') chars += [...b.headers, ...b.rows.flat()].join(' ').length;
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
        if ('items' in b) parts.push(...b.items);
        if (b.type === 'table') {
          parts.push(...b.headers, ...b.rows.flat(), b.caption ?? '');
        }
        if (b.type === 'h2') parts.push(b.text);
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

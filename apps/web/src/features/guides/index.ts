/**
 * Ponto único de acesso ao conteúdo dos Guias PETMOL.
 *
 * O sitemap, o índice /guias, cada /guias/[slug], os JSON-LD e o linking
 * interno são derivados daqui — nunca de uma lista mantida à mão em vários
 * lugares.
 */
import { alimentacaoGuides } from './data/alimentacao';
import { comprasInteligentesGuides } from './data/compras-inteligentes';
import { passeioTransporteGuides } from './data/passeio-transporte';
import { casaConfortoGuides } from './data/casa-conforto';
import { higieneGuides } from './data/higiene';
import { primeirosCuidadosGuides } from './data/primeiros-cuidados';
import { gatosGuides } from './data/gatos';
import { GUIDE_CATEGORIES, GUIDE_CATEGORY_ORDER, getGuideCategory } from './categories';
import type { Guide, GuideCategoryId } from './types';

export type { Guide, GuideBlock, GuideCategory, GuideCategoryId, GuideToolId, GuideSource, GuideFaqItem } from './types';
export { GUIDE_CATEGORIES, GUIDE_CATEGORY_ORDER, getGuideCategory };

const ALL: Guide[] = [
  ...alimentacaoGuides,
  ...comprasInteligentesGuides,
  ...passeioTransporteGuides,
  ...casaConfortoGuides,
  ...higieneGuides,
  ...primeirosCuidadosGuides,
  ...gatosGuides,
];

// "Comece por aqui" no índice /guias — pontos de entrada fortes, um de cada
// tema, para o visitante perceber em segundos a amplitude editorial.
const FEATURED_SLUGS = [
  'como-escolher-racao-ideal-cachorro',
  'coleira-ou-peitoral-qual-escolher',
  'checklist-adotou-cachorro',
  'como-escolher-tapete-higienico-cachorro',
  'como-escolher-tamanho-cama-cachorro',
  'como-escolher-areia-higienica-para-gatos',
];

// "Guias de compra" — os guias cujo trabalho é dar critério para escolher
// um produto ("o que observar antes de comprar"). Ordem editorial fixa.
const BUYING_GUIDE_SLUGS = [
  'como-escolher-racao-ideal-cachorro',
  'coleira-ou-peitoral-qual-escolher',
  'como-escolher-guia-para-cachorro',
  'como-escolher-tapete-higienico-cachorro',
  'como-escolher-tamanho-cama-cachorro',
  'como-escolher-comedouro-cachorro',
  'brinquedos-para-caes-como-escolher-com-seguranca',
  'como-escolher-caixa-transporte-cachorro',
  'bebedouro-automatico-cachorro-vale-a-pena',
  'como-escolher-areia-higienica-para-gatos',
  'como-escolher-arranhador-para-gatos',
];

/**
 * "Assuntos mais procurados" — atalhos para destinos REAIS (guia, categoria
 * ou ferramenta). Nada de link morto.
 */
export interface PopularTopic {
  label: string;
  href: string;
}
const POPULAR_TOPICS: PopularTopic[] = [
  { label: 'Ração', href: '/guias/como-escolher-racao-ideal-cachorro' },
  { label: 'Quanto o cão come por dia', href: '/guias/quanto-meu-cachorro-deve-comer-por-dia' },
  { label: 'Tapete higiênico', href: '/guias/como-escolher-tapete-higienico-cachorro' },
  { label: 'Coleira ou peitoral', href: '/guias/coleira-ou-peitoral-qual-escolher' },
  { label: 'Transporte no carro', href: '/guias/kit-viajar-de-carro-com-cachorro' },
  { label: 'Areia para gatos', href: '/guias/como-escolher-areia-higienica-para-gatos' },
  { label: 'Adotei um pet', href: '/guias/checklist-adotou-cachorro' },
  { label: 'Calculadoras', href: '/guias#ferramentas' },
];

export function getPopularTopics(): PopularTopic[] {
  return POPULAR_TOPICS;
}

/** Ordena por data de atualização (mais recente primeiro), com desempate estável por slug. */
function byUpdatedDesc(a: Guide, b: Guide): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.slug.localeCompare(b.slug);
}

export const GUIDES: readonly Guide[] = Object.freeze([...ALL]);

export function getAllGuides(): Guide[] {
  return [...ALL].sort(byUpdatedDesc);
}

export function getGuideBySlug(slug: string): Guide | undefined {
  return ALL.find((g) => g.slug === slug);
}

export function getGuidesByCategory(category: GuideCategoryId): Guide[] {
  return ALL.filter((g) => g.category === category).sort(byUpdatedDesc);
}

export function getFeaturedGuides(): Guide[] {
  return FEATURED_SLUGS.map((slug) => getGuideBySlug(slug)).filter((g): g is Guide => Boolean(g));
}

/** Guias de compra — dão critério para escolher um produto. Seção própria no índice. */
export function getBuyingGuides(): Guide[] {
  return BUYING_GUIDE_SLUGS.map((slug) => getGuideBySlug(slug)).filter((g): g is Guide => Boolean(g));
}

export function getRecentGuides(limit = 6): Guide[] {
  return getAllGuides().slice(0, limit);
}

/** Guias que contêm uma calculadora — usados na seção "Ferramentas" do índice. */
export function getToolGuides(): Guide[] {
  return ALL.filter((g) => Boolean(g.tool)).sort(byUpdatedDesc);
}

export type { GuideSearchRecord, GuideSearchHit } from './search';
export { searchInIndex } from './search';
import { searchInIndex as _searchInIndex, type GuideSearchRecord } from './search';

/**
 * Índice leve para a busca editorial no cliente — só os campos necessários,
 * sem o corpo dos guias. É o que o índice /guias passa para o Client
 * Component de busca (evita mandar todo o conteúdo para o navegador).
 */
export function buildSearchIndex(): GuideSearchRecord[] {
  return getAllGuides().map((g) => ({
    slug: g.slug,
    title: g.title,
    description: g.description,
    categoryId: g.category,
    categoryLabel: GUIDE_CATEGORIES[g.category]?.label ?? '',
    hasTool: Boolean(g.tool),
    terms: [g.summary, ...(g.searchTerms ?? [])],
  }));
}

/** Busca editorial no servidor (testes, uso interno). */
export function searchGuides(rawQuery: string, limit = 8) {
  return _searchInIndex(buildSearchIndex(), rawQuery, limit);
}

export function getRelatedGuides(slug: string): Guide[] {
  const guide = getGuideBySlug(slug);
  if (!guide) return [];
  const related = guide.relatedSlugs
    .map((s) => getGuideBySlug(s))
    .filter((g): g is Guide => g !== undefined && g.slug !== slug);
  if (related.length >= 3) return related.slice(0, 3);
  // Completa com outros da mesma categoria, sem repetir.
  const seen = new Set([slug, ...related.map((g) => g.slug)]);
  for (const g of getGuidesByCategory(guide.category)) {
    if (related.length >= 3) break;
    if (!seen.has(g.slug)) {
      related.push(g);
      seen.add(g.slug);
    }
  }
  return related.slice(0, 3);
}

export function getCategoriesWithGuides(): { category: (typeof GUIDE_CATEGORIES)[GuideCategoryId]; guides: Guide[] }[] {
  return GUIDE_CATEGORY_ORDER.map((id) => ({
    category: GUIDE_CATEGORIES[id],
    guides: getGuidesByCategory(id),
  })).filter((section) => section.guides.length > 0);
}

/**
 * Validação estrutural do conteúdo — roda nos testes, não em produção.
 * Garante que slugs são únicos, relatedSlugs apontam para guias reais,
 * categorias existem e nenhum guia está sem corpo.
 */
export function validateGuides(): string[] {
  const errors: string[] = [];
  const slugs = new Set<string>();
  for (const g of ALL) {
    if (slugs.has(g.slug)) errors.push(`slug duplicado: ${g.slug}`);
    slugs.add(g.slug);
    if (!GUIDE_CATEGORIES[g.category]) errors.push(`${g.slug}: categoria inexistente "${g.category}"`);
    if (g.blocks.length < 4) errors.push(`${g.slug}: corpo curto demais (${g.blocks.length} blocos)`);
    if (!g.description || g.description.length < 40) errors.push(`${g.slug}: description ausente ou curta`);
    if (!g.summary || g.summary.length < 40) errors.push(`${g.slug}: summary ausente ou curto`);
    if (g.tool) {
      const hasToolBlock = g.blocks.some((b) => b.type === 'tool' && b.tool === g.tool);
      if (!hasToolBlock) errors.push(`${g.slug}: tool "${g.tool}" sem bloco tool correspondente`);
    }
    for (const b of g.blocks) {
      if (b.type === 'tool' && b.tool !== g.tool) {
        errors.push(`${g.slug}: bloco tool "${b.tool}" não bate com guide.tool "${g.tool ?? '(nenhum)'}"`);
      }
      if (b.type === 'h2' && !b.id) errors.push(`${g.slug}: h2 "${b.text}" sem id de âncora`);
    }
  }
  for (const g of ALL) {
    for (const rel of g.relatedSlugs) {
      if (!slugs.has(rel)) errors.push(`${g.slug}: relatedSlug inexistente "${rel}"`);
    }
    for (const b of g.blocks) {
      if (b.type === 'links') {
        if (b.items.length === 0) errors.push(`${g.slug}: bloco links vazio`);
        for (const it of b.items) {
          if (it.slug === g.slug) errors.push(`${g.slug}: bloco links aponta para o próprio guia`);
          if (!slugs.has(it.slug)) errors.push(`${g.slug}: bloco links aponta para slug inexistente "${it.slug}"`);
        }
      }
    }
    for (const src of g.sources ?? []) {
      if (!/^https:\/\//.test(src.url)) errors.push(`${g.slug}: fonte "${src.label}" com URL não-https`);
    }
  }
  return errors;
}

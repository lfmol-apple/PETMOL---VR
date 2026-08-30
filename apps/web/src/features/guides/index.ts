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
];

// Ordem editorial do índice /guias — os que resolvem dúvidas de compra
// primeiro, com as ferramentas em destaque.
const FEATURED_SLUGS = [
  'como-escolher-racao-ideal-cachorro',
  'quanto-tempo-dura-saco-de-racao',
  'quanto-custa-alimentar-cachorro-por-mes',
  'coleira-ou-peitoral-qual-escolher',
];

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

export function getRecentGuides(limit = 6): Guide[] {
  return getAllGuides().slice(0, limit);
}

/** Guias que contêm uma calculadora — usados na seção "Ferramentas" do índice. */
export function getToolGuides(): Guide[] {
  return ALL.filter((g) => Boolean(g.tool)).sort(byUpdatedDesc);
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
    for (const src of g.sources ?? []) {
      if (!/^https:\/\//.test(src.url)) errors.push(`${g.slug}: fonte "${src.label}" com URL não-https`);
    }
  }
  return errors;
}

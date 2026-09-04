/**
 * Busca editorial — só sobre o índice leve, SEM importar o conteúdo dos
 * guias. Isso permite o Client Component de busca importar daqui sem
 * arrastar todo o corpo dos guias para o bundle do navegador.
 *
 * O índice em si (`buildSearchIndex`) é montado no servidor, em `index.ts`,
 * e passado como prop para o componente.
 */
import type { GuideCategoryId } from './types';

export interface GuideSearchRecord {
  slug: string;
  title: string;
  description: string;
  categoryId: GuideCategoryId;
  categoryLabel: string;
  hasTool: boolean;
  terms: string[];
}

export interface GuideSearchHit {
  slug: string;
  title: string;
  description: string;
  categoryId: GuideCategoryId;
  hasTool: boolean;
}

export function searchInIndex(
  records: GuideSearchRecord[],
  rawQuery: string,
  limit = 8,
): GuideSearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (q.length < 2) return [];
  const terms = q.split(/\s+/).filter(Boolean);
  return records
    .map((r) => {
      const title = r.title.toLowerCase();
      const rest = [r.description, r.categoryLabel, ...r.terms].join(' ').toLowerCase();
      let score = 0;
      for (const t of terms) {
        if (title.includes(t)) score += 3;
        else if (rest.includes(t)) score += 1;
      }
      return { r, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ r }) => ({
      slug: r.slug,
      title: r.title,
      description: r.description,
      categoryId: r.categoryId,
      hasTool: r.hasTool,
    }));
}

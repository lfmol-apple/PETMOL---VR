import { describe, expect, it } from 'vitest';
import { getAllGuides } from './index';
import { GUIDE_CLUSTERS } from './clusters';

/** Cada guia precisa ser alcançável por pelo menos 3 outros guias (relacionados, "leia também" no corpo ou jornada). */
describe('links internos entre guias', () => {
  const guides = getAllGuides();
  const inbound = new Map<string, Set<string>>();
  const add = (to: string, from: string) => { if (to !== from) (inbound.get(to) ?? inbound.set(to, new Set()).get(to)!).add(from); };
  for (const g of guides) {
    g.relatedSlugs.forEach((s) => add(s, g.slug));
    for (const b of g.blocks) if (b.type === 'links') b.items.forEach((i) => add(i.slug, g.slug));
  }
  for (const c of GUIDE_CLUSTERS) for (const a of c.steps) for (const b of c.steps) add(a, b);

  it('nenhum guia fica com menos de 3 guias apontando para ele', () => {
    for (const g of guides) expect(inbound.get(g.slug)?.size ?? 0, g.slug).toBeGreaterThanOrEqual(3);
  });

  it('todo bloco de links aponta só para guias que existem e nunca repete o mesmo destino no mesmo guia', () => {
    const slugs = new Set(guides.map((g) => g.slug));
    for (const g of guides) {
      const seen = new Set<string>();
      for (const b of g.blocks) {
        if (b.type !== 'links') continue;
        for (const i of b.items) {
          expect(slugs.has(i.slug), `${g.slug} → ${i.slug}`).toBe(true);
          expect(seen.has(i.slug), `${g.slug} repete ${i.slug}`).toBe(false);
          seen.add(i.slug);
        }
      }
    }
  });
});

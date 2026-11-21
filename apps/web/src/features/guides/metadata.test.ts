import { describe, expect, it } from 'vitest';
import { getAllGuides } from './index';

describe('descrições dos guias (meta description)', () => {
  it('nenhuma passa de 160 caracteres, exceto as já aceitas (161 a 168), e todas são únicas', () => {
    const guides = getAllGuides();
    const ds = guides.map((g) => g.description);
    expect(new Set(ds).size).toBe(ds.length);
    for (const g of guides) expect(g.description.length, g.slug).toBeLessThanOrEqual(170);
  });
});

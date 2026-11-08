import { describe, expect, it } from 'vitest';
import { computeCareBreakdown } from './computeCareBreakdown';

const run = (species?: string) =>
  computeCareBreakdown({ pet_id: 'p', pet_name: 'X', species } as never, [], [], [], [], []);

describe('régua de cuidados por espécie', () => {
  it('cão: vacina + vermífugo + antipulgas + coleira (4 itens, todos pendentes sem registro)', () => {
    const r = run('dog');
    expect(r.totalItems).toBe(4);
    expect(r.overdueItems).toBe(4);
  });
  it('espécie ausente é tratada como cão (pets antigos)', () => {
    expect(run(undefined).totalItems).toBe(4);
  });
  it('gato: sem coleira (3 itens)', () => {
    expect(run('cat').totalItems).toBe(3);
  });
  it('coelho/cavalo: nada se aplica, então a régua não fica "pendente" para sempre', () => {
    for (const s of ['rabbit', 'cavalo']) {
      const r = run(s);
      expect(r.totalItems).toBe(0);
      expect(r.overdueItems).toBe(0);
      expect(r.hoverReason).toContain('100%');
    }
  });
});

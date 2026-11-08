import { describe, expect, it } from 'vitest';
import { activePromos, promoChip, STORE_PROMOS, type StorePromo } from './storePromos';

describe('radar de promoções', () => {
  it('8/11: Shopee e Mercado Livre mostram "11.11 em 3 dias"; Cobasi, Petz e Amazon nada (sem campanha verificada)', () => {
    expect(promoChip('2026-11-08', 'shopee')?.label).toBe('11.11 em 3 dias');
    expect(promoChip('2026-11-08', 'mercadolivre')?.label).toBe('11.11 em 3 dias');
    for (const m of ['cobasi', 'petz', 'amazon'] as const) expect(promoChip('2026-11-08', m)).toBeNull();
  });
  it('no dia 11 o chip vira "11.11 hoje" e depois some', () => {
    expect(promoChip('2026-11-10', 'shopee')?.label).toBe('11.11 amanhã');
    const hoje = promoChip('2026-11-11', 'shopee')!;
    expect(hoje.label).toBe('11.11 hoje');
    expect(hoje.phase).toBe('live');
    expect(promoChip('2026-11-12', 'shopee')).toBeNull();
  });
  it('Black Week, Black Friday e Cyber Monday valem para todas as lojas', () => {
    for (const m of ['petz', 'mercadolivre', 'cobasi', 'amazon', 'shopee'] as const) {
      expect(promoChip('2026-11-23', m)?.label).toBe('Black Week no ar');
      expect(promoChip('2026-11-27', m)?.label).toBe('Black Friday no ar');
      expect(promoChip('2026-11-30', m)?.label).toBe('Cyber Monday hoje');
    }
  });
  it('o que está no ar vence o que está por vir', () => {
    const promos: StorePromo[] = [
      { id: 'a', merchants: ['shopee'], name: 'A', detail: '', startsOn: '2026-11-05', endsOn: '2026-11-12', source: 'x' },
      { id: 'b', merchants: ['shopee'], name: 'B', detail: '', startsOn: '2026-11-10', endsOn: '2026-11-10', source: 'x' },
    ];
    expect(promoChip('2026-11-08', 'shopee', promos)?.promoId).toBe('a');
    expect(activePromos('2026-11-08', 'shopee', promos).map((p) => p.promo.id)).toEqual(['a', 'b']);
  });
  it('toda campanha cadastrada tem fonte e datas coerentes (regra: só promoção verificada)', () => {
    for (const p of STORE_PROMOS) {
      expect(p.source).toMatch(/^https:\/\//);
      expect(p.endsOn >= p.startsOn).toBe(true);
      expect(p.merchants.length).toBeGreaterThan(0);
    }
  });
});

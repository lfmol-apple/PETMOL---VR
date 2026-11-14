import { describe, expect, it } from 'vitest';
import { AGE_BANDS, WEIGHT_BANDS, bandKey, pickBand, setQuick, toggleIn, QUICK_BLOCK_ID, type Band } from './quickFilters';
import { emptyFilter, uid, type FilterState } from './filters';

const inBand = (b: Band, x: number) => b.lo <= x && x <= b.hi;       // a MESMA regra do motor: between inclusivo nos dois lados

describe('faixas de idade e de peso: cada valor pertence a UMA só faixa (sem sobreposição e sem lacuna)', () => {
  it('idade em meses completos: 0 a 600, cada mês em exatamente uma faixa', () => {
    for (let m = 0; m <= 600; m++) expect(AGE_BANDS.filter((b) => inBand(b, m)).map((b) => b.key), `mês ${m}`).toHaveLength(1);
    expect(AGE_BANDS.map((b) => [b.lo, b.hi])).toEqual([[0, 11], [12, 35], [36, 95], [96, 600]]);
    AGE_BANDS.slice(1).forEach((b, i) => expect(b.lo).toBe(AGE_BANDS[i].hi + 1));                    // emendadas: 11|12, 35|36, 95|96
  });

  it('peso com 2 casas (0,01 kg): de 0,01 a 500 kg, cada valor em exatamente uma faixa', () => {
    for (let c = 1; c <= 50000; c++) {
      const kg = Math.round(c) / 100;
      expect(WEIGHT_BANDS.filter((b) => inBand(b, kg)).length, `${kg} kg`).toBe(1);
    }
    expect(WEIGHT_BANDS.map((b) => [b.lo, b.hi])).toEqual([[0, 9.99], [10, 24.99], [25, 500]]);
    for (const [kg, key] of [[9.99, 'pequeno'], [10, 'medio'], [24.99, 'medio'], [25, 'grande']] as const) expect(WEIGHT_BANDS.find((b) => inBand(b, kg))!.key).toBe(key);
  });

  it('os rótulos explicam os limites sem ambiguidade', () => {
    expect(AGE_BANDS.map((b) => b.hint)).toEqual(['menos de 1 ano', '1 a menos de 3 anos', '3 a menos de 8 anos', '8 anos ou mais']);
    expect(WEIGHT_BANDS.map((b) => b.hint)).toEqual(['menos de 10 kg', '10 a menos de 25 kg', '25 kg ou mais']);
  });

  it('escolher uma faixa grava o intervalo exato e escolher a mesma de novo limpa', () => {
    let s = pickBand(emptyFilter(), 'pet_age_months', AGE_BANDS[1]);
    expect(s.blocks[0].conds[0]).toMatchObject({ field: 'pet_age_months', op: 'between', value: ['12', '35'] });
    expect(bandKey(s, 'pet_age_months', AGE_BANDS)).toBe('jovem');
    s = pickBand(s, 'pet_age_months', AGE_BANDS[2]);
    expect(bandKey(s, 'pet_age_months', AGE_BANDS)).toBe('adulto');
    s = pickBand(s, 'pet_age_months', AGE_BANDS[2]);
    expect(s.blocks).toHaveLength(0);
  });
});

describe('o bloco rápido não muda a combinação que o usuário já tinha', () => {
  it('com blocos avançados combinados por OU, criar o bloco rápido NÃO troca o OU por E', () => {
    const adv: FilterState = { op: 'or', blocks: [{ id: uid('b'), op: 'and', petScope: 'any', conds: [] }, { id: uid('b'), op: 'and', petScope: 'any', conds: [] }] };
    const s = setQuick(adv, 'pet_sex', { op: 'eq', value: 'male', ack: false });
    expect(s.op).toBe('or');
    expect(s.blocks[0].id).toBe(QUICK_BLOCK_ID);
  });
  it('sem nenhum bloco, o primeiro chip cria o bloco com E e o mesmo pet', () => {
    const s = toggleIn(emptyFilter(), 'pet_species', 'cat');
    expect(s).toMatchObject({ op: 'and', blocks: [{ id: QUICK_BLOCK_ID, op: 'and', petScope: 'same' }] });
  });
});

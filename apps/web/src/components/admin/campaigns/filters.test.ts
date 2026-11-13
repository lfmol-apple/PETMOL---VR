/* eslint-disable @typescript-eslint/no-explicit-any -- inspeção livre do JSON montado */
import { describe, expect, it } from 'vitest';
import fixture from './fields.fixture.json';
import type { FieldInfo } from './api';
import { GROUPS, buildFilter, condError, defaultCond, describeCond, kindOf, uid, type FilterState } from './filters';

const FIELDS = fixture.fields as unknown as FieldInfo[];
const f = (name: string) => FIELDS.find((x) => x.field === name)!;

describe('catálogo de filtros', () => {
  it('são exatamente os 21 filtros da Etapa 2, sem campos inexistentes', () => {
    expect(FIELDS).toHaveLength(21);
    const names = FIELDS.map((x) => x.field).join(' ');
    for (const proibido of ['tutor_sex', 'sexo_tutor', 'litter', 'areia', 'days_remaining', 'dias_restantes']) expect(names).not.toContain(proibido);
  });
  it('todo filtro cai em um dos grupos da tela (tutor, pet, localização, alimentação, cuidados, atividade)', () => {
    const keys = GROUPS.map((g) => g.key);
    for (const x of FIELDS) expect(keys).toContain(x.group);
    expect(GROUPS.map((g) => g.title)).toEqual(['Tutor', 'Pet', 'Localização', 'Alimentação', 'Cuidados', 'Atividade']);
  });
  it('todo filtro tem um editor e uma condição padrão válida de montar', () => {
    for (const x of FIELDS) { expect(kindOf(x)).toBeTruthy(); expect(defaultCond(x).field).toBe(x.field); }
  });
  it('localização aproximada exige confirmação explícita', () => {
    for (const name of ['location_gps_radius', 'location_geoip_region']) {
      expect(f(name).approximate).toBe(true);
      const c = { ...defaultCond(f(name)) };
      c.value = name === 'location_gps_radius' ? { lat: '-23.5', lng: '-46.6', km: '10' } : ['São Paulo'];
      expect(condError(c, f(name))).toMatch(/aproximada/);
      expect(condError({ ...c, ack: true }, f(name))).toBeNull();
    }
  });
});

describe('buildFilter', () => {
  const state = (blocks: FilterState['blocks'], op: 'and' | 'or' = 'and'): FilterState => ({ op, blocks });
  it('sem filtros = grupo raiz vazio (todos os alcançáveis)', () => {
    const b = buildFilter(state([]), FIELDS);
    expect(b.ready).toBe(true);
    expect(b.filter).toEqual({ version: 1, root: { kind: 'group', op: 'and', items: [] } });
  });
  it('gato + fêmea + marca, escopo "mesmo pet", com E/OU entre blocos', () => {
    const cat = { ...defaultCond(f('pet_species')), value: ['cat'] };
    const fem = { ...defaultCond(f('pet_sex')), value: 'female' };
    const marca = { ...defaultCond(f('feeding_brand_contains')), value: ' Golden ' };
    const sp = { ...defaultCond(f('location_registered_state')), value: ['SP', ' RJ'] };
    const b = buildFilter(state([
      { id: uid('b'), op: 'and', petScope: 'same', conds: [cat, fem, marca] },
      { id: uid('b'), op: 'or', petScope: 'any', conds: [sp] },
    ], 'or'), FIELDS);
    expect(b.ready).toBe(true);
    const root = b.filter.root as any;
    expect(root.op).toBe('or');
    expect(root.items[0]).toMatchObject({ kind: 'group', op: 'and', pet_scope: 'same' });
    expect(root.items[0].items.map((r: any) => [r.field, r.op, r.value])).toEqual([['pet_species', 'in', ['cat']], ['pet_sex', 'eq', 'female'], ['feeding_brand_contains', 'contains', 'Golden']]);
    expect(root.items[1].pet_scope).toBeUndefined();            // bloco só de tutor não leva escopo de pet
    expect(root.items[1].items[0].value).toEqual(['SP', 'RJ']);
  });
  it('condição incompleta bloqueia a consulta e diz o que falta', () => {
    const b = buildFilter(state([{ id: 'x', op: 'and', petScope: 'any', conds: [defaultCond(f('pet_species'))] }]), FIELDS);
    expect(b.ready).toBe(false);
    expect(b.errors[0].text).toMatch(/ao menos um/);
  });
  it('números e datas: intervalo invertido é recusado', () => {
    const w = { ...defaultCond(f('pet_weight_kg')), op: 'between', value: ['20', '5'] };
    expect(condError(w, f('pet_weight_kg'))).toMatch(/mínimo é maior/);
    const d = { ...defaultCond(f('tutor_created_at')), op: 'between', value: ['2026-05-02', '2026-05-01'] };
    expect(condError(d, f('tutor_created_at'))).toMatch(/início vem depois/);
  });
  it('raio fora do intervalo é recusado', () => {
    const c = { ...defaultCond(f('location_gps_radius')), value: { lat: '1', lng: '1', km: '900' }, ack: true };
    expect(condError(c, f('location_gps_radius'))).toMatch(/1 a 500/);
  });
  it('descreve a condição em português', () => {
    const c = { ...defaultCond(f('pet_species')), value: ['cat', 'dog'] };
    expect(describeCond(c, f('pet_species'))).toBe('Espécie: Gato ou Cão');
  });
});

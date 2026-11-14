import { describe, expect, it } from 'vitest';
import fixture from './fields.fixture';
import type { FieldInfo } from './api';
import { chipLocks, disjoint, findConflicts } from './consistency';
import { uid, type Block, type Cond, type FilterState, type Op, type PetScope } from './filters';
import { QUICK_BLOCK_ID } from './quickFilters';

const FIELDS = fixture.fields as unknown as FieldInfo[];
const c = (field: string, op: string, value: unknown): Cond => ({ id: uid('c'), field, op, value, ack: false });
const blk = (conds: Cond[], op: Op = 'and', petScope: PetScope = 'any', id = uid('b')): Block => ({ id, op, petScope, conds });
const st = (blocks: Block[], op: Op = 'and'): FilterState => ({ op, blocks });
const conflicts = (s: FilterState) => findConflicts(s, FIELDS).length;

describe('disjoint: condições do mesmo campo que nunca valem juntas', () => {
  it('conjuntos, valores únicos e intervalos', () => {
    expect(disjoint(c('pet_species', 'in', ['cat']), c('pet_species', 'in', ['dog']))).toBe(true);
    expect(disjoint(c('pet_species', 'in', ['cat', 'dog']), c('pet_species', 'in', ['dog']))).toBe(false);
    expect(disjoint(c('pet_sex', 'eq', 'male'), c('pet_sex', 'eq', 'female'))).toBe(true);
    expect(disjoint(c('tutor_activity', 'eq', 'last_7d'), c('tutor_activity', 'eq', 'over_30d'))).toBe(true);
    expect(disjoint(c('pet_age_months', 'between', ['0', '11']), c('pet_age_months', 'between', ['12', '35']))).toBe(true);
    expect(disjoint(c('pet_age_months', 'between', ['0', '12']), c('pet_age_months', 'between', ['12', '35']))).toBe(false);   // 12 está nos dois
    expect(disjoint(c('pet_weight_kg', 'gte', '25'), c('pet_weight_kg', 'lte', '9.99'))).toBe(true);
    expect(disjoint(c('pet_weight_kg', 'gte', '10'), c('pet_weight_kg', 'lte', '24.99'))).toBe(false);
    expect(disjoint(c('location_registered_state', 'in', ['sp', 'rj']), c('location_registered_state', 'in', ['MG']))).toBe(true);
    expect(disjoint(c('pet_species', 'in', ['cat']), c('pet_sex', 'eq', 'male'))).toBe(false);                                   // campos diferentes
    expect(disjoint(c('pet_age_months', 'between', ['', '']), c('pet_age_months', 'eq', '5'))).toBe(false);                      // incompleto não é contradição
  });
});

describe('findConflicts: contradição só quando as condições têm de valer JUNTAS', () => {
  it('mesmo bloco E: gato E cão no MESMO pet = contradição; em "algum pet" não (pets diferentes)', () => {
    expect(conflicts(st([blk([c('pet_species', 'in', ['cat']), c('pet_species', 'in', ['dog'])], 'and', 'same')]))).toBe(1);
    expect(conflicts(st([blk([c('pet_species', 'in', ['cat']), c('pet_species', 'in', ['dog'])], 'and', 'all')]))).toBe(1);
    expect(conflicts(st([blk([c('pet_species', 'in', ['cat']), c('pet_species', 'in', ['dog'])], 'and', 'any')]))).toBe(0);   // tutor com um gato E um cão
  });
  it('mesmo bloco OU: nunca é contradição (basta uma)', () => {
    expect(conflicts(st([blk([c('pet_sex', 'eq', 'male'), c('pet_sex', 'eq', 'female')], 'or', 'same')]))).toBe(0);
  });
  it('entre blocos com E: só contradiz quando algum lado exige "todos os pets"', () => {
    const gato = (s: PetScope) => blk([c('pet_species', 'in', ['cat'])], 'and', s);
    const cao = (s: PetScope) => blk([c('pet_species', 'in', ['dog'])], 'and', s);
    expect(conflicts(st([gato('same'), cao('same')]))).toBe(0);
    expect(conflicts(st([gato('any'), cao('any')]))).toBe(0);
    expect(conflicts(st([gato('all'), cao('same')]))).toBe(1);
    expect(conflicts(st([gato('same'), cao('all')]))).toBe(1);
    expect(conflicts(st([gato('all'), cao('all')]))).toBe(1);
  });
  it('entre blocos com OU: nunca é contradição', () => {
    expect(conflicts(st([blk([c('pet_species', 'in', ['cat'])], 'and', 'all'), blk([c('pet_species', 'in', ['dog'])], 'and', 'all')], 'or'))).toBe(0);
    expect(conflicts(st([blk([c('tutor_activity', 'eq', 'last_7d')]), blk([c('tutor_activity', 'eq', 'over_30d')])], 'or'))).toBe(0);
  });
  it('campos do tutor valem para a mesma pessoa em qualquer bloco E', () => {
    expect(conflicts(st([blk([c('tutor_activity', 'eq', 'last_7d')]), blk([c('tutor_activity', 'eq', 'over_30d')])]))).toBe(1);
    expect(conflicts(st([blk([c('tutor_pet_count', 'gte', '5')]), blk([c('tutor_pet_count', 'lte', '2')])]))).toBe(1);
    expect(conflicts(st([blk([c('platform', 'in', ['ios'])]), blk([c('platform', 'in', ['android'])])]))).toBe(0);              // pode ter os dois aparelhos
  });
  it('um bloco com OU não entra nas restrições E entre blocos', () => {
    expect(conflicts(st([blk([c('tutor_activity', 'eq', 'last_7d')]), blk([c('tutor_activity', 'eq', 'over_30d'), c('platform', 'in', ['ios'])], 'or')]))).toBe(0);
  });
  it('faixas de idade vizinhas no mesmo pet se contradizem; sobrepostas não', () => {
    expect(conflicts(st([blk([c('pet_age_months', 'between', ['0', '11']), c('pet_age_months', 'between', ['12', '35'])], 'and', 'same')]))).toBe(1);
    expect(conflicts(st([blk([c('pet_age_months', 'between', ['0', '12']), c('pet_age_months', 'between', ['12', '35'])], 'and', 'same')]))).toBe(0);
  });
  it('a mensagem diz onde estão (atalhos / Bloco N) e se é pet ou tutor', () => {
    const s = st([blk([c('pet_sex', 'eq', 'male')], 'and', 'same', QUICK_BLOCK_ID), blk([c('pet_sex', 'eq', 'female')], 'and', 'all')]);
    const [m] = findConflicts(s, FIELDS);
    expect(m.text).toMatch(/atalhos/); expect(m.text).toMatch(/Bloco 2/); expect(m.text).toMatch(/nenhum pet/);
  });
});

describe('chipLocks: os atalhos nunca contradizem o que está nos filtros avançados', () => {
  const quick = (conds: Cond[], op: Op = 'and', sc: PetScope = 'same') => blk(conds, op, sc, QUICK_BLOCK_ID);
  it('sem blocos ou só com o bloco rápido: tudo livre', () => {
    expect(chipLocks(st([])).all).toBeNull();
    expect(chipLocks(st([quick([c('pet_species', 'in', ['cat'])])])).all).toBeNull();
  });
  it('OU entre blocos trava tudo; E libera', () => {
    const b = [quick([c('pet_species', 'in', ['cat'])]), blk([c('pet_sex', 'eq', 'male')])];
    expect(chipLocks(st(b, 'or')).all).toMatch(/OU/);
    expect(chipLocks(st(b, 'and')).all).toBeNull();
  });
  it('bloco rápido alterado (OU ou "algum pet") trava tudo', () => {
    expect(chipLocks(st([quick([c('pet_species', 'in', ['cat'])], 'or')])).all).toMatch(/alterado/);
    expect(chipLocks(st([quick([c('pet_species', 'in', ['cat'])], 'and', 'any')])).all).toMatch(/alterado/);
  });
  it('campo que também está num bloco avançado trava só aquele atalho e diz qual bloco', () => {
    const l = chipLocks(st([quick([c('pet_sex', 'eq', 'male')]), blk([c('pet_species', 'in', ['dog'])])]));
    expect(l.all).toBeNull();
    expect(l.byField.get('pet_species')).toMatch(/Bloco 2/);
    expect(l.byField.has('pet_sex')).toBe(false);
  });
});

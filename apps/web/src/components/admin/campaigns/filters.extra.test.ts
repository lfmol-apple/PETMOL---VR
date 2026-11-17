/* eslint-disable @typescript-eslint/no-explicit-any -- inspeção livre do JSON montado */
import { describe, expect, it } from 'vitest';
import fixture from './fields.fixture';
import type { FieldInfo } from './api';
import { buildFilter, conditionCount, describeStoredFilter, filterToState, uid, type FilterState } from './filters';

const FIELDS = fixture.fields as unknown as FieldInfo[];
const cond = (field: string, op: string, value: unknown) => ({ id: uid('c'), field, op, value, ack: false });
const withBlock = (extra?: string[]): FilterState => ({ op: 'and', extra, blocks: [{ id: uid('b'), op: 'and', petScope: 'same', conds: [cond('feeding_registered', 'eq', true), cond('push_received', 'eq', 'never')] }] });

describe('público: filtros + pessoas somadas (OU)', () => {
  it('sem pessoas extras o JSON é o de sempre', () => {
    const b = buildFilter(withBlock(), FIELDS);
    expect(b.ready).toBe(true);
    expect((b.filter.root as any).op).toBe('and');
  });
  it('com extras vira (filtros) OU (tutores escolhidos)', () => {
    const root = buildFilter(withBlock(['t1', 't2']), FIELDS).filter.root as any;
    expect(root.op).toBe('or');
    expect(root.items[0].items[0].items.map((r: any) => r.field)).toEqual(['feeding_registered', 'push_received']);
    expect(root.items[1].items[0]).toMatchObject({ field: 'tutor_selected', op: 'in', value: ['t1', 't2'] });
  });
  it('sem filtro nenhum, só as pessoas escolhidas (não "todos")', () => {
    const root = buildFilter({ op: 'and', blocks: [], extra: ['t1'] }, FIELDS).filter.root as any;
    expect(root.op).toBe('and');
    expect(root.items).toHaveLength(1);
    expect(root.items[0]).toMatchObject({ field: 'tutor_selected', value: ['t1'] });
  });
  it('recusa mais de 200 pessoas somadas e conta o extra como filtro', () => {
    expect(buildFilter({ op: 'and', blocks: [], extra: Array.from({ length: 201 }, (_, i) => `t${i}`) }, FIELDS).ready).toBe(false);
    expect(conditionCount({ op: 'and', blocks: [], extra: ['a'] })).toBe(1);
  });
  it('o lote guardado volta para a tela com as pessoas extras e a descrição as cita', () => {
    const root = buildFilter(withBlock(['t1', 't2']), FIELDS).filter.root as any;
    const st = filterToState({ root }, FIELDS);
    expect(st.extra).toEqual(['t1', 't2']);
    expect(st.blocks[0].conds.map((c) => c.field)).toEqual(['feeding_registered', 'push_received']);
    const lines = describeStoredFilter({ root }, FIELDS);
    expect(lines.join(' ')).toMatch(/Somados ao grupo \(OU\): 2 tutores escolhidos/);
  });
});

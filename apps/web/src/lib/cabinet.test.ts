import { describe, expect, it } from 'vitest';
import { CABINET_DURABLE_DAYS, cabinetSearchTerm, cabinetStatusText, cabinetUrgency, isDurable, sortCabinet } from './cabinet';
import type { CabinetItem } from './cabinetApi';

const it_ = (id: string, days_left: number | null): CabinetItem => ({ id, pet_id: 'p', name: id, category: 'higiene', days_left });

describe('armário: prazo', () => {
  it('classifica a urgência', () => {
    expect(cabinetUrgency({ days_left: null })).toBe('none');
    expect(cabinetUrgency({ days_left: -1 })).toBe('out');
    expect(cabinetUrgency({ days_left: 0 })).toBe('soon');
    expect(cabinetUrgency({ days_left: 7 })).toBe('soon');
    expect(cabinetUrgency({ days_left: 8 })).toBe('ok');
  });
  it('escreve o status em português', () => {
    expect(cabinetStatusText({ days_left: null })).toBeNull();
    expect(cabinetStatusText({ days_left: 0 })).toBe('Acaba hoje');
    expect(cabinetStatusText({ days_left: 1 })).toBe('Acaba em 1 dia');
    expect(cabinetStatusText({ days_left: 5 })).toBe('Acaba em 5 dias');
    expect(cabinetStatusText({ days_left: -1 })).toBe('Acabou há 1 dia');
    expect(cabinetStatusText({ days_left: -3 })).toBe('Acabou há 3 dias');
  });
  it('mostra primeiro o que está acabando e deixa sem prazo por último', () => {
    expect(sortCabinet([it_('a', null), it_('b', 20), it_('c', -2), it_('d', 3)]).map((i) => i.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});

describe('armário: dura muito tempo', () => {
  it('prazo gigante vira "Dura muito tempo", sem urgência e por último na ordem', () => {
    const durable = { ...it_('d', 36000), duration_days: CABINET_DURABLE_DAYS };
    expect(isDurable(CABINET_DURABLE_DAYS)).toBe(true);
    expect(isDurable(730)).toBe(false);
    expect(cabinetStatusText(durable)).toBe('Dura muito tempo');
    expect(cabinetUrgency(durable)).toBe('none');
    expect(sortCabinet([durable, it_('a', 5), it_('b', null)]).map((i) => i.id)).toEqual(['a', 'd', 'b']);
  });
});

describe('armário: termo de busca nas lojas', () => {
  it('usa o nome e acrescenta a marca só quando ela não está no nome', () => {
    expect(cabinetSearchTerm({ name: 'Gel dental canino', brand: null })).toBe('Gel dental canino');
    expect(cabinetSearchTerm({ name: 'Gel dental canino', brand: 'Pet Clean' })).toBe('Pet Clean Gel dental canino');
    expect(cabinetSearchTerm({ name: 'Pet Clean Gel dental', brand: 'pet clean' })).toBe('Pet Clean Gel dental');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildPetStoreTitle,
  buildReorderCards,
  groupReorderCardsByUrgency,
  reorderUrgencyGroupFor,
  REORDER_SOON_THRESHOLD_DAYS,
  type ReorderCard,
} from './petStoreContent';
import type { PetCareReminder } from '@/lib/petCareDomain';

describe('buildPetStoreTitle — "Loja do [nome]" calculado pelo pet selecionado', () => {
  it('pet macho vira "Loja do [nome]"', () => {
    expect(buildPetStoreTitle({ sex: 'male', pet_name: 'Baby' })).toBe('Loja do Baby');
  });

  it('pet fêmea vira "Loja da [nome]"', () => {
    expect(buildPetStoreTitle({ sex: 'female', pet_name: 'Frida' })).toBe('Loja da Frida');
  });

  it('sem sexo definido usa a forma masculina padrão (mesma função de gênero do resto do app)', () => {
    expect(buildPetStoreTitle({ pet_name: 'Rex' })).toBe('Loja do Rex');
  });

  it('sem nome de pet cai no fallback "Loja do Pet"', () => {
    expect(buildPetStoreTitle({ sex: 'male', pet_name: null })).toBe('Loja do Pet');
    expect(buildPetStoreTitle({ sex: 'female', pet_name: undefined })).toBe('Loja do Pet');
    expect(buildPetStoreTitle({ sex: 'male', pet_name: '' })).toBe('Loja do Pet');
    expect(buildPetStoreTitle({ sex: 'male', pet_name: '   ' })).toBe('Loja do Pet');
  });

  it('trocar de pet recalcula o título — nunca fica preso no pet anterior', () => {
    const petA = { sex: 'male' as const, pet_name: 'Baby' };
    const petB = { sex: 'female' as const, pet_name: 'Frida' };
    expect(buildPetStoreTitle(petA)).toBe('Loja do Baby');
    expect(buildPetStoreTitle(petB)).toBe('Loja da Frida');
    expect(buildPetStoreTitle(petA)).not.toBe(buildPetStoreTitle(petB));
  });

  it('nenhum nome de pet fica hardcoded — "Baby" só aparece quando é literalmente o pet_name passado', () => {
    const result = buildPetStoreTitle({ sex: 'male', pet_name: 'Thor' });
    expect(result).not.toMatch(/Baby/);
    expect(result).toBe('Loja do Thor');
  });
});

describe('buildReorderCards — medicação só vira compra com código de barras', () => {
  function reminder(overrides: Partial<PetCareReminder>): PetCareReminder {
    return {
      key: 'r1',
      pet_id: 'pet-1',
      pet_name: 'Baby',
      domain: 'medication',
      label: 'Meloxicam 2mg',
      icon: '💊',
      due_date: '2026-08-24',
      diff: 0,
      status: 'today',
      action_target: 'health/medication',
      source_record_id: 'event-1',
      is_derived: false,
      ...overrides,
    };
  }

  it('remove medicação sem código para não exibir produto/preço inseguro na loja', () => {
    expect(buildReorderCards([reminder({ gtin: undefined })])).toEqual([]);
  });

  it('mantém medicação com código escaneado', () => {
    const cards = buildReorderCards([reminder({ gtin: '7896112410010' })]);
    expect(cards).toHaveLength(1);
    expect(cards[0].gtin).toBe('7896112410010');
    expect(cards[0].label).toBe('Meloxicam 2mg');
  });

  it('carrega o diff (base do agrupamento por urgência da Loja do Pet)', () => {
    const cards = buildReorderCards([reminder({ gtin: '7896112410010', diff: 17 })]);
    expect(cards[0].diff).toBe(17);
  });
});

describe('reorderUrgencyGroupFor — classificação de urgência (só apresentação, sem regra de negócio nova)', () => {
  it('sentinela de "sem prazo" (petisco avulso) vira anytime', () => {
    expect(reorderUrgencyGroupFor(9999)).toBe('anytime');
  });

  it('vencido e hoje contam como soon — são os mais urgentes de todos', () => {
    expect(reorderUrgencyGroupFor(-5)).toBe('soon');
    expect(reorderUrgencyGroupFor(0)).toBe('soon');
  });

  it(`até ${REORDER_SOON_THRESHOLD_DAYS} dias é soon, acima disso é later`, () => {
    expect(reorderUrgencyGroupFor(REORDER_SOON_THRESHOLD_DAYS)).toBe('soon');
    expect(reorderUrgencyGroupFor(REORDER_SOON_THRESHOLD_DAYS + 1)).toBe('later');
  });

  it('bate com o exemplo usado na especificação (17/56 = breve, 77/92 = mais para frente)', () => {
    expect(reorderUrgencyGroupFor(17)).toBe('soon');
    expect(reorderUrgencyGroupFor(56)).toBe('soon');
    expect(reorderUrgencyGroupFor(77)).toBe('later');
    expect(reorderUrgencyGroupFor(92)).toBe('later');
  });
});

describe('groupReorderCardsByUrgency — agrupa e ordena por proximidade dentro do grupo', () => {
  function card(overrides: Partial<ReorderCard>): ReorderCard {
    return {
      id: overrides.id ?? Math.random().toString(36),
      icon: '💊',
      label: overrides.label ?? 'Produto',
      urgencyText: '',
      urgencyTone: 'upcoming',
      searchQuery: 'produto',
      domain: 'parasite',
      diff: 0,
      ...overrides,
    };
  }

  it('separa nos 3 grupos corretamente', () => {
    const grouped = groupReorderCardsByUrgency([
      card({ id: 'a', diff: 9999 }),
      card({ id: 'b', diff: 17 }),
      card({ id: 'c', diff: 92 }),
    ]);
    expect(grouped.anytime.map((c) => c.id)).toEqual(['a']);
    expect(grouped.soon.map((c) => c.id)).toEqual(['b']);
    expect(grouped.later.map((c) => c.id)).toEqual(['c']);
  });

  it('ordena soon e later por proximidade (mais perto primeiro), nunca por ordem de chegada', () => {
    const grouped = groupReorderCardsByUrgency([
      card({ id: 'racao', label: 'Ração', diff: 56 }),
      card({ id: 'nexgard', label: 'NexGard', diff: 17 }),
      card({ id: 'scalibor', label: 'Scalibor', diff: 92 }),
      card({ id: 'drontal', label: 'Drontal', diff: 77 }),
    ]);
    expect(grouped.soon.map((c) => c.id)).toEqual(['nexgard', 'racao']);
    expect(grouped.later.map((c) => c.id)).toEqual(['drontal', 'scalibor']);
  });

  it('grupo vazio vira array vazio, nunca undefined', () => {
    const grouped = groupReorderCardsByUrgency([]);
    expect(grouped).toEqual({ anytime: [], soon: [], later: [] });
  });
});

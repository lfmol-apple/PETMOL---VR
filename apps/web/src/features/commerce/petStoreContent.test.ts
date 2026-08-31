import { describe, expect, it } from 'vitest';
import { buildPetStoreTitle, buildReorderCards } from './petStoreContent';
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
    expect(cards[0].priceLookupAllowed).toBe(true);
  });

  it('mantém coleira sem código como recompra, mas sem lookup de preço comparável', () => {
    const cards = buildReorderCards([reminder({
      domain: 'parasite',
      label: 'Coleira Repelente',
      sublabel: 'Coleira Repelente',
      action_target: 'health/parasites/collar',
      gtin: undefined,
    })]);

    expect(cards).toHaveLength(1);
    expect(cards[0].label).toBe('Coleira Repelente');
    expect(cards[0].priceLookupAllowed).toBe(false);
  });

  it('libera lookup de preço de coleira quando há GTIN escaneado', () => {
    const cards = buildReorderCards([reminder({
      domain: 'parasite',
      label: 'Coleira Scalibor 48cm',
      sublabel: 'Coleira Repelente',
      action_target: 'health/parasites/collar',
      gtin: '7896185957009',
    })]);

    expect(cards).toHaveLength(1);
    expect(cards[0].gtin).toBe('7896185957009');
    expect(cards[0].priceLookupAllowed).toBe(true);
  });
});

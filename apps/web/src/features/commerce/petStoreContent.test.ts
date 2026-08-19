import { describe, expect, it } from 'vitest';
import { buildPetStoreTitle } from './petStoreContent';

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

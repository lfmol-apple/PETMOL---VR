import { describe, expect, it } from 'vitest';
import { petSpeciesEmoji } from './petTaxonomy';

describe('petSpeciesEmoji', () => {
  it('cão/gato e espécie ausente mantêm o comportamento antigo', () => {
    expect(petSpeciesEmoji('dog')).toBe('🐶');
    expect(petSpeciesEmoji('cat')).toBe('🐱');
    expect(petSpeciesEmoji(undefined)).toBe('🐶');
    expect(petSpeciesEmoji('')).toBe('🐶');
  });
  it('outros bichos conhecidos usam o ícone próprio', () => {
    expect(petSpeciesEmoji('rabbit')).toBe('🐇');
    expect(petSpeciesEmoji('bird')).toBe('🦜');
    expect(petSpeciesEmoji('hamster')).toBe('🐹');
    expect(petSpeciesEmoji('fish')).toBe('🐠');
  });
  it('nomes comuns digitados no campo livre ganham o emoji certo', () => {
    expect(petSpeciesEmoji('cavalo')).toBe('🐴');
    expect(petSpeciesEmoji('Porco')).toBe('🐷');
    expect(petSpeciesEmoji('jacaré')).toBe('🐊');
    expect(petSpeciesEmoji('Égua')).toBe('🐴');
    expect(petSpeciesEmoji('periquito')).toBe('🦜');
    expect(petSpeciesEmoji('tartaruga')).toBe('🐢');
  });
  it('texto livre desconhecido e "other" viram 🐾 (nunca um cachorro)', () => {
    expect(petSpeciesEmoji('furão')).toBe('🐾');
    expect(petSpeciesEmoji('xyzbicho')).toBe('🐾');
    expect(petSpeciesEmoji('other')).toBe('🐾');
  });
});

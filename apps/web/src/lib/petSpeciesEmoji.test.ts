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
  it('texto livre e "other" viram 🐾 (nunca um cachorro)', () => {
    expect(petSpeciesEmoji('furão')).toBe('🐾');
    expect(petSpeciesEmoji('other')).toBe('🐾');
  });
});

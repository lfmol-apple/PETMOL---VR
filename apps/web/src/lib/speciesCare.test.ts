import { describe, expect, it } from 'vitest';
import { hasDogCatCare, speciesCare, speciesLabel, speciesNoun } from './speciesCare';

describe('speciesCare', () => {
  it('cão: tudo; ausente também (pets antigos)', () => {
    expect(speciesCare('dog')).toEqual({ vaccines: true, dewormer: true, fleaTick: true, collar: true });
    expect(speciesCare(undefined)).toEqual(speciesCare('dog'));
    expect(speciesCare('')).toEqual(speciesCare('dog'));
  });
  it('gato: vacina e antiparasitários, sem coleira', () => {
    expect(speciesCare('cat')).toEqual({ vaccines: true, dewormer: true, fleaTick: true, collar: false });
  });
  it('coelho, pássaro, cavalo, texto livre e "other": nada de vacina/parasita', () => {
    for (const s of ['rabbit', 'bird', 'hamster', 'fish', 'other', 'cavalo', 'jacaré']) {
      expect(speciesCare(s)).toEqual({ vaccines: false, dewormer: false, fleaTick: false, collar: false });
      expect(hasDogCatCare(s)).toBe(false);
    }
  });
});

describe('speciesNoun / speciesLabel', () => {
  it('nomes conhecidos, texto livre e fallback', () => {
    expect(speciesNoun('dog')).toBe('cachorro');
    expect(speciesNoun('cat')).toBe('gato');
    expect(speciesNoun('rabbit')).toBe('coelho');
    expect(speciesNoun('cavalo')).toBe('cavalo');
    expect(speciesNoun('other')).toBe('pet');
    expect(speciesNoun(undefined)).toBe('cachorro');
    expect(speciesLabel('cat')).toBe('Gato');
    expect(speciesLabel('furão')).toBe('Furão');
  });
});

import { describe, expect, it } from 'vitest';
import { hasDogCatCare, speciesCare, speciesLabel, speciesNoun, speciesPosterEmoji } from './speciesCare';

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

describe('rótulos e cartaz de pet perdido', () => {
  it('cão pode usar "Cão"; outros bichos mantêm o próprio nome', () => {
    expect(speciesLabel('dog')).toBe('Cachorro');
    expect(speciesLabel('dog', 'Cão')).toBe('Cão');
    expect(speciesLabel(undefined, 'Cão')).toBe('Cão');
    expect(speciesLabel('cat', 'Cão')).toBe('Gato');
    expect(speciesLabel('rabbit')).toBe('Coelho');
    expect(speciesLabel('jacaré')).toBe('Jacaré');
  });
  it('emoji do cartaz: cão 🐕, gato 🐈, outros pelo ícone da espécie, desconhecido 🐾', () => {
    expect(speciesPosterEmoji('dog')).toBe('🐕');
    expect(speciesPosterEmoji(undefined)).toBe('🐕');
    expect(speciesPosterEmoji('cat')).toBe('🐈');
    expect(speciesPosterEmoji('rabbit')).toBe('🐇');
    expect(speciesPosterEmoji('cavalo')).toBe('🐴');
    expect(speciesPosterEmoji('furão')).toBe('🐾');
  });
});

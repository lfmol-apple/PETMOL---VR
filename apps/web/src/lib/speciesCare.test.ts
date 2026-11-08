import { describe, expect, it } from 'vitest';
import { hasDogCatCare, speciesCare, speciesLabel, speciesNoun, speciesPosterEmoji } from './speciesCare';

describe('speciesCare', () => {
  it('cão: tudo; ausente também (pets antigos)', () => {
    expect(speciesCare('dog')).toEqual({ vaccines: true, dewormer: true, fleaTick: true, collar: true, walk: true, grooming: true });
    expect(speciesCare(undefined)).toEqual(speciesCare('dog'));
    expect(speciesCare('')).toEqual(speciesCare('dog'));
  });
  it('gato: vacina e antiparasitários, sem coleira', () => {
    expect(speciesCare('cat')).toEqual({ vaccines: true, dewormer: true, fleaTick: true, collar: false, walk: true, grooming: true });
  });
  it('coelho, pássaro, cavalo, texto livre e "other": nada de vacina/parasita', () => {
    for (const s of ['rabbit', 'bird', 'hamster', 'fish', 'other', 'cavalo', 'jacaré']) {
      const c = speciesCare(s);
      expect([c.vaccines, c.dewormer, c.fleaTick, c.collar, c.walk]).toEqual([false, false, false, false, false]);
      expect(hasDogCatCare(s)).toBe(false);
    }
  });
  it('Banho e Tosa: some para peixe, pássaro e hamster; fica para coelho, cavalo e demais', () => {
    for (const s of ['fish', 'bird', 'hamster']) expect(speciesCare(s).grooming).toBe(false);
    for (const s of ['rabbit', 'cavalo', 'other', 'dog', 'cat']) expect(speciesCare(s).grooming).toBe(true);
  });
  it('passeio: só cão e gato', () => {
    expect(speciesCare('dog').walk).toBe(true);
    expect(speciesCare('cat').walk).toBe(true);
    for (const s of ['rabbit', 'bird', 'fish', 'hamster', 'cavalo', 'other']) expect(speciesCare(s).walk).toBe(false);
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

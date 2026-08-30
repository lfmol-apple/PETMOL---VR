import { describe, expect, it } from 'vitest';
import { hasEmoji, sanitizePetName, stripEmoji } from './petName';

describe('stripEmoji', () => {
  it('remove pictogramas e mantém o texto', () => {
    expect(stripEmoji('Rex 🐶')).toBe('Rex ');
    expect(stripEmoji('🌟Luna⭐')).toBe('Luna');
    expect(stripEmoji('Bidu')).toBe('Bidu');
  });

  it('remove emoji composto (ZWJ, tom de pele, bandeira)', () => {
    expect(stripEmoji('Fido 👨‍👩‍👧')).toBe('Fido ');
    expect(stripEmoji('Nina 👋🏽')).toBe('Nina ');
    expect(stripEmoji('Thor 🇧🇷')).toBe('Thor ');
  });

  it('mantém acentos e hífen', () => {
    expect(stripEmoji('Açaí-Mel')).toBe('Açaí-Mel');
  });
});

describe('hasEmoji', () => {
  it('detecta presença de emoji', () => {
    expect(hasEmoji('Rex 🐶')).toBe(true);
    expect(hasEmoji('Rex')).toBe(false);
  });
});

describe('sanitizePetName', () => {
  it('tira emoji e colapsa espaços', () => {
    expect(sanitizePetName('Rex  🐶  ')).toBe('Rex ');
    expect(sanitizePetName('Bela 🐱 Flor')).toBe('Bela Flor');
  });
});

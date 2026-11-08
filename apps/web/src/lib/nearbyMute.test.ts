import { describe, expect, it } from 'vitest';
import { isNearbySilenced } from './nearbyMute';

describe('isNearbySilenced', () => {
  it('sem alertas, nada está silenciado', () => {
    expect(isNearbySilenced([], ['a'])).toBe(false);
  });
  it('todos os alertas atuais silenciados → silenciado (a contagem continua mostrando o número)', () => {
    expect(isNearbySilenced(['a', 'b'], ['a', 'b', 'x'])).toBe(true);
  });
  it('um alerta NOVO quebra o silêncio', () => {
    expect(isNearbySilenced(['a', 'b', 'novo'], ['a', 'b'])).toBe(false);
  });
  it('nada silenciado → não silenciado', () => {
    expect(isNearbySilenced(['a'], [])).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { PERCENT_KEYS, pctOf } from './percent';

describe('pctOf (base = "Se cadastrou")', () => {
  it('calcula com uma casa decimal e vírgula', () => {
    expect(pctOf(1, 8)).toBe('12,5%');
    expect(pctOf(50, 100)).toBe('50%');
    expect(pctOf(2, 3)).toBe('66,7%');
  });
  it('sem base ou sem dado devolve traço (nunca divide por zero)', () => {
    expect(pctOf(5, 0)).toBe('—');
    expect(pctOf(undefined, 10)).toBe('—');
    expect(pctOf(3, null)).toBe('—');
  });
  it('não corta em 100%: mostra o número real', () => {
    expect(pctOf(6, 4)).toBe('150%');
  });
  it('downloads e cadastros não têm percentual', () => {
    expect(PERCENT_KEYS).toEqual(['pets', 'alimentacao', 'notificacoes']);
  });
});

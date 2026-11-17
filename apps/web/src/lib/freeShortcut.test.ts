import { describe, expect, it } from 'vitest';
import {
  FREE_SHORTCUT_DEADLINE_LABEL,
  FREE_SHORTCUT_DURATION_MS,
  endFreeShortcut,
  formatCountdown,
  openFreeShortcut,
  peekFreeShortcut,
  remainingFrom,
} from './freeShortcut';

function memory() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
}
const MIN = 60 * 1000;

describe('freeShortcut', () => {
  it('usa a data real e 20 minutos', () => {
    expect(FREE_SHORTCUT_DEADLINE_LABEL).toBe('31/12');
    expect(FREE_SHORTCUT_DURATION_MS).toBe(20 * MIN);
  });

  it('a contagem começa no primeiro toque e NÃO reinicia ao reabrir', () => {
    const st = memory();
    const t0 = 1_000_000;
    expect(peekFreeShortcut(t0, st)).toBeNull();               // ver não inicia
    const first = openFreeShortcut(t0, st);
    expect(first).toEqual({ status: 'active', startedAt: t0, remainingMs: 20 * MIN });
    const again = openFreeShortcut(t0 + 5 * MIN, st);          // voltou 5 min depois
    expect(again).toMatchObject({ status: 'active', startedAt: t0, remainingMs: 15 * MIN });
  });

  it('depois de 20 minutos o atalho encerra e não reabre', () => {
    const st = memory();
    openFreeShortcut(0, st);
    expect(openFreeShortcut(20 * MIN, st)).toEqual({ status: 'ended', end: 'expired' });
    expect(openFreeShortcut(21 * MIN, st)).toEqual({ status: 'ended', end: 'expired' });
  });

  it('feito ou "agora não" encerram na hora, e o primeiro motivo vale', () => {
    const st = memory();
    openFreeShortcut(0, st);
    endFreeShortcut('done', 2 * MIN, st);
    endFreeShortcut('dismissed', 3 * MIN, st);
    expect(openFreeShortcut(4 * MIN, st)).toEqual({ status: 'ended', end: 'done' });
  });

  it('sem armazenamento disponível não quebra', () => {
    expect(openFreeShortcut(10, null)).toMatchObject({ status: 'active' });
    expect(() => endFreeShortcut('dismissed', 10, null)).not.toThrow();
  });

  it('formata a contagem em mm:ss e nunca fica negativa', () => {
    expect(formatCountdown(20 * MIN)).toBe('20:00');
    expect(formatCountdown(19 * MIN + 59_000)).toBe('19:59');
    expect(formatCountdown(61_001)).toBe('01:02');
    expect(formatCountdown(-5)).toBe('00:00');
    expect(remainingFrom(0, 25 * MIN)).toBe(0);
  });
});

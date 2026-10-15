import { beforeEach, describe, expect, it } from 'vitest';
import {
  SECOND_CHANCE_MAX, readSecondChance, recordSecondChance, shouldShowSecondChance, startSecondChanceClock,
} from './foodSecondChance';

const DAY = 86400000;
beforeEach(() => window.localStorage.clear());

describe('segunda chance da ração', () => {
  const base = { hasFoodData: false, onboardingFood: 'later' as const };

  it('só para quem escolheu "depois" e ainda não tem ração', () => {
    const state = { count: 0, lastAt: null };
    expect(shouldShowSecondChance({ ...base, state })).toBe(true);
    expect(shouldShowSecondChance({ ...base, hasFoodData: true, state })).toBe(false);
    expect(shouldShowSecondChance({ ...base, onboardingFood: 'na', state })).toBe(false);      // "não uso ração": nunca
    expect(shouldShowSecondChance({ ...base, onboardingFood: undefined, state })).toBe(false); // o onboarding ainda cuida
  });

  it('pausa de 7 dias entre as vezes e no máximo 3', () => {
    const t0 = 1_800_000_000_000;
    expect(shouldShowSecondChance({ ...base, state: { count: 1, lastAt: t0 }, now: t0 + 6 * DAY })).toBe(false);
    expect(shouldShowSecondChance({ ...base, state: { count: 1, lastAt: t0 }, now: t0 + 8 * DAY })).toBe(true);
    expect(shouldShowSecondChance({ ...base, state: { count: SECOND_CHANCE_MAX, lastAt: t0 }, now: t0 + 30 * DAY })).toBe(false);
  });

  it('registrar conta uma vez e começa a pausa; o relógio do "depois" começa com 0 vezes', () => {
    startSecondChanceClock('p1', 1000);
    expect(readSecondChance('p1')).toEqual({ count: 0, lastAt: 1000 });
    startSecondChanceClock('p1', 9999);                  // não reinicia
    expect(readSecondChance('p1').lastAt).toBe(1000);
    expect(recordSecondChance('p1', 5000)).toEqual({ count: 1, lastAt: 5000 });
  });
});

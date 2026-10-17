import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearFoodRepurchase, getPendingFoodRepurchase, markFoodRepurchaseIntent, snoozeFoodRepurchase,
} from './foodRepurchase';

describe('foodRepurchase', () => {
  beforeEach(() => window.localStorage.clear());

  it('só aparece depois que o tutor ficou fora do app', () => {
    markFoodRepurchaseIntent('p1', 'Golden', 1_000);
    expect(getPendingFoodRepurchase('p1', 5_000)).toBeNull();
    expect(getPendingFoodRepurchase('p1', 30_000)?.brand).toBe('Golden');
  });

  it('é por pet', () => {
    markFoodRepurchaseIntent('p1', 'Golden', 0);
    expect(getPendingFoodRepurchase('p2', 60_000)).toBeNull();
  });

  it('"ainda não" some por 24h e volta; expira em 14 dias', () => {
    markFoodRepurchaseIntent('p1', 'Golden', 0);
    snoozeFoodRepurchase(60_000);
    expect(getPendingFoodRepurchase('p1', 120_000)).toBeNull();
    expect(getPendingFoodRepurchase('p1', 60_000 + 25 * 3600_000)).not.toBeNull();
    expect(getPendingFoodRepurchase('p1', 15 * 24 * 3600_000)).toBeNull();
  });

  it('clear remove', () => {
    markFoodRepurchaseIntent('p1', 'Golden', 0);
    clearFoodRepurchase();
    expect(getPendingFoodRepurchase('p1', 60_000)).toBeNull();
  });
});

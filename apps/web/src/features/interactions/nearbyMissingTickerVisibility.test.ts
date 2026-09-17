import { describe, it, expect, beforeEach } from 'vitest';
import { shouldShowNearbyTicker, registerNearbyTickerHomeOpen } from './nearbyMissingTickerVisibility';

describe('nearbyMissingTickerVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function openHome(ids: string[]) {
    const shown = shouldShowNearbyTicker(ids);
    registerNearbyTickerHomeOpen(ids, shown);
    return shown;
  }

  it('nunca mostra sem alertas', () => {
    expect(shouldShowNearbyTicker([])).toBe(false);
  });

  it('mostra um conjunto nunca visto antes (explosão inicial)', () => {
    expect(openHome(['a1'])).toBe(true);
  });

  it('mostra nas 3 primeiras aberturas do mesmo conjunto, depois quieta', () => {
    expect(openHome(['a1'])).toBe(true); // 1ª
    expect(openHome(['a1'])).toBe(true); // 2ª
    expect(openHome(['a1'])).toBe(true); // 3ª
    expect(openHome(['a1'])).toBe(false); // 4ª — quietou
  });

  it('volta a cada 5 aberturas depois da explosão inicial — nunca fica em silêncio pra sempre', () => {
    for (let i = 0; i < 3; i++) openHome(['a1']); // consome a explosão inicial (aberturas 1-3)
    expect(openHome(['a1'])).toBe(false); // abertura 4 — quieto
    expect(openHome(['a1'])).toBe(false); // 5
    expect(openHome(['a1'])).toBe(false); // 6
    expect(openHome(['a1'])).toBe(false); // 7
    expect(openHome(['a1'])).toBe(false); // 8
    expect(openHome(['a1'])).toBe(true); // 9ª — 5 aberturas desde a última exibição (3ª) — volta
  });

  it('um conjunto NOVO (alerta a mais) reseta e fura a soneca do conjunto antigo', () => {
    for (let i = 0; i < 3; i++) openHome(['a1']);
    expect(openHome(['a1'])).toBe(false);

    // um pet a mais = conjunto diferente = explosão inicial de novo
    expect(openHome(['a1', 'a2'])).toBe(true);
  });

  it('o mesmo conjunto em ordem diferente ainda conta como o mesmo conjunto', () => {
    openHome(['a1', 'a2']);
    openHome(['a2', 'a1']);
    openHome(['a1', 'a2']);
    expect(shouldShowNearbyTicker(['a2', 'a1'])).toBe(false);
  });
});

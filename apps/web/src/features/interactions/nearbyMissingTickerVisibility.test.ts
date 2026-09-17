import { describe, it, expect, beforeEach } from 'vitest';
import { shouldShowNearbyTicker, registerNearbyTickerShown } from './nearbyMissingTickerVisibility';

describe('nearbyMissingTickerVisibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('nunca mostra sem alertas', () => {
    expect(shouldShowNearbyTicker([])).toBe(false);
  });

  it('mostra um conjunto nunca visto antes', () => {
    expect(shouldShowNearbyTicker(['a1'])).toBe(true);
  });

  it('continua mostrando o mesmo conjunto até o teto de 3 aberturas', () => {
    registerNearbyTickerShown(['a1']);
    expect(shouldShowNearbyTicker(['a1'])).toBe(true); // 2ª
    registerNearbyTickerShown(['a1']);
    expect(shouldShowNearbyTicker(['a1'])).toBe(true); // 3ª
    registerNearbyTickerShown(['a1']);
    expect(shouldShowNearbyTicker(['a1'])).toBe(false); // 4ª — parou
  });

  it('um conjunto NOVO (alerta a mais) fura o teto do conjunto antigo', () => {
    registerNearbyTickerShown(['a1']);
    registerNearbyTickerShown(['a1']);
    registerNearbyTickerShown(['a1']);
    expect(shouldShowNearbyTicker(['a1'])).toBe(false);

    // um pet a mais no alerta = conjunto diferente = furou de novo
    expect(shouldShowNearbyTicker(['a1', 'a2'])).toBe(true);
  });

  it('o mesmo conjunto em ordem diferente ainda conta como o mesmo conjunto', () => {
    registerNearbyTickerShown(['a1', 'a2']);
    registerNearbyTickerShown(['a2', 'a1']);
    registerNearbyTickerShown(['a1', 'a2']);
    expect(shouldShowNearbyTicker(['a2', 'a1'])).toBe(false);
  });
});

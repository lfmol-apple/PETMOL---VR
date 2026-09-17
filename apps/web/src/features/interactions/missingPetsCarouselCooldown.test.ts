import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  registerHomeOpen,
  shouldAutoShowNearbyCarousel,
  markNearbyCarouselAutoShown,
  markNearbyCarouselDismissed,
} from './missingPetsCarouselCooldown';

describe('missingPetsCarouselCooldown', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nunca mostra sem alertas ativos', () => {
    expect(shouldAutoShowNearbyCarousel([])).toBe(false);
  });

  it('mostra um alerta nunca visto antes', () => {
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(true);
  });

  it('um alerta dispensado não reaparece na hora', () => {
    markNearbyCarouselDismissed(['a1']);
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(false);
  });

  it('um alerta NOVO fura a soneca de um antigo já dispensado', () => {
    markNearbyCarouselDismissed(['a1']);
    expect(shouldAutoShowNearbyCarousel(['a1', 'a2'])).toBe(true);
  });

  it('reaparece depois de ~6h mesmo sem novas aberturas', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T10:00:00Z'));
    markNearbyCarouselDismissed(['a1']);
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(false);

    vi.setSystemTime(new Date('2026-09-16T16:00:01Z')); // +6h01
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(true);
  });

  it('reaparece depois de 3 aberturas da Home, mesmo antes de 6h', () => {
    markNearbyCarouselDismissed(['a1']);
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(false);

    registerHomeOpen();
    registerHomeOpen();
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(false); // só 2 aberturas

    registerHomeOpen();
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(true); // 3ª abertura
  });

  it('respeita o teto de 3 auto-shows por dia mesmo com alertas sempre novos', () => {
    markNearbyCarouselAutoShown();
    markNearbyCarouselAutoShown();
    markNearbyCarouselAutoShown();
    // 4º alerta novo do dia — já bateu o teto
    expect(shouldAutoShowNearbyCarousel(['nunca-visto'])).toBe(false);
  });

  it('abrir o carrossel (não só dispensar) também silencia a soneca', () => {
    // markNearbyCarouselDismissed é chamado tanto no X do aviso quanto ao
    // abrir o carrossel (ver home/page.tsx) — mesmo efeito de "já visto".
    markNearbyCarouselDismissed(['a1']);
    expect(shouldAutoShowNearbyCarousel(['a1'])).toBe(false);
  });
});

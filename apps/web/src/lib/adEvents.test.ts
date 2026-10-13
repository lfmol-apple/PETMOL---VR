import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ logEvent: vi.fn().mockResolvedValue(undefined), native: false }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => h.native },
  registerPlugin: () => ({ logEvent: h.logEvent }),
}));

import { isAdEventKind, trackAdEvent } from './adEvents';

describe('adEvents', () => {
  it('só eventos de negócio conhecidos passam o filtro', () => {
    expect(isAdEventKind('registration')).toBe(true);
    expect(isAdEventKind('food_cycle_created')).toBe(true);
    expect(isAdEventKind('push_opened')).toBe(false);
    expect(isAdEventKind('toString')).toBe(false);
  });

  it('na web/PWA não chama o nativo', () => {
    h.native = false;
    trackAdEvent('registration');
    expect(h.logEvent).not.toHaveBeenCalled();
  });

  it('no app nativo envia nome Meta e TikTok', () => {
    h.native = true;
    trackAdEvent('registration');
    expect(h.logEvent).toHaveBeenCalledWith({ meta: 'fb_mobile_complete_registration', tiktok: 'Registration' });
  });
});

import { describe, expect, it } from 'vitest';
import { detectStorePlatform, playStoreUrl, storeUrlFor } from './appStores';

describe('appStores', () => {
  it('detecta iPhone, iPad moderno, Android e desktop', () => {
    expect(detectStorePlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('ios');
    expect(detectStorePlatform('Mozilla/5.0 (Macintosh)', 5, 'MacIntel')).toBe('ios');
    expect(detectStorePlatform('Mozilla/5.0 (Linux; Android 14; SM-S911B)')).toBe('android');
    expect(detectStorePlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X)', 0, 'MacIntel')).toBe('desktop');
  });
  it('link do Play leva a origem do clique como referrer', () => {
    const u = playStoreUrl('hero');
    expect(u).toContain('id=br.com.petmol.app');
    expect(decodeURIComponent(u)).toContain('utm_medium=hero');
  });
  it('iPhone sem URL da App Store → null (mostra "Em breve")', () => {
    expect(storeUrlFor('ios', 'hero')).toBeNull();
    expect(storeUrlFor('desktop', 'hero')).toBeNull();
    expect(storeUrlFor('android', 'hero')).toContain('play.google.com');
  });
});

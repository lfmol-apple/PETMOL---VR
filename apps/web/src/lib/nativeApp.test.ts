import { describe, expect, it } from 'vitest';
import { NATIVE_APP_UA_MARKER, isNativeAppUserAgent } from './nativeApp';

describe('nativeApp — detecção do WebView nativo pelo User-Agent', () => {
  it('o marcador é o que capacitor.config.ts injeta via appendUserAgent', () => {
    expect(NATIVE_APP_UA_MARKER).toBe('PetmolApp');
  });

  it('reconhece o UA do app (Android/iOS WebView com appendUserAgent)', () => {
    expect(
      isNativeAppUserAgent(
        'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36 PetmolApp',
      ),
    ).toBe(true);
    expect(
      isNativeAppUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 PetmolApp',
      ),
    ).toBe(true);
  });

  it('NÃO marca navegador normal, PWA ou crawler como app nativo', () => {
    expect(isNativeAppUserAgent('Mozilla/5.0 (iPhone) Safari/604.1')).toBe(false);
    expect(isNativeAppUserAgent('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(false);
    expect(isNativeAppUserAgent('')).toBe(false);
    expect(isNativeAppUserAgent(null)).toBe(false);
    expect(isNativeAppUserAgent(undefined)).toBe(false);
  });
});

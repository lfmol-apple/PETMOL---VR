import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNativeApp, needsIosInstallForPush } from './pwaPlatform';

function stubUA(ua: string, opts: { standalone?: boolean; matchStandalone?: boolean } = {}) {
  vi.stubGlobal('navigator', {
    userAgent: ua,
    platform: 'iPhone',
    maxTouchPoints: 5,
    standalone: opts.standalone ?? false,
  });
  vi.stubGlobal('window', {
    navigator: { standalone: opts.standalone ?? false },
    matchMedia: () => ({ matches: opts.matchStandalone ?? false }),
  });
}

describe('pwaPlatform', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('isNativeApp: true só com o marcador PetmolApp no UA', () => {
    stubUA('Mozilla/5.0 (iPhone) AppleWebKit/605 PetmolApp');
    expect(isNativeApp()).toBe(true);

    stubUA('Mozilla/5.0 (iPhone) AppleWebKit/605 Safari/604');
    expect(isNativeApp()).toBe(false);
  });

  it('needsIosInstallForPush: iPhone no Safari (sem PWA, sem app) → true', () => {
    stubUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 Safari/604');
    expect(needsIosInstallForPush()).toBe(true);
  });

  it('needsIosInstallForPush: dentro do app nativo (PetmolApp) → false', () => {
    stubUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 PetmolApp');
    expect(needsIosInstallForPush()).toBe(false);
  });

  it('needsIosInstallForPush: PWA instalado (standalone) → false', () => {
    stubUA('Mozilla/5.0 (iPhone) AppleWebKit/605', { standalone: true });
    expect(needsIosInstallForPush()).toBe(false);
  });
});

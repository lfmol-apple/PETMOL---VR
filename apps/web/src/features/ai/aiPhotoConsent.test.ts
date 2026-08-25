import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('aiPhotoConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('nao tem consentimento por padrao', async () => {
    const { hasCachedAiPhotoConsent } = await import('./aiPhotoConsent');
    expect(hasCachedAiPhotoConsent('user-a')).toBe(false);
  });

  it('cache local e escopado por usuario e versao', async () => {
    const { AI_CONSENT_POLICY_VERSION, hasCachedAiPhotoConsent } = await import('./aiPhotoConsent');
    window.localStorage.setItem(`petmol_ai_photo_consent_${AI_CONSENT_POLICY_VERSION}_user-a`, 'granted');

    expect(hasCachedAiPhotoConsent('user-a')).toBe(true);
    expect(hasCachedAiPhotoConsent('user-b')).toBe(false);
  });

  it('consulta backend e grava cache apenas para o usuario atual', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        granted: true,
        provider: 'google_gemini',
        consent_type: 'ai_photo_processing',
        policy_version: '2026-08-25',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { ensureAiPhotoConsent, hasCachedAiPhotoConsent } = await import('./aiPhotoConsent');
    await expect(ensureAiPhotoConsent('user-a', 'token-a')).resolves.toBe(true);

    expect(hasCachedAiPhotoConsent('user-a')).toBe(true);
    expect(hasCachedAiPhotoConsent('user-b')).toBe(false);
  });

  it('remove cache local ao revogar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    const { AI_CONSENT_POLICY_VERSION, revokeAiPhotoConsent, hasCachedAiPhotoConsent } = await import('./aiPhotoConsent');
    window.localStorage.setItem(`petmol_ai_photo_consent_${AI_CONSENT_POLICY_VERSION}_user-a`, 'granted');

    await revokeAiPhotoConsent('user-a', 'token-a');

    expect(hasCachedAiPhotoConsent('user-a')).toBe(false);
  });
});

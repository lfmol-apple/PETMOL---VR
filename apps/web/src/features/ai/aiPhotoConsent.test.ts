import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// aiPhotoConsent — consentimento explícito e prévio antes de qualquer foto
// ser enviada ao Gemini (seção 35 da revisão de 25/08/2026). Sem isso,
// VaccineCardUpload.tsx e ProductDetectionSheet.tsx disparavam a requisição
// assim que o arquivo era selecionado, sem nenhuma tela de consentimento.
describe('aiPhotoConsent', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it('não tem consentimento por padrão', async () => {
    const { hasAiPhotoConsent } = await import('./aiPhotoConsent');
    expect(hasAiPhotoConsent()).toBe(false);
  });

  it('lembra o consentimento depois de concedido', async () => {
    const { hasAiPhotoConsent, grantAiPhotoConsent } = await import('./aiPhotoConsent');
    grantAiPhotoConsent();
    expect(hasAiPhotoConsent()).toBe(true);
  });

  it('recusar não fica marcado como negativo permanente — pode tentar de novo depois', async () => {
    const { hasAiPhotoConsent, declineAiPhotoConsent } = await import('./aiPhotoConsent');
    declineAiPhotoConsent();
    expect(hasAiPhotoConsent()).toBe(false);
  });

  it('nunca lança erro se localStorage falhar (ex: modo privado)', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { grantAiPhotoConsent, hasAiPhotoConsent } = await import('./aiPhotoConsent');
    expect(() => grantAiPhotoConsent()).not.toThrow();
    setItemSpy.mockRestore();
    expect(hasAiPhotoConsent()).toBe(false);
  });
});

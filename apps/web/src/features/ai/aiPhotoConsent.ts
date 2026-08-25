/**
 * Consentimento explícito e prévio antes de qualquer foto ser enviada a
 * um provedor de IA de terceiros (Google Gemini) — seção 35 da revisão
 * de 25/08/2026 (ver docs/PRIVACY_DATA_MAP.md). Antes desta correção,
 * VaccineCardUpload.tsx e ProductDetectionSheet.tsx enviavam a foto pro
 * backend (que chama o Gemini) assim que o arquivo era selecionado —
 * zero tela de consentimento, zero opção "usar sem IA" antes do envio.
 *
 * Modelo: uma única permissão, não uma por feature — "o tutor autoriza
 * o PETMOL a usar IA de terceiros pra processar fotos que ele envia"
 * é um consentimento, concedido uma vez (lembrado em localStorage) e
 * válido pra qualquer fluxo que use IA. Negar/timeout/erro sempre cai
 * pra entrada manual, nunca bloqueia o fluxo.
 */

const CONSENT_STORAGE_KEY = 'petmol_ai_photo_consent_v1';
export const AI_CONSENT_POLICY_VERSION = 'v1-2026-08-25';

export function hasAiPhotoConsent(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(CONSENT_STORAGE_KEY) === 'granted';
  } catch {
    return false;
  }
}

export function grantAiPhotoConsent(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, 'granted');
    }
  } catch {
    // best-effort — se localStorage falhar, o consentimento só não fica
    // lembrado pra próxima vez; a tela volta a aparecer, nunca bloqueia
  }
  void trackAiConsentEvent('granted');
}

export function declineAiPhotoConsent(): void {
  // Deliberadamente NÃO persiste a recusa — o tutor pode mudar de ideia
  // na próxima tentativa sem precisar ir em configurações. Só registra
  // o evento pra analytics.
  void trackAiConsentEvent('declined');
}

async function trackAiConsentEvent(decision: 'granted' | 'declined'): Promise<void> {
  try {
    const { trackClick } = await import('@/lib/analytics/click');
    void trackClick({
      source: 'ai_consent',
      cta_type: decision === 'granted' ? 'ai_photo_consent_granted' : 'ai_photo_consent_declined',
      metadata: { policy_version: AI_CONSENT_POLICY_VERSION, provider: 'gemini' },
    });
  } catch {
    // analytics nunca bloqueia UX
  }
}

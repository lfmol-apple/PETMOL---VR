import { API_BASE_URL } from '@/lib/api';

export const AI_CONSENT_POLICY_VERSION = '2026-08-25';
export const AI_CONSENT_PROVIDER = 'google_gemini';
export const AI_CONSENT_TYPE = 'ai_photo_processing';

interface AIPhotoConsentState {
  granted: boolean;
  provider: string;
  consent_type: string;
  policy_version: string;
  granted_at?: string | null;
  revoked_at?: string | null;
}

function consentStorageKey(userId: string): string {
  return `petmol_ai_photo_consent_${AI_CONSENT_POLICY_VERSION}_${userId}`;
}

function safeLocalGet(key: string): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Backend remains the source of truth; cache failures only re-show prompt.
  }
}

function safeLocalRemove(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage failures.
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

export function hasCachedAiPhotoConsent(userId: string | number | null | undefined): boolean {
  if (userId == null) return false;
  return safeLocalGet(consentStorageKey(String(userId))) === 'granted';
}

export async function fetchAiPhotoConsent(userId: string | number, token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/vision/consent/ai-photo`, {
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) return false;
  const state = (await res.json()) as AIPhotoConsentState;
  const key = consentStorageKey(String(userId));
  if (state.granted && state.policy_version === AI_CONSENT_POLICY_VERSION) {
    safeLocalSet(key, 'granted');
    return true;
  }
  safeLocalRemove(key);
  return false;
}

export async function ensureAiPhotoConsent(userId: string | number | null | undefined, token: string | null): Promise<boolean> {
  if (userId == null || !token) return false;
  if (hasCachedAiPhotoConsent(userId)) return true;
  return fetchAiPhotoConsent(userId, token);
}

export async function grantAiPhotoConsent(userId: string | number, token: string): Promise<boolean> {
  const res = await fetch(`${API_BASE_URL}/vision/consent/ai-photo`, {
    method: 'POST',
    headers: authHeaders(token),
    credentials: 'include',
  });
  if (!res.ok) return false;
  const state = (await res.json()) as AIPhotoConsentState;
  if (state.granted) {
    safeLocalSet(consentStorageKey(String(userId)), 'granted');
    void trackAiConsentEvent('granted');
    return true;
  }
  return false;
}

export async function revokeAiPhotoConsent(userId: string | number, token: string): Promise<void> {
  await fetch(`${API_BASE_URL}/vision/consent/ai-photo`, {
    method: 'DELETE',
    headers: authHeaders(token),
    credentials: 'include',
  }).catch(() => undefined);
  safeLocalRemove(consentStorageKey(String(userId)));
}

export function declineAiPhotoConsent(): void {
  void trackAiConsentEvent('declined');
}

async function trackAiConsentEvent(decision: 'granted' | 'declined'): Promise<void> {
  try {
    const { trackClick } = await import('@/lib/analytics/click');
    void trackClick({
      source: 'ai_consent',
      cta_type: decision === 'granted' ? 'ai_photo_consent_granted' : 'ai_photo_consent_declined',
      metadata: { policy_version: AI_CONSENT_POLICY_VERSION, provider: AI_CONSENT_PROVIDER },
    });
  } catch {
    // Analytics never blocks UX.
  }
}

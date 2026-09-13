'use client';

const DEEP_LINK_INTENT_KEY = 'petmol_deeplink_intent_at';

export function markDeepLinkIntent(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(DEEP_LINK_INTENT_KEY, String(Date.now()));
  } catch {}
}

export function hasRecentDeepLinkIntent(windowMs = 15_000): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('modal') || params.get('petId') || params.get('checkin') === '1') {
      return true;
    }
  } catch {}

  try {
    const raw = sessionStorage.getItem(DEEP_LINK_INTENT_KEY);
    const at = raw ? Number(raw) : 0;
    return Number.isFinite(at) && at > 0 && Date.now() - at < windowMs;
  } catch {
    return false;
  }
}

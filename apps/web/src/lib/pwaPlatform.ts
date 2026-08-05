/**
 * pwaPlatform.ts
 *
 * iOS Safari only exposes PushManager/Notification once the site has been
 * installed via "Adicionar à Tela de Início" — in a regular Safari tab
 * `'PushManager' in window` is simply false, same as a browser with no push
 * support at all. Screens that gate on push support silently skip the
 * permission step in that case, which on iPhone reads as "this app never
 * asks me for notifications" instead of "you need to install it first".
 * These helpers let a screen tell the two cases apart and say so.
 */

export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS 13+ reports as "MacIntel" in the UA string but is touch-capable,
  // unlike an actual Mac.
  return navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
  // iOS Safari's own (non-standard) flag — not covered by display-mode media query there.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(displayModeStandalone || iosStandalone);
}

/** True when push could work here if the user installed the PWA first. */
export function needsIosInstallForPush(): boolean {
  return isIosDevice() && !isStandalonePwa();
}

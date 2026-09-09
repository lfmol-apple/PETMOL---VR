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

/**
 * True quando estamos dentro do app nativo PETMOL (WKWebView do Capacitor,
 * iOS ou Android) — não numa aba de navegador nem num PWA instalado. Usa o
 * marcador `PetmolApp` que `capacitor.config.ts` injeta no User-Agent, então
 * funciona mesmo sem o `@capacitor/core` no bundle (ver lib/nativeApp.ts).
 * No app nativo o push é APNs/FCM: nada de "Adicionar à Tela de Início".
 */
export function isNativeApp(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (navigator.userAgent || '').includes('PetmolApp');
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  const displayModeStandalone = window.matchMedia?.('(display-mode: standalone)').matches;
  // iOS Safari's own (non-standard) flag — not covered by display-mode media query there.
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return Boolean(displayModeStandalone || iosStandalone);
}

/**
 * True quando push só funcionaria aqui se o usuário instalasse o PWA antes —
 * iPhone, no Safari, FORA do app nativo e FORA do PWA instalado. Dentro do
 * app nativo (TestFlight/App Store) o push é nativo (APNs), então isto é
 * false e a tela não mostra instrução de "Adicionar à Tela de Início".
 */
export function needsIosInstallForPush(): boolean {
  return isIosDevice() && !isStandalonePwa() && !isNativeApp();
}

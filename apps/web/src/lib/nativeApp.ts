/**
 * nativeApp.ts — detecção "estou rodando dentro do app nativo PETMOL".
 *
 * capacitor.config.ts define `appendUserAgent: 'PetmolApp'`, então o
 * User-Agent do WebView nativo (iOS e Android) sempre contém "PetmolApp".
 * Isso permite decidir no SERVIDOR (Server Component / middleware) o que
 * mostrar. No cliente, prefira `Capacitor.isNativePlatform()` quando o
 * `@capacitor/core` já estiver no bundle.
 */

export const NATIVE_APP_UA_MARKER = 'PetmolApp';

/** True quando o User-Agent é o do app nativo (WebView Capacitor). */
export function isNativeAppUserAgent(userAgent: string | null | undefined): boolean {
  return !!userAgent && userAgent.includes(NATIVE_APP_UA_MARKER);
}

/** Client-side: navigator.userAgent. Sempre false no SSR. */
export function isNativeAppClient(): boolean {
  if (typeof navigator === 'undefined') return false;
  return isNativeAppUserAgent(navigator.userAgent);
}

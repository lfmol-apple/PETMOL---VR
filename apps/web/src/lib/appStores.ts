export type StorePlatform = 'ios' | 'android' | 'desktop';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=br.com.petmol.app';
// Aprovado pela Apple em 22/09/2026 (id 6809570555).
export const APP_STORE_URL: string | null = 'https://apps.apple.com/app/id6809570555';

export function detectStorePlatform(ua: string, maxTouchPoints = 0, platform = ''): StorePlatform {
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (platform === 'MacIntel' && maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Origem do clique (só parâmetro de URL — sem rastreador de terceiros). */
export function playStoreUrl(placement: string): string {
  const referrer = encodeURIComponent(`utm_source=petmol_site&utm_medium=${placement}`);
  return `${PLAY_STORE_URL}&referrer=${referrer}`;
}

export function storeUrlFor(platform: StorePlatform, placement: string): string | null {
  if (platform === 'android') return playStoreUrl(placement);
  if (platform === 'ios') return APP_STORE_URL;
  return null;
}

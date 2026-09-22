export type StorePlatform = 'ios' | 'android' | 'desktop';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=br.com.petmol.app';
// Ainda em revisão da Apple. Ao aprovar, preencher com a URL da App Store:
// os botões de iPhone viram download real sem mais nenhuma mudança.
export const APP_STORE_URL: string | null = null;

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

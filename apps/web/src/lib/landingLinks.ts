/**
 * Links das lojas usados na landing. Os selos oficiais continuam sendo as imagens de sempre;
 * aqui só se montam os endereços — e se acrescenta o que mede de onde veio a instalação.
 *
 * - Google Play: `referrer` com UTM (aparece nos relatórios de aquisição do Play Console).
 * - App Store: `pt` (token do provedor) + `ct` (campanha) só quando o token existir
 *   (NEXT_PUBLIC_APPSTORE_PROVIDER_TOKEN, gerado no App Store Connect > Links de campanha).
 *   Sem token o link fica exatamente como o oficial.
 */
export const APP_STORE_BASE = 'https://apps.apple.com/app/id6809570555';
export const GOOGLE_PLAY_BASE = 'https://play.google.com/store/apps/details?id=br.com.petmol.app&pcampaignid=web_share';

export interface CampaignParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
}

const clean = (v: string | undefined, fallback: string) => (v || fallback).replace(/[^A-Za-z0-9_.\-~]/g, '').slice(0, 60) || fallback;

export function googlePlayUrl(placement: string, campaign: CampaignParams = {}): string {
  const referrer = [
    `utm_source=${clean(campaign.utm_source, 'petmol_site')}`,
    `utm_medium=${clean(campaign.utm_medium, 'landing')}`,
    `utm_campaign=${clean(campaign.utm_campaign, 'landing')}`,
    `utm_content=${clean(campaign.utm_content, placement)}`,
    `utm_term=${clean(placement, 'selo')}`,
  ].join('&');
  return `${GOOGLE_PLAY_BASE}&referrer=${encodeURIComponent(referrer)}`;
}

export function appStoreUrl(placement: string, campaign: CampaignParams = {}, providerToken = process.env.NEXT_PUBLIC_APPSTORE_PROVIDER_TOKEN): string {
  const pt = (providerToken || '').trim();
  if (!pt) return APP_STORE_BASE;
  const ct = clean(`${campaign.utm_campaign || 'landing'}_${placement}`, 'landing');
  return `${APP_STORE_BASE}?pt=${encodeURIComponent(pt)}&ct=${encodeURIComponent(ct)}`;
}

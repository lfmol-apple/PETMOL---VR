/**
 * Eventos da landing gravados NO SERVIDOR (tabela `analytics_product_events`, via POST /analytics/event) —
 * `landing_view`, `landing_download_click`, `landing_store_redirect`. Não usa o `track()` do analytics.ts
 * (que guarda em localStorage) nem o /analytics/click (que gera um lead_id novo a cada chamada).
 *
 * Cada evento leva um `event_id` único (o servidor descarta repetição do mesmo id), o `anonymous_id` estável do
 * navegador e a variante. `keepalive` garante o envio mesmo quando a loja abre e a página perde o foco —
 * e nada aqui impede o redirecionamento: é disparo-e-esquece, com try/catch.
 */
import { API_BASE_URL } from '@/lib/api';
import { getAnalyticsContext } from '@/lib/analytics/session';
import { getCampaignAttribution } from '@/lib/analytics/campaignAttribution';
import { detectInAppBrowser, readLandingContext } from '@/lib/landingContext';
import { EXPERIMENT_ID, getLandingVariant, type VariantInfo } from '@/lib/landingExperiment';

export type LandingEventName = 'landing_view' | 'landing_download_click' | 'landing_store_redirect';
export interface LandingEventExtra {
  button?: 'cta' | 'badge';
  placement?: string;
  store?: 'apple' | 'google' | 'auto';
}

export function buildLandingEvent(name: LandingEventName, info: VariantInfo, extra: LandingEventExtra = {}) {
  const ctx = getAnalyticsContext();
  const url = readLandingContext(window.location.search, navigator.userAgent || '');
  const stored = getCampaignAttribution();
  const utm = {
    utm_source: url.campaign.utm_source ?? stored.utm_source,
    utm_medium: url.campaign.utm_medium ?? stored.utm_medium,
    utm_campaign: url.campaign.utm_campaign ?? stored.utm_campaign,
    utm_content: url.campaign.utm_content ?? stored.utm_content,
    utm_term: stored.utm_term,
  };
  return {
    event_id: ctx.event_id,
    event_name: name,
    anonymous_id: ctx.anonymous_id,
    session_id: ctx.session_id,
    route: window.location.pathname,
    occurred_at: new Date().toISOString(),
    platform: ctx.platform,
    app_version: ctx.app_version,
    os: ctx.os,
    browser: ctx.browser,
    device_class: ctx.device_class,
    locale: ctx.locale,
    timezone: ctx.timezone,
    ...utm,
    referrer_host: stored.referrer_host,
    landing_path: stored.landing_path ?? window.location.pathname,
    properties: {
      experiment_id: EXPERIMENT_ID,
      variant: info.variant,
      ...(info.preview ? { preview: true } : {}),
      ...(extra.button ? { button: extra.button } : {}),
      ...(extra.placement ? { placement: extra.placement } : {}),
      ...(extra.store ? { store: extra.store } : {}),
      iab: detectInAppBrowser(navigator.userAgent || ''),
      fbclid: url.hasFbclid,
    },
  };
}

export function trackLandingEvent(name: LandingEventName, extra: LandingEventExtra = {}, info: VariantInfo = getLandingVariant()): void {
  try {
    const payload = buildLandingEvent(name, info, extra);
    void fetch(`${API_BASE_URL}/analytics/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // medir nunca pode atrapalhar o clique
  }
}

/** Clique em qualquer controle de download: 1 clique + (se levou a uma loja) 1 redirecionamento. */
export function trackDownloadClick(extra: { button: 'cta' | 'badge'; placement: string; store: 'apple' | 'google' | 'auto' }): void {
  const info = getLandingVariant();
  trackLandingEvent('landing_download_click', extra, info);
  if (extra.store === 'apple' || extra.store === 'google') {
    trackLandingEvent('landing_store_redirect', { ...extra }, info);
  }
}

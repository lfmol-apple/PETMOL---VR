/**
 * Low-level analytics transport.
 *
 * PETMOL V1 product metrics should go through '@/lib/v1Metrics'.
 * This file remains a thin storage/transport layer.
 */
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { getAnalyticsContext } from '@/lib/analytics/session';

type EventName =
  | 'app_open'
  | 'session_start'
  | 'screen_view'
  | 'view_emergency'
  | 'search_emergency'
  | 'click_call'
  | 'click_whatsapp'
  | 'click_directions'
  | 'view_services'
  | 'search_services'
  | 'click_pet_service'
  | 'view_buy'
  | 'search_buy'
  | 'open_offer'
  | 'view_rg'
  | 'generate_rg'
  | 'download_rg'
  | 'share_rg'
  | 'pet_created'
  | 'pet_profile_completed'
  | 'medication_created'
  | 'medication_taken'
  | 'worm_control_created'
  | 'worm_control_applied'
  | 'flea_control_created'
  | 'flea_control_applied'
  | 'collar_created'
  | 'collar_replaced'
  | 'vaccine_record_created'
  | 'food_cycle_created'
  | 'food_restock_confirmed'
  | 'food_alert_sent'
  | 'food_alert_opened'
  | 'food_buy_clicked'
  | 'food_partner_selected'
  | 'food_purchase_confirmed'
  | 'food_still_has_food'
  | 'food_finished_early'
  | 'food_remind_earlier'
  | 'food_remind_later'
  | 'food_forecast_confirmed'
  | 'food_duration_adjusted'
  | 'purchase_channel_selected'
  | 'push_action_still_has_food'
  | 'push_action_finished'
  | 'push_action_buy'
  | 'push_action_purchase_confirmed'
  | 'push_opened'
  | 'petmol_activated_v1'
  | 'reminder_action_completed'
  | 'partner_clicked'
  | 'document_uploaded'
  | 'push_sync_degraded'
  | 'register_step1_completed'
  | 'register_completed'
  | 'welcome_register_pet_clicked'
  | 'welcome_skipped'
  | 'signup_started'
  | 'onboarding_started'
  | 'first_pet_created'
  | 'onboarding_food_completed'
  | 'onboarding_vaccine_completed'
  | 'onboarding_parasite_completed'
  | 'onboarding_dewormer_completed'
  | 'onboarding_skipped'
  | 'onboarding_completed'
  | 'account_deleted'
  | 'feedback_submitted';

interface TrackEvent {
  name: EventName;
  properties: Record<string, unknown>;
  timestamp: number;
}

const EVENTS_KEY = 'petmol_events';
const MAX_EVENTS = 1000;
const SENSITIVE_PROPERTY_KEYS = new Set([
  'address',
  'cpf',
  'document',
  'documents',
  'email',
  'health_data',
  'medication',
  'medicine',
  'name',
  'nome',
  'notes',
  'observation',
  'phone',
  'photo',
  'postal_code',
  'prescription',
  'remedy',
  'street',
  'telefone',
  'title',
  'url',
  'whatsapp',
]);

function sanitizeAnalyticsProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (SENSITIVE_PROPERTY_KEYS.has(key.toLowerCase())) continue;
    if (typeof value === 'string') {
      safe[key] = value.slice(0, 160);
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = value.slice(0, 20);
    } else if (typeof value === 'object' && value) {
      safe[key] = sanitizeAnalyticsProperties(value as Record<string, unknown>);
    }
  }
  return safe;
}

function sendProductEvent(name: EventName | string, properties: Record<string, unknown> = {}): void {
  try {
    const context = getAnalyticsContext();
    const token = getToken();
    const payload = {
      event_id: context.event_id,
      event_name: name,
      anonymous_id: context.anonymous_id,
      session_id: context.session_id,
      screen: typeof properties.screen === 'string' ? properties.screen : undefined,
      route: typeof properties.route === 'string' ? properties.route : window.location.pathname,
      occurred_at: new Date().toISOString(),
      platform: context.platform,
      app_version: context.app_version,
      os: context.os,
      browser: context.browser,
      device_class: context.device_class,
      locale: context.locale,
      timezone: context.timezone,
      properties: sanitizeAnalyticsProperties(properties),
    };
    void fetch(`${API_BASE_URL}/analytics/event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // analytics must never break UX
  }
}

export function trackProductEvent(name: EventName | string, properties: Record<string, unknown> = {}): void {
  sendProductEvent(name, properties);
}

// Track event
export function track(name: EventName, properties: Record<string, unknown> = {}): void {
  try {
    const context = getAnalyticsContext();
    const safeProperties = sanitizeAnalyticsProperties(properties);
    const event: TrackEvent = {
      name,
      properties: safeProperties,
      timestamp: Date.now(),
    };

    // Store in localStorage
    const stored = localStorage.getItem(EVENTS_KEY);
    const events: TrackEvent[] = stored ? JSON.parse(stored) : [];
    events.push(event);

    // Keep only last MAX_EVENTS
    if (events.length > MAX_EVENTS) {
      events.splice(0, events.length - MAX_EVENTS);
    }

    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));

    // Console log in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[Track]', name, safeProperties);
    }

    sendProductEvent(name, safeProperties);

    // Best-effort server-side ingestion for product analytics metrics.
    // Keeps existing localStorage tracking as source of truth on the client.
    try {
      const target =
        typeof properties.partner === 'string' ? properties.partner :
        typeof properties.store === 'string' ? properties.store :
        typeof properties.channel === 'string' ? properties.channel :
        undefined;
      const payload = {
        source: typeof properties.source === 'string' ? properties.source : 'home_v1',
        cta_type: name,
        target,
        pet_id: typeof properties.pet_id === 'string' ? properties.pet_id : undefined,
        metadata: {
          ...safeProperties,
          anonymous_id: context.anonymous_id,
          session_id: context.session_id,
          platform: context.platform,
          app_version: context.app_version,
          os: context.os,
          browser: context.browser,
          device_class: context.device_class,
          locale: context.locale,
          timezone: context.timezone,
          route: window.location.pathname,
          v2_sent: true,
          client_timestamp: event.timestamp,
        },
      };
      const endpoint = `${API_BASE_URL}/analytics/click`;

      if (navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        navigator.sendBeacon(endpoint, blob);
      } else {
        void fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(() => undefined);
      }
    } catch {
      // analytics must never break UX
    }
  } catch (error) {
    console.error('Failed to track event:', error);
  }
}

// Get all events
export function getEvents(): TrackEvent[] {
  try {
    const stored = localStorage.getItem(EVENTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Clear events
export function clearEvents(): void {
  try {
    localStorage.removeItem(EVENTS_KEY);
  } catch (error) {
    console.error('Failed to clear events:', error);
  }
}

// Initialize global track function
if (typeof window !== 'undefined') {
  (window as unknown as { track: typeof track }).track = track;
}

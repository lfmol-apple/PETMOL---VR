/**
 * adEvents.ts — repassa eventos de negócio aos SDKs de anúncio nativos
 * (Meta e TikTok) no app iOS/Android. No-op seguro na web/PWA e se a ponte
 * falhar: medir anúncio nunca pode atrapalhar o uso. Instalação e abertura
 * são automáticas nos SDKs; aqui vai só o que o app nativo não enxerga.
 *
 * Nomes: Meta usa o evento padrão quando existe (fb_mobile_*), senão um
 * evento personalizado; TikTok usa o padrão (Registration) ou personalizado.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

interface AdEventsPlugin {
  logEvent(options: { meta?: string; tiktok?: string }): Promise<void>;
}

const AdEvents = registerPlugin<AdEventsPlugin>('AdEvents');

export type AdEventKind =
  | 'registration'
  | 'first_pet_created'
  | 'vaccine_record_created'
  | 'food_cycle_created'
  | 'medication_created'
  | 'onboarding_completed';

const AD_EVENTS: Record<AdEventKind, { meta: string; tiktok: string }> = {
  registration:           { meta: 'fb_mobile_complete_registration', tiktok: 'Registration' },
  first_pet_created:      { meta: 'first_pet_created',               tiktok: 'first_pet_created' },
  vaccine_record_created: { meta: 'vaccine_record_created',          tiktok: 'vaccine_record_created' },
  food_cycle_created:     { meta: 'food_cycle_created',              tiktok: 'food_cycle_created' },
  medication_created:     { meta: 'medication_created',              tiktok: 'medication_created' },
  onboarding_completed:   { meta: 'fb_mobile_tutorial_completion',   tiktok: 'onboarding_completed' },
};

export function isAdEventKind(name: string): name is AdEventKind {
  return Object.prototype.hasOwnProperty.call(AD_EVENTS, name);
}

export function trackAdEvent(kind: AdEventKind): void {
  try {
    if (!Capacitor.isNativePlatform()) return;
    void AdEvents.logEvent(AD_EVENTS[kind]).catch(() => {});
  } catch {
    /* ponte indisponível: ignora */
  }
}

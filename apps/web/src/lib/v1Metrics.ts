import { track } from '@/lib/analytics';
import { isAdEventKind, trackAdEvent } from '@/lib/adEvents';

// Primary analytics facade for PETMOL V1.
// Use this module for product metrics in the current V1 experience.

export type V1MetricEvent =
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
  | 'food_restock_clicked'
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
  // Entrada do app (download → cadastro): ver admin/analytics/entry_bi.py.
  // Nomes não podem terminar em "_view" (o backend renomeia para screen_view).
  | 'auth_screen_shown'
  | 'auth_choice_register'
  | 'auth_choice_login'
  | 'register_failed'
  | 'onboarding_started'
  | 'first_pet_created'
  | 'onboarding_food_completed'
  | 'onboarding_vaccine_completed'
  | 'onboarding_parasite_completed'
  | 'onboarding_dewormer_completed'
  | 'onboarding_skipped'
  | 'onboarding_completed'
  // Passo focado de alimentação no onboarding inicial (12/10/2026) — ver
  // FoodOnboardingCard.tsx. Distinto dos onboarding_food_* acima (que são
  // do checklist multi-item antigo, ainda existente no código mas não mais
  // disparado na jornada inicial).
  | 'onboarding_food_step_viewed'
  | 'onboarding_food_step_started'
  | 'onboarding_food_step_completed'
  | 'onboarding_food_step_skipped'
  | 'account_deleted'
  | 'feedback_submitted';

export function trackV1Metric(name: V1MetricEvent, properties: Record<string, unknown> = {}): void {
  track(name, properties);
  // Eventos de negócio também vão aos SDKs de anúncio (Meta/TikTok) no app nativo.
  if (isAdEventKind(name)) trackAdEvent(name);
}

export function trackReminderActionCompleted(properties: Record<string, unknown> = {}): void {
  trackV1Metric('reminder_action_completed', properties);
}

export function trackPartnerClicked(properties: Record<string, unknown> = {}): void {
  trackV1Metric('partner_clicked', properties);
}

export interface PetProfileMetricShape {
  name?: string | null;
  species?: string | null;
  breed?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  weight?: number | string | null;
  photo?: string | null;
}

export function isPetProfileCompleted(profile: PetProfileMetricShape): boolean {
  return Boolean(
    profile.name &&
    profile.species &&
    profile.breed &&
    profile.birth_date &&
    profile.sex &&
    profile.weight
  );
}

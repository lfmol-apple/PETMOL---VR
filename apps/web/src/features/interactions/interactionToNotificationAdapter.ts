import type { InteractionDecision } from './types';
import type { CanonicalEventActionTarget } from '@/features/events/types';

export interface InteractionNotificationPayload {
  tag: string;
  title: string;
  body: string;
  icon: string;
  badge: string;
  category: InteractionDecision['category'];
  severity: InteractionDecision['severity'];
  pet_id: string;
  pet_name: string;
  action_target: CanonicalEventActionTarget;
  url: string;
  dedup_key?: string;
  requireInteraction?: boolean;
  autoCloseMs?: number;
}

export function interactionDecisionsToNotifications(_decisions: InteractionDecision[]): InteractionNotificationPayload[] {
  // Legacy neutralizado: adapter desativado.
  return [];
}

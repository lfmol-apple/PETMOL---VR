/**
 * notificationDispatcher.ts
 *
 * Legacy neutralizado: dispatcher in-app desativado.
 */

import type { CanonicalPetEvent } from '@/features/events/types';
import type { CareInteractionPolicy, MasterInteractionRules } from '@/features/interactions/types';

export type NotificationDestination =
  | 'purchase'
  | 'register'
  | 'edit'
  | 'history'
  | 'central'
  | 'detail';

export interface NotificationPayload {
  id: string;
  type: string;
  petId: string;
  petName: string;
  title: string;
  message: string;
  ctaPrimary: string;
  ctaSecondary?: string;
  destination: NotificationDestination;
  destinationSecondary?: NotificationDestination;
  timestamp: string;
  priority: number;
  channels: ('home' | 'central' | 'push')[];
}

export function dispatchNotification(
  event: CanonicalPetEvent,
  policy?: CareInteractionPolicy | null,
  rules?: MasterInteractionRules,
): NotificationPayload | null {
  void event;
  void policy;
  void rules;
  return null;
}

export function dispatchNotifications(
  events: CanonicalPetEvent[],
  rules?: MasterInteractionRules,
): NotificationPayload[] {
  void events;
  void rules;
  return [];
}

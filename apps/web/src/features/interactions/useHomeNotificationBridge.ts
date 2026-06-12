/**
 * useHomeNotificationBridge.ts
 *
 * Legacy neutralizado: bridge de notificações in-app desativado.
 */

'use client';

import { useEffect } from 'react';
import type { CanonicalPetEvent } from '@/features/events/types';
import type { MasterInteractionRules } from '@/features/interactions/types';

export function useHomeNotificationBridge(
  events: CanonicalPetEvent[],
  rules: MasterInteractionRules,
  enabled = true,
): void {
  useEffect(() => {
    void events;
    void rules;
    void enabled;
    return;
  }, [events, rules, enabled]);
}

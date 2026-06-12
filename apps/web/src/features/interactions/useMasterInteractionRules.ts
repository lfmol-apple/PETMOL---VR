'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_MASTER_INTERACTION_RULES,
  getDefaultCarePolicy,
  loadMasterInteractionRules,
  saveMasterInteractionRules,
} from './preferences';
import type { CareInteractionPolicy, MasterInteractionRules } from './types';
import { API_BASE_URL } from '@/lib/api';

/** Shape returned by GET /notifications/settings */
interface NotificationSettingsResponse {
  monthly_checkin_day: number;
  monthly_checkin_hour: number;
  monthly_checkin_minute: number;
  push_enabled?: Record<string, boolean>;
}

async function fetchNotificationSettings(): Promise<NotificationSettingsResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/notifications/settings`, {
      credentials: 'include',
    });
    if (!res.ok) return null;
    return (await res.json()) as NotificationSettingsResponse;
  } catch {
    return null;
  }
}

/**
 * Hook de GOVERNANÇA MASTER (camada 1)
 *
 * - Escopo global (não depende de scopeId/localStorage por pet)
 * - Controla quais domínios podem gerar interação
 * - Controla se canais externos (ex.: browser notifications) podem ser usados
 * - Configuração de checkin mensal sincronizada com o backend (GET /notifications/settings)
 */
export function useMasterInteractionRules() {
  const [rules, setRules] = useState<MasterInteractionRules>(DEFAULT_MASTER_INTERACTION_RULES);

  useEffect(() => {
    // Load from localStorage immediately (fast / offline-safe)
    const local = loadMasterInteractionRules();
    setRules(local);

    // Then hydrate from API and merge checkin preferences
    fetchNotificationSettings().then((remote) => {
      if (!remote) return;
      setRules((prev) => ({
        ...prev,
        monthlyCheckin: {
          day: remote.monthly_checkin_day,
          hour: remote.monthly_checkin_hour,
          minute: remote.monthly_checkin_minute,
        },
      }));
    });
  }, []);

  const updateRules = useCallback((next: MasterInteractionRules) => {
    setRules(next);
    saveMasterInteractionRules(next);
  }, []);

  /** Persist checkin settings to API + local state */
  const saveCheckinSettings = useCallback(
    async (day: number, hour: number, minute: number): Promise<boolean> => {
      try {
        const res = await fetch(`${API_BASE_URL}/notifications/settings`, {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            monthly_checkin_day: day,
            monthly_checkin_hour: hour,
            monthly_checkin_minute: minute,
          }),
        });
        if (!res.ok) return false;
        setRules((prev) => ({
          ...prev,
          monthlyCheckin: { day, hour, minute },
        }));
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  const getCarePolicy = useCallback(
    (careKey: string): CareInteractionPolicy | null => {
      const current = rules.carePolicies[careKey];
      const fallback = getDefaultCarePolicy(careKey);
      if (!current) return fallback;

      return {
        ...(fallback ?? {}),
        ...current,
        primary: {
          ...(fallback?.primary ?? {
            label: 'Ver detalhes',
            destination: 'open-central',
            allowContextualPurchase: false,
          }),
          ...current.primary,
        },
        secondary: current.secondary ?? fallback?.secondary,
      } as CareInteractionPolicy;
    },
    [rules],
  );

  return useMemo(
    () => ({ rules, updateRules, getCarePolicy, saveCheckinSettings }),
    [rules, updateRules, getCarePolicy, saveCheckinSettings],
  );
}

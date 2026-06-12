'use client';

/**
 * usePendencies.ts
 *
 * Fetches and manages persistent in-app notification pendencies from the backend.
 *
 * A pendency is the in-app companion to a push notification.
 * It lives until the tutor resolves, snoozes, or dismisses it — so important
 * care reminders never get lost even if the push was missed.
 *
 * Actions:
 *   resolve  → marks as resolved (tutor will act)
 *   snooze   → hides for N hours, then resurfaces
 *   dismiss  → user says "already handled" — hides permanently (until recreated)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Pendency {
  id: string;
  pet_id: number | null;
  type: string;                // vaccine | parasite | medication | grooming | documents
  title: string;
  message: string;
  deep_link: string;           // e.g. "/home?modal=vaccines&petId=42"
  priority: number;            // 0-100; higher = shown first
  status: string;
  created_at: string;
}

export type PendencyAction = 'resolve' | 'snooze' | 'dismiss';

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePendencies() {
  const [pendencies, setPendencies] = useState<Pendency[]>([]);
  const [loading, setLoading] = useState(false);
  const hasFetchedRef = useRef(false);

  const fetchPendencies = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/notifications/pendencies`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (res.ok) {
        const data: Pendency[] = await res.json();
        setPendencies(data);
      }
    } catch {
      // Silent — pendencies are best-effort; the inline alert block is the fallback
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch once on mount (deduplicated via ref)
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    void fetchPendencies();
  }, [fetchPendencies]);

  /**
   * Act on a pendency.
   * - Optimistic: removes/updates locally immediately for snappy UX.
   * - Fire-and-forget to backend: failures are silent (UX already updated).
   *
   * @param id          Pendency ID
   * @param action      resolve | snooze | dismiss
   * @param snoozeHours How long to snooze (default 24h)
   */
  const act = useCallback(
    async (id: string, action: PendencyAction, snoozeHours = 24) => {
      // Optimistic update — remove from list immediately
      setPendencies((prev) => prev.filter((p) => p.id !== id));

      const token = getToken();
      if (!token) return;
      try {
        await fetch(
          `${API_BASE_URL}/notifications/pendencies/${encodeURIComponent(id)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            credentials: 'include',
            body: JSON.stringify({ action, snooze_hours: snoozeHours }),
          },
        );
      } catch {
        // Already removed optimistically — no recovery needed
      }
    },
    [],
  );

  return {
    /** Active pendencies sorted by priority (highest first) */
    pendencies,
    loading,
    /** Manually re-fetch (e.g. after send-on-open creates new pendencies) */
    refetch: fetchPendencies,
    act,
  };
}

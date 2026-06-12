'use client';

/**
 * PushAutoRefresh
 *
 * Componente invisível que roda em toda página (via layout.tsx).
 * Renova silenciosamente a push subscription do dispositivo atual
 * sempre que o usuário abre o app, garantindo que o backend sempre
 * tenha o endpoint correto para este dispositivo.
 *
 * Não exibe nenhuma UI. Não pede permissão (só renova se já foi concedida).
 */

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { trackV1Metric } from '@/lib/v1Metrics';

const PUSH_HEALTH_FAIL_KEY = 'petmol_push_sync_failed_v1';
const PUSH_HEALTH_FAIL_THRESHOLD = 3; // falhas consecutivas antes de alertar

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((char) => char.charCodeAt(0)));
}

function getAuthHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } : { 'Content-Type': 'application/json' };
}

function serializeSubscription(existing: PushSubscription) {
  const keyBuf = existing.getKey('p256dh');
  const authBuf = existing.getKey('auth');

  return {
    endpoint: existing.endpoint,
    keys: {
      p256dh: keyBuf ? btoa(String.fromCharCode(...new Uint8Array(keyBuf))) : '',
      auth: authBuf ? btoa(String.fromCharCode(...new Uint8Array(authBuf))) : '',
    },
  };
}

async function ensureServiceWorkerReady(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  return navigator.serviceWorker.ready;
}

async function fetchVapidPublicKey(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
  if (!response.ok) {
    throw new Error(`VAPID indisponivel (${response.status})`);
  }
  const data = await response.json();
  return data.publicKey as string;
}

async function createSubscription(registration: ServiceWorkerRegistration): Promise<PushSubscription> {
  const vapidKey = await fetchVapidPublicKey();
  const keyArray = urlBase64ToUint8Array(vapidKey);
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyArray as BufferSource,
  });
}

async function syncSubscription(subscription: PushSubscription): Promise<Response> {
  return fetch(`${API_BASE_URL}/notifications/subscribe`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      subscription: serializeSubscription(subscription),
    }),
  });
}

export function PushAutoRefresh() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;

    const token = getToken();
    if (!token) return; // Não está logado — não tenta renovar

    ensureServiceWorkerReady()
      .then(async (reg) => {
        let subscription = await reg.pushManager.getSubscription();

        if (!subscription) {
          subscription = await createSubscription(reg);
        }

        let response = await syncSubscription(subscription);

        if (!response.ok && (response.status === 400 || response.status === 410)) {
          try {
            await subscription.unsubscribe();
          } catch {
            // best effort
          }

          subscription = await createSubscription(reg);
          response = await syncSubscription(subscription);
        }

        if (!response.ok) {
          console.warn('[push] PushAutoRefresh nao conseguiu sincronizar a subscription', response.status);
          recordPushSyncFailure();
        } else {
          clearPushSyncFailures();
        }
      })
      .catch((error) => {
        console.warn('[push] PushAutoRefresh falhou', error);
        recordPushSyncFailure();
      });
  }, []); // roda uma vez por mount (= uma vez por navegação full-page)

  return null;
}

function recordPushSyncFailure() {
  try {
    const count = parseInt(localStorage.getItem(PUSH_HEALTH_FAIL_KEY) ?? '0', 10) + 1;
    localStorage.setItem(PUSH_HEALTH_FAIL_KEY, String(count));
    if (count >= PUSH_HEALTH_FAIL_THRESHOLD) {
      trackV1Metric('push_sync_degraded', { consecutive_failures: count });
      console.error(`[push] Sentinel: ${count} falhas consecutivas na sync de push.`);
    }
  } catch {
    // best effort
  }
}

function clearPushSyncFailures() {
  try {
    localStorage.removeItem(PUSH_HEALTH_FAIL_KEY);
  } catch {
    // best effort
  }
}

/**
 * useNotificationPermissionController.ts
 *
 * Controla o ciclo de vida de Web Push Notifications.
 * Integra com os endpoints do backend PETMOL:
 *   GET  /notifications/vapid-public-key
 *   POST /notifications/subscribe
 *   DELETE /notifications/subscribe
 *   POST /notifications/test
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { getToken } from '@/lib/auth-token';
import { showAppToast } from '@/features/interactions/userPromptChannel';
import { registerNativePush } from '@/features/notifications/nativePushService';
import { getDeviceId } from '@/features/notifications/pushService';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Converte a VAPID public key (base64url) para Uint8Array. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from(Array.from(rawData).map((c) => c.charCodeAt(0)));
}

/** Extrai os campos p256dh e auth de uma PushSubscription. */
function serializeSubscription(sub: PushSubscription) {
  const key = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  return {
    endpoint: sub.endpoint,
    keys: {
      p256dh: key ? btoa(Array.from(new Uint8Array(key)).map((b) => String.fromCharCode(b)).join('')) : '',
      auth: auth ? btoa(Array.from(new Uint8Array(auth)).map((b) => String.fromCharCode(b)).join('')) : '',
    },
  };
}

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function readErrorMessage(response: Response, fallbackMessage: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload.detail === 'string' && payload.detail.trim()) {
    return payload.detail;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || fallbackMessage;
}

async function fetchVapidPublicKey(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/notifications/vapid-public-key`);
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'VAPID key indisponivel'));
  }
  const data = await res.json();
  return data.publicKey as string;
}

async function getLocationSilently(): Promise<{ lat: number; lng: number } | null> {
  try {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) return null;
    const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    if (perm.state !== 'granted') return null;
    return await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 5000, maximumAge: 300_000 },
      );
    });
  } catch {
    return null;
  }
}

async function postSubscription(sub: PushSubscription): Promise<void> {
  const loc = await getLocationSilently();
  const res = await fetch(`${API_BASE_URL}/notifications/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ subscription: serializeSubscription(sub), device_id: getDeviceId(), ...loc }),
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Erro ao registrar subscription'));
  }
}

async function deleteSubscription(): Promise<void> {
  await fetch(`${API_BASE_URL}/notifications/subscribe`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
}

async function postTestNotification(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/notifications/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
  });
  if (!res.ok) {
    throw new Error(await readErrorMessage(res, 'Erro ao enviar push de teste'));
  }
}

async function showLocalTestNotification(): Promise<void> {
  if (typeof window === 'undefined' || Notification.permission !== 'granted') return;

  const reg = await getSwRegistration();
  await reg.showNotification('Teste PETMOL', {
    body: 'Push funcionando! Clique para abrir os lembretes.',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-mono.png',
    tag: 'petmol-test',
    data: { url: '/home' },
    requireInteraction: false,
  });
}

function isExpiredSubscriptionError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('subscription expirada') || normalized.includes('nenhuma subscription');
}

async function getSwRegistration(): Promise<ServiceWorkerRegistration> {
  // Ensure SW is registered first
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  // Always wait for the SW to reach 'active' state — PushManager.subscribe()
  // requires an active SW; returning from register() too early causes AbortError.
  return navigator.serviceWorker.ready;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useNotificationPermissionController() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (!isSupported) return false;
    const result = await Notification.requestPermission();
    setPermission(result);
    return result === 'granted';
  }, [isSupported]);

  const subscribeToPush = useCallback(async (forceRefresh = false): Promise<PushSubscription | null> => {
    if (!isSupported || Notification.permission !== 'granted') return null;
    try {
      const reg = await getSwRegistration();
      const existing = await reg.pushManager.getSubscription();

      if (existing && !forceRefresh) {
        await postSubscription(existing);
        setSubscription(existing);
        setIsSubscribed(true);
        return existing;
      }

      if (existing) {
        try {
          await existing.unsubscribe();
        } catch {
          // best effort: continue to create a fresh subscription
        }
      }

      const vapidKey = await fetchVapidPublicKey();
      const keyArray = urlBase64ToUint8Array(vapidKey);
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyArray as BufferSource,
      });
      await postSubscription(sub);
      setSubscription(sub);
      setIsSubscribed(true);
      return sub;
    } catch (err) {
      setSubscription(null);
      setIsSubscribed(false);
      console.error('[push] subscribeToPush falhou', err);
      return null;
    }
  }, [isSupported]);

  // Detect support and initial state.
  // If a browser subscription already exists, renew it silently so the backend
  // does not keep receiving an expired endpoint from FCM.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supported =
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window;

    setIsSupported(supported);
    if (!supported) return;

    setPermission(Notification.permission);

    getSwRegistration()
      .then(async (reg) => {
        const sub = await reg.pushManager.getSubscription();
        if (!sub) return;

        setIsSubscribed(true);
        setSubscription(sub);

        if (Notification.permission !== 'granted') {
          await postSubscription(sub).catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
          return;
        }

        try {
          await sub.unsubscribe();
          const vapidKey = await fetchVapidPublicKey();
          const keyArray = urlBase64ToUint8Array(vapidKey);
          const refreshed = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyArray as BufferSource,
          });
          await postSubscription(refreshed);
          setSubscription(refreshed);
          setIsSubscribed(true);
        } catch {
          await postSubscription(sub).catch(() => showAppToast('Erro ao sincronizar', { tone: 'warning' }));
        }
      })
      .catch(() => { /* silently ignore */ });
  }, []);

  // Push nativo (FCM/APNs via Capacitor) é um caminho totalmente separado
  // do Web Push acima — no-op automático fora do shell nativo (ver
  // nativePushService.ts), então é seguro sempre tentar aqui.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    void registerNativePush(token);
  }, []);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (!subscription) return;
    try {
      await subscription.unsubscribe();
      await deleteSubscription();
    } catch { /* melhor esforço */ } finally {
      setSubscription(null);
      setIsSubscribed(false);
    }
  }, [subscription]);

  const sendTestNotification = useCallback(async (): Promise<void> => {
    try {
      await postTestNotification();
      await showLocalTestNotification();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao enviar push de teste';
      if (!isExpiredSubscriptionError(message)) {
        throw err;
      }

      const refreshed = await subscribeToPush(true);
      if (!refreshed) {
        setSubscription(null);
        setIsSubscribed(false);
        throw new Error('A inscricao deste dispositivo expirou e nao foi possivel renová-la automaticamente.');
      }

      await postTestNotification();
      await showLocalTestNotification();
    }
  }, [subscribeToPush]);

  return {
    permission,
    isSupported,
    isSubscribed,
    subscription,
    requestPermission,
    subscribeToPush,
    unsubscribe,
    sendTestNotification,
  };
}

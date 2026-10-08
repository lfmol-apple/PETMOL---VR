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
import {
  isNativePushPlatform,
  checkNativePushPermission,
  requestNativePushPermission,
  registerNativePush,
  unregisterNativePush,
  pushDiagBreadcrumb,
  type NativePushPermission,
} from '@/features/notifications/nativePushService';
import { getDeviceId } from '@/features/notifications/pushService';

/** Estado nativo ('prompt'|'granted'|'denied') → NotificationPermission da web. */
function nativeToWebPermission(p: NativePushPermission): NotificationPermission {
  return p === 'prompt' ? 'default' : p;
}

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
  pushDiagBreadcrumb('web: getSwRegistration início');
  // Ensure SW is registered first
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  }
  // Wait for the SW to reach 'active' — mas com teto: `serviceWorker.ready`
  // pode NUNCA resolver no WebView do iOS, e aí a UI fica presa em "ATIVANDO...".
  const reg = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise<ServiceWorkerRegistration>((_, reject) =>
      setTimeout(() => reject(new Error('service worker não ativou (timeout 10s)')), 10_000),
    ),
  ]);
  pushDiagBreadcrumb('web: SW pronto');
  return reg;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

// Achado 08/10/2026: no app nativo, o estado inicial deste hook é SEMPRE
// `false` até a confirmação assíncrona terminar (round-trip real com APNs/FCM
// + backend, até 15s de timeout — ver registerNativePush). Toda vez que a
// tela remonta (app voltou do background e o WebView recarregou — comum em
// iOS sob pressão de memória), o sininho mostrava "desativado" por conta
// desse piso, mesmo com a subscription real intacta. Guardamos o último
// estado confirmado e partimos dele, não de `false` — só muda de verdade se
// a reconfirmação de fato disser que está desativado.
const PUSH_SUBSCRIBED_CACHE_KEY = 'petmol_push_last_known_subscribed_v1';

function readCachedSubscribed(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(PUSH_SUBSCRIBED_CACHE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCachedSubscribed(value: boolean): void {
  try {
    window.localStorage.setItem(PUSH_SUBSCRIBED_CACHE_KEY, value ? '1' : '0');
  } catch { /* melhor esforço */ }
}

// Achado 08/10/2026 (mesmo dia, 3ª rodada): desativar no sininho da Home não
// "pegava" no Perfil — porque no app nativo, QUALQUER tela que monta de novo
// com a permissão do SO ainda concedida renova o token sozinha ("Permissão
// já concedida → renova o token no backend silenciosamente"). Isso é certo
// pra reabrir o app depois de conceder a permissão uma vez, mas não distingue
// isso de "o usuário acabou de apertar Desativar": sem esse sinal, cada tela
// nova (Home, Perfil, qualquer sheet) reativava o push sozinha, desfazendo a
// desativação quase na hora. Esta flag é o sinal que faltava — só é tocada
// por uma ação explícita do usuário (Desativar/Ativar), nunca por uma
// reconfirmação automática.
const PUSH_USER_OPTED_OUT_KEY = 'petmol_push_user_opted_out_v1';

function readUserOptedOut(): boolean {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(PUSH_USER_OPTED_OUT_KEY) === '1';
  } catch {
    return false;
  }
}

function writeUserOptedOut(value: boolean): void {
  try {
    if (value) window.localStorage.setItem(PUSH_USER_OPTED_OUT_KEY, '1');
    else window.localStorage.removeItem(PUSH_USER_OPTED_OUT_KEY);
  } catch { /* melhor esforço */ }
}

export function useNotificationPermissionController() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribedRaw] = useState(readCachedSubscribed);
  const setIsSubscribed = useCallback((value: boolean) => {
    setIsSubscribedRaw(value);
    writeCachedSubscribed(value);
  }, []);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  // Dentro do app nativo (TestFlight/App Store) o push é APNs/FCM via
  // Capacitor — caminho totalmente separado do Web Push abaixo. A UI
  // (register, profile) consome os mesmos campos/ações deste hook, então
  // aqui a gente só troca a implementação por baixo conforme a plataforma.
  const isNative = isNativePushPlatform();

  const requestPermission = useCallback(async (): Promise<boolean> => {
    if (isNative) {
      const state = await requestNativePushPermission();
      setPermission(nativeToWebPermission(state));
      return state === 'granted';
    }
    if (!isSupported) return false;
    pushDiagBreadcrumb('web: Notification.requestPermission');
    const result = await Promise.race([
      Notification.requestPermission(),
      new Promise<NotificationPermission>((_, reject) =>
        setTimeout(() => reject(new Error('Notification.requestPermission não respondeu (timeout 60s)')), 60_000),
      ),
    ]);
    pushDiagBreadcrumb('web: permissão = ' + result);
    setPermission(result);
    return result === 'granted';
  }, [isNative, isSupported]);

  const subscribeToPush = useCallback(async (forceRefresh = false): Promise<PushSubscription | boolean | null> => {
    if (isNative) {
      // Não existe PushSubscription no nativo — devolvemos boolean (truthy =
      // token registrado). Quem chama já testa `if (!sub)`.
      const token = getToken();
      if (!token) return false;
      const ok = await registerNativePush(token);
      setIsSubscribed(ok);
      if (ok) writeUserOptedOut(false);
      return ok;
    }
    if (!isSupported || Notification.permission !== 'granted') return null;
    try {
      const reg = await getSwRegistration();
      const existing = await reg.pushManager.getSubscription();

      if (existing && !forceRefresh) {
        await postSubscription(existing);
        setSubscription(existing);
        setIsSubscribed(true);
        writeUserOptedOut(false);
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
      writeUserOptedOut(false);
      return sub;
    } catch (err) {
      setSubscription(null);
      setIsSubscribed(false);
      console.error('[push] subscribeToPush falhou', err);
      return null;
    }
  }, [isNative, isSupported, setIsSubscribed]);

  // ── App nativo (APNs/FCM): estado inicial + auto-registro do token ────────
  useEffect(() => {
    if (!isNative) return;
    setIsSupported(true);

    void (async () => {
      const state = await checkNativePushPermission();
      setPermission(nativeToWebPermission(state));
      if (state !== 'granted') {
        // ACHADO 08/10/2026 (regressão da própria correção anterior):
        // checkNativePushPermission() tem um timeout de 6s e, se o plugin
        // nativo ainda não respondeu (comum logo que o app volta do
        // background — a ponte nativa do Capacitor ainda se reconectando),
        // ele cai em 'denied' por FALHA DE LEITURA, não porque o usuário
        // realmente desativou nada. Tratar isso como definitivo apagava o
        // sininho sozinho depois de alguns segundos, mesmo com o Perfil
        // mostrando a notificação ativa. Sem um sinal confiável de recusa
        // de verdade (ver TODO abaixo), o jeito seguro é não decidir nada
        // aqui — mantém o último estado confirmado (cache) até a
        // reconfirmação real (reabrir o Perfil, tocar no sininho) dizer
        // algo melhor.
        return;
      }
      if (readUserOptedOut()) {
        // O usuário já desativou explicitamente numa tela (ou nesta mesma,
        // antes de remontar) — permissão do SO continuar concedida não
        // significa que ele quer o push de volta. Sem isso, toda tela nova
        // (Home, Perfil, qualquer sheet) reativava sozinha o que acabou de
        // ser desativado.
        return;
      }
      // Permissão já concedida (build anterior, ou reabertura) → renova o
      // token no backend silenciosamente.
      const token = getToken();
      if (!token) return;
      const ok = await registerNativePush(token);
      setIsSubscribed(ok);
    })();
  }, [isNative, setIsSubscribed]);

  // Detect support and initial state.
  // If a browser subscription already exists, renew it silently so the backend
  // does not keep receiving an expired endpoint from FCM.
  useEffect(() => {
    if (typeof window === 'undefined' || isNative) return;
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

    // Cada tela (Home, Perfil, sheets de item) usa sua própria instância
    // deste hook, sem estado compartilhado. Ativar/desativar numa tela não
    // atualiza as outras já montadas — e navegação entre rotas do Next.js
    // pode reaproveitar a instância anterior sem remontar. Reconferimos a
    // subscription real (não a dança de renovação, só a leitura) sempre que
    // a aba/app volta a ficar visível, pra outras telas puxarem o estado
    // real em vez de ficarem com o valor capturado na montagem.
    const resyncFromRealSubscription = async () => {
      try {
        const reg = await getSwRegistration();
        const sub = await reg.pushManager.getSubscription();
        setIsSubscribed(!!sub);
        setSubscription(sub);
      } catch { /* melhor esforço */ }
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void resyncFromRealSubscription();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [isNative, setIsSubscribed]);

  const unsubscribe = useCallback(async (): Promise<void> => {
    if (isNative) {
      const token = getToken();
      if (token) await unregisterNativePush(token);
      setIsSubscribed(false);
      writeUserOptedOut(true);
      return;
    }
    if (!subscription) return;
    try {
      await subscription.unsubscribe();
      await deleteSubscription();
    } catch { /* melhor esforço */ } finally {
      setSubscription(null);
      setIsSubscribed(false);
      writeUserOptedOut(true);
    }
  }, [isNative, subscription, setIsSubscribed]);

  const sendTestNotification = useCallback(async (): Promise<void> => {
    if (isNative) {
      // No app nativo o "teste" é só o push do backend (APNs/FCM) — não há
      // notificação local via Service Worker.
      await postTestNotification();
      return;
    }
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
  }, [isNative, subscribeToPush, setIsSubscribed]);

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

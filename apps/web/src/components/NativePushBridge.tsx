'use client';

/**
 * NativePushBridge
 *
 * Invisível, no layout. Só no app nativo (Capacitor): liga o listener de
 * "notificação de push tocada" (APNs/FCM) uma vez, pra o tap num lembrete
 * abrir o sheet certo (via nativePushService.initNativePushDeepLink →
 * BroadcastChannel/Cache que a Home já escuta). No-op na web/PWA.
 */
import { useEffect } from 'react';
import { initNativePushDeepLink } from '@/features/notifications/nativePushService';

export function NativePushBridge() {
  useEffect(() => {
    void initNativePushDeepLink();
  }, []);
  return null;
}

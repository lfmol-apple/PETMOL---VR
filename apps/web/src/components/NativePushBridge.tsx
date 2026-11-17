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
import { useRouter } from 'next/navigation';
import { initNativePushDeepLink, setNativeDeepLinkNavigator } from '@/features/notifications/nativePushService';

export function NativePushBridge() {
  const router = useRouter();

  useEffect(() => {
    setNativeDeepLinkNavigator((url: string) => {
      try {
        const parsed = new URL(url, window.location.origin);
        if (parsed.origin !== window.location.origin) return false;
        router.push(parsed.pathname + parsed.search + parsed.hash);
        return true;
      } catch {
        return false;
      }
    });
    void initNativePushDeepLink();
    // Termina a abertura de um produto de push que ficou pela metade (página recarregada/retomada no meio do toque).
    const finishPendingProduct = () => { void import('@/features/commerce/pushProductLink').then((m) => m.openPendingProduct()).catch(() => {}); };
    finishPendingProduct();
    const onVisible = () => { if (document.visibilityState === 'visible') finishPendingProduct(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', finishPendingProduct);
    return () => {
      setNativeDeepLinkNavigator(null);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', finishPendingProduct);
    };
  }, [router]);

  return null;
}

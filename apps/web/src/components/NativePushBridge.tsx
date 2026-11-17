'use client';

/**
 * NativePushBridge
 *
 * Invisível, no layout. Só no app nativo (Capacitor): liga o listener de
 * "notificação de push tocada" (APNs/FCM) uma vez, pra o tap num lembrete
 * abrir o sheet certo (via nativePushService.initNativePushDeepLink →
 * BroadcastChannel/Cache que a Home já escuta). No-op na web/PWA.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { initNativePushDeepLink, setNativeDeepLinkNavigator } from '@/features/notifications/nativePushService';

export function NativePushBridge() {
  const router = useRouter();
  // REGRA DE OURO (dono): campanha com link de produto abre o PRODUTO, nunca a Home do PETMOL. O iPhone sempre acorda o app ao
  // tocar na notificação; então, enquanto a loja abre, cobrimos a tela com um fundo neutro (sem nada do app).
  const [openingProduct, setOpeningProduct] = useState(false);
  useEffect(() => {
    let timer: number | null = null;
    const show = () => { setOpeningProduct(true); if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => setOpeningProduct(false), 10_000); };   // trava de segurança: nunca prende a tela
    const hide = () => { if (timer) window.clearTimeout(timer); timer = window.setTimeout(() => setOpeningProduct(false), 1200); };   // a loja abre por cima; o fundo some logo depois
    void import('@/features/commerce/pushProductLink').then((m) => {
      if (m.hasPendingProduct()) show();
    }).catch(() => {});
    window.addEventListener('petmol:product-opening', show);
    window.addEventListener('petmol:product-opened', hide);
    return () => { window.removeEventListener('petmol:product-opening', show); window.removeEventListener('petmol:product-opened', hide); if (timer) window.clearTimeout(timer); };
  }, []);

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

  if (!openingProduct) return null;
  return (
    <div role="status" aria-live="polite" data-testid="abrindo-produto" className="fixed inset-0 flex flex-col items-center justify-center gap-3 bg-white" style={{ zIndex: 2147483000 }}>
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-slate-200 border-t-[#0056D2]" aria-hidden />
      <p className="text-[15px] font-semibold text-slate-700">Abrindo o produto…</p>
    </div>
  );
}

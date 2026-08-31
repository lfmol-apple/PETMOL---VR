'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { getAnalyticsContext } from '@/lib/analytics/session';
import { trackProductEvent } from '@/lib/analytics';

function screenForRoute(pathname: string): string | null {
  if (pathname === '/login') return 'login';
  if (pathname === '/register') return 'register';
  if (pathname === '/home') return 'home';
  if (pathname.startsWith('/saude/')) return 'pet';
  if (pathname === '/food') return 'alimentacao';
  if (pathname === '/loja') return 'loja';
  if (pathname === '/profile') return 'configuracoes';
  return null;
}

function screenForHomeModal(search: string): string | null {
  const params = new URLSearchParams(search);
  const modal = params.get('modal') || params.get('type');
  if (!modal) return null;
  if (modal.includes('medication')) return 'medicamentos';
  if (modal.includes('parasite') || modal.includes('vermifugo') || modal.includes('antipulgas') || modal.includes('coleira')) {
    return 'antiparasitarios';
  }
  if (modal.includes('food')) return 'alimentacao';
  return null;
}

export function AnalyticsBootstrap() {
  const pathname = usePathname();
  const openedRef = useRef(false);
  const lastScreenRef = useRef<string | null>(null);

  useEffect(() => {
    const context = getAnalyticsContext();
    const route = `${pathname}${window.location.search || ''}`;

    if (!openedRef.current) {
      openedRef.current = true;
      trackProductEvent('app_open', { route });
    }
    if (context.session_started) {
      trackProductEvent('session_start', { route });
    }

    const screen = screenForHomeModal(window.location.search) || screenForRoute(pathname);
    if (screen && lastScreenRef.current !== `${screen}:${route}`) {
      lastScreenRef.current = `${screen}:${route}`;
      trackProductEvent('screen_view', { screen, route });
    }
  }, [pathname]);

  return null;
}

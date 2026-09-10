'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { isNativeApp, isStandalonePwa, isIosDevice } from '@/lib/pwaPlatform';

const KEY = 'petmol_install_reported_v1';

/**
 * Avisa o backend UMA vez, na 1ª abertura do PETMOL neste dispositivo/navegador.
 * É o mais perto de "download" que dá pra medir — App Store / Play não dão isso
 * em tempo real. Guard em localStorage; nenhuma UI.
 */
export function AppInstallPing() {
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return; // sem localStorage → não fica pingando a cada carregamento
    }

    let platform: 'ios' | 'android' | 'pwa' | 'web' = 'web';
    const ua = (navigator.userAgent || '').toLowerCase();
    if (isNativeApp()) platform = isIosDevice() || /iphone|ipad/.test(ua) ? 'ios' : 'android';
    else if (isStandalonePwa()) platform = 'pwa';

    fetch(`${API_BASE_URL}/analytics/app-install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform }),
      keepalive: true,
    })
      .then(() => {
        try { localStorage.setItem(KEY, new Date().toISOString()); } catch { /* ignore */ }
      })
      .catch(() => { /* tenta de novo na próxima abertura */ });
  }, []);

  return null;
}

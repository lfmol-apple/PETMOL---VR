'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/api';
import { isNativeApp, isStandalonePwa, isIosDevice } from '@/lib/pwaPlatform';
import { getCampaignAttribution } from '@/lib/analytics/campaignAttribution';

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

    // Marca ANTES de enviar: com a API lenta, o app podia ser fechado e reaberto antes da resposta
    // chegar, e a 2ª abertura mandava de novo (a mesma pessoa contada duas vezes). Se o envio falhar
    // de verdade (sem rede), a marca é apagada abaixo para tentar na próxima abertura.
    try {
      localStorage.setItem(KEY, new Date().toISOString());
    } catch {
      return;
    }

    let platform: 'ios' | 'android' | 'pwa' | 'web' = 'web';
    const ua = (navigator.userAgent || '').toLowerCase();
    if (isNativeApp()) platform = isIosDevice() || /iphone|ipad/.test(ua) ? 'ios' : 'android';
    else if (isStandalonePwa()) platform = 'pwa';

    fetch(`${API_BASE_URL}/analytics/app-install`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, ...getCampaignAttribution() }),
      keepalive: true,
    })
      .catch(() => {
        try { localStorage.removeItem(KEY); } catch { /* ignore */ }
      });
  }, []);

  return null;
}

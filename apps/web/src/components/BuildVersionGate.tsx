'use client';

/**
 * BuildVersionGate
 *
 * O app nativo (Capacitor WKWebView) carrega o site ao vivo, mas RETOMA a
 * WebView com o JS que já estava na memória quando o iOS a suspendeu — ou
 * seja, um deploy novo não aparece até o app ser morto de verdade ou
 * reinstalado. Isso fazia o dono ver comportamento antigo (flash da
 * landing, etc.) mesmo depois do deploy.
 *
 * Aqui a gente compara a versão EMBUTIDA no bundle em build-time
 * (NEXT_PUBLIC_APP_VERSION = SHA) com /version.json (atualizado a cada
 * deploy). Se o bundle rodando está velho → recarrega uma vez. Checa no
 * mount, a cada 60s, e principalmente quando o app volta ao foco (o caso
 * do WKWebView retomando).
 *
 * A marca "já recarreguei pra essa versão" é compartilhada com
 * ChunkReloadGuard (ver lib/versionSkew.ts) — os dois nunca devem contar
 * reloads separadamente, senão um deploy pode disparar dois reloads
 * concorrentes.
 */
import { useEffect } from 'react';
import { hasRecentDeepLinkIntent } from '@/lib/deepLinkIntent';
import { claimReloadForVersion } from '@/lib/versionSkew';

const BAKED_SHA = (process.env.NEXT_PUBLIC_APP_VERSION || '').trim();

export function BuildVersionGate() {
  useEffect(() => {
    if (!BAKED_SHA || typeof window === 'undefined') return;
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      if (hasRecentDeepLinkIntent()) return;
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        const liveSha = (v || '').split('-')[0];
        if (!liveSha || liveSha === BAKED_SHA) return;

        // bundle rodando está desatualizado — recarrega (1x por versão-alvo,
        // pra nunca entrar em loop se a WebView insistir em servir o velho).
        if (!claimReloadForVersion(liveSha)) return;
        window.location.reload();
      } catch {
        /* offline — ignora */
      }
    };

    void check();
    const iv = window.setInterval(() => void check(), 60_000);
    let focusTimer: number | null = null;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      // Ao tocar em push, o WebView volta ao foco antes do Capacitor entregar
      // pushNotificationActionPerformed. Dá uma janela curta para o deeplink
      // marcar intenção; assim deploy/version skew não dá reload antes do sheet.
      if (focusTimer) window.clearTimeout(focusTimer);
      focusTimer = window.setTimeout(() => void check(), 1_500);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(iv);
      if (focusTimer) window.clearTimeout(focusTimer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return null;
}

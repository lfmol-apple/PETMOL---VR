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
 */
import { useEffect } from 'react';

const BAKED_SHA = (process.env.NEXT_PUBLIC_APP_VERSION || '').trim();

export function BuildVersionGate() {
  useEffect(() => {
    if (!BAKED_SHA || typeof window === 'undefined') return;
    let stopped = false;

    const check = async () => {
      if (stopped) return;
      try {
        const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const { v } = (await res.json()) as { v?: string };
        const liveSha = (v || '').split('-')[0];
        if (!liveSha || liveSha === BAKED_SHA) return;

        // bundle rodando está desatualizado — recarrega (1x por versão-alvo,
        // pra nunca entrar em loop se a WebView insistir em servir o velho).
        const key = 'petmol_reloaded_for_' + liveSha;
        try {
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
        } catch {
          /* sessionStorage bloqueado — segue e recarrega mesmo assim */
        }
        window.location.reload();
      } catch {
        /* offline — ignora */
      }
    };

    void check();
    const iv = window.setInterval(() => void check(), 60_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      stopped = true;
      window.clearInterval(iv);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  return null;
}

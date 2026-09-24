import { useEffect } from 'react';
import { refreshLocationSilently } from '@/lib/silentLocationRefresh';

/**
 * Mantém atualizada a localização de quem JÁ escolheu compartilhar (GPS): renova logo depois da
 * Home abrir e quando o app volta ao primeiro plano. Não faz nada para quem não compartilha e
 * nunca pede permissão (ver silentLocationRefresh.ts).
 */
export function useSilentLocationRefresh(sharesGps: boolean): void {
  useEffect(() => {
    if (!sharesGps) return;
    const run = () => { void refreshLocationSilently(); };
    const timer = setTimeout(run, 3000);      // depois do boot da Home, sem competir com ele
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [sharesGps]);
}

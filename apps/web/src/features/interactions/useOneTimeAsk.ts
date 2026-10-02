'use client';

import { useEffect, useState } from 'react';

/**
 * Mostra algo UMA VEZ por dispositivo/navegador (localStorage), nunca mais —
 * mesmo padrão do PermissionsNudgeCard, só que reutilizável por qualquer
 * tela. `enabled=false` nunca marca como visto (ex: já tem a permissão, ou
 * ainda carregando o dado que decide isso) — só conta como "visto" quando
 * de fato chegou a aparecer.
 */
export function useOneTimeAsk(key: string, enabled: boolean): { open: boolean; dismiss: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(key) === '1') return;
    } catch {
      return;
    }
    setOpen(true);
  }, [enabled, key]);

  const dismiss = () => {
    setOpen(false);
    try { localStorage.setItem(key, '1'); } catch { /* best effort */ }
  };

  return { open, dismiss };
}

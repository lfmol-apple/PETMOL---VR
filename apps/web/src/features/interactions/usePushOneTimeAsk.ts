'use client';

import { useEffect, useState } from 'react';

const GLOBAL_SEEN_KEY = 'petmol_push_ask_any_seen_v1';

/**
 * Variante de useOneTimeAsk ESPECÍFICA pra pedido de notificação — feedback
 * de beta tester (04/10/2026): tocar em vacina, depois ração, depois
 * vermífugo, cada tela pedia pra ativar notificação de novo, mesmo tendo
 * uma permissão só (do sistema) por trás. Com `useOneTimeAsk` puro isso já
 * não deveria acontecer em teoria (a permissão real vira 'granted' e some
 * em todo lugar) — mas se a pessoa só DISPENSA (nunca chega a decidir no
 * sistema), a permissão nativa continua 'prompt'/'default' pra sempre, e
 * cada tela (cada uma com sua própria chave) pede de novo por conta
 * própria. Esse hook some com isso: UMA flag global, gravada assim que a
 * pessoa interage com QUALQUER pedido de notificação (aceitando ou
 * dispensando) — nenhuma outra tela pergunta de novo depois disso,
 * independente da permissão real do sistema ainda estar pendente.
 */
export function usePushOneTimeAsk(key: string, enabled: boolean): { open: boolean; dismiss: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(GLOBAL_SEEN_KEY) === '1') return;
      if (localStorage.getItem(key) === '1') return;
    } catch {
      return;
    }
    setOpen(true);
  }, [enabled, key]);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(key, '1');
      localStorage.setItem(GLOBAL_SEEN_KEY, '1');
    } catch { /* best effort */ }
  };

  return { open, dismiss };
}
